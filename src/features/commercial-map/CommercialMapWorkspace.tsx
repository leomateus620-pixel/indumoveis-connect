import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ComponentType, RefAttributes } from "react";
import {
  Search,
  X,
  Plus,
  Minus,
  Maximize,
  Minimize,
  Scan,
  Settings2,
  HelpCircle,
  Layers,
  Move,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  Box,
  Map as MapIcon,
  MoreHorizontal,
} from "lucide-react";
import { ENTITIES } from "./data/territory";
import type { Point } from "./data/territory";
import type {
  MapGesture,
  MapHandle,
  MapInsets,
  MapQuality,
  MapRendererProps,
  MapView,
} from "./types";
import { Map2D } from "./Map2D";
import { searchEntities } from "./search";
import { MOTION } from "./motion";
import { area, SPACE_STATUS } from "@/lib/format";
import "./map.css";

type Renderer = ComponentType<MapRendererProps & RefAttributes<MapHandle>>;
type Selection = {
  id: string | null;
  panelId: string | null;
  phase: "closed" | "opening" | "open" | "closing";
  expanded: boolean;
};
type Action =
  { type: "select"; id: string } | { type: "close" } | { type: "settle" } | { type: "expand" };
function selectionReducer(state: Selection, action: Action): Selection {
  if (action.type === "select")
    return state.id === action.id && state.phase !== "closing"
      ? state
      : {
          ...state,
          id: action.id,
          panelId: action.id,
          phase: state.phase === "open" ? "open" : "opening",
        };
  if (action.type === "close") return { ...state, id: null, phase: "closing" };
  if (action.type === "expand") return { ...state, expanded: !state.expanded };
  return state.phase === "closing"
    ? { ...state, panelId: null, phase: "closed", expanded: false }
    : { ...state, phase: "open" };
}
interface WorkspaceProps {
  statuses?: Record<string, string>;
  highlightedIds?: string[];
  externalSelection?: string;
  notice?: string;
  commercialState?: "loading" | "confirmed" | "unavailable";
  onCloseExternal?: () => void;
}
const emptyStatuses: Record<string, string> = {};
const emptyIds: string[] = [];

