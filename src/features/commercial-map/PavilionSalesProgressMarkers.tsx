import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import { formatCommercialPercent, type CommercialSegmentAggregate } from "@/lib/commercial";
import type { MapInsets, PavilionProjection, PavilionViewport } from "./types";
import {
  PAVILION_MARKER,
  placePavilionMarkers,
  stepPavilionMarkerScale,
} from "./pavilionSalesProgress";

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
  value: number;
  velocity: number;
  transform: string;
  roofLight: string;
  scale: string;
};

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
      function setScale(node: HTMLDivElement, motion: MarkerMotion) {
        const scale = motion.value.toFixed(4);
        if (motion.scale === scale) return;
        motion.scale = scale;
        node.style.setProperty("--im-progress-scale", scale);
      }
      function paint(now: number) {
        frame = null;
        if (!onscreen || document.hidden) {
          stop();
          return;
        }
        const seconds = lastTime ? Math.min((now - lastTime) / 1000, 1 / 20) : 1 / 60;
        let moving = false;
        for (const [pavilion, target] of targets.current) {
          const node = nodes.current.get(pavilion);
          const motion = motions.current.get(pavilion);
          if (!node || !motion) continue;
          Object.assign(
            motion,
            media.matches
              ? { value: target.scale, velocity: 0 }
              : stepPavilionMarkerScale(motion, target.scale, seconds),
          );
          setScale(node, motion);
          moving ||= motion.value !== target.scale || motion.velocity !== 0;
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
        if (!onscreen || document.hidden) return;
        let needsScaleFrame = false;
        for (const [pavilion, node] of nodes.current) {
          const target = targets.current.get(pavilion);
          if (!target) {
            motions.current.delete(pavilion);
            node.hidden = true;
            continue;
          }
          const motion = motions.current.get(pavilion) ?? {
            value: target.scale,
            velocity: 0,
            transform: "",
            roofLight: "",
            scale: "",
          };
          // The roof attachment follows the camera projection in the same frame.
          // Only the small perspective change of the disc uses a spring.
          const transform = `translate3d(${target.x.toFixed(2)}px,${target.y.toFixed(2)}px,0)`;
          if (transform !== motion.transform) {
            motion.transform = transform;
            node.style.transform = transform;
          }
          const roofLight =
            target.lightAngle == null ? "0deg" : `${target.lightAngle.toFixed(0)}deg`;
          if (roofLight !== motion.roofLight) {
            motion.roofLight = roofLight;
            node.style.setProperty("--im-progress-light-angle", roofLight);
          }
          const projectionKind = target.lightAngle == null ? "plan" : "perspective";
          if (node.dataset.projection !== projectionKind) node.dataset.projection = projectionKind;
          if (media.matches) Object.assign(motion, { value: target.scale, velocity: 0 });
          setScale(node, motion);
          needsScaleFrame ||= motion.value !== target.scale || motion.velocity !== 0;
          motions.current.set(pavilion, motion);
          node.hidden = false;
        }
        if (needsScaleFrame) schedule();
        else stop();
      };
      const visibilityChanged = () => {
        if (document.hidden || !onscreen) {
          stop();
          motions.current.clear();
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
      media.addEventListener("change", applyTargets.current);
      const handleMotionPreference = applyTargets.current;
      applyTargets.current();
      return () => {
        stop();
        observer?.disconnect();
        document.removeEventListener("visibilitychange", visibilityChanged);
        media.removeEventListener("change", handleMotionPreference);
        applyTargets.current = () => {};
      };
    }, []);
    useLayoutEffect(() => applyTargets.current(), [visiblePavilions, insets, selectedPavilion]);

    return (
      <>
        <div ref={layer} className="im-pavilion-marker-layer" aria-hidden="true">
          {pavilions.map((segment) => {
            const percent =
              segment.total > 0 && segment.soldPercent != null
                ? Math.max(0, Math.min(100, segment.soldPercent))
                : null;
            const label = formatCommercialPercent(percent);
            return (
              <div
                key={segment.key}
                ref={(node) => {
                  if (node) nodes.current.set(segment.pavilionNumber, node);
                  else nodes.current.delete(segment.pavilionNumber);
                }}
                className={`im-pavilion-marker${percent == null ? " is-neutral" : ""}`}
                data-pavilion-progress={segment.pavilionNumber}
                style={{ "--im-progress-lift": `${PAVILION_MARKER.lift}px` } as React.CSSProperties}
                hidden
              >
                <span className="im-pavilion-marker-roof" />
                <span className="im-pavilion-marker-light" />
                <span className="im-pavilion-marker-disc">
                  <svg className="im-pavilion-marker-ring" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="20.25" className="im-pavilion-marker-track" />
                    {percent != null && percent > 0 && (
                      <circle
                        cx="24"
                        cy="24"
                        r="20.25"
                        pathLength="100"
                        strokeDasharray={percent < 100 ? `${percent} 100` : undefined}
                        className="im-pavilion-marker-value"
                      />
                    )}
                  </svg>
                  <strong data-compact={label.length > 4 || undefined}>{label}</strong>
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
