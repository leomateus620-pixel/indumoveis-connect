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
  /** Largest share of the lot a number may occupy across / along its baseline. */
  numberAcrossShare: 0.42,
  numberAlongShare: 0.72,
  /** cos(105 deg): the viewer must pass well beyond side-on before a flip. */
  numberFlipHysteresis: 0.26,
  /** A number seen almost along its own baseline is a sliver, not a number:
   * below this screen compression of the baseline it is not drawn. */
  numberMinBaseline: 0.32,
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

/** Fixed reading direction of a lot number: the lot edge closest to the
 * block frontage (drawing +X), so every number in a block shares one
 * baseline like a printed plan. It never depends on the camera. */
export function lotLabelAxis(polygon: readonly Point[]): Point {
  let longest = 0;
  const edges = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    longest = Math.max(longest, length);
    return { dx, dz, length };
  });
  let best: Point = [1, 0],
    score = -1;
  for (const edge of edges) {
    // Chamfers and survey jogs cannot set the direction of a whole lot.
    if (edge.length < longest * 0.35 || edge.length < 1e-9) continue;
    const alignment = Math.abs(edge.dx) / edge.length;
    if (alignment <= score + 1e-9) continue;
    score = alignment;
    const sign = edge.dx < 0 ? -1 : 1;
    best = [(edge.dx / edge.length) * sign, (edge.dz / edge.length) * sign];
  }
  return best;
}

/** Free length through the anchor along and across the reading direction.
 * Each value is twice the nearer boundary hit, because the number is centred
 * on its anchor. */
export function lotLabelExtent(polygon: readonly Point[], anchor: Point, axis: Point) {
  const chord = (dx: number, dz: number) => {
    let forward = Infinity,
      backward = Infinity;
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length],
        ex = b[0] - a[0],
        ez = b[1] - a[1],
        denominator = dx * ez - dz * ex;
      if (Math.abs(denominator) < 1e-12) return;
      const ox = a[0] - anchor[0],
        oz = a[1] - anchor[1],
        t = (ox * ez - oz * ex) / denominator,
        u = (ox * dz - oz * dx) / denominator;
      if (u < -1e-9 || u > 1 + 1e-9) return;
      if (t >= 0) forward = Math.min(forward, t);
      else backward = Math.min(backward, -t);
    });
    const half = Math.min(forward, backward);
    return Number.isFinite(half) ? half * 2 : 0;
  };
  return { along: chord(axis[0], axis[1]), across: chord(-axis[1], axis[0]) };
}

/** World height of a lot number. The pixel target governs while the lot is
 * large on screen; the lot itself caps the number so it can neither cross a
 * boundary nor dominate its polygon. Returning less than the legibility
 * threshold is how distant numbers leave the view progressively. */
export function lotNumberFit(
  extent: { along: number; across: number },
  worldUnitsPerPixel: number,
  textAspect: number,
  selected: boolean,
) {
  const desired =
    ((selected ? LOT_GRAPHICS.selectedNumberPixels : LOT_GRAPHICS.numberPixels) + 3) *
    worldUnitsPerPixel;
  const safe = Math.min(
    extent.across * LOT_GRAPHICS.numberAcrossShare,
    (extent.along * LOT_GRAPHICS.numberAlongShare) / Math.max(textAspect, 1e-6),
  );
  return Math.max(0, Math.min(desired, safe));
}

/** Reading side of a fixed lot number. The baseline never turns with the
 * camera; it only reverses, once, when the viewer is clearly on the far side,
 * so a number is never upside down and never oscillates near 90 degrees. */
export function lotLabelFacing(axis: Point, cameraRight: Point, previous: 1 | -1): 1 | -1 {
  const length = Math.hypot(cameraRight[0], cameraRight[1]);
  if (length < 1e-9) return previous;
  const alignment = ((axis[0] * cameraRight[0] + axis[1] * cameraRight[1]) / length) * previous;
  return alignment < -LOT_GRAPHICS.numberFlipHysteresis ? (-previous as 1 | -1) : previous;
}

/** Screen footprint of one world unit of a ground number: `height` is measured
 * perpendicular to the drawn baseline (what the eye reads as glyph height),
 * `baseline` is the compression along it. `cameraRight` / `cameraUp` are the
 * ground (x, z) components of the camera's right and up vectors. */
export function lotLabelProjection(axis: Point, cameraRight: Point, cameraUp: Point) {
  const rx = axis[0] * cameraRight[0] + axis[1] * cameraRight[1],
    ry = axis[0] * cameraUp[0] + axis[1] * cameraUp[1],
    // The glyph-height direction on the ground is the baseline turned 90 deg.
    ux = axis[1] * cameraRight[0] - axis[0] * cameraRight[1],
    uy = axis[1] * cameraUp[0] - axis[0] * cameraUp[1];
  const baseline = Math.hypot(rx, ry);
  return { baseline, height: baseline > 1e-9 ? Math.abs(rx * uy - ry * ux) / baseline : 0 };
}
