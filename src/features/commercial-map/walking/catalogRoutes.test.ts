import { describe, expect, it } from "vitest";
import preview from "../../../../scripts/park-walking-preview/extended-network.json";
import { ENTITIES, type Point } from "../data/territory";
import { PERMANENT_PARK_LANDMARKS } from "../permanentParkLayout";
import {
  referenceMetresToScene,
  sceneToReferenceCoordinate,
  sceneToReferenceMetres,
  URBAN_REFERENCE,
} from "../urbanReference";
import { walkingCoverage } from "./coverage";
import { advanceGuidance, matchPosition, startGuidance } from "./guidance";
import {
  distance,
  findWalkingRoute,
  lengthOf,
  walkingTimeLabel,
  type NetworkPosition,
  type WalkingNetwork,
} from "./network";
import { filterFix, readFix } from "./position";
import { findWalkingDestination } from "./useParkWalking";

const network = preview as unknown as WalkingNetwork;
const edges = new Map(network.edges.map((edge) => [edge.id, edge]));
const catalogue = [
  ...ENTITIES,
  ...PERMANENT_PARK_LANDMARKS,
  ...network.destinations,
  { id: "exit" },
];
const exit = { id: "exit", label: "Saída do parque", entries: network.exits! };
const destinations = [...new Set(catalogue.map(({ id }) => id))].flatMap((id) => {
  const destination = id === exit.id ? exit : findWalkingDestination(network, id);
  return destination ? [destination] : [];
});

function readAt(scene: Point, accuracy: number, timestamp: number, age = 0) {
  const [longitude, latitude] = sceneToReferenceCoordinate(scene);
  return readFix(
    {
      coords: { longitude, latitude, accuracy },
      timestamp: timestamp - age,
    } as GeolocationPosition,
    timestamp,
  );
}

// Independent shortest-distance oracle: relax all undirected edges until no
// value changes. The product uses Dijkstra and reconstructs routes from legs.
function shortestDistances(start: NetworkPosition) {
  const costs = new Map<string, number>();
  if ("node" in start) costs.set(start.node, 0);
  else {
    const edge = edges.get(start.edge)!;
    costs.set(edge.from, start.metresAlong);
    costs.set(edge.to, edge.metres - start.metresAlong);
  }
  for (let step = 0; step < Object.keys(network.nodes).length; step++) {
    let changed = false;
    for (const edge of network.edges) {
      if (edge.access !== "open") continue;
      for (const [from, to] of [
        [edge.from, edge.to],
        [edge.to, edge.from],
      ]) {
        const next = (costs.get(from) ?? Infinity) + edge.metres;
        if (next + 1e-8 >= (costs.get(to) ?? Infinity)) continue;
        costs.set(to, next);
        changed = true;
      }
    }
    if (!changed) return costs;
  }
  throw Error("Walking distance oracle did not converge");
}

function checkDestinations(start: NetworkPosition) {
  const expected = shortestDistances(start);
  for (const destination of destinations) {
    const route = findWalkingRoute(network, start, destination)!;
    const context = destination.id;
    expect(route, context).not.toBeNull();
    expect(route.metres, context).toBeCloseTo(
      Math.min(...destination.entries.map((entry) => expected.get(entry) ?? Infinity)),
      6,
    );
    expect(route.metres, context).toBeCloseTo(expected.get(route.entry)!, 6);
    expect(route.metres, context).toBeCloseTo(lengthOf(route.path), 6);
    expect(route.path.at(-1), context).toEqual(network.nodes[route.entry].point);
    for (let i = 0; i < route.legs.length; i++) {
      const leg = route.legs[i];
      expect(edges.get(leg.edge)?.access, context).toBe("open");
      if (i) expect(leg.from, context).toBe(route.legs[i - 1].to);
    }
    const minutes = Math.round(route.metres / 75);
    const eta = route.metres < 75 ? "menos de 1 min" : `cerca de ${minutes} min`;
    expect(walkingTimeLabel(route.metres, network.speedMps), context).toBe(eta);
  }
}

