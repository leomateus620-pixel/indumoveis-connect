import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceGuidance, matchPosition, startGuidance } from "./guidance";
import { distance, findWalkingRoute, lengthOf, type Metres, type WalkingNetwork } from "./network";
import { readFix, filterFix, permitsAvatar } from "./position";
import {
  findWalkingAlternatives,
  walkingDestinationTimes,
  walkingDistances,
  walkingMinutes,
  walkingTimeLabel,
} from "./network";
import extendedPreview from "../../../../scripts/park-walking-preview/extended-network.json";
import { INDOMOVEIS_WALKING_PILOT as pilot } from "./pilot";
import { useParkWalking } from "./useParkWalking";
import { walkingCoverage } from "./coverage";
import {
  projectReferenceCoordinate,
  projectReferenceNode,
  referenceLocalMetres,
  referenceMetresToScene,
  REFERENCE_UNITS_PER_METRE,
  sceneToReferenceCoordinate,
  sceneToReferenceMetres,
  RESIDENTIAL_REFERENCE_BOUNDS,
  URBAN_REFERENCE,
} from "../urbanReference";

const p1 = pilot.destinations[0],
  p12 = pilot.destinations[1];
const fromGate = { node: "gate-03" };
const basic = (point: Metres, at: number, accuracy = 2) => ({ point, accuracy, at });
const filtered = (point: Metres, at: number, accuracy = 2) =>
  filterFix(null, basic(point, at, accuracy))!;
