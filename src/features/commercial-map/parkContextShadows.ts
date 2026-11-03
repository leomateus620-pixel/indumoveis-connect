import * as THREE from "three";
import { ENTITIES, type Point } from "./data/territory";
import { DAYLIGHT } from "./daylight";
import { polygonBounds, signedPolygonArea } from "./geometry";
import { subtractPolygons } from "./parkGeometry";
import { pavementUnionCells } from "./pavement";
import { PERMANENT_PARK_LANDMARKS } from "./permanentParkLayout";
import type { SurfaceQuality } from "./surfaceMaterials";
import { SUN_SHADOW } from "./sunShadows";

export type ParkContextShadowSource = {
  id: string;
  polygon: readonly Point[];
  /** Drawing-unit presentation height, never a surveyed elevation. */
  height: number;
};

export const PARK_CONTEXT_SHADOW_SOURCES: readonly ParkContextShadowSource[] =
  PERMANENT_PARK_LANDMARKS.map((landmark) => ({
    id: landmark.id,
    polygon: landmark.polygon,
    height:
      landmark.id === "arena"
        ? 6.7
        : landmark.id === "sede"
          ? 4.4
          : landmark.id === "palco-lactalis"
            ? 3.3
            : landmark.id.startsWith("pavilh")
              ? 3
              : landmark.id.startsWith("etnia")
                ? 3.6
                : landmark.id === "mirante"
                  ? 3.9
                  : landmark.id === "alameda"
                    ? 2.9
                    : 3.4,
  }));

const triangulate = (polygon: readonly Point[]): Point[][] =>
  THREE.ShapeUtils.triangulateShape(
    polygon.map((p) => new THREE.Vector2(...p)),
    [],
  ).map((indices) => indices.map((index) => polygon[index]));

function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points]
    .sort(([ax, az], [bx, bz]) => ax - bx || az - bz)
    .filter((p, i, all) => !i || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]);
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (ordered: readonly Point[]) => {
    const chain: Point[] = [];
    for (const point of ordered) {
      while (
        chain.length > 1 &&
        cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 1e-10
      )
        chain.pop();
      chain.push(point);
    }
    return chain;
  };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

/** Project each real footprint triangle before union. A convex hull of the
 * entire building would fill a re-entrant yard even with a vertical sun. */
export function projectParkContextShadow(
  source: ParkContextShadowSource,
  direction: readonly [number, number, number] = DAYLIGHT.sunDirection,
): Point[][] {
  if (
    !direction.every(Number.isFinite) ||
    direction[1] <= 0 ||
    !Number.isFinite(source.height) ||
    source.height < 0
  )
    throw new Error("park-context-shadow-invalid-projection");
  const dx = (-direction[0] * source.height) / direction[1];
  const dz = (-direction[2] * source.height) / direction[1];
  return triangulate(source.polygon).map((triangle) =>
    convexHull([...triangle, ...triangle.map(([x, z]): Point => [x + dx, z + dz])]),
  );
}

/** Group only potentially intersecting footprints before the exact union.
 * Isolated sectors do not incur a park-wide slab decomposition. Bounds are
 * broad-phase work grouping only, never proof of a shadow intersection. */
export function deriveParkContextShadowCells(
  sources: readonly ParkContextShadowSource[] = PARK_CONTEXT_SHADOW_SOURCES,
  protectedLots: readonly (readonly Point[])[] = ENTITIES.filter((e) => e.kind === "lot").map(
    (e) => e.polygon,
  ),
  direction: readonly [number, number, number] = DAYLIGHT.sunDirection,
): Point[][] {
  const projected = sources.map((source) => {
    const polygons = projectParkContextShadow(source, direction);
    return { polygons, bounds: polygonBounds(polygons.flat()) };
  });
  const parent = projected.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  projected.forEach((item, i) => {
    for (let j = i + 1; j < projected.length; j++) {
      const a = item.bounds,
        b = projected[j].bounds;
      if (a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY)
        parent[find(j)] = find(i);
    }
  });
  const groups = new Map<number, Point[][]>();
  projected.forEach((item, i) => {
    const key = find(i),
      group = groups.get(key) ?? [];
    group.push(...item.polygons);
    groups.set(key, group);
  });
  const blockers = protectedLots.flatMap(triangulate);
  return [...groups.values()]
    .flatMap((polygons) => subtractPolygons(pavementUnionCells(polygons), blockers))
    .filter((polygon) => Math.abs(signedPolygonArea(polygon)) > 1e-8);
}

// Only immutable drawing cells are shared across reopens. Every GPU buffer and
// material below has exactly one renderer owner and independent disposal.
let cachedCells: Point[][] | undefined;

export function createParkContextShadows() {
  const started = performance.now();
  const cells = cachedCells ?? (cachedCells = deriveParkContextShadowCells());
  const preparationMs = performance.now() - started;
  const geometry = new THREE.BufferGeometry();
  let material: THREE.MeshBasicMaterial | undefined;
  const group = new THREE.Group();
  group.name = "indumoveis-permanent-park-ground-shadows";
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    material?.dispose();
    group.clear();
  };
  try {
    const positions: number[] = [];
    for (const polygon of cells)
      for (const source of triangulate(polygon)) {
        // Source-union slabs can be thinner than one Float32 world ULP.
        // Discard only zero-area GPU triangles after the actual quantization,
        // instead of uploading vertices that produce zero normals or cracks.
        const triangle = source.map(([x, z]): Point => [Math.fround(x), Math.fround(z)]);
        const [a, b, c] = triangle;
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (Math.abs(area) <= 1e-10) continue;
        if (area > 0) triangle.reverse();
        for (const [x, z] of triangle) positions.push(x, SUN_SHADOW.elevation, z);
      }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    material = new THREE.MeshBasicMaterial({
      name: "indumoveis-permanent-park-static-contact",
      color: SUN_SHADOW.color,
      opacity: SUN_SHADOW.opacity,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "permanent-park-ground-contact";
    mesh.raycast = () => {};
    mesh.userData.commercialPickable = false;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.renderOrder = 1;
    group.add(mesh);
    return {
      group,
      mesh,
      geometry,
      material,
      cells,
      metadata: {
        sourceIds: PARK_CONTEXT_SHADOW_SOURCES.map((source) => source.id),
        estimatedHeights: true,
        preparationMs,
        drawBatches: 1,
        textures: 0,
        triangles: positions.length / 9,
        sunDirection: DAYLIGHT.sunDirection,
        protectedLotsClipped: true,
      },
      // Context lies outside the detailed shadow camera fitted to the core.
      // Its contact stays present at all quality tiers without another map.
      setQuality(_quality: SurfaceQuality) {},
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
