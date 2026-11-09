import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minus,
  PanelLeft,
  Plus,
  Scan,
  Search,
  X,
} from "lucide-react";
import { SPACE_STATUS } from "@/lib/format";
import { Pavilion1Architecture, Pavilion1NumberPlate } from "./Pavilion1Architecture";
import { Pavilion12Architecture } from "./Pavilion12Architecture";
import {
  Pavilion8Architecture,
  Pavilion8LotRelief,
  Pavilion8NumberPlate,
} from "./Pavilion8Architecture";
import { boundCamera, fitPlan, zoomPlan, type PlanCamera, type Viewport } from "./navigation";
import type { InteriorEnvironment, PavilionPlan } from "./data";
import {
  PAVILION_PRESENTATIONS,
  normalizePavilion12LotCode,
  normalizedLotCode,
  type InteriorPresentation,
} from "./presentation";
import "./interior.css";
import "./pavilion1-shell.css";
import {
  parkPavilionNumber,
  pavilionDestinationHref,
  type ParkPavilionNumber,
} from "./connections";
import { WAYFINDING_SIGN_SIZE, WAYFINDING_SIGNS } from "./wayfinding";
import { Pavilion13Architecture } from "./Pavilion13Architecture";
import { Pavilion13LotDirectory } from "./Pavilion13LotDirectory";
import { pavilion13Sector } from "./pavilion13-sectors";
import { pavilion12Neighbor } from "./pavilion12-keyboard";

type Props = {
  plan: PavilionPlan;
  presentation?: InteriorPresentation;
  selectedCode?: string;
  commercial?: Record<string, { status: string; exhibitor?: string }>;
  commercialError?: boolean;
  onRetryCommercial?: () => void;
  onSelect: (code?: string) => void;
  onBack: () => void;
  onConnect?: (pavilion: ParkPavilionNumber) => void;
};
const formatArea = (value: number, minimumFractionDigits = 2) =>
  `${value.toLocaleString("pt-BR", { minimumFractionDigits, maximumFractionDigits: 2 })} m²`;
const defaultConnectionBadge = { width: 92, height: 104, radius: 12 };

