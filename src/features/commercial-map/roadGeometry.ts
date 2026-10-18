import type { Point } from "./data/territory";

const EPSILON = 1e-8;
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const add = (p: Point, n: Point, scale: number): Point => [
  p[0] + n[0] * scale,
  p[1] + n[1] * scale,
];
const normal = (a: Point, b: Point): Point => {
  const length = distance(a, b);
  return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
};

function cleanPath(path: readonly Point[]): Point[] {
  return path.reduce<Point[]>((points, p) => {
    if (
      p.every(Number.isFinite) &&
      (!points.length || distance(p, points[points.length - 1]) > EPSILON)
    )
      points.push([p[0], p[1]]);
    return points;
  }, []);
}

/** A joined offset, with bounded bevels instead of arbitrarily long acute miters. */
function offsetPath(path: Point[], offset: number, miterLimit: number): Point[] {
  const normals = path.slice(1).map((p, i) => normal(path[i], p));
  const result = [add(path[0], normals[0], offset)];
  for (let i = 1; i < path.length - 1; i++) {
    const a = normals[i - 1],
      b = normals[i];
    const sx = a[0] + b[0],
      sy = a[1] + b[1],
      denominator = sx * b[0] + sy * b[1];
    const scale = Math.abs(denominator) > EPSILON ? offset / denominator : Infinity;
    if (
      !Number.isFinite(scale) ||
      Math.hypot(sx * scale, sy * scale) > Math.abs(offset) * miterLimit
    ) {
      result.push(add(path[i], a, offset), add(path[i], b, offset));
    } else result.push([path[i][0] + sx * scale, path[i][1] + sy * scale]);
  }
  result.push(add(path[path.length - 1], normals[normals.length - 1], offset));
  return result;
}

/** Static drawing-unit ribbon. One polygon joins every bend; no overlapping butt strips. */
export function deriveRoadRibbon(
  input: readonly Point[],
  width: number,
  options: { miterLimit?: number } = {},
): Point[] {
  const path = cleanPath(input);
  if (path.length < 2 || !Number.isFinite(width) || width <= EPSILON) return [];
  const limit = Math.max(1, Number.isFinite(options.miterLimit) ? options.miterLimit! : 2.25);
  return [...offsetPath(path, width / 2, limit), ...offsetPath(path, -width / 2, limit).reverse()];
}

export interface RoadLaneOptions {
  dashLength?: number;
  dashGap?: number;
  lineWidth?: number;
  edgeInset?: number;
  arrowSpacing?: number;
  arrowLength?: number;
  /** Phase in drawing units, fixed to the authored path rather than the camera. */
  startOffset?: number;
  edges?: boolean;
}

export type RoadLaneMarkings = {
  centerDashes: Point[][];
  edgeWhite: Point[][];
  directionArrows: Point[][];
  /** Both directions occupy one half of the same full carriageway width. */
  laneWidth: number;
};

/** Equal two-way lanes, continuous arclength dash phase, and right-hand arrows.
 * These are schematic presentation markings, not a regulatory traffic plan. */
export function markRoadLanes(
  input: readonly Point[],
  width: number,
  options: RoadLaneOptions = {},
): RoadLaneMarkings {
  const path = cleanPath(input),
    empty = {
      centerDashes: [],
      edgeWhite: [],
      directionArrows: [],
      laneWidth: Number.isFinite(width) ? Math.max(0, width / 2) : 0,
    };
  if (path.length < 2 || !Number.isFinite(width) || width <= EPSILON) return empty;
  const lengths = [0];
  for (let i = 1; i < path.length; i++)
    lengths.push(lengths[i - 1] + distance(path[i - 1], path[i]));
  const total = lengths[lengths.length - 1];
  const at = (s: number) => {
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < s) i++;
    const a = path[i - 1],
      b = path[i],
      segment = lengths[i] - lengths[i - 1],
      t = (s - lengths[i - 1]) / segment;
    return {
      point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Point,
      tangent: [(b[0] - a[0]) / segment, (b[1] - a[1]) / segment] as Point,
    };
  };
  const slice = (start: number, end: number): Point[] => [
    at(start).point,
    ...path.filter((_, i) => lengths[i] > start + EPSILON && lengths[i] < end - EPSILON),
    at(end).point,
  ];
  const lineWidth = Math.min(width * 0.08, Math.max(0.025, options.lineWidth ?? width * 0.018));
  const dash = Math.max(lineWidth * 2, options.dashLength ?? width * 0.52),
    gap = Math.max(lineWidth, options.dashGap ?? width * 0.46);
  const period = dash + gap,
    phase = (((options.startOffset ?? 0) % period) + period) % period;
  const centerDashes: Point[][] = [];
  for (let s = -phase; s < total; s += period) {
    const start = Math.max(0, s),
      end = Math.min(total, s + dash);
    if (end - start > lineWidth) centerDashes.push(deriveRoadRibbon(slice(start, end), lineWidth));
  }
  const edgeOffset = Math.max(
    0,
    width / 2 - Math.max(lineWidth, options.edgeInset ?? width * 0.065),
  );
  const edgeWhite =
    options.edges === false
      ? []
      : [-edgeOffset, edgeOffset].map((offset) =>
          deriveRoadRibbon(offsetPath(path, offset, 2.25), lineWidth),
        );
  const arrowLength = Math.min(
    width * 0.85,
    Math.max(lineWidth * 5, options.arrowLength ?? width * 0.72),
  );
  const spacing = Math.max(arrowLength * 3, options.arrowSpacing ?? width * 5.5);
  const directionArrows: Point[][] = [];
  for (let s = spacing / 2; s < total - arrowLength; s += spacing) {
    const sample = at(s),
      n: Point = [-sample.tangent[1], sample.tangent[0]];
    for (const direction of [1, -1]) {
      // In the map's world [x, y-up, sheet-z], forward × up is +n.
      const center = add(sample.point, n, (direction * width) / 4),
        forward: Point = [sample.tangent[0] * direction, sample.tangent[1] * direction];
      const side: Point = [-forward[1], forward[0]],
        half = arrowLength / 2,
        shaft = width * 0.038,
        head = width * 0.13;
      const vertex = (along: number, across: number) =>
        add(add(center, forward, along), side, across);
      directionArrows.push([
        vertex(-half, -shaft),
        vertex(half * 0.22, -shaft),
        vertex(half * 0.22, -head),
        vertex(half, 0),
        vertex(half * 0.22, head),
        vertex(half * 0.22, shaft),
        vertex(-half, shaft),
      ]);
    }
  }
  return { centerDashes, edgeWhite, directionArrows, laneWidth: width / 2 };
}
