import type { Point } from "../data/territory";

export type Metres = Point; // [east, north] relative to the geographic reference
export type Path = readonly Metres[];
export type WalkingNode = {
  point: Metres;
  label: string;
  kind: "gate" | "junction" | "door" | "frontage";
};
export type WalkingEdge = {
  id: string;
  from: string;
  to: string;
  path: Path;
  metres: number;
  access: "open" | "closed" | "restricted";
  /** Adjacent sections of the same, continuous, verified street axis. */
  corridor?: string;
  /** Prefer a nearby street projection when this link overlaps it. */
  connector?: boolean;
  /** Parts of a legacy trace that represent the same pavement as a street axis. */
  axisCoverage?: { corridor: string; from: number; to: number }[];
  steps: "unknown" | "stairs" | "step-free";
};
export type WalkingDestination = { id: string; label: string; entries: readonly string[] };
export type WalkingNetwork = {
  editionYear: number;
  revision: string;
  validation: "preview" | "approved";
  speedMps: number;
  nodes: Record<string, WalkingNode>;
  edges: readonly WalkingEdge[];
  destinations: readonly WalkingDestination[];
  starts: readonly string[];
  exits?: readonly string[];
};

export const distance = (a: Metres, b: Metres) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lengthOf = (path: Path) =>
  path.reduce((total, point, index) => total + (index ? distance(path[index - 1], point) : 0), 0);
export const interpolate = (a: Metres, b: Metres, t: number): Metres => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

export function projectOnPath(point: Metres, path: Path) {
  let result = { point: path[0], metresAlong: 0, offset: distance(point, path[0]) };
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const length = distance(a, b);
    if (!length) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length ** 2,
      ),
    );
    const projected = interpolate(a, b, t);
    const offset = distance(point, projected);
    if (offset < result.offset)
      result = { point: projected, metresAlong: total + length * t, offset };
    total += length;
  }
  return result;
}

export function pathAfter(path: Path, metres: number): Metres[] {
  for (let i = 1; i < path.length; i++) {
    const length = distance(path[i - 1], path[i]);
    if (metres < length)
      return [interpolate(path[i - 1], path[i], metres / length), ...path.slice(i)];
    metres -= length;
  }
  return path.slice(-1);
}

export type NetworkPosition = { node: string } | { edge: string; metresAlong: number };

export const isOpen = (edge: WalkingEdge, stepFree = false) =>
  edge.access === "open" && (!stepFree || edge.steps === "step-free");

export type RouteLeg = {
  edge: string;
  from: string | null;
  to: string;
  path: Path;
  metres: number;
};
export type WalkingRoute = {
  entry: string;
  legs: RouteLeg[];
  path: Metres[];
  metres: number;
};

function* reachable(
  network: WalkingNetwork,
  start: NetworkPosition,
  stepFree = false,
  avoid?: string,
  includeLegs = true,
) {
  const unvisited = new Map<string, { metres: number; legs: RouteLeg[] }>();
  const settled = new Set<string>();
  const adjacency = new Map<string, WalkingEdge[]>();
  for (const edge of network.edges) {
    if (edge.id === avoid || !isOpen(edge, stepFree)) continue;
    for (const node of [edge.from, edge.to]) {
      const list = adjacency.get(node) ?? [];
      list.push(edge);
      adjacency.set(node, list);
    }
  }
  const offer = (node: string, metres: number, legs: RouteLeg[]) => {
    if (
      network.nodes[node] &&
      !settled.has(node) &&
      metres < (unvisited.get(node)?.metres ?? Infinity)
    )
      unvisited.set(node, { metres, legs });
  };
  if ("node" in start) offer(start.node, 0, []);
  else {
    const edge = network.edges.find((candidate) => candidate.id === start.edge);
    if (!edge || !isOpen(edge, stepFree)) return;
    const offset = Math.max(0, Math.min(edge.metres, start.metresAlong));
    offer(
      edge.to,
      edge.metres - offset,
      includeLegs
        ? [
            {
              edge: edge.id,
              from: null,
              to: edge.to,
              path: pathAfter(edge.path, offset),
              metres: edge.metres - offset,
            },
          ]
        : [],
    );
    offer(
      edge.from,
      offset,
      includeLegs
        ? [
            {
              edge: edge.id,
              from: null,
              to: edge.from,
              path: pathAfter([...edge.path].reverse(), edge.metres - offset),
              metres: offset,
            },
          ]
        : [],
    );
  }

  while (unvisited.size) {
    const [node, best] = [...unvisited].reduce((a, b) => (a[1].metres <= b[1].metres ? a : b));
    yield { node, ...best };
    unvisited.delete(node);
    settled.add(node);
    for (const edge of adjacency.get(node) ?? []) {
      const forward = edge.from === node;
      const to = forward ? edge.to : edge.from;
      if (!includeLegs) {
        offer(to, best.metres + edge.metres, []);
        continue;
      }
      const leg = {
        edge: edge.id,
        from: node,
        to,
        metres: edge.metres,
        path: forward ? edge.path : [...edge.path].reverse(),
      };
      offer(to, best.metres + leg.metres, [...best.legs, leg]);
    }
  }
}