export function CommercialMapWorkspace({
  statuses = emptyStatuses,
  highlightedIds = emptyIds,
  externalSelection,
  notice,
  commercialState = "unavailable",
  onCloseExternal,
}: WorkspaceProps) {
  const workspace = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLElement>(null);
  const map = useRef<MapHandle>(null),
    lightMap = useRef<MapHandle>(null),
    origin = useRef<HTMLElement | null>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const [selection, dispatch] = useReducer(selectionReducer, {
    id: null,
    panelId: null,
    phase: "closed",
    expanded: false,
  });
  const [view, setView] = useState<MapView>("perspective");
  const [viewRevision, setViewRevision] = useState(0);
  const [orientationFree, setOrientationFree] = useState(false);
  const externalView = useRef<MapView>("perspective");
  const externalOrientationFree = useRef(false);
  const [quality, setQuality] = useState<MapQuality>("auto");
  const [gesture, setGesture] = useState<MapGesture>("move");
  const [menu, setMenu] = useState<"search" | "settings" | "help" | "legend" | "more" | null>(null);
  const menuOrigin = useRef<HTMLButtonElement | null>(null);
  const [retainedMenu, setRetainedMenu] = useState<typeof menu>(null);
  const displayedMenu = menu ?? retainedMenu;
  useEffect(() => {
    if (menu) {
      setRetainedMenu(menu);
      return;
    }
    const timer = setTimeout(
      () => setRetainedMenu(null),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : MOTION.menuClose,
    );
    return () => clearTimeout(timer);
  }, [menu]);
  const [query, setQuery] = useState(""),
    [location, setLocation] = useState("");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [Renderer, setRenderer] = useState<Renderer | null>(null);
  const [engineWanted, setEngineWanted] = useState(true);
  const [representation, setRepresentation] = useState<"preparing" | "ready" | "recovering" | "2d">(
    "preparing",
  );
  const [attempt, setAttempt] = useState(0),
    [expanded, setExpanded] = useState(false);
  const recovery = useRef(0),
    lastTarget = useRef<Point | undefined>(undefined);
  const lightGesture = useRef(false),
    lightNavigated = useRef(false);
  const readInitialTarget = useCallback(
    () => lightMap.current?.getTarget() ?? lastTarget.current,
    [],
  );
  const canPresent = useCallback(() => !lightGesture.current, []);
  const [insets, setInsets] = useState<MapInsets>({ right: 0, bottom: 0 });
  const [landscapeLayout, setLandscapeLayout] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const entity = ENTITIES.find((e) => e.id === selection.panelId);
  const results = useMemo(() => searchEntities(ENTITIES, query, location), [query, location]);
  const locations = useMemo(
    () => [
      ...new Set(
        ENTITIES.filter((e) => e.kind === "lot" || e.kind === "pavilion").map((e) => e.location),
      ),
    ],
    [],
  );
  const handle = () => (representation === "ready" ? map.current : lightMap.current);
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) setGesture("rotate");
  }, []);
  const select = useCallback((id: string, keyboard = false) => {
    if (!ENTITIES.some((e) => e.id === id)) return;
    const focused = document.activeElement;
    origin.current =
      focused instanceof HTMLElement &&
      focused !== document.body &&
      !focused.closest(".im-map-popover")
        ? focused
        : (workspace.current?.querySelector<HTMLButtonElement>(
            'button[aria-label="Buscar lote, pavilhão ou via"]',
          ) ?? null);
    performance.mark("indumoveis:selection-input");
    lightNavigated.current = false;
    dispatch({ type: "select", id });
    setMenu(null);
    if (keyboard) requestAnimationFrame(() => closeButton.current?.focus());
  }, []);
  const close = useCallback(() => {
    dispatch({ type: "close" });
    onCloseExternal?.();
    const returnTo = origin.current?.isConnected
      ? origin.current
      : workspace.current?.querySelector<HTMLButtonElement>(
          'button[aria-label="Buscar lote, pavilhão ou via"]',
        );
    returnTo?.focus({ preventScroll: true });
  }, [onCloseExternal]);
  const dismissMenu = useCallback(() => {
    menuOrigin.current?.focus({ preventScroll: true });
    setMenu(null);
  }, []);
  const toggleMenu = (next: NonNullable<typeof menu>) => {
    if (menu === next) {
      dismissMenu();
      return;
    }
    if (document.activeElement instanceof HTMLButtonElement)
      menuOrigin.current = document.activeElement;
    setMenu(next);
  };
  const chooseView = (next: MapView) => {
    setView(next);
    setViewRevision((revision) => revision + 1);
    setOrientationFree(false);
  };
  useEffect(() => {
    if (externalSelection) select(externalSelection);
  }, [externalSelection, select]);
  useEffect(() => {
    if (selection.phase !== "opening" && selection.phase !== "closing") return;
    const timer = setTimeout(
      () => dispatch({ type: "settle" }),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : selection.phase === "closing"
          ? MOTION.panelClose
          : MOTION.panelOpen,
    );
    return () => clearTimeout(timer);
  }, [selection.phase]);
  useEffect(() => {
    if (selection.id) {
      performance.mark("indumoveis:selection-dom");
      handle()?.focus(selection.id);
    }
    // Focus only on a new explicit selection, never on refetch or panel close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.id]);
  useEffect(() => {
    const el = workspace.current,
      canvas = stage.current;
    if (!el || !canvas) return;
    const update = () => {
      {
        const viewport = window.visualViewport;
        el.style.setProperty(
          "--map-available",
          `${Math.max(180, (viewport?.height ?? window.innerHeight) - el.getBoundingClientRect().top + (viewport?.offsetTop ?? 0))}px`,
        );
      }
      const p = panel.current?.getBoundingClientRect(),
        s = canvas.getBoundingClientRect();
      setLandscapeLayout(s.width >= 620 && s.height < 400);
      setCompactHeader(el.clientWidth < 1080);
      const sidePanel = !!p && p.width < s.width * 0.55 && p.height > s.height * 0.45;
      const next = {
        right: p && sidePanel ? p.width + 24 : 0,
        bottom: p && !sidePanel ? p.height + 16 : 0,
      };
      setInsets((old) => (old.right === next.right && old.bottom === next.bottom ? old : next));
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observer.observe(canvas);
    if (panel.current) observer.observe(panel.current);
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, [expanded, selection.panelId, selection.expanded]);
  const fail = useCallback((reason: string) => {
    console.warn("[Indumóveis map]", reason);
    lastTarget.current = map.current?.getTarget() ?? lightMap.current?.getTarget();
    setRenderer(null);
    if (reason === "sustained-low-frame-rate") {
      setEngineWanted(false);
      setRepresentation("2d");
    } else if (recovery.current === 0) {
      recovery.current = 1;
      setRepresentation("recovering");
      setAttempt((a) => a + 1);
    } else {
      setEngineWanted(false);
      setRepresentation("2d");
    }
  }, []);
  useEffect(() => {
    if (!engineWanted) return;
    let cancelled = false;
    performance.mark("indumoveis:geometry-available");
    import("./MapRenderer")
      .then((module) => {
        if (!cancelled) {
          lastTarget.current = lightMap.current?.getTarget() ?? lastTarget.current;
          performance.mark("indumoveis:renderer-chunk");
          setRenderer(() => module.default);
        }
      })
      .catch((error) => {
        if (!cancelled) fail(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, fail, engineWanted]);
  useEffect(() => {
    if (representation !== "preparing" && representation !== "recovering") return;
    let elapsed = 0,
      last = performance.now();
    const resumeClock = () => {
      last = performance.now();
    };
    const timer = setInterval(() => {
      const now = performance.now();
      // Waiting for an already usable SVG gesture or a hidden tab is not a
      // renderer failure. Charge only visible, unblocked preparation time.
      if (!document.hidden && !lightGesture.current) elapsed += now - last;
      last = now;
      if (elapsed < 4500) return;
      clearInterval(timer);
      setEngineWanted(false);
      setRenderer(null);
      setRepresentation("2d");
    }, 250);
    document.addEventListener("visibilitychange", resumeClock);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resumeClock);
    };
  }, [representation, attempt]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) {
        e.preventDefault();
        dismissMenu();
      } else if (selection.id) {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [menu, selection.id, close, dismissMenu]);
  useEffect(() => {
    const change = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  async function fullscreen() {
    if (expanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setExpanded(false);
      return;
    }
    setExpanded(true);
    try {
      await workspace.current?.requestFullscreen?.();
    } catch {
      /* Internal expansion remains usable. */
    }
  }
  function changeRepresentation() {
    lastTarget.current = handle()?.getTarget();
    if (representation === "2d") {
      recovery.current = 1;
      setEngineWanted(true);
      setRepresentation("recovering");
      setAttempt((a) => a + 1);
    } else {
      setEngineWanted(false);
      setRenderer(null);
      setRepresentation("2d");
    }
  }
  const common: MapRendererProps = {
    selectedId: selection.id,
    inspectedId,
    view,
    viewRevision,
    quality,
    gesture,
    insets,
    onSelect: select,
    onReady: () => {},
    onFailure: fail,
    statuses,
    highlightedIds,
    initialFocus: lastTarget.current,
    onManualOrientation: () => setOrientationFree(true),
  };
  const tool = (label: string, icon: React.ReactNode, action: () => void, active = false) => (
    <button
      type="button"
      className="im-map-button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={action}
    >
      {icon}
      <span className="im-map-tooltip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
  const status = entity ? statuses[entity.id] : undefined;
  const viewControls = compactHeader ? (
    <select
      className="im-map-view-select"
      aria-label="Vista do mapa"
      disabled={representation !== "ready"}
      value={representation !== "ready" ? "2d" : orientationFree ? "free" : view}
      onChange={(event) => chooseView(event.target.value as MapView)}
    >
      {representation !== "ready" && <option value="2d">Planta 2D</option>}
      {orientationFree && (
        <option value="free" disabled>
          Vista livre
        </option>
      )}
      <option value="perspective">3D</option>
      <option value="top">Superior</option>
      <option value="front">Oblíqua</option>
    </select>
  ) : (
    <div className="im-map-control-group im-map-views" role="group" aria-label="Vistas do mapa">
      {(
        [
          ["perspective", "3D"],
          ["top", "Superior"],
          ["front", "Oblíqua"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={representation === "ready" && !orientationFree && view === value}
          disabled={representation !== "ready"}
          onClick={() => chooseView(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const navigationControls = (
    <div
      className="im-map-control-group im-map-navigation"
      role="group"
      aria-label="Navegação do mapa"
    >
      {tool("Aproximar", <Plus />, () => handle()?.zoom(1.2))}
      {tool("Afastar", <Minus />, () => handle()?.zoom(1 / 1.2))}
      {tool(inspectedId ? "Reenquadrar pavilhão" : "Reenquadrar parque", <Scan />, () =>
        inspectedId ? handle()?.focus(inspectedId) : handle()?.restoreOverview(),
      )}
    </div>
  );
  const gestureControls =
    representation === "ready" &&
    (compactHeader ? (
      <select
        className="im-map-gesture-select"
        aria-label="Gesto de navegação"
        value={gesture}
        onChange={(event) => setGesture(event.target.value as MapGesture)}
      >
        <option value="move">Mover</option>
        <option value="rotate">Girar</option>
      </select>
    ) : (
      <div
        className="im-map-control-group im-map-gestures"
        role="group"
        aria-label="Gesto de navegação"
      >
        {tool("Mover mapa", <Move />, () => setGesture("move"), gesture === "move")}
        {tool("Girar mapa", <RotateCw />, () => setGesture("rotate"), gesture === "rotate")}
      </div>
    ));
  const headerActions = (
    <div className="im-map-header-actions">
      {tool(
        "Buscar lote, pavilhão ou via",
        <Search />,
        () => toggleMenu("search"),
        menu === "search",
      )}
      {compactHeader ? (
        tool(
          "Mais ações do mapa",
          <MoreHorizontal />,
          () => toggleMenu("more"),
          menu === "more" || menu === "settings" || menu === "help" || menu === "legend",
        )
      ) : (
        <>
          {tool(
            "Opções de visualização",
            <Settings2 />,
            () => toggleMenu("settings"),
            menu === "settings",
          )}
          {tool("Legenda", <Layers />, () => toggleMenu("legend"), menu === "legend")}
          {tool("Ajuda de navegação", <HelpCircle />, () => toggleMenu("help"), menu === "help")}
        </>
      )}
      {tool(
        expanded ? "Sair da tela cheia" : "Tela cheia",
        expanded ? <Minimize /> : <Maximize />,
        () => void fullscreen(),
        expanded,
      )}
    </div>
  );
  return (
    <div
      ref={workspace}
      className={`im-map-workspace ${expanded ? "is-expanded" : ""} ${compactHeader ? "has-compact-header" : ""} ${landscapeLayout ? "is-landscape" : ""}`}
      style={
        {
          "--im-open": `${MOTION.panelOpen}ms`,
          "--im-close": `${MOTION.panelClose}ms`,
          "--im-hover": `${MOTION.hover}ms`,
          "--im-menu": `${MOTION.menuOpen}ms`,
          "--im-menu-close": `${MOTION.menuClose}ms`,
          "--im-tooltip": `${MOTION.tooltip}ms`,
          "--im-expand": `${MOTION.panelExpand}ms`,
        } as React.CSSProperties
      }
    >
      <header className="im-map-header">
        <h1>Mapa Comercial</h1>
        {inspectedId && (
          <button
            className="im-map-button im-map-return"
            aria-label="Voltar ao parque"
            title="Voltar ao parque"
            onClick={() => {
              setInspectedId(null);
              setView(externalView.current);
              setOrientationFree(externalOrientationFree.current);
            }}
          >
            <ArrowLeft size={18} />
            <span className="im-map-tooltip" aria-hidden="true">
              Voltar ao parque
            </span>
          </button>
        )}
        {compactHeader && !landscapeLayout && headerActions}
        <div className="im-map-header-tools">
          {viewControls}
          {navigationControls}
          {gestureControls}
        </div>
        {(!compactHeader || landscapeLayout) && headerActions}
      </header>
      <div ref={stage} className="im-map-stage" data-representation={representation}>
        {representation !== "ready" && (
          <Map2D
            {...common}
            ref={lightMap}
            onNavigate={() => {
              lightNavigated.current = true;
            }}
            onGestureChange={(active) => {
              lightGesture.current = active;
            }}
            onReady={() => {
              performance.mark("indumoveis:2d-interactive");
            }}
          />
        )}
        {Renderer && (
          <div className={`im-map-renderer ${representation === "ready" ? "is-ready" : ""}`}>
            <Renderer
              {...common}
              ref={map}
              readInitialTarget={readInitialTarget}
              canPresent={canPresent}
              onReady={() => {
                performance.mark("indumoveis:3d-interactive");
                setRepresentation("ready");
                if (selection.id && !lightNavigated.current) map.current?.focus(selection.id);
              }}
            />
          </div>
        )}
        <div className="im-map-caption">
          <span className="im-map-dot" />
          {representation === "ready"
            ? "Maquete do parque"
            : representation === "preparing"
              ? "Planta disponível · preparando 3D"
              : representation === "recovering"
                ? "Planta disponível · recuperando 3D"
                : "Visualização leve ativada"}
          <span className="im-map-orientation">
            {representation === "ready"
              ? orientationFree
                ? "Orientação livre"
                : view === "top"
                  ? "Preset superior"
                  : view === "front"
                    ? "Preset oblíquo"
                    : "Perspectiva 3D"
              : "Consulta superior em 2D"}
          </span>
        </div>
        {(notice || commercialState === "unavailable") && (
          <div className="im-map-notice" role="status">
            {notice || "Situação comercial não confirmada."}
          </div>
        )}
        {displayedMenu && (
          <section
            className={`im-map-popover im-map-popover-${displayedMenu} ${!menu ? "closing" : ""}`}
            aria-hidden={!menu}
            aria-label={
              displayedMenu === "search"
                ? "Busca do mapa"
                : displayedMenu === "settings"
                  ? "Opções de visualização"
                  : displayedMenu === "help"
                    ? "Ajuda de navegação"
                    : displayedMenu === "more"
                      ? "Mais ações do mapa"
                      : "Legenda"
            }
          >
            <div inert={!menu}>
              <div className="im-map-popover-title">
                <strong>
                  {displayedMenu === "search"
                    ? "Localizar no parque"
                    : displayedMenu === "settings"
                      ? "Visualização"
                      : displayedMenu === "help"
                        ? "Como navegar"
                        : displayedMenu === "more"
                          ? "Ações do mapa"
                          : "Legenda"}
                </strong>
                {tool("Fechar menu", <X />, dismissMenu)}
              </div>
              {displayedMenu === "more" ? (
                <div className="im-map-more-actions">
                  <button className="im-map-action" onClick={() => setMenu("settings")}>
                    <Settings2 />
                    Opções de visualização
                  </button>
                  <button className="im-map-action" onClick={() => setMenu("legend")}>
                    <Layers />
                    Legenda
                  </button>
                  <button className="im-map-action" onClick={() => setMenu("help")}>
                    <HelpCircle />
                    Ajuda de navegação
                  </button>
                </div>
              ) : displayedMenu === "search" ? (
                <>
                  <label className="im-map-search">
                    <Search size={18} />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Lote, pavilhão ou via"
                      placeholder="Lote, pavilhão ou via"
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          workspace.current
                            ?.querySelector<HTMLButtonElement>(".im-map-result")
                            ?.focus();
                        }
                      }}
                    />
                    {query && tool("Limpar busca", <X />, () => setQuery(""))}
                  </label>
                  <select
                    aria-label="Localização"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  >
                    <option value="">Todo o recorte</option>
                    {locations.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <div className="im-map-results" aria-label="Resultados da busca">
                    {results.length ? (
                      results.map((result, index) => (
                        <button
                          className="im-map-result"
                          key={result.id}
                          onClick={(e) => select(result.id, e.detail === 0)}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                              e.preventDefault();
                              const rows =
                                workspace.current?.querySelectorAll<HTMLButtonElement>(
                                  ".im-map-result",
                                );
                              rows?.[
                                Math.max(
                                  0,
                                  Math.min(
                                    results.length - 1,
                                    index + (e.key === "ArrowDown" ? 1 : -1),
                                  ),
                                )
                              ]?.focus();
                            }
                          }}
                        >
                          <span>{result.label}</span>
                          <small>{result.location}</small>
                        </button>
                      ))
                    ) : (
                      <p>Nenhum resultado. Tente outro número ou localização.</p>
                    )}
                  </div>
                </>
              ) : displayedMenu === "settings" ? (
                <>
                  <label>
                    Qualidade
                    <select
                      aria-label="Qualidade gráfica"
                      value={quality}
                      onChange={(e) => setQuality(e.target.value as MapQuality)}
                    >
                      <option value="auto">Automática</option>
                      <option value="light">Leve</option>
                      <option value="balanced">Equilibrado</option>
                      <option value="detailed">Detalhado</option>
                    </select>
                  </label>
                  <button className="im-map-action" onClick={changeRepresentation}>
                    {representation === "2d" ? <Box /> : <MapIcon />}
                    {representation === "2d" ? "Tentar visualização 3D" : "Usar planta leve 2D"}
                  </button>
                  <p>As áreas e a consulta permanecem em todos os perfis.</p>
                </>
              ) : displayedMenu === "help" ? (
                <>
                  <p>
                    3D, Superior e Oblíqua orientam a mesma cena. Em todas elas, Mover desloca e
                    Girar orbita com um dedo ou arrasto esquerdo. O botão secundário desloca. Uma
                    órbita manual ativa a orientação livre; escolher um preset conserva o alvo.
                  </p>
                  <p>
                    Use + / −, roda ou pinça para aproximar. Dois dedos combinam pinça e
                    deslocamento. Na planta de compatibilidade 2D, arraste para mover; a órbita fica
                    disponível no 3D.
                  </p>
                  <p>
                    Toque em uma área para consultar. A busca também permite selecionar pelo
                    teclado. Esc fecha primeiro o menu ou a ficha.
                  </p>
                  <div className="im-map-pan">
                    {tool("Mover para cima", <ArrowUp />, () => handle()?.pan(0, -1))}
                    {tool("Mover para esquerda", <ArrowLeft />, () => handle()?.pan(-1, 0))}
                    {tool("Mover para direita", <ArrowRight />, () => handle()?.pan(1, 0))}
                    {tool("Mover para baixo", <ArrowDown />, () => handle()?.pan(0, 1))}
                    {tool(
                      "Girar à esquerda",
                      <RotateCw style={{ transform: "scaleX(-1)" }} />,
                      () => handle()?.rotate(-1),
                    )}
                    {tool("Girar à direita", <RotateCw />, () => handle()?.rotate(1))}
                  </div>
                </>
              ) : (
                <>
                  <p>
                    <i className="im-key im-key-lot" />
                    Lote externo · contorno da planta
                  </p>
                  <p>
                    <i className="im-key im-key-building" />
                    Pavilhão / apoio
                  </p>
                  <p>
                    <i className="im-key im-key-green" />
                    Vegetação / área natural
                  </p>
                  <p>Preenchimento físico não indica disponibilidade.</p>
                  {Object.keys(statuses).length > 0 &&
                    Object.entries(SPACE_STATUS)
                      .filter(([key]) => Object.values(statuses).includes(key))
                      .map(([key, value]) => <p key={key}>{value.label} · vínculo confirmado</p>)}
                </>
              )}
            </div>
          </section>
        )}
        {entity && (
          <aside
            ref={panel}
            className={`im-map-detail ${selection.phase} ${selection.expanded ? "is-expanded" : ""}`}
            aria-label="Detalhes da área"
            aria-live="polite"
            aria-hidden={selection.phase === "closing"}
          >
            <div inert={selection.phase === "closing"}>
              <div className="im-map-detail-top">
                <span>
                  {entity.kind === "pavilion"
                    ? "Pavilhão"
                    : entity.kind === "lot"
                      ? "Lote externo"
                      : "Referência do parque"}
                </span>
                <button
                  ref={closeButton}
                  className="im-map-button"
                  aria-label="Fechar ficha"
                  onClick={close}
                >
                  <X />
                </button>
              </div>
              <h2>{entity.label}</h2>
              <p className="im-map-location">{entity.location}</p>
              <div className="im-map-detail-summary">
                {entity.declaredAreaM2 != null ? (
                  <>
                    <strong>{area(entity.declaredAreaM2)}</strong>
                    <span>
                      {entity.kind === "pavilion"
                        ? "Área total declarada do edifício"
                        : "Área declarada na planta"}
                    </span>
                  </>
                ) : (
                  <span>Área não confirmada</span>
                )}
              </div>
              <button
                className="im-map-expand"
                aria-expanded={selection.expanded}
                onClick={() => dispatch({ type: "expand" })}
              >
                {selection.expanded ? <ChevronDown /> : <ChevronUp />}
                {selection.expanded ? "Recolher ficha" : "Mais detalhes"}
              </button>
              <div className="im-map-detail-body" inert={!selection.expanded && insets.bottom > 0}>
                <div>
                  <dl>
                    <dt>Situação comercial</dt>
                    <dd>
                      {status
                        ? (SPACE_STATUS[status]?.label ?? "Não confirmada")
                        : "Não confirmada"}
                    </dd>
                    <dt>Referência</dt>
                    <dd>{entity.source}</dd>
                  </dl>
                  {entity.notes && <p>{entity.notes}</p>}
                  {entity.kind === "lot" && !entity.notes && (entity.numbers?.length ?? 0) > 1 && (
                    <p>
                      Envelope agregado:{" "}
                      {entity.numbers?.map((n) => String(n).padStart(2, "0")).join(" / ")}.
                      Subdivisão individual pendente.
                    </p>
                  )}
                  {entity.kind === "pavilion" && (
                    <>
                      <button
                        className="im-map-action im-map-action-primary"
                        onClick={() => {
                          if (!inspectedId) {
                            externalView.current = view;
                            externalOrientationFree.current = orientationFree;
                          }
                          setInspectedId(entity.id);
                        }}
                      >
                        <Box size={18} />
                        Inspecionar sem cobertura
                      </button>
                      <p>
                        Casca arquitetônica com piso e acessos. Espaços internos ainda não
                        cadastrados nesta base.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
        <span className="im-map-live" aria-live="polite">
          {selection.id ? ENTITIES.find((e) => e.id === selection.id)?.label : ""}
        </span>
      </div>
    </div>
  );
}