const origins = [
  { area: "Portão 3", point: [149.1042480964776, 95.8] },
  { area: "Rua Brasília sul", point: [149.0625, 80] },
  { area: "Rua Brasília central", point: [149.0625, 60] },
  { area: "Rua Brasília norte", point: [149.0625, 38] },
  { area: "quadras centrais", point: [114.15, 57] },
  { area: "Rua Argentina", point: [90, 65.8125] },
  { area: "Rua Uruguai", point: [133, 46.3] },
  { area: "Alameda Mercosul", point: [70, 47] },
  { area: "Rua Brasil", point: [100, 24.5] },
] satisfies { area: string; point: Point }[];

describe("matriz completa de destinos a pé do preview", () => {
  it("inclui todos os lotes, pavilhões, estruturas com rota, portões e saída", () => {
    const ids = new Set(destinations.map(({ id }) => id));
    const selectableBuildings = ENTITIES.filter(({ kind }) =>
      ["lot", "pavilion", "support"].includes(kind),
    );
    expect(selectableBuildings.filter(({ kind }) => kind === "lot")).toHaveLength(68);
    expect(selectableBuildings.filter(({ kind }) => kind === "pavilion")).toHaveLength(6);
    expect(
      selectableBuildings.filter(({ kind, id }) => kind !== "support" && !ids.has(id)),
    ).toEqual([]);
    expect(PERMANENT_PARK_LANDMARKS.every(({ id }) => ids.has(id))).toBe(true);
    expect(ids.size).toBe(network.destinations.length + 2); // Shared building and exit.
    expect(findWalkingDestination(network, "indumoveis:support:mao-na-massa")?.entries).toEqual(
      findWalkingDestination(network, "sede")?.entries,
    );
  });

  it.each(network.starts)("confere rota, entrada e ETA desde a partida manual %s", (node) => {
    checkDestinations({ node });
  });

  it.each(origins)("confere cada destino e as margens de GPS em $area", ({ point }) => {
    for (const accuracy of [2, 5, 8]) {
      const fix = filterFix(null, readAt(point, accuracy, 10_000)!)!;
      const first = matchPosition(network, fix, null);
      const second = matchPosition(network, { ...fix, at: 12_000 }, first);
      expect(second?.samples, `±${accuracy} m`).toBe(2);
      checkDestinations(second!.location);
    }
    for (const accuracy of [12, 35]) {
      const fix = filterFix(null, readAt(point, accuracy, 10_000)!)!;
      expect(matchPosition(network, fix, null)).toBeNull();
      expect(fix.radius).toBe(accuracy);
    }
    expect(readAt(point, 2, 20_000, 17_000)).toBeNull();
  });

  it("mantém o raio do aparelho no entorno e nunca força um encaixe fora da planta", () => {
    const scenes: [Point, "park" | "surroundings" | "outside"][] = [
      [[170, 60], "park"],
      [URBAN_REFERENCE.roundabout.center, "surroundings"],
      [[900, -600], "outside"],
    ];
    for (const [point, coverage] of scenes) {
      expect(walkingCoverage(point)).toBe(coverage);
      for (const accuracy of [2, 8, 35]) {
        const fix = filterFix(null, readAt(point, accuracy, 10_000)!)!;
        expect(matchPosition(network, fix, null)).toBeNull();
        expect(fix.radius).toBe(accuracy);
      }
    }
  });

  it("só registra chegada quando a posição distingue a entrada de cada destino", () => {
    for (const destination of destinations) {
      const route = findWalkingRoute(network, { node: network.starts[0] }, destination)!;
      const point = network.nodes[route.entry].point;
      const precise = filterFix(null, readAt(referenceMetresToScene(point), 2, 10_000)!)!;
      const atEntry = { location: { node: route.entry }, at: precise.at, samples: 3 };
      const first = advanceGuidance(network, destination, startGuidance(route), precise, atEntry)!;
      expect(first.arrived, destination.id).toBe(false);
      const later = { ...precise, at: precise.at + 2_000 };
      const competingEntry = destination.entries.some(
        (id) => id !== route.entry && distance(network.nodes[id].point, point) <= 10,
      );
      expect(
        advanceGuidance(network, destination, first, later, atEntry)?.arrived,
        destination.id,
      ).toBe(!competingEntry);
      const nearby = filterFix(null, readAt(referenceMetresToScene(point), 8, 12_000)!)!;
      expect(
        advanceGuidance(network, destination, first, nearby, atEntry)?.arrived,
        destination.id,
      ).toBe(false);
      expect(
        advanceGuidance(network, destination, first, later, null)?.arrived,
        destination.id,
      ).toBe(false);
    }
  });
});
