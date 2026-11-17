import * as THREE from "three";
import { registeredHallFrame, type ParkVertex } from "./parkHallArchitecture";
import { describe, expect, it, vi } from "vitest";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { DAYLIGHT } from "./daylight";
import { createPermanentPark } from "./permanentPark";
import { PERMANENT_PARK_LANDMARKS } from "./permanentParkLayout";

describe("permanent architectural surface orientation", () => {
  it("keeps both stage roof pitches visible and casting into the PCF depth pass", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const surfaces = createSurfaceMaterials({ maps: false });
    const park = createPermanentPark(surfaces);
    const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    const sheet = surfaces.materials.paintedSheet;
    // WebGLShadowMap's PCF pass defaults a FrontSide material to BackSide.
    const depth = new THREE.MeshDepthMaterial({ side: sheet.shadowSide ?? THREE.BackSide });
    try {
      const source = park.group.getObjectByName("permanent-park-paintedSheet") as THREE.Mesh;
      // Production context never captures commercial clicks. Borrow only the
      // geometry for a test raycaster with the renderer's normal FrontSide.
      const roof = new THREE.Mesh(source.geometry, material);
      const shadowCaster = new THREE.Mesh(source.geometry, depth);
      const sun = new THREE.Vector3(...DAYLIGHT.sunDirection).normalize();
      expect(sheet.side).toBe(THREE.FrontSide);
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
        const sunRay = new THREE.Raycaster(
          hit!.point.clone().addScaledVector(sun, 1),
          sun.clone().negate(),
          0.99,
          1.01,
        );
        expect(sunRay.intersectObject(shadowCaster).some((entry) => entry.face!.normal.y > 0)).toBe(
          true,
        );
      }
      expect(source.userData.commercialPickable).toBe(false);
    } finally {
      depth.dispose();
      material.dispose();
      park.dispose();
      surfaces.dispose();
      getContext.mockRestore();
    }
  });

  it("keeps the livestock aisle continuous and the Arena open at both ends", () => {
    const surfaces = createSurfaceMaterials({ maps: false });
    const park = createPermanentPark(surfaces);
    const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    try {
      const mesh = (family: string) => {
        const source = park.group.getObjectByName("permanent-park-" + family) as THREE.Mesh;
        return new THREE.Mesh(source.geometry, material);
      };
      const sheet = mesh("paintedSheet"),
        wall = mesh("paintedWall"),
        steel = mesh("exposedMetal");
      const landmark = (id: string) => PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!;
      const halls = landmark("pavilhoes-6-10-11");
      for (const neighborId of ["pavilhao-7", "pavilhao-5"]) {
        const shared = halls.polygon.filter((p) =>
          landmark(neighborId).polygon.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.001),
        );
        expect(shared, "the A2 outlines meet along a full edge").toHaveLength(2);
      }
      const frame = registeredHallFrame(halls.polygon);
      const ray = (f: typeof frame, a: ParkVertex, b: ParkVertex) => {
        const start = new THREE.Vector3(...f.world(a)),
          direction = new THREE.Vector3(...f.world(b)).sub(start);
        const distance = direction.length();
        return new THREE.Raycaster(start, direction.normalize(), 0, distance);
      };
      for (const fraction of [0.15, 0.5, 0.845]) {
        const x = frame.width * fraction;
        expect(
          ray(frame, [x, 1.56, -0.5], [x, 1.56, frame.depth + 0.5]).intersectObject(wall),
        ).toHaveLength(0);
        const crest = ray(frame, [x, 8, frame.depth / 2], [x, 0, frame.depth / 2]).intersectObject(
          sheet,
        )[0];
        expect(crest.point.y).toBeGreaterThan(3);
      }
      const arena = registeredHallFrame(landmark("arena").polygon);
      expect(
        ray(
          arena,
          [-0.1, 2.2, arena.depth / 2],
          [arena.width + 0.1, 2.2, arena.depth / 2],
        ).intersectObject(steel),
      ).toHaveLength(0);
      for (const depth of [0.98, arena.depth - 0.98]) {
        const contacts = ray(
          arena,
          [-1, 0.71, depth],
          [arena.width + 1, 0.71, depth],
        ).intersectObject(steel);
        const unique = contacts.filter(
          (v, i) => i === 0 || Math.abs(v.distance - contacts[i - 1].distance) > 0.05,
        );
        expect(unique.length).toBe(9);
      }
      expect(park.group.getObjectByName("permanent-park-paintedSheet")!.castShadow).toBe(true);
      expect(park.group.getObjectByName("permanent-park-glass")!.castShadow).toBe(false);
    } finally {
      material.dispose();
      park.dispose();
      surfaces.dispose();
    }
  });
});
