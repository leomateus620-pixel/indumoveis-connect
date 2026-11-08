import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Maximize2, Minus, PanelLeft, Plus, Scan, X } from "lucide-react";
import { SPACE_STATUS } from "@/lib/format";
import { boundCamera, fitPlan, zoomPlan, type PlanCamera, type Viewport } from "./navigation";
import type { PavilionPlan } from "./data";
import "./interior.css";

type Props = {
  plan: PavilionPlan;
  selectedCode?: string;
  commercial?: Record<string, { status: string; exhibitor?: string }>;
  commercialError?: boolean;
  onRetryCommercial?: () => void;
  onSelect: (code?: string) => void;
  onBack: () => void;
};
const formatArea = (value: number) =>
  `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

export function PavilionInterior({
  plan,
  selectedCode,
  commercial = {},
  commercialError,
  onRetryCommercial,
  onSelect,
  onBack,
}: Props) {
  const selected = plan.environments.find((e) => e.code === selectedCode);
  const [panelOpen, setPanelOpen] = useState(!!selected);
  const [mobile, setMobile] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drawing = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const camera = useRef<PlanCamera>({ x: 0, y: 0, scale: 1 });
  const size = useRef<Viewport>({ width: 1, height: 1 });
  const initialized = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: { x: number; y: number }; code?: string; moved: boolean } | null>(
    null,
  );
  const paint = useCallback(
    (next: PlanCamera) => {
      camera.current = boundCamera(next, plan.bounds, size.current);
      const c = camera.current;
      drawing.current?.setAttribute("transform", `translate(${c.x} ${c.y}) scale(${c.scale})`);
      const fitted = fitPlan(plan.bounds, size.current).scale;
      svg.current?.classList.toggle("is-near", c.scale > fitted * 1.6);
      svg.current?.style.setProperty("--plan-scale", String(c.scale));
      svg.current?.style.setProperty("--plan-number-size", `${Math.max(14, 10.5 / c.scale)}px`);
    },
    [plan.bounds],
  );
  const fit = useCallback(() => {
    if (mobile) {
      setPanelOpen(false);
      size.current.left = 0;
    }
    paint(
      fitPlan(
        plan.bounds,
        { ...size.current, height: Math.max(100, size.current.height - 72) },
        mobile ? 20 : 40,
      ),
    );
  }, [paint, plan.bounds, mobile]);
  const zoom = useCallback(
    (factor: number, x = size.current.width / 2, y = size.current.height / 2) => {
      paint(zoomPlan(camera.current, factor, { x, y }, plan.bounds, size.current));
    },
    [paint, plan.bounds],
  );
  useLayoutEffect(() => {
    const host = viewport.current;
    if (!host) return;
    const resize = () => {
      const previous = size.current;
      const rect = host.getBoundingClientRect();
      size.current = { width: rect.width, height: rect.height };
      setMobile(window.matchMedia("(max-width: 700px)").matches);
      if (!initialized.current) {
        paint(
          fitPlan(
            plan.bounds,
            { ...size.current, height: Math.max(100, size.current.height - 72) },
            rect.width < 700 ? 20 : 40,
          ),
        );
        initialized.current = true;
      } else
        paint({
          ...camera.current,
          x: camera.current.x + (rect.width - previous.width) / 2,
          y: camera.current.y + (rect.height - previous.height) / 2,
        });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => observer.disconnect();
  }, [paint, plan.bounds]);
  // A desktop column is reserved from the first frame. Selecting never resets pan or zoom.
  // On mobile the sheet can collapse immediately, retaining the inspection context.
  useEffect(() => {
    if (selectedCode) setPanelOpen(true);
  }, [selectedCode]);
  useLayoutEffect(() => {
    if (sidebar.current) sidebar.current.scrollTop = 0;
  }, [selectedCode]);
  useEffect(() => {
    if (!selected || !initialized.current) return;
    const sheet =
      mobile && panelOpen
        ? (viewport.current?.parentElement?.querySelector("aside")?.getBoundingClientRect().width ??
          0)
        : 0;
    const left = sheet + 20,
      right = size.current.width - 20;
    const top = 56,
      bottom = size.current.height - 90;
    size.current.left = sheet;
    const points = selected.parts.flatMap((part) => part.polygon);
    if (!points.length) return;
    const c = camera.current;
    const xs = points.map(([x]) => x * c.scale + c.x);
    const ys = points.map(([, y]) => y * c.scale + c.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    let dx = 0,
      dy = 0;
    // Reveal only an obscured selection; never reset a user's chosen scale.
    if (maxX - minX <= right - left)
      dx = minX < left ? left - minX : maxX > right ? right - maxX : 0;
    else {
      const anchor = selected.label[0] * c.scale + c.x;
      dx = anchor < left ? left - anchor : anchor > right ? right - anchor : 0;
    }
    if (maxY - minY <= bottom - top)
      dy = minY < top ? top - minY : maxY > bottom ? bottom - maxY : 0;
    else {
      const anchor = selected.label[1] * c.scale + c.y;
      dy = anchor < top ? top - anchor : anchor > bottom ? bottom - anchor : 0;
    }
    if (dx || dy) paint({ ...c, x: c.x + dx, y: c.y + dy });
  }, [selected, mobile, panelOpen, paint]);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      zoom(
        Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.0035),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    node.addEventListener("wheel", wheel, { passive: false });
    const cancel = () => {
      pointers.current.clear();
      gesture.current = null;
    };
    window.addEventListener("blur", cancel);
    return () => {
      node.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", cancel);
    };
  }, [zoom]);
  const choose = (code?: string) => {
    onSelect(code);
    if (code) setPanelOpen(true);
  };
  const collapse = () => {
    setPanelOpen(false);
    size.current.left = 0;
    requestAnimationFrame(() => svg.current?.focus({ preventScroll: true }));
  };
  const close = () => {
    onSelect(undefined);
    collapse();
  };
  const numEnvironments = plan.environments.filter((e) => /^\d{2}$/.test(e.code));
  const commercialInfo = selected?.kind === "commercial" ? commercial[selected.code] : undefined;
  const hasExternal = selected?.parts.some((part) => part.kind === "external");
  const stopGesture = (event: React.PointerEvent<SVGSVGElement>, cancelled = false) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) {
      if (gesture.current) gesture.current.moved = true;
      return;
    }
    const candidate = gesture.current;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && candidate && !candidate.moved) choose(candidate.code);
  };
  return (
    <main
      className={`arq-interior ${panelOpen ? "is-panel-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <header className="arq-header">
        <button className="arq-back" onClick={onBack}>
          <ArrowLeft size={17} />
          <span>Voltar ao parque</span>
        </button>
        <div className="arq-heading">
          <span className="arq-eyebrow">Pavilhão 1</span>
          <h1>Mostra ARQ & Design</h1>
        </div>
        <img
          className="arq-signature"
          src="/brand/arq-design/arq-design-compact.svg"
          alt="ARQ & Design Indumóveis"
          width="106"
          height="81"
        />
      </header>
      <div className="arq-workspace">
        <aside
          ref={sidebar}
          className="arq-sidebar"
          aria-label="Informações do ambiente"
          hidden={mobile && !panelOpen}
        >
          <div className="arq-sidebar-top">
            <span className="arq-eyebrow">
              {selected ? "Ambiente selecionado" : "Explore a mostra"}
            </span>
            <button className="arq-icon" onClick={close} aria-label="Fechar painel e seleção">
              <X size={18} />
            </button>
          </div>
          {selected ? (
            <div className="arq-information" key={selected.code}>
              {/^\d{2}$/.test(selected.code) && <span className="arq-number">{selected.code}</span>}
              <h2>{selected.name}</h2>
              {selected.declaredAreaM2 != null && (
                <p className="arq-area">
                  <span>Área</span>
                  <strong>{formatArea(selected.declaredAreaM2)}</strong>
                </p>
              )}
              {selected.functionLabel &&
                selected.functionLabel !== selected.name &&
                selected.kind !== "hall" && (
                  <p className="arq-function">{selected.functionLabel}</p>
                )}
              {hasExternal && (
                <p className="arq-external">
                  <span aria-hidden="true" />
                  Área externa vinculada
                </p>
              )}
              {selected.kind === "commercial" && commercialError && (
                <div className="arq-query-error" role="alert">
                  <p>Não foi possível carregar a situação comercial.</p>
                  <button onClick={onRetryCommercial}>Tentar novamente</button>
                </div>
              )}
              {commercialInfo?.status && SPACE_STATUS[commercialInfo.status] && (
                <dl className="arq-commercial">
                  <dt>Situação comercial</dt>
                  <dd>{SPACE_STATUS[commercialInfo.status].label}</dd>
                  {commercialInfo.exhibitor && (
                    <>
                      <dt>Expositor</dt>
                      <dd>{commercialInfo.exhibitor}</dd>
                    </>
                  )}
                </dl>
              )}
              {mobile && (
                <button className="arq-view-plan" onClick={collapse}>
                  Ver na planta <ArrowRight size={16} />
                </button>
              )}
            </div>
          ) : (
            <div className="arq-intro">
              <h2>
                Arquitetura para
                <br />
                novos encontros.
              </h2>
              <p>Selecione um ambiente para conhecer o espaço.</p>
              <div className="arq-index">
                <strong>14</strong>
                <span>espaços comerciais</span>
              </div>
            </div>
          )}
          <nav className="arq-environments" aria-label="Selecionar ambiente">
            <span className="arq-eyebrow">Ambientes</span>
            <div className="arq-space-grid">
              {numEnvironments.map((e) => (
                <button
                  key={e.id}
                  onClick={() => choose(e.code)}
                  aria-label={`${e.code} · ${e.name}`}
                  aria-pressed={selected?.id === e.id}
                >
                  {e.code}
                </button>
              ))}
            </div>
            <button
              className="arq-hall-link"
              onClick={() => choose("salon")}
              aria-pressed={selected?.code === "salon"}
            >
              Salão de Design <ArrowRight size={14} />
            </button>
          </nav>
          <div className="arq-sidebar-footer">
            <span className="arq-key">
              <i />
              Comercial
            </span>
            <span className="arq-key">
              <i className="is-support" />
              Apoio
            </span>
            <span className="arq-key">
              <i className="is-external" />
              Área externa
            </span>
          </div>
        </aside>
        <div className="arq-canvas" ref={viewport}>
          {mobile && !panelOpen && (
            <button className="arq-panel-toggle" onClick={() => setPanelOpen(true)}>
              <PanelLeft size={17} />
              {selected
                ? `${selected.code === "salon" ? "" : selected.code + " · "}${selected.name}`
                : "Ambientes"}
            </button>
          )}
          <svg
            ref={svg}
            className="arq-plan"
            role="group"
            aria-label="Planta interativa do Pavilhão 1"
            aria-describedby="arq-navigation-help"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              const directions: Record<string, [number, number]> = {
                ArrowLeft: [60, 0],
                ArrowRight: [-60, 0],
                ArrowUp: [0, 60],
                ArrowDown: [0, -60],
              };
              if (directions[event.key]) {
                event.preventDefault();
                const [x, y] = directions[event.key];
                paint({ ...camera.current, x: camera.current.x + x, y: camera.current.y + y });
              } else if (["+", "=", "-", "0", "Home", "Escape"].includes(event.key)) {
                event.preventDefault();
                if (event.key === "Escape") {
                  event.stopPropagation();
                  close();
                } else if (event.key === "0" || event.key === "Home") fit();
                else zoom(event.key === "-" ? 0.8 : 1.25);
              }
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const code =
                (event.target as Element)
                  .closest("[data-environment]")
                  ?.getAttribute("data-environment") ?? undefined;
              pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              if (pointers.current.size === 1)
                gesture.current = {
                  start: { x: event.clientX, y: event.clientY },
                  code,
                  moved: false,
                };
              else if (gesture.current) gesture.current.moved = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const old = pointers.current.get(event.pointerId);
              if (!old) return;
              const next = { x: event.clientX, y: event.clientY };
              const all = [...pointers.current.entries()];
              if (all.length === 2) {
                const other = all.find(([id]) => id !== event.pointerId)![1];
                const oldDistance = Math.hypot(old.x - other.x, old.y - other.y);
                const newDistance = Math.hypot(next.x - other.x, next.y - other.y);
                const rect = event.currentTarget.getBoundingClientRect();
                const anchor = {
                  x: (old.x + other.x) / 2 - rect.left,
                  y: (old.y + other.y) / 2 - rect.top,
                };
                const scaled = zoomPlan(
                  camera.current,
                  oldDistance > 0 ? newDistance / oldDistance : 1,
                  anchor,
                  plan.bounds,
                  size.current,
                );
                paint({
                  ...scaled,
                  x: scaled.x + (next.x - old.x) / 2,
                  y: scaled.y + (next.y - old.y) / 2,
                });
              } else if (gesture.current) {
                if (
                  Math.hypot(next.x - gesture.current.start.x, next.y - gesture.current.start.y) > 5
                )
                  gesture.current.moved = true;
                if (gesture.current.moved)
                  paint({
                    ...camera.current,
                    x: camera.current.x + next.x - old.x,
                    y: camera.current.y + next.y - old.y,
                  });
              }
              pointers.current.set(event.pointerId, next);
            }}
            onPointerUp={(e) => stopGesture(e)}
            onPointerCancel={(e) => stopGesture(e, true)}
          >
            <g ref={drawing}>
              {plan.environments.map((environment) => (
                <g
                  key={environment.id}
                  data-environment={environment.code}
                  className={`arq-environment is-${environment.kind} ${selected?.id === environment.id ? "is-selected" : ""}`}
                >
                  {environment.parts.map((part) => (
                    <path
                      key={part.id}
                      d={part.path}
                      data-part={part.kind}
                      className={`arq-part is-${part.kind}`}
                      role={environment.kind === "circulation" ? undefined : "button"}
                      tabIndex={
                        part.kind === "interior" && environment.kind !== "circulation" ? 0 : -1
                      }
                      aria-label={`${environment.code.match(/^\d/) ? environment.code + " · " : ""}${environment.name}${part.kind === "external" ? " · área externa vinculada" : ""}`}
                      aria-pressed={selected?.id === environment.id}
                      onClick={(e) => {
                        if (e.detail === 0) choose(environment.code);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          choose(environment.code);
                        }
                      }}
                    />
                  ))}
                  <text
                    x={environment.label[0]}
                    y={environment.label[1]}
                    className={`arq-plan-label ${/^\d/.test(environment.code) ? "" : "is-word"}`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    aria-hidden="true"
                  >
                    {/^\d/.test(environment.code) ? environment.code : environment.name}
                  </text>
                  {/^\d/.test(environment.code) && (
                    <text
                      x={environment.label[0]}
                      y={environment.label[1] + 17}
                      className="arq-plan-detail"
                      textAnchor="middle"
                      aria-hidden="true"
                    >
                      {environment.functionLabel ??
                        (environment.declaredAreaM2 != null
                          ? formatArea(environment.declaredAreaM2)
                          : "")}
                    </text>
                  )}
                  {environment.parts
                    .filter((p) => p.kind === "external")
                    .map((part) => (
                      <text
                        key={part.id}
                        x={environment.label[0]}
                        y={plan.bounds.minY + 23}
                        className="arq-external-label"
                        textAnchor="middle"
                        aria-hidden="true"
                      >
                        {environment.code} · externa
                      </text>
                    ))}
                </g>
              ))}
              <g className="arq-architecture" aria-hidden="true">
                {plan.architecture.map((element) => (
                  <g key={element.id} className={`is-${element.kind}`}>
                    <path d={element.path} style={{ strokeWidth: element.strokeWidth }} />
                    {element.label && element.labelAt && (
                      <text x={element.labelAt[0]} y={element.labelAt[1]} textAnchor="middle">
                        {element.label}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            </g>
          </svg>
          <div className="arq-view-controls" aria-label="Controles da planta">
            <button className="arq-icon" aria-label="Aproximar" onClick={() => zoom(1.35)}>
              <Plus size={19} />
            </button>
            <button className="arq-icon" aria-label="Afastar" onClick={() => zoom(1 / 1.35)}>
              <Minus size={19} />
            </button>
            <span />
            <button className="arq-icon" aria-label="Ajustar à tela" onClick={fit}>
              <Scan size={19} />
            </button>
            <button
              className="arq-icon arq-fullscreen"
              aria-label="Tela cheia"
              onClick={() => {
                const main = viewport.current?.closest("main");
                if (document.fullscreenElement) void document.exitFullscreen();
                else void main?.requestFullscreen?.().catch(() => {});
              }}
            >
              <Maximize2 size={17} />
            </button>
          </div>
          <span className="arq-sr-only" id="arq-navigation-help">
            Arraste para deslocar. Use a roda ou pinça para ampliar. Com a planta em foco, use as
            setas, mais, menos e zero para ajustar à tela. Enter seleciona um ambiente; Escape fecha
            a seleção.
          </span>
          <span className="arq-sr-only" aria-live="polite">
            {selected
              ? `${/^\d/.test(selected.code) ? selected.code + " " : ""}${selected.name}${selected.declaredAreaM2 != null ? ", " + formatArea(selected.declaredAreaM2) : ""}`
              : "Nenhum ambiente selecionado"}
          </span>
        </div>
      </div>
    </main>
  );
}
