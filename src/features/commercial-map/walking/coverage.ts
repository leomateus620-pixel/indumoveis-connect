import type { Point } from "../data/territory";
import { pointInPolygon, polygonBounds } from "../geometry";
import { PARK_NAVIGATION_FOOTPRINT } from "../permanentParkLayout";
import { EXPLORATION_POLYGONS, REFERENCE_UNITS_PER_METRE } from "../urbanReference";
import { EAST_APPROACH } from "../urbanPavement";
import { projectOnPath } from "./network";

const EAST_BAND = 12 * REFERENCE_UNITS_PER_METRE;
const east = [EAST_APPROACH.highway, EAST_APPROACH.returnArm];
const eastCorridors = east.flatMap((path) =>
  path.slice(1).flatMap((b, index) => {
    const a = path[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) return [];
    const dx = ((b[1] - a[1]) / length) * EAST_BAND;
    const dz = ((a[0] - b[0]) / length) * EAST_BAND;
    return [
      [
        [a[0] - dx, a[1] - dz],
        [a[0] + dx, a[1] + dz],
        [b[0] + dx, b[1] + dz],
        [b[0] - dx, b[1] - dz],
      ] as Point[],
    ];
  }),
);
export const WALKING_CONTEXT_POLYGONS = [
  PARK_NAVIGATION_FOOTPRINT,
  ...EXPLORATION_POLYGONS,
  ...eastCorridors,
];
export const walkingContextBounds = polygonBounds(WALKING_CONTEXT_POLYGONS.flat());

/** Finite detailed map, independent of zoom, viewport and decorative horizon. */
export function walkingCoverage(point: Point): "park" | "surroundings" | "outside" {
  if (pointInPolygon(point, PARK_NAVIGATION_FOOTPRINT)) return "park";
  if (
    EXPLORATION_POLYGONS.some((area) => pointInPolygon(point, area)) ||
    east.some((path) => projectOnPath(point, path).offset <= EAST_BAND)
  )
    return "surroundings";
  return "outside";
}
