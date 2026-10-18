import type { Point } from "./data/territory";
import { polygonBounds, type Bounds } from "./geometry";
import { pavementUnionCells } from "./pavement";

/** Local architectural boxes, not meshes or cadastral footprints. */
export type UrbanContactVolume = {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  base: number;
  height: number;
};
export type UrbanContactHouse = {
  center: readonly [number, number];
  heading: number;
  structuralVolumes: readonly UrbanContactVolume[];
};
export type UrbanContactOptions = {
  /** Direction from the world towards the sun; no camera coordinates. */
  sunDirection: readonly [number, number, number];
  groundElevation?: number;
  buildingBaseElevation?: number;
};
export type UrbanContactHouseProjection = {
  index: number;
  sourcePolygons: Point[][];
  /** Disjoint union cells; draw these rather than the overlapping hulls. */
  cells: Point[][];
  bounds: Bounds | null;
};
const EPSILON = 1e-8;
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function convexHull(points: Point[]): Point[] {
  const sorted = points.sort(([ax, az], [bx, bz]) => ax - bx || az - bz);
  const unique = sorted.filter(
    (p, i) => !i || Math.hypot(p[0] - sorted[i - 1][0], p[1] - sorted[i - 1][1]) > EPSILON,
  );
  const half = (input: Point[]) => {
    const out: Point[] = [];
    for (const point of input) {
      while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, point) <= EPSILON) out.pop();
      out.push(point);
    }
    return out;
  };
  return [...half(unique).slice(0, -1), ...half([...unique].reverse()).slice(0, -1)];
}
function projectionParameters(options: UrbanContactOptions) {
  const { sunDirection: sun, groundElevation = 0, buildingBaseElevation = 0 } = options;
  const length = Math.hypot(...sun);
  if (
    ![...sun, groundElevation, buildingBaseElevation].every(Number.isFinite) ||
    !length ||
    sun[1] / length <= 1e-4
  )
    throw new Error("urban-contact-invalid-sun-or-ground");
  return { dx: -sun[0] / sun[1], dz: -sun[2] / sun[1], groundElevation, buildingBaseElevation };
}

function projectVolume(
  house: Pick<UrbanContactHouse, "center" | "heading">,
  volume: UrbanContactVolume,
  params: ReturnType<typeof projectionParameters>,
): Point[] {
  if (
    ![
      ...house.center,
      house.heading,
      volume.x0,
      volume.x1,
      volume.z0,
      volume.z1,
      volume.base,
      volume.height,
    ].every(Number.isFinite) ||
    volume.x1 <= volume.x0 ||
    volume.z1 <= volume.z0 ||
    volume.height <= 0
  )
    throw new Error("urban-contact-invalid-volume");
  const bottom = params.buildingBaseElevation + volume.base - params.groundElevation;
  const top = bottom + volume.height;
  if (top <= 0) return [];
  const c = Math.cos(house.heading),
    s = Math.sin(house.heading);
  const points: Point[] = [];
  for (const x of [volume.x0, volume.x1])
    for (const z of [volume.z0, volume.z1])
      for (const height of [Math.max(0, bottom), top])
        points.push([
          house.center[0] + x * c - z * s + params.dx * height,
          house.center[1] + x * s + z * c + params.dz * height,
        ]);
  return convexHull(points);
}

/** Orthographic sunlight projects the eight corners of each solid box. The
 * convex hull is the exact ground silhouette of that box, including raised
 * upper storeys. Roof profiles are approximated by the supplied volume bounds. */
export function projectUrbanContactVolume(
  house: Pick<UrbanContactHouse, "center" | "heading">,
  volume: UrbanContactVolume,
  options: UrbanContactOptions,
): Point[] {
  return projectVolume(house, volume, projectionParameters(options));
}
const intersects = (a: Bounds, b: Bounds) =>
  a.minX <= b.maxX + EPSILON &&
  a.maxX >= b.minX - EPSILON &&
  a.minY <= b.maxY + EPSILON &&
  a.maxY >= b.minY - EPSILON;
const boundsOf = (cells: Point[][]): Bounds | null =>
  cells.length ? polygonBounds(cells.flat()) : null;

/** One-time CPU preparation. Spatial components keep unrelated homes out of
 * each other's union; both per-house and complete cells have no positive-area
 * overlap, preventing doubled alpha at wings, upper floors and neighbours.
 * The caller clips cells against protected source polygons and owns the single
 * static batch/material. This helper allocates no GPU resources or callbacks. */
export function deriveUrbanContact(
  input: readonly UrbanContactHouse[],
  options: UrbanContactOptions,
) {
  const params = projectionParameters(options);
  const houses: UrbanContactHouseProjection[] = input.map((house, index) => {
    const sourcePolygons = house.structuralVolumes
      .map((volume) => projectVolume(house, volume, params))
      .filter((polygon) => polygon.length >= 3);
    const cells = pavementUnionCells(sourcePolygons);
    return { index, sourcePolygons, cells, bounds: boundsOf(cells) };
  });
  const components: UrbanContactHouseProjection[][] = [];
  const seen = new Set<number>();
  for (const house of houses) {
    if (!house.bounds || seen.has(house.index)) continue;
    const component = [house];
    seen.add(house.index);
    for (let i = 0; i < component.length; i++)
      for (const other of houses)
        if (
          other.bounds &&
          !seen.has(other.index) &&
          intersects(component[i].bounds!, other.bounds)
        ) {
          component.push(other);
          seen.add(other.index);
        }
    components.push(component);
  }
  const cells = components.flatMap((component) =>
    component.length === 1
      ? component[0].cells
      : pavementUnionCells(component.flatMap((house) => house.sourcePolygons)),
  );
  return {
    houses,
    cells,
    bounds: boundsOf(cells),
    sourceVolumeCount: input.reduce((sum, house) => sum + house.structuralVolumes.length, 0),
    projectedVolumeCount: houses.reduce((sum, house) => sum + house.sourcePolygons.length, 0),
    componentCount: components.length,
  };
}
