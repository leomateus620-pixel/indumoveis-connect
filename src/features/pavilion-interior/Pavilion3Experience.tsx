import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Expand,
  Layers3,
  Map as MapIcon,
  Minus,
  MoveUpRight,
  Plus,
  RotateCw,
  Route,
  Scan,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import type { PavilionPlan } from "./data";
import type { CommercialLot } from "@/lib/commercial";
import { commercialPriceLabel, commercialUnitPrice } from "@/lib/commercial";
import { brl, SPACE_STATUS } from "@/lib/format";
import { useCommercialSaleMode } from "@/features/guided-sales/sale-mode-context";
import { CommercialLotLegend } from "@/features/commercial-map/CommercialLotLegend";
import { COMMERCIAL_STATUS_COLORS } from "@/features/commercial-map/visualTheme";
import { lotPricingNote } from "@/features/commercial-map/lotPricingPresentation";
import { normalizePavilion3LotCode } from "./pavilion3";
import {
  lotBounds,
  pavilion3Sectors,
  PAVILION_3_TOUR,
  type Pavilion3ViewControls,
  type Pavilion3ViewRequest,
} from "./pavilion3-experience";
import { Pavilion3PlanView } from "./Pavilion3PlanView";
import type { ParkPavilionNumber } from "./connections";
import "./pavilion3-experience.css";
import "@/features/commercial-map/commercial-lot-legend.css";

const Scene = lazy(() => import("./Pavilion3Scene"));
const area = (value?: number | null) =>
  value == null
    ? "—"
    : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

