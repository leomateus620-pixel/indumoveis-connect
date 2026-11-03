import type { MapEntity, Point } from "./data/territory";
import { pointInPolygon, polygonBounds } from "./geometry";

export const LOT_GRAPHICS = {
  perimeter: "#654653",
  division: "#565e48",
  separation: "#c8c3a0",
  selected: "#f1cc70",
  hover: "#ede0ad",
  perimeterPixels: 2.05,
  divisionPixels: 1.55,
  separationPixels: 0.8,
  numberPixels: 11,
  selectedNumberPixels: 13,
} as const;

export type CommercialBoundary = { a: Point; b: Point; owners: string[] };

/** Split at existing collinear vertices before deduplication. This also handles
 * a long cadastral edge shared by two shorter neighbours. Keys identify edges;
 * emitted coordinates are the original coordinates, never snapped geometry. */
export function commercialBoundaries(entities: readonly MapEntity[]): CommercialBoundary[] {
  const edges = entities
    .filter((entity) => entity.kind === "lot")
    .flatMap((entity) =>
      entity.polygon.map((a, i) => ({
        a,
        b: entity.polygon[(i + 1) % entity.polygon.length],
        owner: entity.id,
      })),
    );
  const vertices = edges.flatMap((edge) => [edge.a, edge.b]);
  const segments = new Map<string, CommercialBoundary>();
  const key = (p: Point) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  for (const edge of edges) {
    const dx = edge.b[0] - edge.a[0],
      dz = edge.b[1] - edge.a[1],
      length2 = dx * dx + dz * dz;
    if (length2 < 1e-14) continue;
    const cuts: { t: number; p: Point }[] = [
      { t: 0, p: edge.a },
      { t: 1, p: edge.b },
    ];
    for (const p of vertices) {
      const rx = p[0] - edge.a[0],
        rz = p[1] - edge.a[1],
        t = (rx * dx + rz * dz) / length2;
      if (
        t > 1e-8 &&
        t < 1 - 1e-8 &&
        Math.abs(rx * dz - rz * dx) / Math.sqrt(length2) < 1e-7 &&
        !cuts.some((cut) => Math.abs(cut.t - t) < 1e-8)
      )
        cuts.push({ t, p });
    }
    cuts.sort((a, b) => a.t - b.t);
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1].p,
        b = cuts[i].p,
        aKey = key(a),
        bKey = key(b),
        segmentKey = aKey < bKey ? `${aKey}/${bKey}` : `${bKey}/${aKey}`;
      const previous = segments.get(segmentKey);
      if (previous) {
        if (!previous.owners.includes(edge.owner)) previous.owners.push(edge.owner);
      } else segments.set(segmentKey, { a, b, owners: [edge.owner] });
    }
  }
  return [...segments.values()];
}

export function boundaryDistance(point: Point, polygon: readonly Point[]) {
  let nearest = Infinity;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length2 = dx * dx + dy * dy,
      t = length2
        ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2))
        : 0;
    nearest = Math.min(nearest, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
  });
  return pointInPolygon(point, polygon) ? nearest : -nearest;
}

/** Presentation anchor only. Coarse-to-fine maximum-clearance search remains
 * inside a concave polygon; no cadastral anchor or lot geometry is rewritten. */
export function interiorLotAnchor(polygon: readonly Point[], preferred?: Point): Point {
  const bounds = polygonBounds(polygon);
  let best: Point =
    preferred && pointInPolygon(preferred, polygon) ? [...preferred] : [...polygon[0]];
  let clearance = boundaryDistance(best, polygon);
  let x0 = bounds.minX,
    y0 = bounds.minY,
    width = bounds.maxX - x0,
    height = bounds.maxY - y0;
  for (let pass = 0; pass < 5; pass++) {
    for (let x = 0; x <= 12; x++)
      for (let y = 0; y <= 12; y++) {
        const p: Point = [x0 + (x * width) / 12, y0 + (y * height) / 12];
        const d = boundaryDistance(p, polygon);
        if (d > clearance) {
          best = p;
          clearance = d;
        }
      }
    width /= 3;
    height /= 3;
    x0 = best[0] - width / 2;
    y0 = best[1] - height / 2;
  }
  return preferred && boundaryDistance(preferred, polygon) >= clearance * 0.92 ? preferred : best;
}

/** Conservative clearance cap for a ground number's X/Z footprint. A
 * circle around the anchor is guaranteed inside even for reentrant polygons. */
export function lotNumberHeight(
  radius: number,
  worldUnitsPerPixel: number,
  textAspect: number,
  selected: boolean,
) {
  const desired =
    ((selected ? LOT_GRAPHICS.selectedNumberPixels : LOT_GRAPHICS.numberPixels) + 3) *
    worldUnitsPerPixel;
  const safe = (radius * 1.78) / Math.hypot(1, textAspect);
  return Math.min(desired, safe);
}
