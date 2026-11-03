import type { Point } from "./data/territory";
import { signedPolygonArea } from "./geometry";

/** A2 white-road classification is at one pixel per PDF point. Subpixel
 * contour simplification removes staircase sampling, never calibrated lots
 * or vector building/block outlines. Original evidence remains immutable. */
export const ROAD_CONTOUR_REVIEW = { tolerancePdfPoints: 0.75, sourcePixelPdfPoints: 1 } as const;
const distanceSquared = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
    );
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dz) ** 2;
};
function simplifyOpen(points: Point[], tolerance: number): Point[] {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maximum = tolerance * tolerance,
      index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceSquared(points[i], points[start], points[end]);
      if (d > maximum) {
        maximum = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
export function simplifyRoadContour(
  input: readonly Point[],
  tolerance: number = ROAD_CONTOUR_REVIEW.tolerancePdfPoints,
): Point[] {
  const points = input
    .filter(
      (p, i) => i !== input.length - 1 || Math.hypot(p[0] - input[0][0], p[1] - input[0][1]) > 1e-9,
    )
    .map((p) => [...p] as Point);
  if (points.length < 5 || tolerance <= 0) return points;
  let opposite = 1;
  for (let i = 2; i < points.length; i++)
    if (
      distanceSquared(points[i], points[0], points[0]) >
      distanceSquared(points[opposite], points[0], points[0])
    )
      opposite = i;
  let result = [
    ...simplifyOpen(points.slice(0, opposite + 1), tolerance).slice(0, -1),
    ...simplifyOpen([...points.slice(opposite), points[0]], tolerance).slice(0, -1),
  ];
  if (
    result.length < 3 ||
    Math.sign(signedPolygonArea(result)) !== Math.sign(signedPolygonArea(points))
  )
    return points;
  const side = (a: Point, b: Point, p: Point) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const originalIndices = new Map(points.map((point, index) => [point, index]));
  for (let pass = 0; pass < 6; pass++) {
    const restore = new Set<number>();
    for (let i = 0; i < result.length; i++)
      for (let j = i + 2; j < result.length; j++) {
        if (i === 0 && j === result.length - 1) continue;
        const a = result[i],
          b = result[(i + 1) % result.length],
          c = result[j],
          d = result[(j + 1) % result.length];
        if (side(a, b, c) * side(a, b, d) < -1e-9 && side(c, d, a) * side(c, d, b) < -1e-9) {
          restore.add(i);
          restore.add(j);
        }
      }
    if (!restore.size) return result;
    // Restore only an unsafe shortcut; a tiny drafting notch must not undo
    // the entire perimeter's verified curve refinement.
    result = result.flatMap((p, i) => {
      if (!restore.has(i)) return [p];
      const start = originalIndices.get(p)!,
        end = originalIndices.get(result[(i + 1) % result.length])!;
      return end > start
        ? points.slice(start, end)
        : [...points.slice(start), ...points.slice(0, end)];
    });
  }
  return points;
}
