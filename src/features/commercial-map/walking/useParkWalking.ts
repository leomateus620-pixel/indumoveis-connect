import { useCallback, useEffect, useMemo, useReducer } from "react";
import { referenceMetresToScene, REFERENCE_UNITS_PER_METRE } from "../urbanReference";
import {
  advanceGuidance,
  matchPosition,
  remainingGeometry,
  startGuidance,
  type Guidance,
} from "./guidance";
import {
  distance,
  findWalkingAlternatives,
  type WalkingDestination,
  type WalkingNetwork,
  type WalkingRoute,
} from "./network";
import { filterFix, FRESH_MS, readFix, WALK_IDLE_MS, type Position } from "./position";
import { ENTITIES, type Point } from "../data/territory";
import { PERMANENT_PARK_LANDMARKS } from "../permanentParkLayout";
import { GATE_03_APPROACH_METRES } from "./pilot";
import { walkingCoverage } from "./coverage";

export function findWalkingDestination(
  network: WalkingNetwork | undefined,
  id: string | undefined,
): WalkingDestination | undefined {
  const direct = network?.destinations.find((candidate) => candidate.id === id);
  if (direct || !id || !network) return direct;
  // A contextual name and its selectable building can share one physical access.
  const landmark = PERMANENT_PARK_LANDMARKS.find((item) => item.existingOwner === id);
  const entry = landmark && network.destinations.find((candidate) => candidate.id === landmark.id);
  const owner = entry && ENTITIES.find((entity) => entity.id === id);
  return owner && entry ? { ...entry, id, label: owner.label } : undefined;
}

export type WalkingOverlay = {
  person: {
    point: Point;
    radius: number;
    approximate: boolean;
    moving: boolean;
    heading?: number;
  } | null;
  path: Point[];
  alternate: Point[];
  turns: { point: Point; angle: number }[];
  entry: Point | null;
};

type Signal = "idle" | "waiting" | "tracking" | "denied" | "unavailable" | "stale" | "outside";
type Session = {
  active: boolean;
  watching: boolean;
  watchVersion: number;
  following: boolean;
  signal: Signal;
  fix: Position | null;
  surroundings: boolean;
  match: ReturnType<typeof matchPosition>;
  origin: string | null;
  destination: WalkingDestination | null;
  guidance: Guidance | null;
  choices: WalkingRoute[];
  selectedRoute: number;
};
const empty: Session = {
  active: false,
  watching: false,
  watchVersion: 0,
  following: false,
  signal: "idle",
  fix: null,
  match: null,
  surroundings: false,
  origin: null,
  destination: null,
  guidance: null,
  choices: [],
  selectedRoute: 0,
};
type Event =
  | { type: "open" | "close" | "watch" | "pause" | "follow" | "stop-moving" | "clear-route" }
  | { type: "signal"; signal: Signal; terminal?: boolean }
  | { type: "fix"; fix: Position }
  | { type: "origin"; origin: string | null }
  | { type: "destination"; destination: WalkingDestination }
  | { type: "choose-route"; index: number };

function calculate(network: WalkingNetwork | undefined, state: Session, index = 0) {
  const start = state.origin
    ? { node: state.origin }
    : state.signal === "tracking" && state.match && state.match.samples >= 2
      ? state.match.location
      : null;
  const choices =
    network && start && state.destination
      ? findWalkingAlternatives(network, start, state.destination)
      : [];
  const selectedRoute = choices[index] ? index : 0;
  return {
    choices,
    selectedRoute,
    guidance: choices.length ? startGuidance(choices[selectedRoute]) : null,
  };
}

