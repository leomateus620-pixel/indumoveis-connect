import * as THREE from "three";
import { describe, it, expect, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { architectureVisualHeight } from "./architecture";
import { createSolarShadows } from "./solarShadows";
import { DAYLIGHT } from "./daylight";
describe("cached directional architectural shadows", () => {
  it("fits only source volumes, preserves solar direction and updates on explicit invalidation", () => {
    const light = new THREE.DirectionalLight(),
      model = createSolarShadows(light, ENTITIES);
    const direction = light.position.clone().sub(light.target.position).normalize();
    expect(direction.toArray()).toEqual(
      expect.arrayContaining(DAYLIGHT.sunDirection.map((v) => expect.closeTo(v, 8))),
    );
    const camera = light.shadow.camera;
    for (const e of ENTITIES)
      for (const [x, z] of e.polygon)
        for (const y of [0, architectureVisualHeight(e)]) {
          const p = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(p.x)).toBeLessThan(1);
          expect(Math.abs(p.y)).toBeLessThan(1);
          expect(Math.abs(p.z)).toBeLessThan(1);
        }
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
