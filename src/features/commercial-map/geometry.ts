import type { MapEntity, Point } from "./data/territory";

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Signed sheet area: clockwise on screen is positive; never implies m². */
export function signedPolygonArea(polygon: readonly Point[]): number {
  return (
    polygon.reduce((sum, point, i) => {
      const next = polygon[(i + 1) % polygon.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2
  );
}

export function polygonBounds(polygon: readonly Point[]): Bounds {
  return polygon.reduce<Bounds>(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
      maxX: Math.max(bounds.maxX, x),
      maxY: Math.max(bounds.maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (
      Math.abs(cross) < 1e-8 &&
      x >= Math.min(xi, xj) - 1e-8 &&
      x <= Math.max(xi, xj) + 1e-8 &&
      y >= Math.min(yi, yj) - 1e-8 &&
      y <= Math.max(yi, yj) + 1e-8
    )
      return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function hasSelfIntersections(polygon: readonly Point[]): boolean {
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < polygon.length; i++) {
    const nextI = (i + 1) % polygon.length;
    for (let j = i + 1; j < polygon.length; j++) {
      const nextJ = (j + 1) % polygon.length;
      if (nextI === j || nextJ === i) continue;
      const a = polygon[i],
        b = polygon[nextI],
        c = polygon[j],
        d = polygon[nextJ];
      if (cross(a, b, c) * cross(a, b, d) < -1e-10 && cross(c, d, a) * cross(c, d, b) < -1e-10)
        return true;
    }
  }
  return false;
}

/** The same y-down sheet becomes +Z, without mirroring a single axis. */
export function sheetToWorld([x, y]: Point, elevation = 0): [number, number, number] {
  return [x, elevation, y];
}

/** Local metric evidence is independent of the schematic footprint. */
export function declaredAreaDifference(widthM: number, depthM: number, declaredM2: number) {
  const calculatedM2 = Number((widthM * depthM).toFixed(4));
  return { declaredM2, calculatedM2, differenceM2: Number((calculatedM2 - declaredM2).toFixed(4)) };
}

/** Validate build-time source data; no backend or graphics engine dependency. */
export function validateTerritory(entities: readonly MapEntity[], bounds: Bounds): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const outside = ([x, y]: Point) =>
    x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY;
  for (const entity of entities) {
    if (ids.has(entity.id)) errors.push(`duplicate id: ${entity.id}`);
    ids.add(entity.id);
    if (entity.polygon.length < 3 || Math.abs(signedPolygonArea(entity.polygon)) < 0.0001)
      errors.push(`degenerate: ${entity.id}`);
    if (
      entity.polygon.some((point) => !point.every(Number.isFinite)) ||
      !entity.anchor.every(Number.isFinite)
    )
      errors.push(`non-finite: ${entity.id}`);
    if (entity.polygon.some(outside)) errors.push(`outside bounds: ${entity.id}`);
    if (hasSelfIntersections(entity.polygon)) errors.push(`self intersection: ${entity.id}`);
    if (!pointInPolygon(entity.anchor, entity.polygon)) errors.push(`anchor outside: ${entity.id}`);
    if (entity.kind === "lot" && !entity.numbers?.length)
      errors.push(`lot without identity: ${entity.id}`);
    if (entity.numbers && new Set(entity.numbers).size !== entity.numbers.length)
      errors.push(`duplicate member: ${entity.id}`);
  }
  return errors;
}

/** Strict positive overlap between axis-aligned lot envelopes; touching is OK. */
export function rectangleOverlap(a: Bounds, b: Bounds): boolean {
  return (
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 1e-5 &&
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 1e-5
  );
}