export function Pavilion3Experience({
  plan,
  selectedCode,
  lotsByEnvironment,
  commercial = {},
  commercialError,
  onRetryCommercial,
  onSelect,
  onBack,
  onConnect,
}: {
  plan: PavilionPlan;
  selectedCode?: string;
  lotsByEnvironment?: ReadonlyMap<string, CommercialLot>;
  commercial?: Record<string, { status: string; exhibitor?: string }>;
  commercialError?: boolean;
  onRetryCommercial?: () => void;
  onSelect: (code?: string) => void;
  onBack: () => void;
  onConnect?: (pavilion: ParkPavilionNumber) => void;
}) {
  const selected = plan.environments.find((lot) => lot.code === selectedCode);
  const commercialLot = selected ? lotsByEnvironment?.get(selected.id) : undefined;
  const selectedArea = commercialLot ? commercialLot.areaM2 : selected?.declaredAreaM2;
  const sectors = useMemo(() => pavilion3Sectors(plan), [plan]);
  const [sector, setSector] = useState<string>();
  const [view, setView] = useState<"perspective" | "plan">("perspective");
  const [unavailable, setUnavailable] = useState(false);
  const [availability, setAvailability] = useState(false);
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [notice, setNotice] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [tour, setTour] = useState<number>();
  const [request, setRequest] = useState<Pavilion3ViewRequest>(() =>
    selected ? { kind: "focus", bounds: lotBounds([selected]) } : { kind: "overview" },
  );
  const controls = useRef<Pavilion3ViewControls | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const focusTitle = useRef(false);
  const shell = useRef<HTMLElement>(null);
  const openPanelButton = useRef<HTMLButtonElement>(null);
  const initialSelection = useRef(selectedCode);
  const saleMode = useCommercialSaleMode();
  const salesActive = !!saleMode?.active;
  const statuses = useMemo(
    () =>
      new Map(
        plan.environments.flatMap((lot) => {
          const status = lotsByEnvironment?.get(lot.id)?.status ?? commercial[lot.code]?.status;
          return status ? [[lot.code, status] as const] : [];
        }),
      ),
    [plan, lotsByEnvironment, commercial],
  );
  const saleCodes = useMemo(
    () =>
      new Set(
        plan.environments
          .filter((lot) => {
            const entry = lotsByEnvironment?.get(lot.id);
            return salesActive && entry && saleMode?.selectedIds.has(entry.id);
          })
          .map((lot) => lot.code),
      ),
    [plan, lotsByEnvironment, salesActive, saleMode?.selectedIds],
  );
  const currentStatus = selected ? statuses.get(selected.code) : undefined;
  const note = commercialLot ? lotPricingNote(commercialLot) : undefined;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(media.matches);
    if (media.matches && !initialSelection.current) setPanelOpen(false);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    if (selectedCode) setPanelOpen(true);
    if (focusTitle.current) {
      focusTitle.current = false;
      title.current?.focus({ preventScroll: true });
    }
  }, [selectedCode]);

  const connect = () =>
    onConnect ? onConnect(13) : window.location.assign("/mapa/pavilhoes/13/interior");
  const overview = () => {
    setRequest({ kind: "overview" });
    setTour(undefined);
    setSector(undefined);
  };
  const choose = (code: string, focus = false) => {
    const lot = plan.environments.find((item) => item.code === code);
    if (!lot) return;
    if (salesActive) {
      const entry = lotsByEnvironment?.get(lot.id);
      if (!entry) {
        setNotice("Este lote não tem vínculo comercial confirmado.");
        return;
      }
      setNotice("");
      saleMode?.toggleLot(entry);
    } else {
      focusTitle.current = focus && code !== selectedCode;
      if (focus && code === selectedCode) title.current?.focus({ preventScroll: true });
      onSelect(code);
      setPanelOpen(true);
    }
    setSearchError("");
    setTour(undefined);
    if (focus) setRequest({ kind: "focus", bounds: lotBounds([lot]) });
  };
  const visit = (stop: number) => {
    setTour(stop);
    setRequest({ kind: "tour", stop });
    setView("perspective");
    if (mobile) setPanelOpen(false);
  };
  const collapse = () => {
    setPanelOpen(false);
    requestAnimationFrame(() => openPanelButton.current?.focus());
  };
  const viewProps = {
    plan,
    selectedCode: salesActive ? undefined : selectedCode,
    saleCodes,
    statuses,
    availability: availability || salesActive,
    salesActive,
    request,
    controlsRef: controls,
    onSelect: choose,
    onConnect: connect,
  };

  return (
    <main
      ref={shell}
      className="p3-experience"
      data-guided-sales-host=""
      data-panel-open={panelOpen}
      data-sales-active={salesActive}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (selected) onSelect(undefined);
          else collapse();
        }
      }}
    >
      <header className="p3-header">
        <button
          className="p3-icon p3-back"
          aria-label="Voltar ao parque"
          title="Voltar ao parque"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </button>
        <img
          className="p3-brand"
          src="/brand/pavilhao-3/construcao-mobiliario.svg"
          alt="Construção e Mobiliário · Indumóveis"
        />
        <h1 className="p3-sr">Construção e Mobiliário</h1>
        <span className="p3-pavilion">
          Pavilhão <strong>03</strong>
        </span>
        <div className="p3-header-meta">
          <span>
            <strong>{plan.environments.length}</strong> lotes
          </span>
          <span>
            <strong>{plan.totalAreaM2?.toLocaleString("pt-BR")}</strong> m² de pavilhão
          </span>
        </div>
        <button className="p3-connection" onClick={connect} aria-label="Ir ao Pavilhão 13">
          Pavilhão 13 <MoveUpRight size={15} />
        </button>
        {saleMode?.canUse && (
          <button
            className="p3-icon p3-sales"
            data-guided-sales-toggle=""
            aria-label="Modo Comercialização"
            title="Modo Comercialização"
            aria-pressed={salesActive}
            onClick={() => {
              setNotice("");
              saleMode.toggleMode();
            }}
          >
            <ShoppingCart size={18} />
          </button>
        )}
      </header>

      <div className="p3-workspace">
        <aside className="p3-panel" aria-label="Informações do lote" hidden={!panelOpen}>
          <div className="p3-panel-head">
            <span className="p3-overline">{salesActive ? "Selecionar lotes" : "Explorar"}</span>
            <button className="p3-icon" aria-label="Recolher painel" onClick={collapse}>
              <X size={17} />
            </button>
          </div>
          <form
            className="p3-search"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const code = normalizePavilion3LotCode(query);
              if (!code || !plan.environments.some((lot) => lot.code === code)) {
                setSearchError("Informe um número de 1 a 142.");
                return;
              }
              setQuery(code);
              choose(code, true);
            }}
          >
            <Search size={17} aria-hidden="true" />
            <label htmlFor="p3-search" className="p3-sr">
              Buscar lote
            </label>
            <input
              id="p3-search"
              type="search"
              inputMode="numeric"
              maxLength={3}
              placeholder="Buscar lote · 1–142"
              value={query}
              aria-invalid={!!searchError}
              aria-describedby={searchError ? "p3-search-error" : undefined}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchError("");
              }}
            />
            <button type="submit" className="p3-icon" aria-label="Localizar lote">
              <ArrowRight size={17} />
            </button>
          </form>
          {searchError && (
            <p className="p3-error" id="p3-search-error" role="alert">
              {searchError}
            </p>
          )}

          {selected && !salesActive ? (
            <section className="p3-lot-detail">
              <button
                className="p3-text-button"
                onClick={() => {
                  onSelect(undefined);
                  overview();
                }}
              >
                <ChevronLeft size={15} /> Todos os setores
              </button>
              <div className="p3-lot-title">
                <h2 ref={title} tabIndex={-1}>
                  Lote <strong>{selected.code}</strong>
                </h2>
                {currentStatus && SPACE_STATUS[currentStatus] && (
                  <span
                    className="p3-status"
                    style={
                      { "--p3-stock": COMMERCIAL_STATUS_COLORS[currentStatus] } as CSSProperties
                    }
                  >
                    <i />
                    {SPACE_STATUS[currentStatus].label}
                  </span>
                )}
              </div>
              <p className="p3-location">{selected.functionLabel}</p>
              <dl className="p3-lot-facts">
                <div>
                  <dt>Área individual</dt>
                  <dd>{area(selectedArea)}</dd>
                </div>
                <div>
                  <dt>Valor de tabela</dt>
                  <dd>{commercialLot?.grossCents != null ? brl(commercialLot.grossCents) : "—"}</dd>
                </div>
              </dl>
              {commercialLot?.tariffCents != null && (
                <p className="p3-unit-price">
                  {commercialPriceLabel(commercialLot)}{" "}
                  <strong>{brl(commercialUnitPrice(commercialLot))}</strong>
                </p>
              )}
              {commercial[selected.code]?.exhibitor && (
                <p className="p3-exhibitor">{commercial[selected.code].exhibitor}</p>
              )}
              {note && <p className="p3-error">{note}</p>}
              <div className="p3-lot-actions">
                <button
                  className="p3-primary"
                  aria-label="Focar lote"
                  onClick={() => {
                    setRequest({ kind: "focus", bounds: lotBounds([selected]) });
                    if (mobile) collapse();
                  }}
                >
                  <Scan size={16} /> Ver de perto
                </button>
                <button
                  className="p3-icon"
                  aria-label="Lote anterior"
                  disabled={selected.code === "1"}
                  onClick={() => choose(String(Number(selected.code) - 1), true)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="p3-icon"
                  aria-label="Próximo lote"
                  disabled={Number(selected.code) === plan.environments.length}
                  onClick={() => choose(String(Number(selected.code) + 1), true)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </section>
          ) : (
            <nav className="p3-sectors" aria-label="Lotes por setor">
              <div className="p3-section-title">
                <h2>Setores</h2>
                <span>{sectors.length}</span>
              </div>
              {sectors.map((item) => (
                <div className="p3-sector" key={item.key} data-active={sector === item.key}>
                  <button
                    className="p3-sector-button"
                    aria-expanded={sector === item.key}
                    aria-controls={`p3-sector-${item.key}`}
                    onClick={() => {
                      const next = sector === item.key ? undefined : item.key;
                      setSector(next);
                      setTour(undefined);
                      setRequest(
                        next ? { kind: "focus", bounds: item.bounds } : { kind: "overview" },
                      );
                    }}
                  >
                    <span className="p3-sector-letter">{item.key}</span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.lots[0].code}–{item.lots.at(-1)?.code}{" "}
                        <span>· {item.lots.length} lotes</span>
                      </small>
                    </span>
                    <ChevronDown size={15} />
                  </button>
                  <div
                    id={`p3-sector-${item.key}`}
                    className="p3-lot-grid"
                    hidden={sector !== item.key}
                  >
                    {item.lots.map((lot) => (
                      <button
                        key={lot.id}
                        aria-label={`Localizar lote ${lot.code}`}
                        aria-pressed={
                          salesActive ? saleCodes.has(lot.code) : selectedCode === lot.code
                        }
                        aria-description={SPACE_STATUS[statuses.get(lot.code) ?? ""]?.label}
                        onClick={() => choose(lot.code, true)}
                        style={
                          {
                            "--p3-stock":
                              COMMERCIAL_STATUS_COLORS[statuses.get(lot.code) ?? ""] ??
                              "transparent",
                          } as CSSProperties
                        }
                      >
                        {lot.code}
                        <i />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!unavailable && (
                <button className="p3-tour-start" onClick={() => visit(0)}>
                  <Route size={18} />
                  <span>Percorrer o interior</span>
                  <ArrowRight size={17} />
                </button>
              )}
            </nav>
          )}
          {commercialError && (
            <div role="alert" className="p3-error">
              Não foi possível carregar a situação comercial.{" "}
              <button onClick={onRetryCommercial}>Tentar novamente</button>
            </div>
          )}
          {(availability || salesActive) && (
            <CommercialLotLegend statuses={[...statuses.values()]} salesActive={salesActive} />
          )}
          <button className="p3-mobile-connection" onClick={connect} aria-label="Ir ao Pavilhão 13">
            Pavilhão 13 <MoveUpRight size={15} />
          </button>
        </aside>

        {!panelOpen && (
          <button
            ref={openPanelButton}
            className="p3-open-panel"
            onClick={() => setPanelOpen(true)}
            aria-label={selected ? `Abrir informações do lote ${selected.code}` : "Explorar lotes"}
          >
            <Search size={17} />
            {selected ? `Lote ${selected.code}` : "Explorar lotes"}
            <ChevronRight size={16} />
          </button>
        )}

        <div className="p3-stage">
          <Suspense
            fallback={
              <div className="p3-scene-loading" role="status">
                Preparando o interior…
              </div>
            }
          >
            {view === "perspective" && !unavailable ? (
              <Scene
                {...viewProps}
                onUnavailable={() => {
                  setUnavailable(true);
                  setView("plan");
                  setTour(undefined);
                }}
              />
            ) : (
              <Pavilion3PlanView {...viewProps} />
            )}
          </Suspense>
          <div className="p3-display-controls">
            <div className="p3-view-switch" aria-label="Visualização">
              <button
                aria-pressed={view === "perspective"}
                disabled={unavailable}
                onClick={() => setView("perspective")}
              >
                <Box size={16} /> Perspectiva
              </button>
              <button
                aria-pressed={view === "plan"}
                onClick={() => {
                  setView("plan");
                  setTour(undefined);
                }}
              >
                <MapIcon size={16} /> Planta
              </button>
            </div>
            <button
              className="p3-availability"
              aria-label="Mostrar disponibilidade"
              aria-pressed={availability || salesActive}
              disabled={salesActive}
              onClick={() => setAvailability((value) => !value)}
            >
              <Layers3 size={17} />
              <span>Disponibilidade</span>
            </button>
          </div>
          {unavailable && (
            <p className="p3-fallback" role="status">
              Visualização em planta · 3D indisponível neste dispositivo
            </p>
          )}
          {notice && (
            <p className="p3-notice" role="status">
              {notice}
            </p>
          )}

          <div className="p3-view-tools" aria-label="Controles do interior">
            <button
              className="p3-icon"
              aria-label="Aproximar"
              title="Aproximar"
              onClick={() => controls.current?.zoom(1.3)}
            >
              <Plus size={19} />
            </button>
            <button
              className="p3-icon"
              aria-label="Afastar"
              title="Afastar"
              onClick={() => controls.current?.zoom(1 / 1.3)}
            >
              <Minus size={19} />
            </button>
            <span />
            {view === "perspective" && (
              <button
                className="p3-icon"
                aria-label="Girar visão"
                title="Girar visão"
                onClick={() => controls.current?.rotate()}
              >
                <RotateCw size={17} />
              </button>
            )}
            <button
              className="p3-icon"
              aria-label="Ajustar à tela"
              title="Visão geral"
              onClick={overview}
            >
              <Scan size={18} />
            </button>
            <button
              className="p3-icon p3-fullscreen"
              aria-label="Tela cheia"
              title="Tela cheia"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void shell.current?.requestFullscreen?.().catch(() => {});
              }}
            >
              <Expand size={16} />
            </button>
          </div>
          {tour != null ? (
            <div className="p3-tour-controls" aria-label="Percurso do interior">
              <button
                className="p3-icon"
                aria-label="Ponto anterior"
                disabled={tour === 0}
                onClick={() => visit(tour - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                <small>
                  {tour + 1} / {PAVILION_3_TOUR.length}
                </small>
                {PAVILION_3_TOUR[tour].name}
              </span>
              <button
                className="p3-icon"
                aria-label="Próximo ponto"
                disabled={tour === PAVILION_3_TOUR.length - 1}
                onClick={() => visit(tour + 1)}
              >
                <ChevronRight size={18} />
              </button>
              <button className="p3-icon" aria-label="Encerrar percurso" onClick={overview}>
                <X size={16} />
              </button>
            </div>
          ) : (
            <p className="p3-navigation-hint">
              {view === "perspective"
                ? "Arraste para girar · Use a roda ou pinça para aproximar"
                : "Arraste para deslocar · Setas para navegar entre lotes"}
            </p>
          )}
        </div>
        <span className="p3-sr" aria-live="polite">
          {selected
            ? `${selected.name}, ${area(selectedArea)}`
            : tour != null
              ? PAVILION_3_TOUR[tour].name
              : "Visão geral do Pavilhão 3"}
        </span>
      </div>
    </main>
  );
}
