import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";
import { MAP_BOUNDS, TREES } from "./data/territory";
import {
  PARK_CORE_ENTITIES as ENTITIES,
  PARK_CONTEXT_BLOCKS,
  PARK_CONTEXT_ROADS,
  PARK_CONTEXT_WALKS,
  PERMANENT_PARK_LANDMARKS,
  PERMANENT_PARK_EXPLORATION,
  PARK_GATES,
} from "./permanentParkLayout";
import type { MapEntity, Point } from "./data/territory";
import type { MapHandle, MapRendererProps, PavilionProjection } from "./types";
import { MOTION } from "./motion";
import { createSelectionNavigationSession, isClick, normalizedWheelDelta } from "./navigation";
import { pointInPolygon, polygonBounds } from "./geometry";
import {
  isWalkway,
  STREET_LABEL,
  streetLabelCorridor,
  streetLabelPresentation,
} from "./labelPolicy";
import { COMMERCIAL_STATUS_COLORS, VISUAL_THEME } from "./visualTheme";
import { commercialBoundaries, interiorLotAnchor, LOT_GRAPHICS } from "./commercialPresentation";
import { getPavilionPresentation } from "./architectureOrientation";
import { pavilionMarkerScale } from "./pavilionSalesProgress";

const fullWidth = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
const fullHeight = MAP_BOUNDS.maxY - MAP_BOUNDS.minY;
const parkBounds = polygonBounds(PERMANENT_PARK_EXPLORATION.flat());
const parkWidth = parkBounds.maxX - parkBounds.minX;
type Box = { x: number; y: number; width: number; height: number };
type Map2DProps = MapRendererProps & {
  onNavigate?(): void;
  onGestureChange?(active: boolean): void;
};
const base: Box = {
  x: MAP_BOUNDS.minX - fullWidth * 0.035,
  y: MAP_BOUNDS.minY - fullHeight * 0.035,
  width: fullWidth * 1.07,
  height: fullHeight * 1.07,
};
const roads = ENTITIES.filter((entity) => entity.kind === "road");
const lotBoundaries = commercialBoundaries(ENTITIES);
const lotAnchors = new Map(
  ENTITIES.filter((entity) => entity.kind === "lot").map((entity) => [
    entity.id,
    interiorLotAnchor(entity.polygon, entity.anchor),
  ]),
);
const roadCorridors = new Map(
  roads.map((entity) => [entity.id, streetLabelCorridor(entity, roads)]),
);
const pavilion8Id = "indumoveis:pavilion:8";
const pavilions = ENTITIES.filter((entity) => entity.kind === "pavilion");

