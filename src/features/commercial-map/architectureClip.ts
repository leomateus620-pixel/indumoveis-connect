import { ShapeUtils, Vector2 } from "three";
import type { Point } from "./data/territory";
import { signedPolygonArea } from "./geometry";

export type ArchitecturalVertex = [number, number, number];
/** Vertical extrusion of the actual concave footprint. Y is interpolated,
 * preserving pitched roofs; footprint holes/notches never become a box. */
export function footprintClipper(footprint: readonly Point[]) {
  const pieces = ShapeUtils.triangulateShape(
    footprint.map((p) => new Vector2(...p)),
    [],
  ).map((indices) => indices.map((i) => footprint[i]));
  return (triangle: readonly ArchitecturalVertex[]): ArchitecturalVertex[][] => {
    const result: ArchitecturalVertex[][] = [],
      seen = new Set<string>();
    for (const piece of pieces) {
      const sign = Math.sign(signedPolygonArea(piece));
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
