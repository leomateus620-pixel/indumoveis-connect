import {
  distance,
  findWalkingRoute,
  isOpen,
  pathAfter,
  projectOnPath,
  type NetworkPosition,
  type WalkingDestination,
  type WalkingNetwork,
  type WalkingRoute,
} from "./network";
import type { Position } from "./position";

type Match = { location: NetworkPosition; at: number; samples: number };
export function matchPosition(
  network: WalkingNetwork,
  fix: Position,
  previous: Match | null,
): Match | null {
  if (fix.accuracy > 9) return null;
  const candidates = network.edges
    .filter((edge) => isOpen(edge))
    .map((edge) => ({
      edge,
      ...projectOnPath(fix.point, edge.path),
    }))
    .filter((candidate) => candidate.offset <= Math.max(3, Math.min(7, fix.accuracy)))
    .sort((a, b) => a.offset - b.offset);
  const best = candidates[0];
  if (!best) return null;
  const plausible = candidates.filter(
    (entry) => entry.offset - best.offset < fix.accuracy * 0.8 + 1,
  );
  let location: NetworkPosition = { edge: best.edge.id, metresAlong: best.metresAlong };
  if (plausible.length > 1) {
    const shared = [best.edge.from, best.edge.to].find(
      (node) =>
        plausible.every(({ edge }) => edge.from === node || edge.to === node) &&
        distance(network.nodes[node].point, fix.point) <= Math.min(4, fix.accuracy + 1) &&
        plausible.every((entry) => distance(entry.point, network.nodes[node].point) <= 5),
    );
    if (!shared) return null;
    location = { node: shared };
  }
  const adjacent = (before: NetworkPosition) => {
    if ("node" in location && "node" in before) return location.node === before.node;
    if ("edge" in location && "edge" in before) {
      if (location.edge === before.edge)
        return (
          Math.abs(location.metresAlong - before.metresAlong) <=
          (4 * (fix.at - previous!.at)) / 1000 + fix.accuracy
        );
      const a = network.edges.find((edge) => edge.id === locationEdge(location));
      const b = network.edges.find((edge) => edge.id === before.edge);
      const at = (edge: NonNullable<typeof a>, node: string, offset: number) =>
        edge.from === node ? offset : edge.to === node ? edge.metres - offset : Infinity;
      const along = location.metresAlong;
      return (
        a &&
        b &&
        [a.from, a.to].some(
          (node) =>
            at(a, node, along) + at(b, node, before.metresAlong) <=
            (4 * (fix.at - previous!.at)) / 1000 + fix.accuracy * 2,
        )
      );
    }
    const node = "node" in location ? location.node : "node" in before ? before.node : "";
    const part = "edge" in location ? location : "edge" in before ? before : null;
    const edge = network.edges.find((candidate) => candidate.id === part?.edge);
    return (
      !!edge &&
      !!part &&
      (edge.from === node
        ? part.metresAlong
        : edge.to === node
          ? edge.metres - part.metresAlong
          : Infinity) <=
        (4 * (fix.at - previous!.at)) / 1000 + fix.accuracy * 2
    );
  };
  const samples =
    previous &&
    fix.at > previous.at &&
    fix.at - previous.at <= 10_000 &&
    adjacent(previous.location)
      ? previous.samples + 1
      : 1;
  return { location, at: fix.at, samples };
}

function locationEdge(location: NetworkPosition) {
  return "edge" in location ? location.edge : undefined;
}

export type Guidance = {
  route: WalkingRoute;
  progress: number;
  offRouteSince: number | null;
  offRouteCount: number;
  arrivalSince: number | null;
  arrived: boolean;
  rerouted: boolean;
};

export const startGuidance = (route: WalkingRoute): Guidance => ({
  route,
  progress: 0,
  offRouteSince: null,
  offRouteCount: 0,
  arrivalSince: null,
  arrived: false,
  rerouted: false,
});

export function advanceGuidance(
  network: WalkingNetwork,
  destination: WalkingDestination,
  current: Guidance,
  fix: Position,
  match: Match | null,
): Guidance | null {
  if (current.arrived) return current;
  if (!match || match.samples < 2) {
    return { ...current, offRouteSince: null, offRouteCount: 0, arrivalSince: null };
  }
  const projection = projectOnPath(fix.point, current.route.path);
  if (projection.offset > Math.max(7, fix.accuracy + 3)) {
    const since = current.offRouteSince ?? fix.at;
    if (current.offRouteCount >= 2 && fix.at - since >= 5_000) {
      const replacement = findWalkingRoute(network, match.location, destination);
      return replacement ? { ...startGuidance(replacement), rerouted: true } : null;
    }
    return {
      ...current,
      offRouteSince: since,
      offRouteCount: current.offRouteCount + 1,
      arrivalSince: null,
    };
  }
  const remaining = current.route.metres - projection.metresAlong;
  const atEntry =
    "node" in match.location
      ? match.location.node === current.route.entry
      : network.edges.some(
          (edge) =>
            edge.id === locationEdge(match.location) &&
            (edge.from === current.route.entry || edge.to === current.route.entry),
        );
  const arrivalPoint = network.nodes[current.route.entry].point;
  const otherEntryPlausible = destination.entries.some(
    (entry) =>
      entry !== current.route.entry &&
      network.nodes[entry] &&
      distance(fix.point, network.nodes[entry].point) <= fix.accuracy + 8,
  );
  const closeToDoor =
    atEntry &&
    !otherEntryPlausible &&
    remaining <= 6 &&
    fix.accuracy <= 5 &&
    distance(fix.point, arrivalPoint) + fix.accuracy <= 8;
  const arrivalSince = closeToDoor ? (current.arrivalSince ?? fix.at) : null;
  const progress = Math.min(current.route.metres, Math.max(0, projection.metresAlong));
  return {
    ...current,
    offRouteSince: null,
    offRouteCount: 0,
    arrivalSince,
    progress,
    arrived: arrivalSince !== null && fix.at - arrivalSince >= 1_500,
  };
}

export function remainingGeometry(guidance: Guidance) {
  return pathAfter(guidance.route.path, guidance.progress);
}