export function findWalkingRoute(
  network: WalkingNetwork,
  start: NetworkPosition,
  destination: WalkingDestination,
  stepFree = false,
  avoid?: string,
): WalkingRoute | null {
  for (const { node, legs, metres } of reachable(network, start, stepFree, avoid)) {
    if (!destination.entries.includes(node)) continue;
    const path = legs.flatMap((leg, index) => (index ? leg.path.slice(1) : leg.path));
    return { entry: node, legs, metres, path: path.length ? path : [network.nodes[node].point] };
  }
  return null;
}

/** Distance between two projected positions, bounded for GPS matching. */
export function nearbyNetworkDistance(
  network: WalkingNetwork,
  start: NetworkPosition,
  end: NetworkPosition,
  limit: number,
): number {
  if ("edge" in start && "edge" in end && start.edge === end.edge) {
    const distance = Math.abs(start.metresAlong - end.metresAlong);
    const edge = network.edges.find(({ id }) => id === start.edge);
    return edge && isOpen(edge) && distance <= limit ? distance : Infinity;
  }
  const offsets = new Map<string, number>();
  if ("node" in end) offsets.set(end.node, 0);
  else {
    const edge = network.edges.find(({ id }) => id === end.edge);
    if (!edge || !isOpen(edge)) return Infinity;
    offsets.set(edge.from, end.metresAlong);
    offsets.set(edge.to, edge.metres - end.metresAlong);
  }
  let closest = Infinity;
  for (const { node, metres } of reachable(network, start, false, undefined, false)) {
    if (metres > limit || metres >= closest) break;
    closest = Math.min(closest, metres + (offsets.get(node) ?? Infinity));
  }
  return closest <= limit ? closest : Infinity;
}

export function walkingDistances(network: WalkingNetwork, start: NetworkPosition) {
  return new Map(
    Array.from(reachable(network, start, false, undefined, false), ({ node, metres }) => [
      node,
      metres,
    ]),
  );
}

export function walkingDestinationTimes(network: WalkingNetwork, start: NetworkPosition) {
  const distances = walkingDistances(network, start);
  return network.destinations
    .flatMap((item) => {
      const metres = Math.min(...item.entries.map((entry) => distances.get(entry) ?? Infinity));
      return Number.isFinite(metres) && metres >= 5 ? [{ item, metres }] : [];
    })
    .sort((a, b) => a.metres - b.metres);
}

export function walkingMinutes(metres: number, speedMps: number) {
  return Math.max(1, Math.round(metres / speedMps / 60));
}

export function walkingTimeLabel(metres: number, speedMps: number, short = false) {
  if (metres / speedMps < 60) return "menos de 1 min";
  return `${short ? "" : "cerca de "}${walkingMinutes(metres, speedMps)} min`;
}

/** Second route must use a different entrance or a materially different
 * corridor. An unavoidable partial first edge remains usable in either direction. */
export function findWalkingAlternatives(
  network: WalkingNetwork,
  start: NetworkPosition,
  destination: WalkingDestination,
): WalkingRoute[] {
  const primary = findWalkingRoute(network, start, destination);
  if (!primary) return [];
  const used = new Set(primary.legs.map(({ edge }) => edge));
  const differentCorridor = (route: WalkingRoute) =>
    route.legs
      .filter(({ edge }) => !used.has(edge))
      .some(
        (leg) =>
          leg.metres >= 20 &&
          leg.path
            .slice(1)
            .some(
              (point, i) =>
                projectOnPath(interpolate(leg.path[i], point, 0.5), primary.path).offset > 6,
            ),
      );
  const otherEntries = destination.entries.filter((entry) => entry !== primary.entry);
  const alternatives = [
    otherEntries.length
      ? findWalkingRoute(network, start, { ...destination, entries: otherEntries })
      : null,
    ...primary.legs
      .filter(({ from, metres }) => from && metres >= 3)
      .map(({ edge }) => findWalkingRoute(network, start, destination, false, edge)),
  ].filter(
    (route): route is WalkingRoute =>
      route !== null &&
      route.metres - primary.metres <= Math.max(15, primary.metres * 0.25) &&
      (route.entry !== primary.entry || differentCorridor(route)),
  );
  alternatives.sort((a, b) => a.metres - b.metres);
  return alternatives[0] ? [primary, alternatives[0]] : [primary];
}
