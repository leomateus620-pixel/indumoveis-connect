import {
  distance,
  findWalkingRoute,
  isOpen,
  nearbyNetworkDistance,
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
  const projections = network.edges
    .filter((edge) => isOpen(edge))
    .map((edge) => ({ edge, ...projectOnPath(fix.point, edge.path) }))
    .filter((candidate) => candidate.offset <= Math.max(3, Math.min(7, fix.accuracy)))
    .sort((a, b) => a.offset - b.offset);
  const streetHits = projections.filter(({ edge }) => !edge.connector);
  const hits = streetHits.length ? streetHits : projections;
  const nearbyAxes = new Set(hits.flatMap(({ edge }) => (edge.corridor ? [edge.corridor] : [])));
  const candidates = hits.filter(
    ({ edge, metresAlong }) =>
      !edge.axisCoverage?.some(
        ({ corridor, from, to }) =>
          nearbyAxes.has(corridor) && metresAlong >= from && metresAlong <= to,
      ),
  );
  const closest = candidates[0];
  if (!closest) return null;
  const projected = ({ edge, metresAlong }: (typeof candidates)[number]): NetworkPosition => ({
    edge: edge.id,
    metresAlong,
  });
  const axis = candidates.find(({ edge }) => edge.corridor);
  // Prefer the registered street axis when it is the nearest interpretation,
  // or when the two projections actually connect on the same piece of street.
  const followsAxis =
    axis &&
    (axis === closest ||
      nearbyNetworkDistance(network, projected(closest), projected(axis), 8) <= 8);
  const best = followsAxis ? axis : closest;
  const plausible = candidates.filter(
    (entry) => entry.offset - best.offset < fix.accuracy * 0.8 + 1,
  );
  let location = projected(best);
  // Coincident pieces of a single axis are one corridor. For any competing
  // unlabelled route require a short local joining path, not mere proximity.
  const competing = plausible.filter(
    (entry) =>
      entry !== best &&
      (!best.edge.corridor || entry.edge.corridor !== best.edge.corridor) &&
      !(
        followsAxis &&
        !entry.edge.corridor &&
        nearbyNetworkDistance(network, location, projected(entry), 8) <= 8
      ),
  );
  if (competing.length) {
    const shared = [best.edge.from, best.edge.to].find(
      (node) =>
        competing.every(({ edge }) => edge.from === node || edge.to === node) &&
        distance(network.nodes[node].point, fix.point) <= Math.min(4, fix.accuracy + 1) &&
        [...competing, best].every(
          (entry) => distance(entry.point, network.nodes[node].point) <= 5,
        ),
    );
    if (shared) location = { node: shared };
    else if (
      competing.some((entry) => nearbyNetworkDistance(network, location, projected(entry), 8) > 8)
    )
      return null;
  }
  const elapsed = previous ? fix.at - previous.at : 0;
  const speedBound = (4 * elapsed) / 1000 + 2 * fix.accuracy;
  const continued =
    previous &&
    elapsed > 0 &&
    elapsed <= 10_000 &&
    nearbyNetworkDistance(network, previous.location, location, speedBound) <= speedBound;
  return { location, at: fix.at, samples: continued ? previous.samples + 1 : 1 };
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
    nearbyNetworkDistance(network, match.location, { node: current.route.entry }, 8) <= 8;
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
