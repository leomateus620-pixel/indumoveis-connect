import { ShapeUtils, Vector2 } from "three";
import type { Point } from "./data/territory";
import { pointInPolygon, signedPolygonArea } from "./geometry";

export type ArchitecturalVertex = [number, number, number];
/** Vertical extrusion of the actual concave footprint. Y is interpolated,
 * preserving pitched roofs; footprint holes/notches never become a box. */
export function footprintClipper(footprint: readonly Point[]) {
  const pieces = ShapeUtils.triangulateShape(
    footprint.map((p) => new Vector2(...p)),
    [],
  ).map((indices) => {
    const points = indices.map((i) => footprint[i]);
    const sign = Math.sign(signedPolygonArea(points));
    return {
      points,
      sign,
      minX: Math.min(...points.map((p) => p[0])),
      maxX: Math.max(...points.map((p) => p[0])),
      minZ: Math.min(...points.map((p) => p[1])),
      maxZ: Math.max(...points.map((p) => p[1])),
    };
  });
  // Most small frame members lie entirely inside the outline. A triangle
  // whose plan bounds miss every boundary has the same membership throughout.
  // Keep its original three vertices instead of cutting it at internal ears.
  const boundary = footprint.map((p, i) => {
    const q = footprint[(i + 1) % footprint.length];
    return {
      minX: Math.min(p[0], q[0]),
      maxX: Math.max(p[0], q[0]),
      minZ: Math.min(p[1], q[1]),
      maxZ: Math.max(p[1], q[1]),
    };
  });
  return (triangle: readonly ArchitecturalVertex[]): ArchitecturalVertex[][] => {
    const result: ArchitecturalVertex[][] = [],
      seen = new Set<string>();
    const [u, v, w] = triangle;
    const minX = Math.min(u[0], v[0], w[0]),
      maxX = Math.max(u[0], v[0], w[0]);
    const minZ = Math.min(u[2], v[2], w[2]),
      maxZ = Math.max(u[2], v[2], w[2]);
    const overlaps = (b: (typeof boundary)[number]) =>
      minX <= b.maxX + 1e-8 &&
      maxX >= b.minX - 1e-8 &&
      minZ <= b.maxZ + 1e-8 &&
      maxZ >= b.minZ - 1e-8;
    if (!boundary.some(overlaps)) {
      if (!pointInPolygon([u[0], u[2]], footprint)) return [];
      const abX = v[0] - u[0],
        abY = v[1] - u[1],
        abZ = v[2] - u[2];
      const acX = w[0] - u[0],
        acY = w[1] - u[1],
        acZ = w[2] - u[2];
      if (Math.hypot(abY * acZ - abZ * acY, abZ * acX - abX * acZ, abX * acY - abY * acX) < 1e-9)
        return [];
      return [[u, v, w]];
    }
    for (const bounds of pieces) {
      const { points: piece, sign } = bounds;
      if (!overlaps(bounds)) continue;
      let polygon = [...triangle];
      for (let i = 0; i < piece.length && polygon.length; i++) {
        const a = piece[i],
          b = piece[(i + 1) % piece.length];
        const side = (p: ArchitecturalVertex) =>
          sign * ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
        const next: ArchitecturalVertex[] = [];
        polygon.forEach((p, j) => {
          const q = polygon[(j + 1) % polygon.length],
            dp = side(p),
            dq = side(q);
          if (dp >= -1e-8) next.push(p);
          if ((dp > 1e-8 && dq < -1e-8) || (dp < -1e-8 && dq > 1e-8)) {
            const t = dp / (dp - dq);
            next.push([
              p[0] + t * (q[0] - p[0]),
              p[1] + t * (q[1] - p[1]),
              p[2] + t * (q[2] - p[2]),
            ]);
          }
        });
        polygon = next;
      }
      for (let i = 1; i < polygon.length - 1; i++) {
        const t = [polygon[0], polygon[i], polygon[i + 1]],
          [a, b, c] = t;
        const u = b.map((x, j) => x - a[j]),
          v = c.map((x, j) => x - a[j]);
        if (
          Math.hypot(
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ) < 1e-9
        )
          continue;
        // A vertical face exactly on an internal triangulation edge has one
        // owner, even when both columns intersect the same input triangle.
        const key = t
          .map((p) => p.map((x) => Math.round(x * 1e7)).join(","))
          .sort()
          .join(";");
        if (!seen.has(key)) {
          seen.add(key);
          result.push(t);
        }
      }
    }
    return result;
  };
}
