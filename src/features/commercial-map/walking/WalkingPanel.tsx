import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Flag,
  Footprints,
  LocateFixed,
  LogOut,
  MapPin,
  Route,
  Signpost,
  X,
} from "lucide-react";
import {
  walkingDestinationTimes,
  walkingTimeLabel,
  type NetworkPosition,
  type WalkingNetwork,
} from "./network";
import { deviceCoordinateLabels } from "./position";
import { findWalkingDestination, type useParkWalking } from "./useParkWalking";

type Walking = ReturnType<typeof useParkWalking>;

const status = {
  idle: "",
  waiting: "Buscando uma posição…",
  tracking: "",
  denied: "A permissão de localização foi negada.",
  unavailable: "Sinal indisponível. Você pode escolher a partida.",
  stale: "Posição desatualizada. Aguardando uma nova leitura.",
  outside: "Fora da área do mapa. Você pode explorar a planta do parque.",
} as const;

export function WalkingPanel({
  walking,
  network,
  preview,
  close,
  recenter,
  picked,
  clearPicked,
}: {
  walking: Walking;
  network?: WalkingNetwork;
  preview: boolean;
  close(): void;
  recenter(): void;
  picked: { id: string; label: string } | null;
  clearPicked(): void;
}) {
  const { state, dispatch } = walking;
  const [expanded, setExpanded] = useState(true);
  const { destination, guidance, fix, signal } = state;
  const liveProgress =
    signal === "tracking" && !!state.match && state.match.samples >= 2 && !guidance?.offRouteCount;
  const arrival = guidance && network?.nodes[guidance.route.entry];
  const remaining = guidance ? Math.max(0, guidance.route.metres - guidance.progress) : null;
  const metres = remaining === null ? null : Math.round(remaining / 5) * 5;
  const start: NetworkPosition | null = state.origin
    ? { node: state.origin }
    : liveProgress
      ? (state.match?.location ?? null)
      : null;
  const destinations = network && start ? walkingDestinationTimes(network, start).slice(0, 6) : [];
  const pickedDestination = findWalkingDestination(network, picked?.id);
  const exit = network?.exits?.length
    ? { id: "exit", label: "Saída do parque", entries: network.exits }
    : null;
  const outsidePosition = signal === "outside" && fix ? deviceCoordinateLabels(fix) : null;
  const fixLabel =
    signal === "tracking" && fix
      ? `${fix.accuracy > 10 ? "Localização aproximada" : "Localização ativa"} · GPS ±${Math.ceil(fix.accuracy)} m`
      : status[signal];
  return (
    <section className="im-walking-panel" aria-label="Navegar pelo parque">
      <header>
        <h2>
          <span className="im-walking-heading-icon">
            <Footprints size={17} aria-hidden="true" />
          </span>
          Navegar pelo parque
        </h2>
        <div className="im-walking-actions">
          <button
            className="im-map-button"
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher orientações" : "Expandir orientações"}
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </button>
          <button
            className="im-map-button"
            type="button"
            onClick={close}
            aria-label="Sair da navegação"
          >
            <X />
          </button>
        </div>
      </header>
      <div className="im-walking-panel-body" hidden={!expanded}>
        <p className="im-walking-context">
          <CircleHelp size={14} aria-hidden="true" />
          {preview ? "Simulação · acessos em validação" : "Alinhamento do mapa provisório"}
        </p>
        <div className="im-walking-actions im-walking-controls">
          {(!state.watching || signal === "unavailable" || signal === "stale") && (
            <button
              className="im-map-action im-walking-primary"
              type="button"
              onClick={() => dispatch({ type: "watch" })}
            >
              <LocateFixed size={16} />{" "}
              {signal === "unavailable" || signal === "stale"
                ? "Tentar novamente"
                : "Minha localização"}
            </button>
          )}
          {signal === "tracking" && fix && (
            <button className="im-map-action" type="button" onClick={recenter}>
              <LocateFixed size={16} /> Recentralizar
            </button>
          )}
          {exit && (
            <button
              className="im-map-action"
              type="button"
              onClick={() => dispatch({ type: "destination", destination: exit })}
            >
              <LogOut size={15} /> Quero sair
            </button>
          )}
        </div>
        {fixLabel && (
          <p role="status" className="im-walking-signal" data-signal={signal}>
            <span aria-hidden="true" className="im-walking-signal-dot" />
            {fixLabel}
            {fix && signal === "tracking" && state.surroundings && " · entorno do parque"}
            {fix && signal === "tracking" && !state.following && " · câmera em exploração"}
          </p>
        )}
        {outsidePosition && fix && (
          <details className="im-walking-instructions im-walking-device">
            <summary>
              <MapPin size={15} aria-hidden="true" /> Posição do dispositivo
            </summary>
            <dl>
              <div>
                <dt>Latitude</dt>
                <dd>≈ {outsidePosition.latitude}°</dd>
              </div>
              <div>
                <dt>Longitude</dt>
                <dd>≈ {outsidePosition.longitude}°</dd>
              </div>
            </dl>
            <p>
              Margem informada pelo dispositivo ±{Math.ceil(fix.accuracy)} m. A rota a pé começa na
              área coberta.
            </p>
          </details>
        )}
        {destination && (
          <div className="im-walking-summary im-walking-route-summary" aria-label="Resumo da rota">
            <div className="im-walking-destination">
              <strong>
                <Flag size={15} aria-hidden="true" />
                {destination.label}
              </strong>
              <button
                type="button"
                className="im-map-button"
                aria-label="Limpar rota"
                onClick={() => dispatch({ type: "clear-route" })}
              >
                <X />
              </button>
            </div>
            {guidance && arrival ? (
              <>
                <div role="status" aria-live="polite">
                  {guidance.arrived ? (
                    preview ? (
                      "Chegada simulada"
                    ) : (
                      "Você chegou"
                    )
                  ) : (liveProgress || state.origin) &&
                    metres !== null &&
                    remaining !== null &&
                    network ? (
                    <span className="im-walking-metrics">
                      <strong>{metres === 0 ? "menos de 5 m" : `${metres} m`}</strong>
                      <span>{state.origin ? "no trajeto" : "restantes"}</span>
                      <span className="im-walking-eta">
                        {walkingTimeLabel(remaining, network.speedMps)}
                      </span>
                    </span>
                  ) : (
                    "Progresso pausado · posição com incerteza"
                  )}
                </div>
                {state.choices.length > 1 &&
                  !guidance.arrived &&
                  (liveProgress || state.origin) &&
                  network && (
                    <div className="im-walking-choices" role="group" aria-label="Opções de trajeto">
                      {state.choices.map((option, index) => (
                        <button
                          type="button"
                          key={index}
                          className="im-walking-option"
                          aria-pressed={state.selectedRoute === index}
                          onClick={() => dispatch({ type: "choose-route", index })}
                        >
                          <span className="im-walking-option-icon">
                            {index ? (
                              <Route size={16} aria-hidden="true" />
                            ) : (
                              <ArrowUpRight size={16} aria-hidden="true" />
                            )}
                            {state.selectedRoute === index && (
                              <Check size={14} aria-hidden="true" />
                            )}
                          </span>
                          <strong>{index ? "Alternativa" : "Mais curta"}</strong>
                          <small>
                            {Math.round(option.metres / 5) * 5} m ·{" "}
                            {walkingTimeLabel(option.metres, network.speedMps, true)}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                <p className="im-walking-arrival">
                  <span className="im-walking-arrival-icon">
                    <Flag size={15} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Chegada</strong>
                    {arrival.label}
                  </span>
                </p>
                {!guidance.arrived && network && guidance.route.legs.length > 1 && (
                  <details className="im-walking-instructions">
                    <summary>
                      <Route size={15} aria-hidden="true" /> Orientações do trajeto
                    </summary>
                    <ol>
                      {guidance.route.legs
                        .reduce<{ label: string; total: number }[]>(
                          (list, leg) => [
                            ...list,
                            {
                              label: network.nodes[leg.to].label,
                              total: (list.at(-1)?.total ?? 0) + leg.metres,
                            },
                          ],
                          [],
                        )
                        .filter(({ total }) => total > guidance.progress)
                        .map(({ label }) => label)
                        .filter(
                          (label, i, labels) =>
                            label && labels.indexOf(label) === i && label !== arrival.label,
                        )
                        .slice(0, 5)
                        .concat(arrival.label)
                        .map((label) => (
                          <li key={label}>Siga até {label}.</li>
                        ))}
                    </ol>
                  </details>
                )}
                {guidance.rerouted && <p role="status">Rota recalculada</p>}
              </>
            ) : (
              <p role="status">
                {state.origin || liveProgress
                  ? "Não há ligação disponível entre a partida e essa entrada."
                  : "Escolha uma partida ou aguarde uma posição confiável na rede do piloto."}
              </p>
            )}
          </div>
        )}
        {network && (
          <label className="im-walking-start">
            <span>Escolher ponto de partida</span>
            <span className="im-walking-select-shell">
              <MapPin size={16} aria-hidden="true" />
              <select
                value={state.origin ?? ""}
                onChange={(event) =>
                  dispatch({ type: "origin", origin: event.target.value || null })
                }
              >
                <option value="">
                  {state.watching ? "Usar minha localização" : "Selecionar um acesso"}
                </option>
                {network.starts.map((id) => (
                  <option key={id} value={id}>
                    {network.nodes[id].label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </span>
          </label>
        )}
        {picked && picked.id !== destination?.id && (
          <div className="im-walking-summary" aria-label="Destino selecionado">
            <div className="im-walking-destination">
              <strong>
                <MapPin size={16} aria-hidden="true" />
                {picked.label}
              </strong>
              <button
                type="button"
                className="im-map-button"
                aria-label="Limpar destino selecionado"
                onClick={clearPicked}
              >
                <X />
              </button>
            </div>
            {pickedDestination ? (
              <button
                type="button"
                className="im-map-action im-walking-route-action"
                onClick={() => {
                  dispatch({ type: "destination", destination: pickedDestination });
                  clearPicked();
                }}
              >
                <Route size={16} aria-hidden="true" /> Traçar rota a pé
              </button>
            ) : (
              <p>Sem caminho validado para este destino.</p>
            )}
          </div>
        )}
        {network && !picked && !destination && !destinations.length && (
          <p>Selecione um destino no mapa ou na busca.</p>
        )}
        {network && destinations.length > 0 && (
          <details className="im-walking-instructions">
            <summary>
              <Signpost size={15} aria-hidden="true" /> Destinos a pé
            </summary>
            <ul>
              {destinations.map(({ item, metres }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="im-map-action"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      dispatch({ type: "destination", destination: item });
                    }}
                  >
                    {item.label} · {walkingTimeLabel(metres, network.speedMps)}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {!network && <p>As rotas a pé aguardam validação dos acessos desta edição.</p>}
        {!destination && (
          <p className="im-walking-privacy">
            <MapPin size={13} aria-hidden="true" /> A localização cobre o parque e o entorno
            representado no mapa. Sua posição fica nesta aba.
          </p>
        )}
      </div>
    </section>
  );
}