export function PavilionInterior({
  plan,
  presentation = PAVILION_PRESENTATIONS[1],
  selectedCode,
  commercial = {},
  commercialError,
  onRetryCommercial,
  onSelect,
  onBack,
  onConnect,
}: Props) {
  const selected = plan.environments.find((e) => e.code === selectedCode);
  const isPavilion1 = presentation.pavilionNumber === 1;
  const isPavilion8 = presentation.pavilionNumber === 8;
  const isPavilion12 = presentation.pavilionNumber === 12;
  const isPavilion13 = presentation.pavilionNumber === 13;
  const lotsMode = presentation.mode === "lots";
  const searchLots = presentation.searchLots === true;
  const [lotQuery, setLotQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [keyboardLot, setKeyboardLot] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(!!selected);
  const [mobile, setMobile] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drawing = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const lotTitle = useRef<HTMLHeadingElement>(null);
  const focusDirectorySelection = useRef(false);
  const viewControls = useRef<HTMLDivElement>(null);
  const camera = useRef<PlanCamera>({ x: 0, y: 0, scale: 1 });
  const size = useRef<Viewport>({ width: 1, height: 1 });
  const initialized = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    start: { x: number; y: number };
    code?: string;
    destination?: ParkPavilionNumber;
    moved: boolean;
  } | null>(null);
  const paint = useCallback(
    (next: PlanCamera) => {
      camera.current = boundCamera(next, plan.bounds, size.current);
      const c = camera.current;
      drawing.current?.setAttribute("transform", `translate(${c.x} ${c.y}) scale(${c.scale})`);
      const fitted = fitPlan(plan.bounds, size.current).scale;
      svg.current?.classList.toggle("is-near", c.scale > fitted * 1.6);
      svg.current?.style.setProperty("--plan-scale", String(c.scale));
      svg.current?.style.setProperty(
        "--plan-number-size",
        `${Math.min(presentation.numberLabelMaxSize ?? Infinity, Math.max(14, 10.5 / c.scale))}px`,
      );
    },
    [plan.bounds, presentation.numberLabelMaxSize],
  );
  const fitViewport = useCallback(
    (compact: boolean) => {
      // In the narrow portrait view, the lot directory needs space above the drawing.
      const top = lotsMode && compact ? 48 : 0;
      const next = fitPlan(
        plan.bounds,
        { ...size.current, height: Math.max(100, size.current.height - 72 - top) },
        compact ? 20 : 40,
      );
      paint({ ...next, y: next.y + top });
    },
    [lotsMode, paint, plan.bounds],
  );
  const fit = useCallback(() => {
    if (mobile) {
      setPanelOpen(false);
      size.current.left = 0;
    }
    fitViewport(mobile);
  }, [fitViewport, mobile]);
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
      const compact = window.matchMedia("(max-width: 700px)").matches;
      setMobile(compact);
      if (!initialized.current) {
        fitViewport(lotsMode ? compact : rect.width < 700);
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
  }, [fitViewport, lotsMode, paint]);
  // A desktop column is reserved from the first frame. Selecting never resets pan or zoom.
  // On mobile the sheet can collapse immediately, retaining the inspection context.
  useEffect(() => {
    if (selectedCode) setPanelOpen(true);
  }, [selectedCode]);
  useLayoutEffect(() => {
    if (sidebar.current) sidebar.current.scrollTop = 0;
    if (!focusDirectorySelection.current) return;
    focusDirectorySelection.current = false;
    lotTitle.current?.focus({ preventScroll: true });
    // Let the activation and route finish before restoring the details to the top.
    const frame = requestAnimationFrame(() => {
      if (sidebar.current) sidebar.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedCode]);
  useEffect(() => {
    if (!selected || !panelOpen || !initialized.current) return;
    const sheet = mobile ? (sidebar.current?.getBoundingClientRect().width ?? 0) : 0;
    const sideMargin = sheet ? 8 : 20;
    const left = sheet + sideMargin,
      right = size.current.width - sideMargin;
    const gallerySheet = isPavilion1 && mobile;
    const top = gallerySheet ? 12 : 56;
    let bottom = size.current.height - (gallerySheet ? 12 : 90);
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
    const fitsHorizontally = maxX - minX <= right - left;
    const anchorX = selected.label[0] * c.scale + c.x;
    if (fitsHorizontally) dx = minX < left ? left - minX : maxX > right ? right - maxX : 0;
    else {
      const margin = gallerySheet ? 12 : 0;
      dx = Math.min(right - margin, Math.max(left + margin, anchorX)) - anchorX;
    }
    if ((lotsMode && mobile) || gallerySheet) {
      const host = viewport.current?.getBoundingClientRect();
      const tools = viewControls.current?.getBoundingClientRect();
      const anchorOnly = gallerySheet && !fitsHorizontally;
      const clearance = anchorOnly ? 12 : isPavilion13 ? 6 : 0;
      if (
        host &&
        tools &&
        tools.top - host.top > top + 20 &&
        (anchorOnly ? anchorX : maxX) + dx + clearance > tools.left - host.left &&
        (anchorOnly ? anchorX : minX) + dx - clearance < tools.right - host.left
      ) {
        bottom = Math.min(bottom, tools.top - host.top - 12);
      }
    }
    if (maxY - minY <= bottom - top && !(gallerySheet && !fitsHorizontally))
      dy = minY < top ? top - minY : maxY > bottom ? bottom - maxY : 0;
    else {
      const anchor = selected.label[1] * c.scale + c.y;
      const margin = gallerySheet ? 12 : 0;
      dy = Math.min(bottom - margin, Math.max(top + margin, anchor)) - anchor;
    }
    if (dx || dy) paint({ ...c, x: c.x + dx, y: c.y + dy });
  }, [selected, mobile, panelOpen, paint, lotsMode, isPavilion1, isPavilion13]);
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
    if (
      lotsMode &&
      code &&
      !plan.environments.some((e) => e.code === code && e.kind === "commercial")
    )
      return;
    setSearchError("");
    onSelect(code);
    if (code) setPanelOpen(true);
  };
  const collapse = (focusTarget: SVGElement | null = svg.current) => {
    setPanelOpen(false);
    size.current.left = 0;
    requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
  };
  const close = () => {
    onSelect(undefined);
    collapse();
  };
  const locateSelected = () => {
    if (!selected) return;
    if (mobile) {
      collapse(
        drawing.current?.querySelector<SVGPathElement>(
          `[data-environment="${selected.code}"] [data-part="interior"]`,
        ) ?? svg.current,
      );
    }
    const { width, height } = size.current;
    const scale = Math.max(
      camera.current.scale,
      fitPlan(plan.bounds, size.current).scale * 2.15,
      1.6,
    );
    const [x, y] = selected.label;
    paint({ scale, x: width / 2 - x * scale, y: (height - 52) / 2 - y * scale });
  };
  const focusAdjacentLot = (environment: InteriorEnvironment, key: string) => {
    const next = pavilion12Neighbor(plan.environments, environment, key);
    if (!next) return;
    const target = drawing.current?.querySelector<SVGPathElement>(
      `[data-environment="${next.code}"] [data-part="interior"]`,
    );
    if (!target) return;
    const c = camera.current;
    const x = next.label[0] * c.scale + c.x;
    const y = next.label[1] * c.scale + c.y;
    const panelWidth =
      mobile && panelOpen ? (sidebar.current?.getBoundingClientRect().width ?? 0) : 0;
    const safeX = Math.max(panelWidth + 16, Math.min(size.current.width - 16, x));
    const safeY = Math.max(16, Math.min(size.current.height - 86, y));
    if (safeX !== x || safeY !== y) paint({ ...c, x: c.x + safeX - x, y: c.y + safeY - y });
    target.focus({ preventScroll: true });
  };
  const numEnvironments = plan.environments.filter(
    (e) => /^\d{2}$/.test(e.code) && (!lotsMode || e.kind === "commercial"),
  );
  const commercialInfo = selected?.kind === "commercial" ? commercial[selected.code] : undefined;
  const hasExternal = selected?.parts.some((part) => part.kind === "external");
  const connections =
    presentation.connections?.flatMap((connection) => {
      const element = plan.architecture.find((item) => item.id === connection.elementId);
      if (!element) return [];
      const center =
        connection.center ?? (element.labelAt && [element.labelAt[0], element.labelAt[1] - 24]);
      return center ? [{ ...connection, element, center }] : [];
    }) ?? [];
  const wayfinding =
    presentation.wayfinding?.filter(({ elementId }) =>
      plan.architecture.some((element) => element.id === elementId),
    ) ?? [];
  const openConnection = (destination: ParkPavilionNumber) => {
    if (onConnect) onConnect(destination);
    else window.location.assign(pavilionDestinationHref(destination));
  };
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
    if (!cancelled && candidate && !candidate.moved) {
      if (candidate.destination) openConnection(candidate.destination);
      else choose(candidate.code);
    }
  };
  return (
    <main
      className={`arq-interior is-pavilion-${presentation.pavilionNumber} ${lotsMode ? "has-lot-layout" : ""} ${panelOpen ? "is-panel-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <header className="arq-header">
        <button
          className="arq-back arq-back-compact"
          onClick={onBack}
          aria-label="Voltar ao parque"
          aria-describedby="pavilion-external-view-help"
        >
          <ArrowLeft size={17} />
          <span className="arq-sr-only">Voltar ao parque</span>
          <span role="tooltip" id="pavilion-external-view-help" className="arq-back-tooltip">
            Voltar ao parque<small>Visualização externa</small>
          </span>
        </button>
        <div className="arq-brand-led">
          {isPavilion1 ? (
            <picture>
              <source
                media="(min-width: 701px)"
                srcSet="/brand/arq-design/arq-design-primary.svg"
              />
              <img
                className="arq-signature"
                src={presentation.brandPath}
                alt={presentation.brandAlt}
                width="106"
                height="81"
              />
            </picture>
          ) : (
            <img
              className="arq-signature"
              src={presentation.brandPath}
              alt={presentation.brandAlt}
              width="228"
              height="79"
            />
          )}
          <h1 className="arq-sr-only">{presentation.title}</h1>
        </div>
        <span className="arq-pavilion-id">Pavilhão {presentation.pavilionNumber}</span>
        {lotsMode && plan.totalAreaM2 != null && (
          <p className="arq-total-area">
            <span>Área total:</span>{" "}
            <strong>{formatArea(plan.totalAreaM2, isPavilion12 ? 0 : 2)}</strong>
          </p>
        )}
      </header>
      <div className="arq-workspace">
        <aside
          ref={sidebar}
          className="arq-sidebar"
          aria-label={lotsMode ? "Informações do lote" : "Informações do ambiente"}
          hidden={mobile && !panelOpen}
        >
          <div className="arq-sidebar-top">
            <span className="arq-eyebrow">
              {selected
                ? lotsMode
                  ? "Lote selecionado"
                  : "Ambiente selecionado"
                : isPavilion13
                  ? "Explore o salão"
                  : lotsMode
                    ? "Planta do pavilhão"
                    : "Explore a mostra"}
            </span>
            <button className="arq-icon" onClick={close} aria-label="Fechar painel e seleção">
              <X size={18} />
            </button>
          </div>
          {selected ? (
            <div className="arq-information" key={selected.code}>
              {/^\d{2}$/.test(selected.code) && (
                <span className="arq-number" aria-hidden={lotsMode || undefined}>
                  {selected.code}
                </span>
              )}
              <h2 ref={lotTitle} tabIndex={isPavilion13 || isPavilion12 ? -1 : undefined}>
                {selected.name}
              </h2>
              {lotsMode && (
                <p className="arq-lot-context">
                  Pavilhão {presentation.pavilionNumber}
                  <span>{presentation.title}</span>
                </p>
              )}
              {presentation.showAreas && selected.declaredAreaM2 != null && (
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
              {isPavilion12 ? (
                <button className="arq-view-plan" onClick={locateSelected}>
                  Localizar na planta <Scan size={16} />
                </button>
              ) : (
                mobile && (
                  <button className="arq-view-plan" onClick={() => collapse()}>
                    Ver na planta <ArrowRight size={16} />
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="arq-intro">
              {isPavilion13 ? (
                <h2>Galeria de lotes</h2>
              ) : lotsMode ? (
                <h2>Encontre um lote</h2>
              ) : (
                <h2>Arquitetura para novos encontros.</h2>
              )}
              <p>
                {isPavilion13
                  ? "Selecione na planta, busque pelo número ou explore por setor."
                  : isPavilion12
                    ? "Selecione na planta ou busque pelo número."
                    : lotsMode
                      ? "Selecione um espaço na planta ou pelos números abaixo."
                      : "Selecione um ambiente para conhecer o espaço."}
              </p>
              <div className="arq-index">
                <strong>{presentation.commercialCount}</strong>
                <span>{lotsMode ? "lotes individuais" : "espaços comerciais"}</span>
              </div>
            </div>
          )}
          {searchLots ? (
            <form
              className="arq-lot-search"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const code = isPavilion12
                  ? normalizePavilion12LotCode(lotQuery)
                  : normalizedLotCode(lotQuery);
                if (
                  !code ||
                  !plan.environments.some((e) => e.code === code && e.kind === "commercial")
                ) {
                  setSearchError(
                    isPavilion12
                      ? "Informe um número de 1 a 254."
                      : "Informe um número de 01 a 80.",
                  );
                  return;
                }
                setLotQuery(code);
                if (isPavilion12 && code !== selectedCode) {
                  setKeyboardLot(code);
                  focusDirectorySelection.current = true;
                }
                choose(code);
              }}
            >
              <label htmlFor="pavilion-lot-search" className="arq-eyebrow">
                Buscar lote
              </label>
              <div className="arq-lot-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  id="pavilion-lot-search"
                  type="search"
                  inputMode="numeric"
                  maxLength={isPavilion12 ? 3 : 2}
                  placeholder={isPavilion12 ? "1–254" : "01–80"}
                  value={lotQuery}
                  aria-invalid={!!searchError}
                  aria-describedby={searchError ? "pavilion-lot-search-error" : undefined}
                  onChange={(event) => {
                    setLotQuery(event.target.value);
                    setSearchError("");
                  }}
                />
                <button type="submit" aria-label="Localizar lote">
                  <ArrowRight size={17} />
                </button>
              </div>
              {searchError && (
                <p id="pavilion-lot-search-error" role="alert">
                  {searchError}
                </p>
              )}
            </form>
          ) : (
            <nav
              className="arq-environments"
              aria-label={lotsMode ? "Selecionar lote" : "Selecionar ambiente"}
            >
              <span className="arq-eyebrow">{lotsMode ? "Lotes" : "Ambientes"}</span>
              <div className="arq-space-grid">
                {numEnvironments.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => choose(e.code)}
                    aria-label={lotsMode ? e.name : `${e.code} · ${e.name}`}
                    aria-pressed={selected?.id === e.id}
                    data-p1-linked={
                      isPavilion1 && e.parts.some((part) => part.kind === "external")
                        ? true
                        : undefined
                    }
                    data-p1-support={isPavilion1 && e.kind === "support" ? true : undefined}
                  >
                    {e.code}
                  </button>
                ))}
              </div>
              {!lotsMode && (
                <button
                  className="arq-hall-link"
                  onClick={() => choose("salon")}
                  aria-pressed={selected?.code === "salon"}
                >
                  Salão de Design <ArrowRight size={14} />
                </button>
              )}
            </nav>
          )}
          {isPavilion13 && (
            <Pavilion13LotDirectory
              environments={plan.environments}
              selectedCode={selected?.code}
              onSelect={(code) => {
                focusDirectorySelection.current = code !== selected?.code;
                choose(code);
              }}
            />
          )}
          <div className="arq-sidebar-footer">
            {lotsMode ? (
              <>
                <span className="arq-key">
                  <i />
                  Lotes
                </span>
                <span className="arq-key">
                  <i className="is-support" />
                  Circulação
                </span>
                <span className="arq-key">
                  <i className="is-structure" />
                  Estrutura
                </span>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </aside>
        <div className="arq-canvas" ref={viewport}>
          {mobile && !panelOpen && (
            <button
              className="arq-panel-toggle"
              aria-label={
                isPavilion12 && selected ? `Abrir informações do lote ${selected.code}` : undefined
              }
              onClick={() => setPanelOpen(true)}
            >
              <PanelLeft size={17} />
              {selected
                ? lotsMode
                  ? selected.name
                  : `${selected.code === "salon" ? "" : selected.code + " · "}${selected.name}`
                : searchLots
                  ? "Buscar lote"
                  : lotsMode
                    ? "Lotes"
                    : "Ambientes"}
            </button>
          )}
          <svg
            ref={svg}
            className="arq-plan"
            role="group"
            aria-label={`Planta interativa do Pavilhão ${presentation.pavilionNumber}`}
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
              const target = event.target as Element;
              const code =
                target.closest("[data-environment]")?.getAttribute("data-environment") ?? undefined;
              const destination = parkPavilionNumber(
                target.closest("[data-pavilion-access]")?.getAttribute("data-pavilion-access"),
              );
              if (destination && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))
                return;
              pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              if (pointers.current.size === 1)
                gesture.current = {
                  start: { x: event.clientX, y: event.clientY },
                  code,
                  destination,
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
              {isPavilion1 && <Pavilion1Architecture plan={plan} />}
              {isPavilion8 && <Pavilion8Architecture plan={plan} />}
              {isPavilion12 && <Pavilion12Architecture plan={plan} />}
              {isPavilion13 && <Pavilion13Architecture plan={plan} />}
              {connections.map(({ element, center, destination, icon }) => {
                const { width, height, radius } =
                  presentation.connectionBadge ?? defaultConnectionBadge;
                const x = center[0] - width / 2;
                const y = center[1] - height / 2;
                const href = pavilionDestinationHref(destination);
                return (
                  <g key={element.id}>
                    {element.kind === "guide" && !isPavilion13 && (
                      <path className="arq-connection-guide" d={element.path} aria-hidden="true" />
                    )}
                    <a
                      className="arq-connection"
                      data-pavilion-access={destination}
                      href={href}
                      tabIndex={0}
                      aria-label={`Acesso ao Pavilhão ${destination}`}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                          return;
                        // Pointer navigation is owned by the same click-versus-pan threshold as lots.
                        event.preventDefault();
                        if (event.detail === 0) openConnection(destination);
                      }}
                    >
                      <title>
                        {href.startsWith("/mapa?") ? "Localizar no mapa externo" : "Abrir interior"}
                      </title>
                      <rect
                        className="arq-connection-hit"
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={radius}
                      />
                      <image
                        href={icon}
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        aria-hidden="true"
                        pointerEvents="none"
                      />
                    </a>
                  </g>
                );
              })}
              {plan.environments.map((environment) => (
                <g
                  key={environment.id}
                  data-environment={environment.code}
                  data-p13-sector={isPavilion13 ? pavilion13Sector(environment.code) : undefined}
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
                        part.kind === "interior" &&
                        environment.kind !== "circulation" &&
                        (!isPavilion12 || environment.code === (keyboardLot ?? selectedCode ?? "1"))
                          ? 0
                          : -1
                      }
                      aria-label={`${!isPavilion12 && environment.code.match(/^\d/) ? environment.code + " · " : ""}${environment.name}${part.kind === "external" ? " · área externa vinculada" : ""}`}
                      aria-pressed={selected?.id === environment.id}
                      onFocus={isPavilion12 ? () => setKeyboardLot(environment.code) : undefined}
                      onClick={(e) => {
                        if (e.detail === 0) choose(environment.code);
                      }}
                      onKeyDown={(e) => {
                        if (
                          isPavilion12 &&
                          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          focusAdjacentLot(environment, e.key);
                          return;
                        }
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          choose(environment.code);
                        }
                      }}
                    />
                  ))}
                  {isPavilion8 &&
                    environment.parts.map((part) => (
                      <Pavilion8LotRelief key={part.id} path={part.path} />
                    ))}
                  {isPavilion8 && <Pavilion8NumberPlate center={environment.label} />}
                  {isPavilion1 && /^\d{2}$/.test(environment.code) && (
                    <Pavilion1NumberPlate center={environment.label} />
                  )}
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
                  {presentation.showAreas && /^\d/.test(environment.code) && (
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
                {plan.architecture
                  .filter(
                    (element) =>
                      !(
                        isPavilion12 &&
                        (element.id === "p12:floor-outline" || element.id === "p12:perimeter")
                      ) && !connections.some((connection) => connection.element.id === element.id),
                  )
                  .map((element) => {
                    const sign = wayfinding.find((sign) => sign.elementId === element.id);
                    return (
                      <g key={element.id} className={`is-${element.kind}`}>
                        {!sign?.hideSourcePath && (
                          <path d={element.path} style={{ strokeWidth: element.strokeWidth }} />
                        )}
                        {element.label && element.labelAt && !sign && (
                          <text x={element.labelAt[0]} y={element.labelAt[1]} textAnchor="middle">
                            {element.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
              </g>
              {(isPavilion1 || isPavilion12) && selected && (
                <g
                  className={isPavilion12 ? "arq-p12-selection" : "arq-p1-selection"}
                  aria-hidden="true"
                  pointerEvents="none"
                >
                  {selected.parts.map((part) => (
                    <path key={part.id} d={part.path} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              )}
              {wayfinding.flatMap(({ elementId, kind, centers }) => {
                const { width, height } = WAYFINDING_SIGN_SIZE;
                const { asset, label } = WAYFINDING_SIGNS[kind];
                const directory =
                  isPavilion8 && kind !== "service"
                    ? "fornecedores-construcao"
                    : "pavilion-wayfinding";
                return centers.map(([x, y]) => (
                  <image
                    key={`${elementId}:${x}:${y}`}
                    href={`/brand/${directory}/${asset}`}
                    x={x - width / 2}
                    y={y - height / 2}
                    width={width}
                    height={height}
                    data-wayfinding={kind}
                    role="img"
                    aria-label={label}
                    pointerEvents="none"
                  />
                ));
              })}
            </g>
          </svg>
          <div ref={viewControls} className="arq-view-controls" aria-label="Controles da planta">
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
            a seleção. {isPavilion12 && "Com um lote em foco, as setas navegam entre lotes."}
          </span>
          <span className="arq-sr-only" aria-live="polite">
            {selected
              ? `${!lotsMode && /^\d/.test(selected.code) ? selected.code + " " : ""}${selected.name}${presentation.showAreas && selected.declaredAreaM2 != null ? ", " + formatArea(selected.declaredAreaM2) : ""}`
              : lotsMode
                ? "Nenhum lote selecionado"
                : "Nenhum ambiente selecionado"}
          </span>
        </div>
      </div>
    </main>
  );
}
