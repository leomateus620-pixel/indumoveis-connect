import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { architectureVisualHeight, getArchitectureDefinition } from "./architecture";
import { DAYLIGHT } from "./daylight";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { createSunShadows, projectSunShadow, SUN_SHADOW } from "./sunShadows";

describe("fixed economical world sun shadows", () => {
  it("projects actual built footprints opposite the visible sun with the source height", () => {
    const before = JSON.stringify(ENTITIES);
    const sunBefore = [...DAYLIGHT.sunDirection];
    for (const entity of ENTITIES) {
      const shadow = projectSunShadow(entity);
      if (!getArchitectureDefinition(entity)) {
        expect(shadow).toBeNull();
        continue;
      }
      const footprint = polygonBounds(entity.polygon),
        projected = polygonBounds(shadow!);
      const height = architectureVisualHeight(entity);
      const dx = (-DAYLIGHT.sunDirection[0] * height) / DAYLIGHT.sunDirection[1];
      const dz = (-DAYLIGHT.sunDirection[2] * height) / DAYLIGHT.sunDirection[1];
      expect(projected.minX).toBeCloseTo(footprint.minX + Math.min(0, dx));
      expect(projected.maxX).toBeCloseTo(footprint.maxX + Math.max(0, dx));
      expect(projected.minY).toBeCloseTo(footprint.minY + Math.min(0, dz));
      expect(projected.maxY).toBeCloseTo(footprint.maxY + Math.max(0, dz));
      expect(pointInPolygon(entity.anchor, shadow!)).toBe(true);
    }
    expect(JSON.stringify(ENTITIES)).toBe(before);
    expect(DAYLIGHT.sunDirection).toEqual(sunBefore);
  });

  it("unions overlaps into one batch without darkening the same floor twice", () => {
    const built = ENTITIES.find((entity) => getArchitectureDefinition(entity))!;
    const a = createSunShadows([built]);
    const duplicated = createSunShadows([built, { ...built, id: built.id }]);
    try {
      const area = (shadow: typeof a) =>
        shadow.cells.reduce((sum, polygon) => sum + Math.abs(signedPolygonArea(polygon)), 0);
      expect(area(duplicated)).toBeCloseTo(area(a));
      expect(duplicated.group.children).toHaveLength(1);
      expect(duplicated.geometry.getAttribute("position").count).toBe(
        a.geometry.getAttribute("position").count,
      );
      expect(duplicated.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(duplicated.material.depthWrite).toBe(false);
      expect(duplicated.material.toneMapped).toBe(false);
      expect(duplicated.material.opacity).toBeLessThan(0.17);
    } finally {
      a.dispose();
      duplicated.dispose();
    }
  });

  it("stays grounded and fixed during camera orbit, without picking or shadow maps", () => {
    const shadow = createSunShadows(ENTITIES);
    try {
      const positions = shadow.geometry.getAttribute("position"),
        normals = shadow.geometry.getAttribute("normal");
      const before = Array.from(positions.array);
      shadow.group.updateMatrixWorld(true);
      const transforms = shadow.group.matrixWorld.toArray();
      const camera = new THREE.PerspectiveCamera(38, 1.7, 0.1, 2000);
      for (let azimuth = 0; azimuth < Math.PI * 2; azimuth += Math.PI / 4) {
        camera.position.setFromSpherical(new THREE.Spherical(140, 1.1, azimuth));
        camera.lookAt(95, 0, 55);
        camera.updateMatrixWorld();
      }
      expect(Array.from(positions.array)).toEqual(before);
      expect(shadow.group.matrixWorld.toArray()).toEqual(transforms);
      for (let i = 0; i < positions.count; i++) {
        expect(positions.getY(i)).toBeCloseTo(SUN_SHADOW.elevation);
        expect(normals.getY(i)).toBeCloseTo(1);
      }
      const mesh = shadow.group.children[0] as THREE.Mesh;
      expect(mesh.castShadow || mesh.receiveShadow).toBe(false);
      expect(mesh.renderOrder).toBeLessThan(3);
      const triangleCenter = new THREE.Vector3();
      for (let i = 0; i < 3; i++)
        triangleCenter.add(new THREE.Vector3().fromBufferAttribute(positions, i));
      triangleCenter.multiplyScalar(1 / 3);
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(triangleCenter.x, 20, triangleCenter.z),
        new THREE.Vector3(0, -1, 0),
      );
      // The same ray really crosses this triangle when ordinary Mesh picking
      // is enabled, so the no-hit assertion exercises the explicit exclusion.
      const ordinaryMesh = new THREE.Mesh(shadow.geometry, shadow.material);
      ordinaryMesh.updateMatrixWorld();
      expect(raycaster.intersectObject(ordinaryMesh)).toHaveLength(1);
      expect(raycaster.intersectObject(shadow.group, true)).toHaveLength(0);
    } finally {
      shadow.dispose();
    }
  });

  it("releases its only geometry and material exactly once on reopen cleanup", () => {
    const shadow = createSunShadows(ENTITIES);
    const geometryDisposed = vi.fn(),
      materialDisposed = vi.fn();
    shadow.geometry.addEventListener("dispose", geometryDisposed);
    shadow.material.addEventListener("dispose", materialDisposed);
    shadow.dispose();
    shadow.dispose();
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(shadow.group.children).toHaveLength(0);
    const reopened = createSunShadows(ENTITIES);
    expect(reopened.group.children).toHaveLength(1);
    reopened.dispose();
  });
});
