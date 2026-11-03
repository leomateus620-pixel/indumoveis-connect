import type { Point } from "./data/territory";
import { polygonBounds, type Bounds } from "./geometry";

/** Offline geometric audit only. Scanline fill uses the actual polygon union;
 * an eroded 4-neighbour grid gives conservative candidate paths. Every result
 * must then pass the independent vector-surface/clearance validator. No part
 * of this mask creates or changes rendered pavement or production navigation. */
export function buildSurfaceConnectivityGrid(
  surfaces: readonly Point[][],
  blockers: readonly Point[][],
  root: Point,
  supported: (path: Point[]) => boolean,
  step = 0.125,
  auditExtent?: Bounds,
) {
  const bounds = auditExtent ?? polygonBounds(surfaces.flat()),
    origin: Point = [
      Math.floor(bounds.minX / step) * step - step,
      Math.floor(bounds.minY / step) * step - step,
    ];
  const width = Math.ceil((bounds.maxX - origin[0]) / step) + 2,
    height = Math.ceil((bounds.maxY - origin[1]) / step) + 2,
    count = width * height;
  if (count > 10_000_000) throw new Error("connectivity-grid-audit-envelope-too-large");
  const mask = new Uint8Array(count),
    safe = new Uint8Array(count),
    components = new Int32Array(count).fill(-1);
  const at = (x: number, z: number): Point => [
    origin[0] + (x + 0.5) * step,
    origin[1] + (z + 0.5) * step,
  ];
  const fill = (polygon: readonly Point[], value: number) => {
    const b = polygonBounds(polygon),
      start = Math.max(0, Math.ceil((b.minY - origin[1]) / step - 0.5)),
      end = Math.min(height - 1, Math.floor((b.maxY - origin[1]) / step - 0.5));
    for (let z = start; z <= end; z++) {
      const worldZ = origin[1] + (z + 0.5) * step,
        hits: number[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          c = polygon[(i + 1) % polygon.length];
        if ((a[1] <= worldZ && c[1] > worldZ) || (c[1] <= worldZ && a[1] > worldZ))
          hits.push(a[0] + ((worldZ - a[1]) * (c[0] - a[0])) / (c[1] - a[1]));
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const left = Math.max(0, Math.ceil((hits[i] - origin[0]) / step - 0.5)),
          right = Math.min(width - 1, Math.floor((hits[i + 1] - origin[0]) / step - 0.5));
        if (right >= left) mask.fill(value, z * width + left, z * width + right + 1);
      }
    }
  };
  for (const polygon of surfaces) fill(polygon, 1);
  for (const polygon of blockers) fill(polygon, 0);
  // Keep a complete one-cell collar inside actual floor. The grid is stricter
  // than the final .035-unit vector clearance; it never certifies a subcell gap.
  for (let z = 1; z < height - 1; z++)
    for (let x = 1; x < width - 1; x++) {
      const i = z * width + x;
      if (
        mask[i] &&
        mask[i - 1] &&
        mask[i + 1] &&
        mask[i - width] &&
        mask[i + width] &&
        mask[i - width - 1] &&
        mask[i - width + 1] &&
        mask[i + width - 1] &&
        mask[i + width + 1]
      )
        safe[i] = 1;
    }
  const point = (i: number) => at(i % width, Math.floor(i / width));
  const nearby = (p: Point) => {
    const x = Math.floor((p[0] - origin[0]) / step),
      z = Math.floor((p[1] - origin[1]) / step),
      result: number[] = [];
    for (let dz = -4; dz <= 4; dz++)
      for (let dx = -4; dx <= 4; dx++) {
        const col = x + dx,
          row = z + dz;
        if (col < 0 || col >= width || row < 0 || row >= height) continue;
        const i = row * width + col;
        if (safe[i]) result.push(i);
      }
    return result
      .sort(
        (a, b) =>
          Math.hypot(point(a)[0] - p[0], point(a)[1] - p[1]) -
          Math.hypot(point(b)[0] - p[0], point(b)[1] - p[1]),
      )
      .slice(0, 12)
      .filter((i) => supported([p, point(i)]));
  };
  const queue = new Int32Array(count),
    parent = new Int32Array(count).fill(-2);
  let componentCount = 0;
  for (let i = 0; i < count; i++) {
    if (!safe[i] || components[i] >= 0) continue;
    let begin = 0,
      end = 1;
    queue[0] = i;
    components[i] = componentCount;
    while (begin < end) {
      const current = queue[begin++];
      for (const next of [current - 1, current + 1, current - width, current + width])
        if (next >= 0 && next < count && safe[next] && components[next] < 0) {
          components[next] = componentCount;
          queue[end++] = next;
        }
    }
    componentCount++;
  }
  const starts = nearby(root);
  let begin = 0,
    end = 0;
  for (const i of starts) {
    parent[i] = -1;
    queue[end++] = i;
  }
  while (begin < end) {
    const current = queue[begin++];
    for (const next of [current - 1, current + 1, current - width, current + width])
      if (next >= 0 && next < count && safe[next] && parent[next] === -2) {
        parent[next] = current;
        queue[end++] = next;
      }
  }
  const trace = (target: Point): Point[] | null => {
    if (supported([root, target])) return [root, target];
    for (const targetCell of nearby(target)) {
      if (parent[targetCell] === -2) continue;
      const path: Point[] = [target];
      let i = targetCell;
      while (i >= 0) {
        path.push(point(i));
        i = parent[i];
      }
      path.push(root);
      path.reverse();
      const simple: Point[] = [];
      for (const p of path) {
        while (simple.length >= 2) {
          const a = simple[simple.length - 2],
            b = simple[simple.length - 1];
          if (Math.abs((b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0])) > 1e-9) break;
          simple.pop();
        }
        simple.push(p);
      }
      if (supported(simple)) return simple;
    }
    return null;
  };
  return {
    trace,
    componentCount,
    step,
    width,
    height,
    surfaceCells: mask.reduce((n, x) => n + x, 0),
    safeCells: safe.reduce((n, x) => n + x, 0),
    rootCells: starts.length,
    componentAt: (p: Point) => nearby(p).map((i) => components[i]),
  };
}
