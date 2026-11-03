import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createPhotoBuilder } from "./photoArchitectureKit";
import { buildPhotoFrameFacade } from "./photoFrameFacades";
import { PARK_CORE_ENTITIES } from "./permanentParkLayout";

function build(pavilion: 1 | 14) {
  const entity = PARK_CORE_ENTITIES.find(
    (candidate) => candidate.id === `indumoveis:pavilion:${pavilion}`,
  )!;
  const snapshot = JSON.stringify(entity);
  const result = createPhotoBuilder(entity, pavilion === 1 ? 3.8 : 2.5, pavilion === 1 ? 0.1 : 0.6);
  buildPhotoFrameFacade(result.builder, pavilion);
  expect(JSON.stringify(entity)).toBe(snapshot);
  return result;
}

describe("photo-referenced frame and metal halls", () => {
  it("keeps P1's exposed structure and upper panel silhouette with finite geometry", () => {
    const model = build(1);
    expect(model.main.has("architecturalFrame")).toBe(true);
    expect(model.main.has("paintedWall")).toBe(true);
    expect(model.max[1]).toBeGreaterThan(model.builder.h);
    for (const bucket of [...model.main.values(), ...model.fine.values()]) {
      expect(bucket.positions.every(Number.isFinite)).toBe(true);
      expect(bucket.positions.length % 9).toBe(0);
    }
  });

  it("retains P14's metal envelope when sub-pixel ribs are omitted", () => {
    const model = build(14);
    const coarse = model.main.get("paintedSheet")!;
    const fine = model.fine.get("paintedSheet")!;
    expect(coarse.positions.length).toBeGreaterThan(1000);
    expect(fine.positions.length).toBeGreaterThan(1000);
    // The coarse mesh contains both low and high metal, not just roof trim.
    const heights = coarse.positions.filter((_, index) => index % 3 === 1);
    expect(Math.min(...heights)).toBeLessThan(model.builder.h * 0.1);
    expect(Math.max(...heights)).toBeGreaterThan(model.builder.h);
  });

  it("puts the P14 gate behind its metal facade instead of painting it on a flat wall", () => {
    const model = build(14);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(model.main.get("paintedSheet")!.positions, 3),
    );
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const { w, h } = model.builder;
    const origin = new THREE.Vector3(...model.world([w * 0.3925, h * 0.2, -1]));
    const direction = new THREE.Vector3(...model.world([w * 0.3925, h * 0.2, 0]))
      .sub(origin)
      .normalize();
    const hits = new THREE.Raycaster(origin, direction).intersectObject(mesh);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].distance).toBeGreaterThan(1.08);
    expect(hits[0].distance).toBeLessThan(1.3);
    geometry.dispose();
    material.dispose();
  });
});