function Pavilion8MapDetail({ entity, roofVisible }: { entity: MapEntity; roofVisible: boolean }) {
  const clip = useId();
  const presentation = getPavilionPresentation(entity);
  if (!presentation) return null;

  const [a, b] = presentation.frontEdge;
  const frontWidth = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tangent = [(b[0] - a[0]) / frontWidth, (b[1] - a[1]) / frontWidth];
  const frontMidpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [ridgeX, ridgeY] = presentation.ridgeDirection;
  const [frontX, frontY] = presentation.frontNormal;
  const bounds = polygonBounds(entity.polygon);
  const reach = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  return (
    <g pointerEvents="none" aria-hidden="true">
      <clipPath id={clip}>
        <polygon points={entity.polygon.map((point) => point.join(",")).join(" ")} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {roofVisible && (
          <line
            x1={frontMidpoint[0] - ridgeX * reach}
            y1={frontMidpoint[1] - ridgeY * reach}
            x2={frontMidpoint[0] + ridgeX * reach}
            y2={frontMidpoint[1] + ridgeY * reach}
            stroke="#776c63"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {presentation.mainEntries.map(([x, y]) => {
          const inset = frontWidth * 0.04;
          const halfWidth = frontWidth * 0.06;
          return (
            <line
              key={`${x},${y}`}
              x1={x - frontX * inset - tangent[0] * halfWidth}
              y1={y - frontY * inset - tangent[1] * halfWidth}
              x2={x - frontX * inset + tangent[0] * halfWidth}
              y2={y - frontY * inset + tangent[1] * halfWidth}
              stroke="#8c4e3c"
              strokeWidth="2.2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
    </g>
  );
}

function entityColor(entity: MapEntity) {
  if (entity.kind === "road") return isWalkway(entity) ? VISUAL_THEME.walk : VISUAL_THEME.road;
  if (entity.kind === "lot") return "#91ad7d";
  if (entity.kind === "pavilion") return VISUAL_THEME.wall;
  if (entity.kind === "landscape") return VISUAL_THEME.landscape;
  return VISUAL_THEME.support;
}
function sceneLabel(entity: MapEntity) {
  if (entity.kind === "lot")
    return (entity.numbers ?? []).map((n) => String(n).padStart(2, "0")).join(" / ");
  if (entity.kind === "pavilion") {
    const number = entity.id.split(":").at(-1);
    return `P${number}${number === "1" ? " · Mostra" : ""}`;
  }
  if (entity.kind === "landscape" && entity.id !== "indumoveis:landscape:grove") return "";
  if (entity.id === "indumoveis:support:mao-na-massa") return "Casa / Sede";
  return entity.label;
}
function labelRotation(entity: MapEntity) {
  if (entity.kind !== "road") return undefined;
  return roadCorridors.get(entity.id)?.vertical
    ? `rotate(-90 ${entity.anchor[0]} ${entity.anchor[1]})`
    : undefined;
}

function physicalSurfacePath(surface: MapEntity & { holes?: Point[][] }) {
  return [surface.polygon, ...(surface.holes ?? [])]
    .map((ring) => `M${ring.map((point) => point.join(",")).join("L")}Z`)
    .join("");
}

/** Same territorial polygons, independent of the engine, usable while the 3D chunk loads. */
export const Map2D = forwardRef<MapHandle, Map2DProps>(function Map2D(props, ref) {
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<Box>({ ...base });
  const selectionSession = useRef(createSelectionNavigationSession<Box>((value) => ({ ...value })));
  const manuallyNavigated = useRef(false);
  const cameraRestored = useRef(false);
  const animation = useRef<number | null>(null);
  const animationGeneration = useRef(0);
  const labels = useRef<{ node: SVGTextElement; entity: MapEntity }[]>([]);
  const streetState = useRef(new Map<string, { scale: number; visible: boolean }>());
  const current = useRef(props);
  current.current = props;
  const pointers = useRef(new Map<number, Point>());
  const candidate = useRef<{
    id: number;
    start: Point;
    entity?: string;
    landmark?: string;
    moved: boolean;
    touch: boolean;
  } | null>(null);
  const write = () => {
    const b = box.current;
    const rect = svg.current?.getBoundingClientRect();
    const aspect = rect?.width && rect.height ? rect.height / rect.width : base.height / base.width;
    const cx = b.x + b.width / 2,
      cy = b.y + b.height / 2;
    b.width = Math.min(parkWidth * 2.2, Math.max(fullWidth * 0.035, b.width));
    b.height = b.width * aspect;
    b.x = Math.max(parkBounds.minX, Math.min(parkBounds.maxX, cx)) - b.width / 2;
    b.y = Math.max(parkBounds.minY, Math.min(parkBounds.maxY, cy)) - b.height / 2;
    svg.current?.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
    svg.current?.classList.toggle("im-map-near", b.width < fullWidth * 0.7);
    if (!rect?.width) return;
    svg.current?.style.setProperty("--im-label-unit", `${b.width / rect.width}px`);
    const pixelsPerUnit = rect.width / b.width;
    const { onPavilionProjection, inspectedId } = current.current;
    if (onPavilionProjection) {
      const projections: PavilionProjection[] = [];
      if (b.width <= fullWidth * 1.85) {
        for (const pavilion of pavilions) {
          if (pavilion.id === inspectedId) continue;
          const [x, y] = pavilion.anchor;
          projections.push({
            pavilionNumber: Number(pavilion.id.split(":").at(-1)),
            x: (x - b.x) * pixelsPerUnit,
            y: (y - b.y) * pixelsPerUnit,
            distance: Math.hypot(x - cx, y - cy),
            scale: pavilionMarkerScale(b.width, rect.width),
          });
        }
      }
      onPavilionProjection(projections, { width: rect.width, height: rect.height });
    }
    // Street text starts at one authored world size, never at a minimum screen
    // size. Only the glyph band is measured; no full-cell/white-plate collision.
    for (const { node, entity } of labels.current) {
      if (entity.kind !== "road") continue;
      const previous = streetState.current.get(entity.id);
      const oldScale = previous?.scale || 1;
      const glyph = node.getBBox?.();
      const worldTextWidth =
        (glyph?.width
          ? glyph.width / oldScale
          : (node.textContent?.length ?? 0) * STREET_LABEL.baseTextHeight * 0.55) + 0.06;
      const worldTextHeight =
        (glyph?.height ? glyph.height / oldScale : STREET_LABEL.baseTextHeight * 0.75) + 0.06;
      const corridor = roadCorridors.get(entity.id)!;
      const presentation = streetLabelPresentation({
        naturalTextWidthPx: worldTextWidth * pixelsPerUnit,
        naturalTextHeightPx: worldTextHeight * pixelsPerUnit,
        worldTextWidth,
        worldTextHeight,
        corridorLength: corridor.length,
        corridorWidth: corridor.width,
        wasVisible: previous?.visible ?? false,
        selected: entity.id === current.current.selectedId,
      });
      // A zero corridor hides the text but leaves a measurable nonzero font.
      const scale = presentation.scale || 1;
      node.style.fontSize = `${STREET_LABEL.baseTextHeight * scale}px`;
      node.style.strokeWidth = `${Math.min(0.06 * scale, 1.3 / pixelsPerUnit)}px`;
      node.style.opacity = String(presentation.opacity);
      streetState.current.set(entity.id, { scale, visible: presentation.visible });
    }
    // Read every label before changing visibility. Pan/zoom never updates React state.
    const measured = labels.current.map((label) => ({
      ...label,
      bounds: label.node.getBoundingClientRect(),
    }));
    const accepted: DOMRect[] = [];
    for (const { node, entity, bounds } of measured) {
      const selected = entity.id === current.current.selectedId;
      const unit = b.width / rect.width;
      const left = b.x + (bounds.left - rect.left - 2) * unit;
      const right = b.x + (bounds.right - rect.left + 2) * unit;
      const top = b.y + (bounds.top - rect.top - 2) * unit;
      const bottom = b.y + (bounds.bottom - rect.top + 2) * unit;
      const fits =
        entity.kind !== "lot" ||
        (pointInPolygon([left, top], entity.polygon) &&
          pointInPolygon([right, top], entity.polygon) &&
          pointInPolygon([left, bottom], entity.polygon) &&
          pointInPolygon([right, bottom], entity.polygon));
      const visible =
        !!node.textContent &&
        (entity.kind === "lot" || entity.kind === "road" || selected) &&
        (entity.kind !== "road" || streetState.current.get(entity.id)?.visible) &&
        fits &&
        bounds.right > rect.left &&
        bounds.left < rect.right &&
        bounds.bottom > rect.top &&
        bounds.top < rect.bottom &&
        (selected ||
          !accepted.some(
            (r) =>
              bounds.left < r.right + 3 &&
              bounds.right > r.left - 3 &&
              bounds.top < r.bottom + 3 &&
              bounds.bottom > r.top - 3,
          ));
      node.style.visibility = visible ? "visible" : "hidden";
      if (visible) accepted.push(bounds);
    }
  };
  const cancelAnimation = () => {
    animationGeneration.current++;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  };
  const animateBox = (destination: Box, duration: number) => {
    cancelAnimation();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      box.current = destination;
      write();
      return;
    }
    const start = { ...box.current },
      began = performance.now();
    const generation = animationGeneration.current;
    const frame = (now: number) => {
      if (generation !== animationGeneration.current) return;
      const p = Math.min(1, (now - began) / duration),
        t = p * p * (3 - 2 * p);
      box.current = {
        x: start.x + (destination.x - start.x) * t,
        y: start.y + (destination.y - start.y) * t,
        width: start.width + (destination.width - start.width) * t,
        height: start.height + (destination.height - start.height) * t,
      };
      write();
      animation.current = p < 1 ? requestAnimationFrame(frame) : null;
      if (p === 1) ensureSelectedVisible();
    };
    animation.current = requestAnimationFrame(frame);
  };
  const zoom = (factor: number, center?: Point) => {
    manuallyNavigated.current = true;
    current.current.onNavigate?.();
    cancelAnimation();
    const b = box.current;
    const cx = center?.[0] ?? b.x + b.width / 2;
    const cy = center?.[1] ?? b.y + b.height / 2;
    b.x = cx - (cx - b.x) / factor;
    b.y = cy - (cy - b.y) / factor;
    b.width /= factor;
    b.height /= factor;
    write();
  };
  const focus = (id?: string) => {
    const entity = ENTITIES.find((e) => e.id === id);
    if (!entity) {
      const rect = svg.current?.getBoundingClientRect();
      const width = Math.max(
        base.width,
        (base.height * (rect?.width ?? 1)) / Math.max(1, rect?.height ?? 1),
      );
      const height =
        width * (rect?.height && rect.width ? rect.height / rect.width : base.height / base.width);
      animateBox(
        {
          x: (MAP_BOUNDS.minX + MAP_BOUNDS.maxX - width) / 2,
          y: (MAP_BOUNDS.minY + MAP_BOUNDS.maxY - height) / 2,
          width,
          height,
        },
        MOTION.focusFar,
      );
      return;
    }
    focusPolygon(entity.polygon, entity.anchor);
  };
  const focusPolygon = (polygon: Point[], anchor?: Point) => {
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]);
    const center: Point = anchor ?? [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ];
    const rect = svg.current?.getBoundingClientRect();
    const right = Math.min(0.75, current.current.insets.right / Math.max(1, rect?.width ?? 1));
    const bottom = Math.min(0.75, current.current.insets.bottom / Math.max(1, rect?.height ?? 1));
    const aspect = rect?.width && rect.height ? rect.height / rect.width : base.height / base.width;
    const width = Math.max(
      ((Math.max(...xs) - Math.min(...xs)) * 2.1) / (1 - right),
      ((Math.max(...ys) - Math.min(...ys)) * 2.1) / aspect / (1 - bottom),
      fullWidth * 0.1,
    );
    const height = width * aspect;
    animateBox(
      {
        x: center[0] - width * (0.5 - right * 0.5),
        y: center[1] - height * (0.5 - bottom * 0.5),
        width,
        height,
      },
      Math.min(240, MOTION.focusNear),
    );
  };
  function ensureSelectedVisible() {
    if (
      animation.current !== null ||
      pointers.current.size ||
      manuallyNavigated.current ||
      !current.current.selectedId
    )
      return;
    const entity = ENTITIES.find((e) => e.id === current.current.selectedId),
      element = svg.current;
    const matrix = element?.getScreenCTM?.();
    if (!entity || !element || !matrix) return;
    const rect = element.getBoundingClientRect();
    const corners = entity.polygon.map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
    const inset = current.current.insets;
    if (
      corners.some(
        (p) =>
          p.x < rect.left + 24 ||
          p.x > rect.right - inset.right - 24 ||
          p.y < rect.top + 44 ||
          p.y > rect.bottom - inset.bottom - 24,
      )
    )
      focus(entity.id);
  }
  useImperativeHandle(ref, () => ({
    focus,
    focusLandmark: (id) => {
      const landmark = PERMANENT_PARK_LANDMARKS.find((entry) => entry.id === id);
      if (!landmark) return false;
      focusPolygon(landmark.polygon);
      return true;
    },
    zoom,
    pan: (dx, dy) => {
      manuallyNavigated.current = true;
      current.current.onNavigate?.();
      cancelAnimation();
      box.current.x += dx * box.current.width * 0.08;
      box.current.y += dy * box.current.height * 0.08;
      write();
    },
    rotate: () => {},
    getTarget: () => [
      box.current.x + box.current.width / 2,
      box.current.y + box.current.height / 2,
    ],
    captureCamera: () => ({ kind: "2d", ...box.current }),
    restoreOverview: () => {
      const rect = svg.current?.getBoundingClientRect(),
        aspect = (rect?.width ?? 1) / Math.max(1, rect?.height ?? 1);
      const width = Math.max(parkWidth, (parkBounds.maxY - parkBounds.minY) * aspect) * 1.08,
        height = width / aspect;
      animateBox(
        {
          x: (parkBounds.minX + parkBounds.maxX - width) / 2,
          y: (parkBounds.minY + parkBounds.maxY - height) / 2,
          width,
          height,
        },
        MOTION.focusFar,
      );
    },
    restoreCommercial: () => focus(),
  }));
  useEffect(() => {
    const priority = { pavilion: 1, road: 2, support: 3, lot: 4, landscape: 5 };
    labels.current = Array.from(svg.current?.querySelectorAll("text") ?? [])
      .map((node) => ({
        node,
        entity: ENTITIES.find(
          (entity) =>
            entity.id === node.closest("[data-label-entity]")?.getAttribute("data-label-entity"),
        )!,
      }))
      .sort(
        (a, b) =>
          (a.entity.id === props.selectedId ? 0 : priority[a.entity.kind]) -
          (b.entity.id === props.selectedId ? 0 : priority[b.entity.kind]),
      );
    write();
    // Labels share the existing SVG; selection only changes their priority.
  }, [props.selectedId, props.inspectedId, props.onPavilionProjection]);
  useEffect(() => {
    write();
    if (props.initialFocus) {
      box.current.x = props.initialFocus[0] - box.current.width / 2;
      box.current.y = props.initialFocus[1] - box.current.height / 2;
      write();
    }
    current.current.onReady();
    const element = svg.current;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const matrix = element?.getScreenCTM();
      if (!matrix) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
      zoom(
        Math.exp(
          -normalizedWheelDelta(e.deltaY, e.deltaMode, element?.clientHeight ?? 300) * 0.002,
        ),
        [p.x, p.y],
      );
    };
    element?.addEventListener("wheel", wheel, { passive: false });
    const cancel = () => {
      cancelAnimation();
      pointers.current.clear();
      candidate.current = null;
      current.current.onGestureChange?.(false);
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changedMotion = () => {
      if (motion.matches) cancelAnimation();
    };
    motion.addEventListener("change", changedMotion);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            write();
            ensureSelectedVisible();
          })
        : null;
    if (element) observer?.observe(element);
    return () => {
      element?.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
      motion.removeEventListener("change", changedMotion);
      observer?.disconnect();
      cancel();
    };
    // The SVG and its gesture owner survive selection and commercial refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const change = selectionSession.current.change(
      props.selectedId ?? props.inspectedId,
      () => box.current,
    );
    if (change.kind === "none") return;
    if (props.initialCamera?.kind === "2d" && change.kind === "focus" && !cameraRestored.current) {
      cameraRestored.current = true;
      manuallyNavigated.current = true;
      box.current = { ...props.initialCamera };
      write();
      return;
    }
    manuallyNavigated.current = false;
    if (change.kind === "focus") focus(change.id);
    else animateBox(change.destination, Math.min(260, MOTION.view));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId, props.inspectedId]);
  // Reframe only when a newly occupied screen region actually hides the item.
  useEffect(() => {
    ensureSelectedVisible();
    // The gesture owner reads current selection through its ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.insets.right, props.insets.bottom]);
  return (
    <svg
      ref={svg}
      className="im-map-svg"
      viewBox={`${base.x} ${base.y} ${base.width} ${base.height}`}
      role="img"
      aria-label="Planta interativa do parque Indumóveis. Consulte também pela busca."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        cancelAnimation();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
        props.onGestureChange?.(true);
        if (pointers.current.size > 1) {
          if (candidate.current) candidate.current.moved = true;
          return;
        }
        candidate.current = {
          id: e.pointerId,
          start: [e.clientX, e.clientY],
          entity:
            (e.target as Element).closest("[data-entity]")?.getAttribute("data-entity") ??
            undefined,
          // Read at press time: pointer capture retargets the release.
          landmark:
            (e.target as Element).closest("[data-landmark]")?.getAttribute("data-landmark") ??
            undefined,
          moved: false,
          touch: e.pointerType === "touch",
        };
      }}
      onPointerMove={(e) => {
        const old = pointers.current.get(e.pointerId);
        if (!old) return;
        const c = candidate.current;
        if (
          c &&
          Math.hypot(e.clientX - c.start[0], e.clientY - c.start[1]) >
            (c.touch ? MOTION.touchDrag : MOTION.mouseDrag)
        )
          c.moved = true;
        if (c?.moved) props.onNavigate?.();
        if (c?.moved) manuallyNavigated.current = true;
        const rect = e.currentTarget.getBoundingClientRect();
        const scale = Math.max(box.current.width / rect.width, box.current.height / rect.height);
        if (pointers.current.size === 2) {
          const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
          if (other) {
            const before = Math.hypot(old[0] - other[0], old[1] - other[1]);
            const after = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
            const matrix = svg.current?.getScreenCTM?.();
            const midpoint = matrix
              ? new DOMPoint(
                  (e.clientX + other[0]) / 2,
                  (e.clientY + other[1]) / 2,
                ).matrixTransform(matrix.inverse())
              : null;
            if (before > 0) zoom(after / before, midpoint ? [midpoint.x, midpoint.y] : undefined);
          }
        } else if (c?.moved) {
          box.current.x -= (e.clientX - old[0]) * scale;
          box.current.y -= (e.clientY - old[1]) * scale;
          write();
        }
        pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
      }}
      onPointerUp={(e) => {
        const c = candidate.current;
        if (
          c &&
          c.id === e.pointerId &&
          !c.moved &&
          isClick({ x: c.start[0], y: c.start[1], touch: c.touch }, e.clientX, e.clientY)
        ) {
          if (c.entity) {
            props.onLandmark?.(null);
            props.onSelect(c.entity);
          } else {
            const landmark = c.landmark ?? null;
            props.onLandmark?.(landmark);
            if (!landmark && props.selectedId) props.onDeselect?.();
          }
        }
        pointers.current.delete(e.pointerId);
        if (!pointers.current.size) {
          candidate.current = null;
          props.onGestureChange?.(false);
        }
      }}
      onPointerCancel={() => {
        candidate.current = null;
        pointers.current.clear();
        props.onGestureChange?.(false);
      }}
      onLostPointerCapture={(e) => {
        pointers.current.delete(e.pointerId);
        if (!pointers.current.size) {
          candidate.current = null;
          props.onGestureChange?.(false);
        }
      }}
    >
      <rect
        x={parkBounds.minX - parkWidth}
        y={parkBounds.minY - parkWidth}
        width={parkWidth * 4}
        height={parkWidth * 4}
        fill={VISUAL_THEME.background}
      />
      <g className="im-map-physical-context" pointerEvents="none" aria-hidden="true">
        {PARK_CONTEXT_BLOCKS.flatMap((block) =>
          (block.referencePieces ?? [block.referencePolygon]).map((polygon, index) => (
            <polygon
              key={`${block.id}:${index}`}
              points={polygon.map((p) => p.join(",")).join(" ")}
              fill="#afbd9b"
              stroke="#839678"
              strokeWidth=".08"
            />
          )),
        )}
        {[...PARK_CONTEXT_ROADS, ...PARK_CONTEXT_WALKS].map((road) => (
          <path
            key={road.id}
            d={physicalSurfacePath(road)}
            fillRule="evenodd"
            fill={road.id.includes(":walk:") ? VISUAL_THEME.walk : VISUAL_THEME.road}
          />
        ))}
        {PERMANENT_PARK_LANDMARKS.filter((l) => !l.existingOwner).map((l) => (
          <polygon
            key={l.id}
            data-landmark={l.id}
            pointerEvents="all"
            points={l.polygon.map((p) => p.join(",")).join(" ")}
            fill={VISUAL_THEME.roof}
            stroke="#68736b"
            strokeWidth=".1"
          />
        ))}
        {PARK_GATES.map((g) => (
          <circle key={g.id} cx={g.point[0]} cy={g.point[1]} r=".5" fill={VISUAL_THEME.plum} />
        ))}
      </g>
      {ENTITIES.filter((entity) => entity.kind !== "landscape").map((entity) => (
        <g
          key={entity.id}
          data-entity={entity.id}
          className={`im-map-entity im-map-${entity.kind} ${props.selectedId === entity.id ? "is-selected" : ""} ${props.highlightedIds.includes(entity.id) ? "is-highlighted" : ""}`}
        >
          <polygon
            points={entity.polygon.map((p) => p.join(",")).join(" ")}
            style={{
              fill:
                entity.kind === "road" &&
                !["indumoveis:road:benvenuto", "indumoveis:road:imigrantes"].includes(entity.id)
                  ? "transparent"
                  : (entity.kind === "lot" &&
                      COMMERCIAL_STATUS_COLORS[props.statuses[entity.id]]) ||
                    entityColor(entity),
            }}
          />
          {entity.kind === "pavilion" && (
            <polygon
              className="im-map-roof"
              points={entity.polygon.map((p) => p.join(",")).join(" ")}
              style={{
                display: props.inspectedId === entity.id ? "none" : undefined,
                fill: entity.id === pavilion8Id ? "#c8c2b5" : VISUAL_THEME.roof,
              }}
            />
          )}
          {entity.id === pavilion8Id && (
            <Pavilion8MapDetail entity={entity} roofVisible={props.inspectedId !== entity.id} />
          )}
          {props.selectedId === entity.id && (
            <polygon
              points={entity.polygon.map((p) => p.join(",")).join(" ")}
              pointerEvents="none"
              style={{ fill: LOT_GRAPHICS.selected, fillOpacity: 0.09, stroke: "none" }}
            />
          )}
          {entity.accesses?.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={fullWidth * 0.0022} fill={VISUAL_THEME.plum} />
          ))}
        </g>
      ))}
      <g className="im-map-cadastral-ink" pointerEvents="none" aria-hidden="true">
        {lotBoundaries.map((edge, index) => (
          <line
            key={index}
            x1={edge.a[0]}
            y1={edge.a[1]}
            x2={edge.b[0]}
            y2={edge.b[1]}
            stroke={edge.owners.length === 1 ? LOT_GRAPHICS.perimeter : LOT_GRAPHICS.division}
            strokeWidth={
              edge.owners.length === 1 ? LOT_GRAPHICS.perimeterPixels : LOT_GRAPHICS.divisionPixels
            }
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        ))}
      </g>
      {TREES.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={fullWidth * 0.004}
          fill={VISUAL_THEME.foliage[i % VISUAL_THEME.foliage.length]}
          pointerEvents="none"
        />
      ))}
      <g className="im-map-labels" pointerEvents="none">
        {ENTITIES.map((entity) => (
          <g
            key={entity.id}
            data-label-entity={entity.id}
            className={`im-map-entity im-map-${entity.kind} ${props.selectedId === entity.id ? "is-selected" : ""}`}
          >
            <text
              x={(lotAnchors.get(entity.id) ?? entity.anchor)[0]}
              y={(lotAnchors.get(entity.id) ?? entity.anchor)[1]}
              textAnchor="middle"
              dominantBaseline="central"
              className={entity.kind === "lot" ? "im-lot-number" : ""}
              transform={labelRotation(entity)}
              style={
                entity.kind === "road"
                  ? {
                      fontSize: STREET_LABEL.baseTextHeight,
                      fontWeight: 500,
                      fill: isWalkway(entity) ? VISUAL_THEME.text : VISUAL_THEME.roadText,
                      stroke: isWalkway(entity) ? VISUAL_THEME.walk : VISUAL_THEME.roadHalo,
                      strokeWidth: 0.06,
                      visibility: "hidden",
                    }
                  : entity.kind !== "lot"
                    ? { visibility: entity.id === props.selectedId ? undefined : "hidden" }
                    : undefined
              }
            >
              {sceneLabel(entity)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
});
