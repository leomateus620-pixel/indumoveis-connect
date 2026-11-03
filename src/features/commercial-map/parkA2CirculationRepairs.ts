import type { Point } from "./data/territory";
import { pointInPolygon, polygonBounds } from "./geometry";
import { PARK_A2_GATES, PARK_A2_ROAD_SURFACES } from "./parkA2Reference";

/** The road extraction deliberately keeps the source rings. Dark gate bars,
 * grey numbered circles and blue E annotations are ink over a passage, not
 * holes in the pavement. Restore only the short, documented opening axis;
 * dimensions are drawing evidence and never a portal-building footprint. */
const sourceSurfaces = PARK_A2_ROAD_SURFACES.map((surface) => ({
  ...surface,
  bounds: polygonBounds(surface.polygon),
  holeBounds: surface.holes.map(polygonBounds),
}));
export function pointOnA2Road(point: Point): boolean {
  return sourceSurfaces.some((surface) => {
    const b = surface.bounds;
    if (
      point[0] < b.minX ||
      point[0] > b.maxX ||
      point[1] < b.minY ||
      point[1] > b.maxY ||
      !pointInPolygon(point, surface.polygon)
    )
      return false;
    return !surface.holes.some((hole, i) => {
      const h = surface.holeBounds[i];
      return (
        point[0] >= h.minX &&
        point[0] <= h.maxX &&
        point[1] >= h.minY &&
        point[1] <= h.maxY &&
        pointInPolygon(point, hole)
      );
    });
  });
}

export const PARK_A2_GATE_PAVEMENT_REPAIRS = Object.entries(PARK_A2_GATES).flatMap(([id, gate]) => {
  if (pointOnA2Road(gate.passagePoint)) return [];
  const magnitude = Math.hypot(...gate.axis2D);
  const axis: Point = [gate.axis2D[0] / magnitude, gate.axis2D[1] / magnitude];
  const normal: Point = [-axis[1], axis[0]];
  const along = (t: number, offset = 0): Point => [
    gate.passagePoint[0] + axis[0] * t + normal[0] * offset,
    gate.passagePoint[1] + axis[1] * t + normal[1] * offset,
  ];
  const nearest = (sign: number) => {
    for (let step = 0.5; step <= gate.width * 2 + 4; step += 0.5)
      if (pointOnA2Road(along(step * sign))) return step * sign;
    return null;
  };
  const before = nearest(-1),
    after = nearest(1);
  if (before === null && after === null) return [];
  const embed = Math.min(2, gate.width * 0.15);
  const start = before === null ? -0.5 : before - embed;
  const end = after === null ? 0.5 : after + embed;
  const section = (t: number): [number, number] => {
    let low = 0,
      high = 0;
    const half = gate.width / 2;
    for (let offset = 0.25; offset <= half; offset += 0.25) {
      if (!pointOnA2Road(along(t, -offset))) break;
      low = -offset;
    }
    for (let offset = 0.25; offset <= half; offset += 0.25) {
      if (!pointOnA2Road(along(t, offset))) break;
      high = offset;
    }
    return [low, high];
  };
  const knownBefore = before === null ? null : section(start),
    knownAfter = after === null ? null : section(end);
  const usable = (section: [number, number] | null) =>
    section && section[1] - section[0] >= gate.width * 0.25;
  // At a right-angle mouth one profile can meet the edge of the other branch.
  // The opposite confirmed white section supplies the same opening width.
  const first = usable(knownBefore) ? knownBefore! : usable(knownAfter) ? knownAfter! : null;
  const last = usable(knownAfter) ? knownAfter! : first;
  if (!first || !last) return [];
  return [
    {
      id: `gate-${id.toLowerCase()}-annotation-clearance`,
      gateId: id,
      polygon: [
        along(start, first[0]),
        along(end, last[0]),
        along(end, last[1]),
        along(start, first[1]),
      ] as Point[],
      source:
        "A2 original passage axis/white road edges; a2-gates-review.png; gate annotation removed from raster road classification",
      sourceSpan: [start, end] as Point,
      referenceWidth: gate.width,
      condition:
        "Short graphical occlusion repair, following the existing passage. No surveyed width, parking area or portal volume is inferred.",
    },
  ];
});
