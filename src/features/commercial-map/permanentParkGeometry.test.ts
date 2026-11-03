import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { createPermanentPark } from "./permanentPark";
import { PERMANENT_PARK_LANDMARKS } from "./permanentParkLayout";

describe("permanent architectural surface orientation", () => {
  it("keeps both stage roof pitches visible from above with front-face culling", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const surfaces = createSurfaceMaterials({ maps: false });
    const park = createPermanentPark(surfaces);
    const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    try {
      const source = park.group.getObjectByName("permanent-park-paintedSheet") as THREE.Mesh;
      // Production context never captures commercial clicks. Borrow only the
      // geometry for a test raycaster with the renderer's normal FrontSide.
      const roof = new THREE.Mesh(source.geometry, material);
      roof.updateMatrixWorld(true);
      const stage = PERMANENT_PARK_LANDMARKS.find((item) => item.sourceId === "B13")!;
      const [x0, z0, x1, z1] = stage.bounds;
      for (const fraction of [0.25, 0.75]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3((x0 + x1) / 2, 12, z0 + (z1 - z0) * fraction),
          new THREE.Vector3(0, -1, 0),
        );
        const hit = ray.intersectObject(roof)[0];
        expect(hit, `stage roof pitch at fraction ${fraction} must face the sky`).toBeDefined();
        expect(hit!.point.y).toBeGreaterThan(2);
        expect(hit!.face!.normal.y).toBeGreaterThan(0);
      }
      expect(source.userData.commercialPickable).toBe(false);
    } finally {
      material.dispose();
      park.dispose();
      surfaces.dispose();
      getContext.mockRestore();
    }
  });
});
