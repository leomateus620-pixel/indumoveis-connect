import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createPhotoBuilder } from "./photoArchitectureKit";
import { buildPhotoP3Facade } from "./photoP3Facade";
import { PARK_CORE_ENTITIES } from "./permanentParkLayout";
import { polygonsOverlap } from "./parkGeometry";
import type { Point } from "./data/territory";

function specimen() {
  const entity = PARK_CORE_ENTITIES.find((e) => e.id === "indumoveis:pavilion:3")!;
  const model = createPhotoBuilder(entity, 4, 0.64);
  buildPhotoP3Facade(model.builder);
  return { entity, ...model };
}
describe("P3 and its integrated Brigada module", () => {
  it("keeps the photographed glazing at the Administration end and the gates in the same facade", () => {
    const model = specimen();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(model.main.get("glass")!.positions, 3),
    );
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const at = model.world([model.builder.w * 0.15, 2, -1]);
    const ray = new THREE.Raycaster(new THREE.Vector3(...at), new THREE.Vector3(0, 0, 1));
    expect(at[0]).toBeGreaterThan(model.entity.anchor[0]);
    expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
    expect(model.main.has("paintedSheet")).toBe(true);
    expect(model.main.has("concrete")).toBe(true);
    expect(model.main.has("exposedMetal")).toBe(true);
    geometry.dispose();
    material.dispose();
  });
  it("keeps the canopy, ramp and rail geometry clear of all protected lot interiors", () => {
    const model = specimen();
    for (const bucket of [...model.main.values(), ...model.fine.values()]) {
      for (let i = 0; i < bucket.positions.length; i += 9) {
        const points = Array.from({ length: 3 }, (_, j): Point => [
          bucket.positions[i + j * 3],
          bucket.positions[i + j * 3 + 2],
        ]);
        const area =
          Math.abs(
            points.reduce(
              (s, p, j) => s + p[0] * points[(j + 1) % 3][1] - points[(j + 1) % 3][0] * p[1],
              0,
            ),
          ) / 2;
        if (area < 1e-10) continue;
        for (const lot of PARK_CORE_ENTITIES.filter((e) => e.kind === "lot"))
          expect(polygonsOverlap(points, lot.polygon), lot.id).toBe(false);
      }
    }
    const before = JSON.stringify(model.main.get("paintedSheet"));
    expect(model.fine.size).toBeGreaterThan(0);
    model.fine.clear();
    expect(JSON.stringify(model.main.get("paintedSheet"))).toBe(before);
  });
});
