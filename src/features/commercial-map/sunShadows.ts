import * as THREE from "three";
import { architectureVisualHeight, getArchitectureDefinition } from "./architecture";
import { DAYLIGHT } from "./daylight";
import type { MapEntity, Point } from "./data/territory";
import { pavementUnionCells } from "./pavement";

/** Static schematic ground projections, not a surveyed solar simulation or
 * roof self-shadow. One shared batch costs no shadow map or extra render pass. */
export const SUN_SHADOW = {
  elevation: 0.085,
  opacity: 0.12,
  color: "#2e4050",
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

export function createSunShadows(entities: readonly MapEntity[]) {
  const sources = entities.flatMap((entity) => {
    const polygon = projectSunShadow(entity);
    return polygon ? [{ id: entity.id, polygon }] : [];
  });
  // Nonoverlapping source-derived cells prevent a darker stripe where two
  // pavilions cast onto the same floor. This runs once, never during gestures.
  const cells = pavementUnionCells(sources.map(({ polygon }) => polygon));
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
        const points = indices.map((index) => polygon[index]);
        const normalY =
          (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]) -
          (points[1][0] - points[0][0]) * (points[2][1] - points[0][1]);
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
      sourceIds: sources.map(({ id }) => id),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
