import * as THREE from "three";
import type { MapEntity, Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { distanceToPolygon } from "./planting";
import type { SurfaceQuality } from "./surfaceMaterials";

/** Drawing units, not surveyed metres. Roots stay inside the original lots;
 * shared physical blades provide close detail above the authored green floor. */
export const LOT_GRASS = {
  elevation: 0.054,
  inset: 0.42,
  cellSize: 42,
  capacity: 7200,
  budgets: { light: 2200, balanced: 4400, detailed: 7200 },
  closeDistances: { light: 80, balanced: 110, detailed: 145 },
  // The largest authored scale is 1.27×1.2: tips stay below y=.20,
  // leaving the existing lot numbers at y=.23 and status borders readable.
  bladeHeight: 0.095,
  maximumTipDrift: 0.018,
} as const;

export type GrassRoot = { point: Point; entityId: string; seed: number };
const noise = (i: number, seed: number) => {
  const value = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

/** Seeded stratified rejection against the real polygon and its edges. No AABB
 * replacement can place blades in the clipped corner of lot 70 or on a road. */
export function deriveGrassRoots(
  entities: readonly MapEntity[],
  capacity = LOT_GRASS.capacity,
): GrassRoot[] {
  const lots = entities.filter((entity) => entity.kind === "lot");
  const total = lots.reduce(
    (area, entity) => area + Math.abs(signedPolygonArea(entity.polygon)),
    0,
  );
  const roots: GrassRoot[] = [];
  if (!total) return roots;
  lots.forEach((entity, lotIndex) => {
    const box = polygonBounds(entity.polygon),
      amount = Math.max(
        1,
        Math.floor((capacity * Math.abs(signedPolygonArea(entity.polygon))) / total),
      );
    let accepted = 0;
    for (let attempt = 0; attempt < amount * 8 && accepted < amount; attempt++) {
      const seed = lotIndex * 100003 + attempt;
      const point: Point = [
        THREE.MathUtils.lerp(box.minX, box.maxX, noise(seed, 19)),
        THREE.MathUtils.lerp(box.minY, box.maxY, noise(seed, 53)),
      ];
      if (
        !pointInPolygon(point, entity.polygon) ||
        distanceToPolygon(point, entity.polygon) < LOT_GRASS.inset
      )
        continue;
      roots.push({ point, entityId: entity.id, seed });
      accepted++;
    }
  });
  return roots.slice(0, capacity);
}

function tuftGeometry() {
  const positions: number[] = [],
    colors: number[] = [];
  for (let blade = 0; blade < 2; blade++) {
    const angle = blade * Math.PI * 0.5 + 0.24,
      bend = blade ? -0.021 : 0.026;
    const height = LOT_GRASS.bladeHeight * (blade ? 0.87 : 1);
    const vertices = [
      new THREE.Vector3(-0.014, 0, 0),
      new THREE.Vector3(0.014, 0, 0),
      new THREE.Vector3(-0.009, height * 0.55, bend * 0.25),
      new THREE.Vector3(0.009, height * 0.55, bend * 0.25),
      new THREE.Vector3(0.007, height, bend),
    ];
    vertices.forEach((vertex) => vertex.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle));
    for (const index of [0, 1, 2, 1, 3, 2, 2, 3, 4]) {
      const vertex = vertices[index];
      positions.push(...vertex.toArray());
      const color = new THREE.Color("#476537").lerp(
        new THREE.Color("#a0b86e"),
        (vertex.y / height) * 0.7,
      );
      colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One static instanced batch per spatial cell, no per-blade objects or RAF.
 * Overview uses the green source lot floor; only close cells draw 3D blades. */
export function createLotGrass(
  entities: readonly MapEntity[],
  options: { quality?: SurfaceQuality; maps?: boolean } = {},
) {
  const group = new THREE.Group();
  group.name = "indumoveis-lot-grass";
  const roots = deriveGrassRoots(entities);
  const geometry = tuftGeometry();
  let material: THREE.MeshLambertMaterial;
  try {
    material = new THREE.MeshLambertMaterial({
      color: "#ffffff",
      vertexColors: true,
      side: THREE.DoubleSide,
    });
  } catch (error) {
    geometry.dispose();
    throw error;
  }
  const cells: { mesh: THREE.InstancedMesh; center: Point; roots: GrassRoot[] }[] = [];
  const time = { value: 0 },
    wind = { value: 0 };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const { mesh } of cells) mesh.dispose();
    geometry.dispose();
    material.dispose();
    group.clear();
  };
  try {
    material.name = "indumoveis-matte-living-lot-grass";
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grassTime = time;
      shader.uniforms.grassWind = wind;
      shader.vertexShader =
        `uniform float grassTime; uniform float grassWind;\n${shader.vertexShader}`.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float grassTip = smoothstep(0.0, 0.095, position.y);
        float grassPhase = instanceMatrix[3].x * 0.65 + instanceMatrix[3].z * 0.43;
        transformed.x += sin(grassTime * 1.2 + grassPhase) * 0.018 * grassTip * grassWind;
        transformed.z += cos(grassTime * 0.9 + grassPhase * 0.7) * 0.012 * grassTip * grassWind;
      #endif`,
        );
    };
    material.customProgramCacheKey = () => "indumoveis-lot-grass-v1";
    const grouped = new Map<string, GrassRoot[]>();
    for (const root of roots) {
      const key = `${Math.floor(root.point[0] / LOT_GRASS.cellSize)}:${Math.floor(root.point[1] / LOT_GRASS.cellSize)}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(root);
    }
    const transform = new THREE.Matrix4(),
      rotation = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0);
    for (const [key, members] of grouped) {
      // Prefixes are deterministic even coverage, not a growing square patch.
      members.sort((a, b) => noise(a.seed, 91) - noise(b.seed, 91));
      const mesh = new THREE.InstancedMesh(geometry, material, members.length);
      const [cx, cz] = key.split(":").map(Number);
      cells.push({
        mesh,
        center: [(cx + 0.5) * LOT_GRASS.cellSize, (cz + 0.5) * LOT_GRASS.cellSize],
        roots: members,
      });
      mesh.name = `grass-cell-${key}`;
      mesh.raycast = () => {};
      mesh.userData.commercialPickable = false;
      members.forEach((root, slot) => {
        rotation.setFromAxisAngle(up, noise(root.seed, 71) * Math.PI * 2);
        const size = 0.72 + noise(root.seed, 38) * 0.55;
        transform.compose(
          new THREE.Vector3(root.point[0], LOT_GRASS.elevation, root.point[1]),
          rotation,
          new THREE.Vector3(size, size * (0.8 + noise(root.seed, 67) * 0.4), size),
        );
        mesh.setMatrixAt(slot, transform);
        mesh.setColorAt(
          slot,
          new THREE.Color("#ffffff").lerp(new THREE.Color("#b3b781"), noise(root.seed, 47) * 0.28),
        );
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.04;
      group.add(mesh);
    }
    let quality = options.quality ?? "balanced",
      lastDistance = 80,
      lastTarget: Point | undefined;
    const updateLod = (distance: number, target?: Point) => {
      lastDistance = distance;
      lastTarget = target;
      const fade =
        1 -
        THREE.MathUtils.smoothstep(
          distance,
          LOT_GRASS.closeDistances[quality] * 0.65,
          LOT_GRASS.closeDistances[quality],
        );
      let remaining = LOT_GRASS.budgets[quality];
      // Counts only change; source transforms/geometry stay immutable during
      // pan, resize, quality changes and wind. Native frustum culling is per cell.
      for (const cell of cells) {
        const local =
          !target ||
          Math.hypot(cell.center[0] - target[0], cell.center[1] - target[1]) <=
            Math.max(32, distance * 0.85 + 20);
        cell.mesh.count = local
          ? Math.min(
              remaining,
              Math.floor(
                ((cell.roots.length * LOT_GRASS.budgets[quality]) / LOT_GRASS.capacity) * fade,
              ),
            )
          : 0;
        cell.mesh.visible = cell.mesh.count > 0;
        remaining -= cell.mesh.count;
      }
    };
    updateLod(lastDistance);
    return {
      group,
      textureBytes: 0,
      metadata: {
        roots: roots.length,
        capacity: LOT_GRASS.capacity,
        cellCount: cells.length,
        maximumDraws: cells.length,
        trianglesPerTuft: geometry.getAttribute("position").count / 3,
        estimatedInstanceBytes: roots.length * (16 + 3) * 4,
        textureMaps: 0,
        inset: LOT_GRASS.inset,
        sourceIds: [...new Set(roots.map((root) => root.entityId))],
      },
      animate(seconds: number, enabled: boolean) {
        time.value = seconds;
        wind.value = enabled ? 1 : 0;
      },
      setQuality(tier: SurfaceQuality) {
        quality = tier;
        updateLod(lastDistance, lastTarget);
      },
      updateLod,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
