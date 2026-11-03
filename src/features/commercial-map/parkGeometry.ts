import type { Point } from "./data/territory";
import { signedPolygonArea, polygonBounds } from "./geometry";

/** Planar operations without Three.js, safe in the initial SVG/search chunk. */
export function subtractConvexPolygon(
  subject: readonly Point[],
  blocker: readonly Point[],
): Point[][] {
  const sign = Math.sign(signedPolygonArea(blocker));
  let inside = [...subject];
  const outside: Point[][] = [];
  for (let i = 0; i < blocker.length && inside.length; i++) {
    const a = blocker[i],
      b = blocker[(i + 1) % blocker.length];
    const side = (p: Point) =>
      sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const yes: Point[] = [],
      no: Point[] = [];
    inside.forEach((p, j) => {
      const q = inside[(j + 1) % inside.length],
        dp = side(p),
        dq = side(q);
      if (dp >= -1e-9) yes.push(p);
      if (dp <= 1e-9) no.push(p);
      if ((dp > 1e-9 && dq < -1e-9) || (dp < -1e-9 && dq > 1e-9)) {
        const t = dp / (dp - dq),
          cross: Point = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
        yes.push(cross);
        no.push(cross);
      }
    });
    if (no.length >= 3 && Math.abs(signedPolygonArea(no)) > 1e-8) outside.push(no);
    inside = yes;
  }
  return outside;
}
export function subtractPolygons(
  subjects: readonly Point[][],
  blockers: readonly Point[][],
): Point[][] {
  let result = subjects.map((polygon) => ({ polygon, bounds: polygonBounds(polygon) }));
  for (const blocker of blockers) {
    const b = polygonBounds(blocker);
    result = result.flatMap((part) => {
      const a = part.bounds;
      // Broad phase only; actual clipping still uses every polygon edge.
      if (
        a.maxX <= b.minX + 1e-9 ||
        b.maxX <= a.minX + 1e-9 ||
        a.maxY <= b.minY + 1e-9 ||
        b.maxY <= a.minY + 1e-9
      )
        return [part];
      return subtractConvexPolygon(part.polygon, blocker).map((polygon) => ({
        polygon,
        bounds: polygonBounds(polygon),
      }));
    });
  }
  return result.map((part) => part.polygon);
}

/** Tests positive-area intersection, including crossing edges without a
 * contained vertex. Boundary contact is a legitimate pavement junction. */
export function polygonsOverlap(
  a: readonly Point[],
  b: readonly Point[],
  tolerance = 1e-7,
): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const strictlyInside = (p: Point, polygon: readonly Point[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const v = polygon[i],
        w = polygon[j];
      if (
        Math.abs(cross(v, w, p)) < tolerance &&
        p[0] >= Math.min(v[0], w[0]) - tolerance &&
        p[0] <= Math.max(v[0], w[0]) + tolerance &&
        p[1] >= Math.min(v[1], w[1]) - tolerance &&
        p[1] <= Math.max(v[1], w[1]) + tolerance
      )
        return false;
      if (
        v[1] > p[1] !== w[1] > p[1] &&
        p[0] < ((w[0] - v[0]) * (p[1] - v[1])) / (w[1] - v[1]) + v[0]
      )
        inside = !inside;
    }
    return inside;
  };
  if (a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a))) return true;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const p = a[i],
        q = a[(i + 1) % a.length],
        r = b[j],
        s = b[(j + 1) % b.length];
      if (
        cross(p, q, r) * cross(p, q, s) < -tolerance &&
        cross(r, s, p) * cross(r, s, q) < -tolerance
      )
        return true;
    }
  const middle: Point = [
    a.reduce((s, p) => s + p[0], 0) / a.length,
    a.reduce((s, p) => s + p[1], 0) / a.length,
  ];
  return strictlyInside(middle, a) && strictlyInside(middle, b);
}
