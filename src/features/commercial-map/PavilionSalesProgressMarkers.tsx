import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import { formatCommercialPercent, type CommercialSegmentAggregate } from "@/lib/commercial";
import type { MapInsets, PavilionProjection, PavilionViewport } from "./types";
import { PAVILION_MARKER, placePavilionMarkers } from "./pavilionSalesProgress";

type PavilionProgress = CommercialSegmentAggregate & { pavilionNumber: number };

export type PavilionMarkerLayerHandle = {
  project(projections: readonly PavilionProjection[], viewport: PavilionViewport): void;
};

function pavilionSalesDescription(segment: PavilionProgress) {
  const label = `Pavilhão ${segment.pavilionNumber}`;
  return segment.total > 0
    ? `${label}: ${segment.sold} de ${segment.total} lotes vendidos (${formatCommercialPercent(segment.soldPercent)})`
    : `${label}: sem inventário comercial confirmado`;
}

type MarkerMotion = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  visible: boolean;
  transform: string;
};

const spring = 225;
const damping = 27;
const stopThreshold = 0.15;

function stepAxis(position: number, velocity: number, target: number, seconds: number) {
  const nextVelocity =
    (velocity + (target - position) * spring * seconds) / (1 + damping * seconds);
  const offset = position + nextVelocity * seconds - target;
  const clamped = Math.max(-PAVILION_MARKER.maxShift, Math.min(PAVILION_MARKER.maxShift, offset));
  return { position: target + clamped, velocity: offset === clamped ? nextVelocity : 0 };
}

type Props = {
  segments: readonly CommercialSegmentAggregate[];
  selectedPavilion?: number;
  insets: MapInsets;
};