function reduce(network: WalkingNetwork | undefined, state: Session, event: Event): Session {
  switch (event.type) {
    case "open":
      return { ...state, active: true };
    case "close":
      return empty;
    case "watch":
      return {
        ...state,
        active: true,
        watching: true,
        watchVersion: state.watchVersion + 1,
        following: true,
        signal: "waiting",
        fix: null,
        match: null,
        origin: null,
        guidance: null,
        choices: [],
        selectedRoute: 0,
      };
    case "pause":
      return state.following ? { ...state, following: false } : state;
    case "follow":
      return { ...state, following: true };
    case "stop-moving":
      return state.fix?.moving ? { ...state, fix: { ...state.fix, moving: false } } : state;
    case "clear-route":
      return { ...state, destination: null, guidance: null, choices: [], selectedRoute: 0 };
    case "origin": {
      const next = { ...state, origin: event.origin, guidance: null, following: false };
      return { ...next, ...calculate(network, next) };
    }
    case "destination": {
      const next = { ...state, active: true, destination: event.destination, guidance: null };
      return { ...next, ...calculate(network, next) };
    }
    case "choose-route":
      return { ...state, ...calculate(network, state, event.index) };
    case "signal": {
      if (!state.watching) return state;
      const signal = event.signal;
      return {
        ...state,
        signal,
        match: null,
        fix: null,
        watching: !event.terminal && signal !== "denied" && signal !== "idle",
        guidance: state.guidance && {
          ...state.guidance,
          offRouteSince: null,
          offRouteCount: 0,
          arrivalSince: null,
        },
      };
    }
    case "fix": {
      if (!state.watching) return state;
      const fix = event.fix;
      const nearGate = distance(GATE_03_APPROACH_METRES, fix.point) <= 8;
      const coverage = walkingCoverage(referenceMetresToScene(fix.point));
      const inside = coverage !== "outside" || nearGate;
      const signal = inside ? "tracking" : "outside";
      const match = inside && network ? matchPosition(network, fix, state.match) : null;
      const next = {
        ...state,
        match,
        fix,
        surroundings: coverage !== "park",
        signal,
      } satisfies Session;
      if (!network || !state.destination || state.origin) return next;
      if (!state.guidance) return { ...next, ...calculate(network, next) };
      const guidance = advanceGuidance(network, state.destination, state.guidance, fix, match);
      if (guidance && guidance.route !== state.guidance.route) {
        const recalculated = calculate(network, next);
        return { ...next, ...recalculated, guidance };
      }
      return { ...next, guidance };
    }
  }
}

function routeTurns(path: Point[]) {
  const turns: WalkingOverlay["turns"] = [];
  for (let i = 1; i < path.length - 1; i++) {
    const [a, b, c] = path.slice(i - 1, i + 2);
    const incoming = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const outgoing = Math.atan2(c[0] - b[0], c[1] - b[1]);
    if (distance(a, b) >= 1.4 && distance(b, c) >= 1.4 && Math.cos(incoming - outgoing) < 0.8)
      turns.push({ point: b, angle: outgoing });
  }
  return turns;
}