function sample(scene: Metres, at: number, accuracy = 3): GeolocationPosition {
  const [longitude, latitude] = sceneToReferenceCoordinate(scene);
  return {
    timestamp: at,
    coords: {
      longitude,
      latitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
  } as GeolocationPosition;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("registro geográfico do parque", () => {
  it("preserva o nó de origem e o eixo métrico usado pelo mapa existente", () => {
    expect(projectReferenceCoordinate([-54.4777125, -27.8434439])[0]).toBeCloseTo(148.2, 8);
    expect(projectReferenceNode("2132115382")[0]).toBeCloseTo(0, 8);
    expect(projectReferenceNode("2132115382")[1]).toBeCloseTo(98.675, 8);
    expect(referenceLocalMetres([-54.4777125, -27.8424439])[1]).toBeCloseTo(111.31949, 4);
    expect(referenceLocalMetres([-54.4767125, -27.8434439])[0]).toBeCloseTo(98.432, 1);
  });

  it("converte ida e volta sem trocar os eixos ou alterar a escala", () => {
    const lonLat: Metres = [-54.479302, -27.845005];
    const scene = projectReferenceCoordinate(lonLat);
    expect(sceneToReferenceCoordinate(scene)[0]).toBeCloseTo(lonLat[0], 9);
    expect(sceneToReferenceCoordinate(scene)[1]).toBeCloseTo(lonLat[1], 9);
    const metric = sceneToReferenceMetres(scene);
    expect(referenceMetresToScene(metric)[0]).toBeCloseTo(scene[0], 9);
    expect(referenceMetresToScene(metric)[1]).toBeCloseTo(scene[1], 9);
    expect(distance(scene, URBAN_REFERENCE.anchor.world) / REFERENCE_UNITS_PER_METRE).toBeCloseTo(
      Math.hypot(...metric),
      8,
    );
  });

  it("inclui o bairro representado e as rótulas, excluindo o horizonte", () => {
    const b = RESIDENTIAL_REFERENCE_BOUNDS;
    expect(walkingCoverage([(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2])).toBe("surroundings");
    expect(walkingCoverage(URBAN_REFERENCE.roundabout.center)).not.toBe("outside");
    expect(walkingCoverage([900, -600])).toBe("outside");
  });
});

describe("rede de caminhada", () => {
  it("mede o caminho modelado nos dois sentidos, com ETA em minutos", () => {
    const route = findWalkingRoute(pilot, fromGate, p1)!;
    expect(route.entry).toBe("p1-front");
    expect(route.metres).toBeCloseTo(280, -1);
    expect(route.metres).toBeCloseTo(lengthOf(route.path), 7);
    expect(walkingMinutes(route.metres, pilot.speedMps)).toBe(4);
    expect(
      findWalkingRoute(pilot, { node: route.entry }, pilot.destinations[2])?.metres,
    ).toBeCloseTo(route.metres);
    const edge = pilot.edges[0];
    expect(findWalkingRoute(pilot, { edge: edge.id, metresAlong: 2 }, p1)?.metres).toBeCloseTo(
      route.metres - 2,
    );
  });

  it("considera portas alternativas e bloqueios, sem atalho entre trechos desconectados", () => {
    const multiEntry = { ...p1, entries: [...p1.entries, ...p12.entries] };
    expect(findWalkingRoute(pilot, fromGate, multiEntry)?.entry).toBe("p12-front");
    const blocked: WalkingNetwork = {
      ...pilot,
      edges: pilot.edges.map((edge) =>
        edge.to === "p12-front" ? { ...edge, access: "closed" } : edge,
      ),
    };
    expect(findWalkingRoute(blocked, fromGate, multiEntry)?.entry).toBe("p1-front");
    expect(findWalkingRoute(blocked, fromGate, p12)).toBeNull();
    expect(findWalkingRoute(pilot, fromGate, { ...p1, entries: ["missing"] })).toBeNull();
    expect(findWalkingRoute(pilot, fromGate, p1, true)).toBeNull();
  });

  it("ordena destinos conectados pelo caminho e oferece portas ou corredores distintos", () => {
    const network = extendedPreview as unknown as WalkingNetwork;
    const start = { node: network.starts[0] };
    const ranked = walkingDestinationTimes(network, start);
    expect(
      ranked.filter(({ item }) => item.id.startsWith("indumoveis:external:lot:")),
    ).toHaveLength(68);
    expect(ranked.filter(({ item }) => item.id.startsWith("indumoveis:pavilion:"))).toHaveLength(6);
    expect(ranked.map(({ metres }) => metres)).toEqual(
      ranked.map(({ metres }) => metres).sort((a, b) => a - b),
    );
    const p14 = network.destinations.find(({ id }) => id === "indumoveis:pavilion:14")!;
    const [primary, alternate] = findWalkingAlternatives(network, start, p14);
    expect(primary.entry).not.toBe(alternate.entry);
    expect(primary.metres).toBeLessThan(alternate.metres);
    const exit = { id: "exit", label: "", entries: network.exits! };
    expect(findWalkingRoute(network, { node: network.starts[1] }, exit)).not.toBeNull();
  });

  const expanded = extendedPreview as unknown as WalkingNetwork;
  const expandedLot = (number: number) =>
    expanded.destinations.find(({ id }) => id.endsWith(`:lot:${number}`))!;

  it.each([
    { lot: 28, range: [95, 105], eta: 1 },
    { lot: 42, range: [118, 128], eta: 2 },
    { lot: 56, range: [141, 152], eta: 2 },
  ])("usa o corredor direto da Brasília até o lote $lot", ({ lot, range, eta }) => {
    const route = findWalkingRoute(expanded, { node: expanded.starts[0] }, expandedLot(lot))!;
    expect(route.metres).toBeGreaterThan(range[0]);
    expect(route.metres).toBeLessThan(range[1]);
    expect(walkingMinutes(route.metres, expanded.speedMps)).toBe(eta);
    expect(route.metres).toBeCloseTo(lengthOf(route.path), 7);
    expect(route.path.map(referenceMetresToScene).every(([x]) => x >= 143)).toBe(true);
  });

  it("confere os extremos e a metragem das ligações do preview", () => {
    const unsupported = expanded.edges.filter(
      (edge) =>
        !Number.isFinite(edge.metres) ||
        edge.metres <= 1e-8 ||
        distance(expanded.nodes[edge.from].point, edge.path[0]) > 1e-6 ||
        distance(expanded.nodes[edge.to].point, edge.path.at(-1)!) > 1e-6,
    );
    expect(unsupported.map(({ id }) => id)).toEqual([]);
    expect(new Set(expanded.edges.map(({ id }) => id)).size).toBe(expanded.edges.length);
  });

  it.each([
    [149.0625, 80],
    [149.0625, 60],
    [149.0625, 38],
    [114.15, 57],
    [90, 65.8125],
    [133, 46.3],
    [70, 47],
    [100, 24.5],
  ])("calcula a rede dos 68 lotes a partir da leitura em %s, %s", (x, z) => {
    const point = sceneToReferenceMetres([x, z]);
    const first = matchPosition(expanded, filtered(point, 1_000, 3), null);
    expect(first).not.toBeNull();
    const match = matchPosition(expanded, filtered(point, 3_000, 3), first);
    expect(match?.samples).toBe(2);
    const distances = walkingDistances(expanded, match!.location);
    expect(
      expanded.destinations.filter(
        ({ id, entries }) => id.includes(":lot:") && entries.some((entry) => distances.has(entry)),
      ),
    ).toHaveLength(68);
  });

  it("desconta o trecho já percorrido e usa outra frente quando ela é mais próxima", () => {
    const lot = expandedLot(56);
    const firstPoint = sceneToReferenceMetres([149.0625, 60]);
    const secondPoint = sceneToReferenceMetres([149.0625, 55]);
    const first = matchPosition(expanded, filtered(firstPoint, 1_000, 3), null)!;
    const second = matchPosition(expanded, filtered(secondPoint, 5_000, 3), first)!;
    expect(second.samples).toBe(2);
    const route = findWalkingRoute(expanded, first.location, lot)!;
    const remaining = findWalkingRoute(expanded, second.location, lot)!;
    const guidance = advanceGuidance(
      expanded,
      lot,
      startGuidance(route),
      filtered(secondPoint, 5_000, 3),
      second,
    )!;
    expect(guidance.progress).toBeCloseTo(5 / REFERENCE_UNITS_PER_METRE, 4);
    expect(route.metres - guidance.progress).toBeCloseTo(remaining.metres, 4);
    const west = matchPosition(
      expanded,
      filtered(sceneToReferenceMetres([133, 24.5]), 1_000, 3),
      null,
    )!;
    const westRoute = findWalkingRoute(expanded, west.location, lot)!;
    expect(westRoute.entry).not.toBe(route.entry);
    expect(westRoute.metres).toBeLessThan(30);
    expect(walkingTimeLabel(westRoute.metres, expanded.speedMps)).toBe("menos de 1 min");
  });

  it("preserva ambiguidade entre corredores paralelos", () => {
    const network: WalkingNetwork = {
      ...pilot,
      edges: [
        {
          id: "first",
          from: "a",
          to: "b",
          access: "open",
          steps: "unknown",
          path: [
            [0, 0],
            [40, 0],
          ],
          metres: 40,
        },
        {
          id: "second",
          from: "c",
          to: "d",
          access: "open",
          steps: "unknown",
          path: [
            [0, 6],
            [40, 6],
          ],
          metres: 40,
        },
      ],
    };
    expect(matchPosition(network, filtered([20, 3], 1_000, 4), null)).toBeNull();
    expect(matchPosition(network, filtered([20, 0], 1_000, 11), null)).toBeNull();
  });

  it("espera desvio persistente e exige permanência na entrada correta", () => {
    const route = findWalkingRoute(pilot, fromGate, p1)!;
    const p12Edge = pilot.edges.find((edge) => edge.to === "p12-front")!;
    const wrongDoor = pilot.nodes["p12-front"].point;
    let guidance = startGuidance(route);
    for (const at of [1_000, 4_000, 7_000]) {
      guidance = advanceGuidance(pilot, p1, guidance, filtered(wrongDoor, at), {
        location: { edge: p12Edge.id, metresAlong: p12Edge.metres },
        at,
        samples: 2,
      })!;
      expect(guidance.rerouted).toBe(at === 7_000);
      expect(guidance.arrived).toBe(false);
    }
    const door = pilot.nodes[route.entry].point;
    const match = { location: { node: route.entry }, at: 10_000, samples: 3 };
    guidance = advanceGuidance(pilot, p1, guidance, filtered(door, 10_000), match)!;
    expect(guidance.arrived).toBe(false);
    expect(advanceGuidance(pilot, p1, guidance, filtered(door, 12_000), null)?.arrived).toBe(false);
    expect(advanceGuidance(pilot, p1, guidance, filtered(door, 12_000), match)?.arrived).toBe(true);
  });
});

describe("localização e representação", () => {
  it("rejeita leitura antiga, salto e oscilação e detecta movimento persistente", () => {
    expect(readFix(sample([140, 90], 1_000), 14_000)).toBeNull();
    const first = filtered([0, 0], 1_000);
    expect(filterFix(first, basic([130, 3], 2_000))).toBeNull();
    const stationary = filterFix(first, basic([0.5, 0.5], 2_000))!;
    expect(stationary.moving).toBe(false);
    expect(stationary.radius).toBeGreaterThan(stationary.accuracy);
    const firstStep = filterFix(stationary, basic([0, 3.2], 3_000))!;
    expect(firstStep.heading).toBeUndefined();
    const walking = filterFix(firstStep, basic([0, 6.4], 5_000))!;
    expect(walking.moving).toBe(true);
    expect(walking.heading).toBe(0);
  });

  it("aplica histerese de distância e inclinação e conserva o ícone em posição aproximada", () => {
    expect(permitsAvatar(false, 24, 40, false)).toBe(false);
    expect(permitsAvatar(false, 25, 40, false)).toBe(true);
    expect(permitsAvatar(true, 20, 27, false)).toBe(true);
    expect(permitsAvatar(true, 18, 40, false)).toBe(false);
    expect(permitsAvatar(true, 35, 22, false)).toBe(false);
    expect(permitsAvatar(true, 35, 40, true)).toBe(false);
  });
});

function geolocation() {
  const callbacks: PositionCallback[] = [];
  const errors: PositionErrorCallback[] = [];
  const watch = vi.fn((callback: PositionCallback, error: PositionErrorCallback) => {
    callbacks.push(callback);
    errors.push(error);
    return callbacks.length;
  });
  const clear = vi.fn();
  const geo = {
    watchPosition: watch,
    clearWatch: clear,
    getCurrentPosition: vi.fn(),
  } as Geolocation;
  return { callbacks, errors, watch, clear, geo };
}

describe("ciclo de vida local por aba", () => {
  it("começa com ação, trata recusa e libera a escolha manual", () => {
    vi.stubGlobal("isSecureContext", true);
    const source = geolocation();
    const view = renderHook(() => useParkWalking(pilot, source.geo));
    act(() => view.result.current.dispatch({ type: "open" }));
    expect(source.watch).not.toHaveBeenCalled();
    act(() => view.result.current.dispatch({ type: "watch" }));
    act(() => source.errors[0]({ code: 1 } as GeolocationPositionError));
    expect(view.result.current.state.signal).toBe("denied");
    expect(source.clear).toHaveBeenCalledWith(1);
    act(() => view.result.current.dispatch({ type: "origin", origin: "gate-03" }));
    act(() => view.result.current.dispatch({ type: "destination", destination: p1 }));
    expect(view.result.current.state.guidance?.route.entry).toBe("p1-front");
    expect(view.result.current.overlay?.person).toBeNull();
    view.unmount();
  });

  it("tenta a leitura aproximada uma vez e exige uma nova amostra ao voltar à aba", () => {
    vi.stubGlobal("isSecureContext", true);
    vi.useFakeTimers();
    const source = geolocation();
    let hidden = false;
    const visibility = vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const fallback = vi.mocked(source.geo.getCurrentPosition);
    const view = renderHook(() => useParkWalking(pilot, source.geo));
    act(() => view.result.current.dispatch({ type: "watch" }));
    act(() => {
      source.errors[0]({ code: 2 } as GeolocationPositionError);
      source.errors[0]({ code: 3 } as GeolocationPositionError);
    });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallback.mock.calls[0][2]?.enableHighAccuracy).toBe(false);
    act(() => fallback.mock.calls[0][0](sample([149, 95.8], Date.now(), 30)));
    expect(view.result.current.overlay?.person?.approximate).toBe(true);
    expect(view.result.current.state.match).toBeNull();
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(view.result.current.state.signal).toBe("stale");
    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => source.callbacks[1](sample([149, 95.8], Date.now() - 1)));
    expect(view.result.current.overlay).toBeNull();
    act(() => source.callbacks[1](sample([149, 95.8], Date.now())));
    expect(view.result.current.overlay?.person).toBeTruthy();
    view.unmount();
    visibility.mockRestore();
  });

  it("descarta posição fora, expira leitura e ignora callbacks após sair ou desmontar", () => {
    vi.stubGlobal("isSecureContext", true);
    vi.useFakeTimers();
    const first = geolocation(),
      second = geolocation();
    const a = renderHook(() => useParkWalking(pilot, first.geo));
    const b = renderHook(() => useParkWalking(pilot, second.geo));
    act(() => {
      a.result.current.dispatch({ type: "watch" });
      b.result.current.dispatch({ type: "watch" });
    });
    act(() => {
      first.callbacks[0](sample([149, 95.8], Date.now()));
      second.callbacks[0](sample([900, -600], Date.now()));
    });
    expect(a.result.current.overlay?.person?.point[0]).toBeCloseTo(149);
    expect(b.result.current.state.signal).toBe("outside");
    expect(b.result.current.overlay).toBeNull();
    expect(b.result.current.state.fix).not.toBeNull();
    act(() => vi.advanceTimersByTime(12_001));
    expect(a.result.current.state.signal).toBe("stale");
    act(() => a.result.current.dispatch({ type: "close" }));
    expect(first.clear).toHaveBeenCalledWith(1);
    act(() => first.callbacks[0](sample([149, 95.8], Date.now())));
    expect(a.result.current.overlay).toBeNull();
    b.unmount();
    expect(second.clear).toHaveBeenCalledWith(1);
    a.unmount();
  });
});
