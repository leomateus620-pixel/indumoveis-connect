import * as THREE from "three";
import { ENTITIES, type Point } from "./data/territory";
import { DAYLIGHT } from "./daylight";
import { signedPolygonArea } from "./geometry";
import { subtractPolygons } from "./parkGeometry";
import { PERMANENT_PARK_LANDMARKS } from "./permanentParkLayout";
import type { SurfaceQuality } from "./surfaceMaterials";
import { SUN_SHADOW, sweepShadowFootprint, unionShadowFootprints } from "./sunShadows";

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

export function projectParkContextShadow(
  source: ParkContextShadowSource,
  direction: readonly [number, number, number] = DAYLIGHT.sunDirection,
): Point[][] {
  return sweepShadowFootprint(source.polygon, source.height, direction);
}

export function deriveParkContextShadowCells(
  sources: readonly ParkContextShadowSource[] = PARK_CONTEXT_SHADOW_SOURCES,
  protectedLots: readonly (readonly Point[])[] = ENTITIES.filter((e) => e.kind === "lot").map(
    (e) => e.polygon,
  ),
  direction: readonly [number, number, number] = DAYLIGHT.sunDirection,
): Point[][] {
  const projected = unionShadowFootprints(
    sources.map((source) => projectParkContextShadow(source, direction)),
  );
  const blockers = protectedLots.flatMap(triangulate);
  return subtractPolygons(projected, blockers).filter(
    (polygon) => Math.abs(signedPolygonArea(polygon)) > 1e-8,
  );
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
