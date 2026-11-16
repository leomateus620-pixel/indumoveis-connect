import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { PavilionPlan } from "./data";
import { Pavilion3Architecture } from "./Pavilion3Architecture";
import { boundCamera, fitPlan, zoomPlan, type PlanCamera, type Viewport } from "./navigation";
import { COMMERCIAL_STATUS_COLORS } from "@/features/commercial-map/visualTheme";
import { SPACE_STATUS } from "@/lib/format";
import { pavilion3Neighbor } from "./pavilion3";
import type { Pavilion3ViewControls, Pavilion3ViewRequest } from "./pavilion3-experience";

export function Pavilion3PlanView({
  plan,
  selectedCode,
  saleCodes,
  statuses,
  availability,
  request,
  controlsRef,
  onSelect,
  onConnect,
}: {
  plan: PavilionPlan;
  selectedCode?: string;
  saleCodes: ReadonlySet<string>;
  statuses: ReadonlyMap<string, string>;
  availability: boolean;
  request: Pavilion3ViewRequest;
  controlsRef: RefObject<Pavilion3ViewControls | null>;
  onSelect: (code: string) => void;
  onConnect: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const size = useRef<Viewport>({ width: 1, height: 1 });
  const [camera, setCamera] = useState<PlanCamera>({ x: 0, y: 0, scale: 1 });
  const current = useRef(camera);
  const [focusCode, setFocusCode] = useState(selectedCode ?? "1");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    x: number;
    y: number;
    moved: boolean;
    code?: string;
    connection?: boolean;
  } | null>(null);
  const paint = useCallback(
    (next: PlanCamera) => {
      current.current = boundCamera(next, plan.bounds, size.current);
      setCamera(current.current);
    },
    [plan.bounds],
  );
  const fit = useCallback(() => {
    const bounds = request.kind === "focus" ? request.bounds : plan.bounds;
    const padding = request.kind === "focus" ? Math.min(size.current.width * 0.2, 110) : 36;
    const next = fitPlan(bounds, size.current, padding);
    // A single row should keep its neighbours visible rather than fill the entire screen.
    if (request.kind === "focus")
      next.scale = Math.min(next.scale, fitPlan(plan.bounds, size.current).scale * 3.2);
    next.x = (size.current.width - (bounds.minX + bounds.maxX) * next.scale) / 2;
    next.y = (size.current.height - (bounds.minY + bounds.maxY) * next.scale) / 2;
    paint(next);
  }, [paint, plan.bounds, request]);
  const zoom = useCallback(
    (factor: number, x = size.current.width / 2, y = size.current.height / 2) =>
      paint(zoomPlan(current.current, factor, { x, y }, plan.bounds, size.current)),
    [paint, plan.bounds],
  );
  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      size.current = { width: rect.width, height: rect.height };
      fit();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [fit]);
  useEffect(() => {
    controlsRef.current = { zoom, rotate: () => {} };
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      zoom(
        Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.0035),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      controlsRef.current = null;
    };
  }, [controlsRef, zoom]);
  return (
    <svg
      ref={svg}
      className="p3-plan-view"
      role="group"
      aria-label="Planta interativa do Pavilhão 3"
      tabIndex={0}
      style={{ "--plan-scale": camera.scale } as CSSProperties}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const delta: Record<string, [number, number]> = {
          ArrowLeft: [60, 0],
          ArrowRight: [-60, 0],
          ArrowUp: [0, 60],
          ArrowDown: [0, -60],
        };
        if (delta[event.key]) {
          event.preventDefault();
          const [x, y] = delta[event.key];
          paint({ ...camera, x: camera.x + x, y: camera.y + y });
        } else if (["+", "=", "-", "0", "Home"].includes(event.key)) {
          event.preventDefault();
          if (["0", "Home"].includes(event.key)) fit();
          else zoom(event.key === "-" ? 0.8 : 1.25);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const target = event.target as Element;
        if (
          target.closest("a") &&
          (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        )
          return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 1)
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            moved: false,
            code:
              target.closest("[data-environment]")?.getAttribute("data-environment") ?? undefined,
            connection: !!target.closest("a"),
          };
        else if (gesture.current) gesture.current.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const old = pointers.current.get(event.pointerId);
        if (!old) return;
        const next = { x: event.clientX, y: event.clientY };
        if (pointers.current.size === 2) {
          const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)![1];
          const distance = Math.hypot(old.x - other.x, old.y - other.y);
          const rect = event.currentTarget.getBoundingClientRect();
          const scaled = zoomPlan(
            current.current,
            distance ? Math.hypot(next.x - other.x, next.y - other.y) / distance : 1,
            { x: (old.x + other.x) / 2 - rect.left, y: (old.y + other.y) / 2 - rect.top },
            plan.bounds,
            size.current,
          );
          paint({
            ...scaled,
            x: scaled.x + (next.x - old.x) / 2,
            y: scaled.y + (next.y - old.y) / 2,
          });
        } else if (gesture.current) {
          if (Math.hypot(next.x - gesture.current.x, next.y - gesture.current.y) > 5)
            gesture.current.moved = true;
          if (gesture.current.moved)
            paint({
              ...current.current,
              x: current.current.x + next.x - old.x,
              y: current.current.y + next.y - old.y,
            });
        }
        pointers.current.set(event.pointerId, next);
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);
        if (pointers.current.size) return;
        const candidate = gesture.current;
        gesture.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (candidate && !candidate.moved) {
          if (candidate.connection) onConnect();
          else if (candidate.code) onSelect(candidate.code);
        }
      }}
      onPointerCancel={() => {
        pointers.current.clear();
        gesture.current = null;
      }}
    >
      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
        <Pavilion3Architecture plan={plan} />
        {plan.environments.map((lot) => {
          const status = statuses.get(lot.code);
          const active = selectedCode === lot.code || saleCodes.has(lot.code);
          return (
            <g
              key={lot.id}
              data-environment={lot.code}
              data-selected={active || undefined}
              data-availability={availability || undefined}
              style={
                {
                  "--p3-stock": COMMERCIAL_STATUS_COLORS[status ?? ""] ?? "#efeadf",
                } as CSSProperties
              }
            >
              {lot.parts.map((part) => (
                <path
                  key={part.id}
                  d={part.path}
                  data-part={part.kind}
                  className="p3-plan-lot"
                  role="button"
                  tabIndex={focusCode === lot.code ? 0 : -1}
                  aria-label={lot.name}
                  aria-description={status ? SPACE_STATUS[status]?.label : undefined}
                  aria-pressed={active}
                  onClick={(event) => {
                    if (event.detail === 0) onSelect(lot.code);
                  }}
                  onKeyDown={(event) => {
                    if (["Enter", " "].includes(event.key)) {
                      event.preventDefault();
                      onSelect(lot.code);
                    } else if (event.key.startsWith("Arrow")) {
                      event.preventDefault();
                      const next = pavilion3Neighbor(plan.environments, lot, event.key);
                      if (!next) return;
                      setFocusCode(next.code);
                      const [x, y] = next.label;
                      const c = current.current;
                      const sx = x * c.scale + c.x,
                        sy = y * c.scale + c.y;
                      paint({
                        ...c,
                        x: c.x + Math.max(24, Math.min(size.current.width - 24, sx)) - sx,
                        y: c.y + Math.max(24, Math.min(size.current.height - 24, sy)) - sy,
                      });
                      svg.current
                        ?.querySelector<SVGPathElement>(`[data-environment="${next.code}"] path`)
                        ?.focus({ preventScroll: true });
                    }
                  }}
                />
              ))}
              <text
                x={lot.label[0]}
                y={lot.label[1]}
                dominantBaseline="central"
                textAnchor="middle"
                pointerEvents="none"
                aria-hidden="true"
              >
                {lot.code}
              </text>
            </g>
          );
        })}
        <image
          href="/brand/pavilion-wayfinding/entrada.svg"
          x="226"
          y="750"
          width="62"
          height="30"
          aria-label="Entrada"
        />
        <a
          href="/mapa/pavilhoes/13/interior"
          aria-label="Acesso ao Pavilhão 13"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (event.detail === 0) onConnect();
          }}
        >
          <image
            href="/brand/pavilhao-3/acesso-pavilhao-13.svg"
            x="461"
            y="417"
            width="52"
            height="62"
          />
        </a>
      </g>
    </svg>
  );
}
