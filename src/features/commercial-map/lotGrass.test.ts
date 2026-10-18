import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { pointInPolygon } from "./geometry";
import { distanceToPolygon } from "./planting";
import { createLotGrass, deriveGrassRoots, LOT_GRASS } from "./lotGrass";

const meshes = (grass: ReturnType<typeof createLotGrass>) =>
  grass.group.children as THREE.InstancedMesh[];
describe("source-clipped physical commercial lot grass", () => {
  it("retains the exact commercial source and keeps roots plus bent/windy tips inset from every real polygon", () => {
    const before = JSON.stringify(ENTITIES),
      roots = deriveGrassRoots(ENTITIES);
    const lots = ENTITIES.filter((entity) => entity.kind === "lot");
    expect(roots.length).toBeGreaterThan(6000);
    expect(roots.length).toBeLessThanOrEqual(LOT_GRASS.capacity);
    expect(new Set(roots.map((root) => root.entityId)).size).toBe(lots.length);
    expect(deriveGrassRoots(ENTITIES)).toEqual(roots);
    for (const root of roots) {
      const source = lots.find((lot) => lot.id === root.entityId)!;
      expect(pointInPolygon(root.point, source.polygon)).toBe(true);
      expect(distanceToPolygon(root.point, source.polygon)).toBeGreaterThanOrEqual(LOT_GRASS.inset);
      expect(
        ENTITIES.filter((entity) => entity.kind === "road").some((road) =>
          pointInPolygon(root.point, road.polygon),
        ),
      ).toBe(false);
    }
    const grass = createLotGrass(ENTITIES, { quality: "detailed" });
    try {
      const point = new THREE.Vector3(),
        matrix = new THREE.Matrix4();
      for (const mesh of meshes(grass)) {
        const positions = mesh.geometry.getAttribute("position");
        // Sample complete transformed tufts, not only their root centres.
        for (let instance = 0; instance < mesh.instanceMatrix.count; instance += 37) {
          mesh.getMatrixAt(instance, matrix);
          const root = new THREE.Vector3().setFromMatrixPosition(matrix);
          const source = lots.find((lot) => pointInPolygon([root.x, root.z], lot.polygon))!;
          for (let vertex = 0; vertex < positions.count; vertex++) {
            point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
            expect(point.y).toBeLessThan(0.2);
            for (const wind of [-LOT_GRASS.maximumTipDrift, LOT_GRASS.maximumTipDrift])
              expect(pointInPolygon([point.x + wind, point.z + wind], source.polygon)).toBe(true);
          }
        }
      }
      expect(JSON.stringify(ENTITIES)).toBe(before);
    } finally {
      grass.dispose();
    }
  });

  it("shares one 3D tuft geometry and material, budgets quality and hides far detail without rebuilding roots", () => {
    const grass = createLotGrass(ENTITIES);
    try {
      expect(new Set(meshes(grass).map((mesh) => mesh.geometry)).size).toBe(1);
      expect(new Set(meshes(grass).map((mesh) => mesh.material)).size).toBe(1);
      expect(
        meshes(grass).every((mesh) => mesh.frustumCulled && mesh.boundingSphere !== null),
      ).toBe(true);
      expect(grass.metadata.trianglesPerTuft).toBe(6);
      expect(grass.metadata.maximumDraws).toBeLessThanOrEqual(15);
      expect(grass.textureBytes).toBe(0);
      const before = meshes(grass).map((mesh) => Array.from(mesh.instanceMatrix.array));
      const counts: number[] = [];
      for (const tier of ["light", "balanced", "detailed"] as const) {
        grass.setQuality(tier);
        grass.updateLod(20);
        grass.animate(4.25, true);
        const count = meshes(grass).reduce((sum, mesh) => sum + mesh.count, 0);
        expect(count).toBeLessThanOrEqual(LOT_GRASS.budgets[tier]);
        counts.push(count);
      }
      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
      grass.updateLod(800);
      expect(meshes(grass).every((mesh) => !mesh.visible && mesh.count === 0)).toBe(true);
      expect(meshes(grass).map((mesh) => Array.from(mesh.instanceMatrix.array))).toEqual(before);
    } finally {
      grass.dispose();
    }
  });

  it("never intercepts picking and disposes shared geometry/material and instance buffers once", () => {
    const grass = createLotGrass(ENTITIES);
    grass.updateLod(20);
    const geometryDisposed = vi.fn(),
      materialDisposed = vi.fn(),
      instancesDisposed = vi.fn();
    const first = meshes(grass)[0],
      count = meshes(grass).length;
    first.geometry.addEventListener("dispose", geometryDisposed);
    (first.material as THREE.Material).addEventListener("dispose", materialDisposed);
    for (const mesh of meshes(grass)) mesh.addEventListener("dispose", instancesDisposed);
    const matrix = new THREE.Matrix4();
    first.getMatrixAt(0, matrix);
    const root = new THREE.Vector3().setFromMatrixPosition(matrix);
    grass.group.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(root.x, 4, root.z),
      new THREE.Vector3(0, -1, 0),
    );
    expect(raycaster.intersectObject(grass.group, true)).toHaveLength(0);
    grass.dispose();
    grass.dispose();
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(instancesDisposed).toHaveBeenCalledTimes(count);
    expect(grass.group.children).toHaveLength(0);
  });
});
