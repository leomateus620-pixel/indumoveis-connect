import * as THREE from "three";
import { describe, it, expect, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { getArchitectureDefinition } from "./architecture";
import { createSolarShadows } from "./solarShadows";
import { DAYLIGHT } from "./daylight";
describe("cached directional architectural shadows", () => {
  it("fits a deferred, transformed canopy and its projected shadow once", () => {
    const light = new THREE.DirectionalLight();
    const model = createSolarShadows(light, ENTITIES);
    const geometry = new THREE.BoxGeometry(4, 8, 3);
    const material = new THREE.MeshLambertMaterial();
    const crown = new THREE.InstancedMesh(geometry, material, 1);
    crown.castShadow = true;
    crown.setMatrixAt(0, new THREE.Matrix4().makeTranslation(42, 4, -58));
    const group = new THREE.Group();
    group.position.set(180, 0, 0);
    group.add(crown);
    model.setQuality("detailed");
    light.shadow.needsUpdate = false;
    model.includeCasters(group);
    expect(light.shadow.needsUpdate).toBe(true);
    const sun = new THREE.Vector3(...DAYLIGHT.sunDirection);
    for (const x of [220, 224])
      for (const z of [-59.5, -56.5]) {
        const top = new THREE.Vector3(x, 8, z);
        const shadow = top.clone().addScaledVector(sun, (-0.18 - top.y) / sun.y);
        for (const point of [top, shadow])
          expect(
            point
              .project(light.shadow.camera)
              .toArray()
              .every((v) => Math.abs(v) < 1),
          ).toBe(true);
      }
    light.shadow.needsUpdate = false;
    model.includeCasters(group);
    expect(light.shadow.needsUpdate).toBe(false);
    model.dispose();
    crown.dispose();
    geometry.dispose();
    material.dispose();
  });

  it("fits only source volumes, preserves solar direction and updates on explicit invalidation", () => {
    const light = new THREE.DirectionalLight(),
      model = createSolarShadows(light, ENTITIES);
    const direction = light.position.clone().sub(light.target.position).normalize();
    expect(direction.toArray()).toEqual(
      expect.arrayContaining(DAYLIGHT.sunDirection.map((v) => expect.closeTo(v, 8))),
    );
    const camera = light.shadow.camera;
    const casters = ENTITIES.filter(getArchitectureDefinition);
    for (const e of casters)
      for (const [x, z] of e.polygon)
        for (const y of [-0.18, getArchitectureDefinition(e)!.height]) {
          const point = new THREE.Vector3(x, y, z);
          const receiver = point.clone().addScaledVector(direction, (-0.18 - y) / direction.y);
          for (const p of [point.project(camera), receiver.project(camera)]) {
            expect(Math.abs(p.x)).toBeLessThan(1);
            expect(Math.abs(p.y)).toBeLessThan(1);
            expect(Math.abs(p.z)).toBeLessThan(1);
          }
        }
    expect(
      ENTITIES.some(
        (entity) =>
          !getArchitectureDefinition(entity) &&
          entity.polygon.some(([x, z]) => {
            const p = new THREE.Vector3(x, 0, z).project(camera);
            return Math.abs(p.x) > 1 || Math.abs(p.y) > 1;
          }),
      ),
    ).toBe(true);
    expect(light.shadow.mapSize.toArray()).toEqual([1024, 1024]);
    model.setQuality("balanced");
    expect(light.castShadow).toBe(false);
    model.setQuality("detailed");
    expect(light.castShadow).toBe(true);
    expect(light.shadow.autoUpdate).toBe(false);
    light.shadow.needsUpdate = false;
    camera.position.addScalar(1);
    expect(light.shadow.needsUpdate).toBe(false);
    model.invalidate();
    expect(light.shadow.needsUpdate).toBe(true);
    const dispose = vi.spyOn(light.shadow, "dispose");
    model.dispose();
    model.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