export const PavilionSalesProgressMarkers = forwardRef<PavilionMarkerLayerHandle, Props>(
  function PavilionSalesProgressMarkers({ segments, selectedPavilion, insets }, ref) {
    const layer = useRef<HTMLDivElement>(null);
    const nodes = useRef(new Map<number, HTMLDivElement>());
    const motions = useRef(new Map<number, MarkerMotion>());
    const targets = useRef(new Map<number, PavilionProjection>());
    const lastProjection = useRef<{
      points: readonly PavilionProjection[];
      viewport: PavilionViewport;
    }>(null);
    const applyTargets = useRef<() => void>(() => {});
    const pavilions = useMemo(
      () =>
        segments.filter((segment): segment is PavilionProgress => segment.pavilionNumber != null),
      [segments],
    );
    const visiblePavilions = useMemo(
      () => new Set(pavilions.map((segment) => segment.pavilionNumber)),
      [pavilions],
    );
    const settings = useRef({ selectedPavilion, insets, visiblePavilions });
    settings.current = { selectedPavilion, insets, visiblePavilions };

    useImperativeHandle(
      ref,
      () => ({
        project(points, viewport) {
          lastProjection.current = { points, viewport };
          applyTargets.current();
        },
      }),
      [],
    );

    useLayoutEffect(() => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      let frame: number | null = null;
      let lastTime = 0;
      let onscreen = true;
      function stop() {
        if (frame != null) cancelAnimationFrame(frame);
        frame = null;
        lastTime = 0;
      }
      function paint(now: number) {
        frame = null;
        if (!onscreen || document.hidden) {
          stop();
          return;
        }
        const seconds = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 1 / 60;
        let moving = false;
        for (const [pavilion, node] of nodes.current) {
          const target = targets.current.get(pavilion);
          const motion = motions.current.get(pavilion);
          if (!target) {
            if (motion) motion.visible = false;
            node.hidden = true;
            continue;
          }
          const next = motion ?? { ...target, vx: 0, vy: 0, visible: false, transform: "" };
          if (media.matches || !next.visible) {
            Object.assign(next, { x: target.x, y: target.y, vx: 0, vy: 0 });
          } else {
            const x = stepAxis(next.x, next.vx, target.x, seconds);
            const y = stepAxis(next.y, next.vy, target.y, seconds);
            const active =
              Math.hypot(x.position - target.x, y.position - target.y) > stopThreshold ||
              Math.hypot(x.velocity, y.velocity) > 2;
            moving ||= active;
            Object.assign(
              next,
              active
                ? { x: x.position, y: y.position, vx: x.velocity, vy: y.velocity }
                : { x: target.x, y: target.y, vx: 0, vy: 0 },
            );
          }
          next.visible = true;
          const transform = `translate3d(${next.x.toFixed(1)}px,${next.y.toFixed(1)}px,0) translate(-50%,-100%) scale(${target.scale.toFixed(2)})`;
          if (next.transform !== transform) {
            node.style.transform = transform;
            next.transform = transform;
          }
          node.hidden = false;
          motions.current.set(pavilion, next);
        }
        if (moving) {
          lastTime = now;
          frame = requestAnimationFrame(paint);
        } else {
          lastTime = 0;
        }
      }
      function schedule() {
        if (frame == null && onscreen && !document.hidden) frame = requestAnimationFrame(paint);
      }
      applyTargets.current = () => {
        const projection = lastProjection.current;
        const { visiblePavilions, selectedPavilion, insets } = settings.current;
        targets.current =
          projection && visiblePavilions.size
            ? placePavilionMarkers(
                projection.points,
                projection.viewport,
                insets,
                visiblePavilions,
                selectedPavilion,
              )
            : new Map();
        // An occluded or offscreen marker cannot continue its previous spring.
        for (const [pavilion, node] of nodes.current) {
          if (targets.current.has(pavilion)) continue;
          const motion = motions.current.get(pavilion);
          if (motion) motion.visible = false;
          node.hidden = true;
        }
        if (targets.current.size) schedule();
        else stop();
      };
      const visibilityChanged = () => {
        if (document.hidden || !onscreen) {
          stop();
          for (const motion of motions.current.values()) motion.visible = false;
        } else {
          applyTargets.current();
        }
      };
      const observer =
        typeof IntersectionObserver !== "undefined"
          ? new IntersectionObserver(([entry]) => {
              onscreen = entry.isIntersecting;
              visibilityChanged();
            })
          : null;
      if (layer.current) observer?.observe(layer.current);
      document.addEventListener("visibilitychange", visibilityChanged);
      media.addEventListener("change", schedule);
      applyTargets.current();
      return () => {
        stop();
        observer?.disconnect();
        document.removeEventListener("visibilitychange", visibilityChanged);
        media.removeEventListener("change", schedule);
        applyTargets.current = () => {};
      };
    }, []);
    useLayoutEffect(() => applyTargets.current(), [visiblePavilions, insets, selectedPavilion]);

    return (
      <>
        <div ref={layer} className="im-pavilion-marker-layer" aria-hidden="true">
          {pavilions.map((segment) => {
            const percent = segment.total > 0 ? segment.soldPercent : null;
            return (
              <div
                key={segment.key}
                ref={(node) => {
                  if (node) nodes.current.set(segment.pavilionNumber, node);
                  else nodes.current.delete(segment.pavilionNumber);
                }}
                className={`im-pavilion-marker${percent == null ? " is-neutral" : ""}`}
                data-pavilion-progress={segment.pavilionNumber}
                hidden
              >
                <svg className="im-pavilion-marker-ring" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r="11" className="im-pavilion-marker-track" />
                  {percent != null && percent > 0 && (
                    <circle
                      cx="14"
                      cy="14"
                      r="11"
                      pathLength="100"
                      strokeDasharray={`${percent} 100`}
                      className="im-pavilion-marker-value"
                    />
                  )}
                  <circle cx="14" cy="14" r="2.5" className="im-pavilion-marker-center" />
                </svg>
                <span className="im-pavilion-marker-text">
                  <span>P{segment.pavilionNumber}</span>
                  <strong>{formatCommercialPercent(percent)}</strong>
                </span>
              </div>
            );
          })}
        </div>
        {pavilions.length > 0 && (
          <ul className="im-map-live" aria-label="Progresso comercial dos pavilhões">
            {pavilions.map((segment) => (
              <li key={segment.key}>{pavilionSalesDescription(segment)}</li>
            ))}
          </ul>
        )}
      </>
    );
  },
);