export function useParkWalking(
  network: WalkingNetwork | undefined,
  geolocationOverride?: Geolocation,
) {
  const [state, dispatch] = useReducer(
    (previous: Session, event: Event) => reduce(network, previous, event),
    empty,
  );
  const pause = useCallback(() => dispatch({ type: "pause" }), []);
  useEffect(() => {
    if (!state.watching) return;
    const geo = geolocationOverride ?? navigator.geolocation;
    if (!window.isSecureContext || !geo) {
      dispatch({ type: "signal", signal: "unavailable", terminal: true });
      return;
    }
    let watch: number | undefined;
    let generation = 0;
    let disposed = false;
    let stale: number | undefined;
    let idle: number | undefined;
    let resumeAfter = 0;
    let previousFix: Position | null = null;
    const stop = () => {
      generation++;
      if (watch !== undefined) geo.clearWatch(watch);
      watch = undefined;
      previousFix = null;
      window.clearTimeout(stale);
      window.clearTimeout(idle);
    };
    const start = () => {
      if (disposed || document.hidden || watch !== undefined) return;
      const session = ++generation;
      let requestedApproximate = false;
      const active = () => !disposed && session === generation && !document.hidden;
      const accept: PositionCallback = (sample) => {
        if (!active()) return;
        const reading = readFix(sample, Date.now());
        if (!reading || reading.at < resumeAfter) return;
        const fix = filterFix(previousFix, reading);
        if (!fix) return;
        previousFix = fix;
        dispatch({ type: "fix", fix });
        window.clearTimeout(stale);
        window.clearTimeout(idle);
        idle = window.setTimeout(() => dispatch({ type: "stop-moving" }), WALK_IDLE_MS);
        stale = window.setTimeout(
          () => dispatch({ type: "signal", signal: "stale" }),
          Math.max(0, fix.at + FRESH_MS - Date.now()),
        );
      };
      const unavailable = () => {
        if (!active() || (previousFix && Date.now() - previousFix.at < FRESH_MS)) return;
        dispatch({ type: "signal", signal: resumeAfter ? "stale" : "unavailable" });
      };
      const approximate = () => {
        if (requestedApproximate || !active() || typeof geo.getCurrentPosition !== "function")
          return;
        requestedApproximate = true;
        try {
          geo.getCurrentPosition(accept, unavailable, {
            enableHighAccuracy: false,
            maximumAge: 0,
            timeout: 8_000,
          });
        } catch {
          unavailable();
        }
      };
      // Some computers can provide a Wi-Fi estimate after the high-accuracy
      // provider times out. The second request shares the consent and lifetime.
      stale = window.setTimeout(() => {
        unavailable();
        approximate();
      }, FRESH_MS);
      try {
        watch = geo.watchPosition(
          accept,
          (error) => {
            if (!active()) return;
            if (error.code === 1) {
              stop();
              dispatch({ type: "signal", signal: "denied" });
              return;
            }
            previousFix = null;
            window.clearTimeout(stale);
            dispatch({ type: "signal", signal: "unavailable" });
            approximate();
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
        );
      } catch {
        stop();
        dispatch({ type: "signal", signal: "unavailable", terminal: true });
      }
    };
    const visibility = () => {
      if (document.hidden) {
        stop();
        dispatch({ type: "signal", signal: "stale" });
      } else {
        resumeAfter = Date.now();
        start();
      }
    };
    const leave = () => {
      stop();
      dispatch({ type: "close" });
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    start();
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
    };
  }, [state.watching, state.watchVersion, geolocationOverride]);

  useEffect(() => {
    if (!state.active || state.watching) return;
    const leave = () => dispatch({ type: "close" });
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [state.active, state.watching]);

  const route = state.signal === "outside" && !state.origin ? undefined : state.guidance?.route;
  // Route geometry is rebuilt only when the route or meaningful progress changes.
  const progress = state.guidance ? Math.floor(state.guidance.progress / 2) * 2 : 0;
  const arrived = state.guidance?.arrived ?? false;
  const overlayRoute = useMemo(() => {
    if (!route || !network) return { path: [], alternate: [], turns: [], entry: null };
    const path = arrived
      ? []
      : remainingGeometry({ ...startGuidance(route), progress }).map(referenceMetresToScene);
    const other = state.choices[state.selectedRoute === 0 ? 1 : 0];
    const alternate =
      !arrived && progress < 6 && other ? other.path.map(referenceMetresToScene) : [];
    return {
      path,
      alternate,
      turns: routeTurns(path),
      entry: referenceMetresToScene(network.nodes[route.entry].point),
    };
  }, [route, network, progress, arrived, state.choices, state.selectedRoute]);
  const fix = state.signal === "tracking" ? state.fix : null;
  const overlay = useMemo<WalkingOverlay | null>(
    () =>
      state.active && (fix || route)
        ? {
            ...overlayRoute,
            person: fix
              ? {
                  point: referenceMetresToScene(fix.centre),
                  radius: fix.radius * REFERENCE_UNITS_PER_METRE,
                  approximate: fix.accuracy > 10,
                  moving: fix.moving,
                  heading:
                    fix.heading === undefined
                      ? undefined
                      : (() => {
                          const [x, z] = referenceMetresToScene([
                            fix.centre[0] + Math.sin(fix.heading),
                            fix.centre[1] + Math.cos(fix.heading),
                          ]);
                          const [cx, cz] = referenceMetresToScene(fix.centre);
                          return Math.atan2(x - cx, z - cz);
                        })(),
                }
              : null,
          }
        : null,
    [state.active, overlayRoute, fix, route],
  );
  return { state, dispatch, overlay, pause };
}
