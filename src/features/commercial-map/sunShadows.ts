import * as THREE from "three";
import { architectureVisualHeight, getArchitectureDefinition } from "./architecture";
import { DAYLIGHT } from "./daylight";
import type { MapEntity, Point } from "./data/territory";
import { polygonBounds, signedPolygonArea } from "./geometry";
import { pavementUnionCells } from "./pavement";
import { PARK_SHADOWS } from "./visualTheme";

/** Static schematic ground projections, not a surveyed solar simulation or
 * roof self-shadow. One shared batch costs no shadow map or extra render pass. */
export const SUN_SHADOW = {
  elevation: 0.085,
  opacity: PARK_SHADOWS.opacity,
  color: PARK_SHADOWS.color,
} as const;

function convexHull(points: Point[]): Point[] {
  const sorted = [...points]
    .sort(([ax, ay], [bx, by]) => ax - bx || ay - by)
    .filter(
      (point, index, all) =>
        !index || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1],
    );
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (ordered: Point[]) => {
    const result: Point[] = [];
    for (const point of ordered) {
      while (
        result.length > 1 &&
        cross(result[result.length - 2], result[result.length - 1], point) <= 1e-10
      )
        result.pop();
      result.push(point);
    }
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

/** Sweep only existing built footprints opposite the same fixed world sun
 * used by visible sky and lighting; unbuilt lots never acquire a shadow. */
export function projectSunShadow(
  entity: MapEntity,
  direction: readonly [number, number, number] = DAYLIGHT.sunDirection,
): Point[] | null {
  if (!getArchitectureDefinition(entity)) return null;
  if (!direction.every(Number.isFinite) || direction[1] <= 0)
    throw new Error("sun-shadow-invalid-direction");
  const height = architectureVisualHeight(entity);
  const dx = (-direction[0] * height) / direction[1],
    dz = (-direction[2] * height) / direction[1];
  return convexHull([
    ...entity.polygon.map(([x, z]): Point => [x, z]),
    ...entity.polygon.map(([x, z]): Point => [x + dx, z + dz]),
  ]);
}

/** The sweep consists of the original footprint plus the strips swept by
 * its outward-facing sides. Keeping those strips separate preserves actual
 * setbacks and concave yards when the projected polygons are unioned. */
export function sweepShadowFootprint(
  polygon: readonly Point[],
  height: number,
  direction: readonly [number, number, number],
): Point[][] {
  if (
    !direction.every(Number.isFinite) ||
    direction[1] <= 0 ||
    !Number.isFinite(height) ||
    height < 0
  )
    throw new Error("sun-shadow-invalid-projection");
  const dx = (-direction[0] * height) / direction[1],
    dz = (-direction[2] * height) / direction[1];
  const sign = Math.sign(signedPolygonArea(polygon));
  const strips = polygon.flatMap((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (sign * ((b[1] - a[1]) * dx - (b[0] - a[0]) * dz) <= 1e-8) return [];
    return [[a, b, [b[0] + dx, b[1] + dz] as Point, [a[0] + dx, a[1] + dz] as Point]];
  });
  return [[...polygon], ...strips];
}

/** Isolated casters need no shared slab decomposition. AABB components keep
 * detailed permanent park footprints off the core's initial critical path. */
export function unionShadowFootprints(sources: readonly Point[][][]): Point[][] {
  const bounds = sources.map((polygons) => polygonBounds(polygons.flat()));
  const parent = bounds.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  bounds.forEach((a, i) => {
    for (let j = i + 1; j < bounds.length; j++) {
      const b = bounds[j];
      if (a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY)
        parent[find(j)] = find(i);
    }
  });
  const groups = new Map<number, Point[][]>();
  sources.forEach((polygons, i) => {
    const key = find(i);
    const group = groups.get(key) ?? [];
    group.push(...polygons);
    groups.set(key, group);
  });
  return [...groups.values()].flatMap(pavementUnionCells);
}

const projectionCache = new WeakMap<
  readonly MapEntity[],
  { cells: Point[][]; sourceIds: string[] }
>();

export function createSunShadows(entities: readonly MapEntity[]) {
  // Nonoverlapping source-derived cells prevent a darker stripe where two
  // pavilions cast onto the same floor. Immutable cells can survive reopens.
  let projection = projectionCache.get(entities);
  if (!projection) {
    const sources = entities.flatMap((entity) => {
      const definition = getArchitectureDefinition(entity);
      return definition
        ? [
            {
              id: entity.id,
              polygons: sweepShadowFootprint(
                entity.polygon,
                definition.height,
                DAYLIGHT.sunDirection,
              ),
            },
          ]
        : [];
    });
    projection = {
      cells: unionShadowFootprints(sources.map(({ polygons }) => polygons)),
      sourceIds: sources.map(({ id }) => id),
    };
    projectionCache.set(entities, projection);
  }
  const { cells, sourceIds } = projection;
  const geometry = new THREE.BufferGeometry();
  let material: THREE.MeshBasicMaterial | undefined;
  let mesh: THREE.Mesh | undefined;
  const group = new THREE.Group();
  group.name = "indumoveis-fixed-sun-shadows";
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    material?.dispose();
    mesh?.removeFromParent();
    group.clear();
  };
  try {
    const positions: number[] = [];
    for (const polygon of cells) {
      const triangles = THREE.ShapeUtils.triangulateShape(
        polygon.map(([x, z]) => new THREE.Vector2(x, z)),
        [],
      );
      for (const indices of triangles) {
        const points = indices.map((index) => polygon[index].map(Math.fround));
        const normalY =
          (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]) -
          (points[1][0] - points[0][0]) * (points[2][1] - points[0][1]);
        if (Math.abs(normalY) <= 1e-10) continue;
        if (normalY < 0) [points[1], points[2]] = [points[2], points[1]];
        for (const [x, z] of points) positions.push(x, SUN_SHADOW.elevation, z);
      }
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    material = new THREE.MeshBasicMaterial({
      name: "indumoveis-fixed-sun-ground-contact",
      color: SUN_SHADOW.color,
      transparent: true,
      opacity: SUN_SHADOW.opacity,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    mesh = new THREE.Mesh(geometry, material);
    mesh.name = "fixed-directional-ground-shadow";
    mesh.renderOrder = 1;
    mesh.raycast = () => {};
    mesh.userData.commercialPickable = false;
    mesh.castShadow = mesh.receiveShadow = false;
    group.add(mesh);
    return {
      group,
      mesh,
      geometry,
      material,
      cells,
      sourceIds,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
