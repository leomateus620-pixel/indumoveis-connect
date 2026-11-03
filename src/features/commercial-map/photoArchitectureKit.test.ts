import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { getPavilionPresentation } from "./architectureOrientation";
import { createPhotoBuilder, type PhotoBucket, type PhotoVertex } from "./photoArchitectureKit";

const PAVILION_NUMBERS = [1, 14, 12, 8, 13, 3];

/** Isolated rectangular specimen, deliberately away from the source origin.
 * Tests exercise the geometry builder without the renderer or facade recipes. */
function specimen(): MapEntity {
  const pavilion = ENTITIES.find((entity) => entity.id === "indumoveis:pavilion:3")!;
  return {
    ...pavilion,
    polygon: [
      [30, 40],
      [50, 40],
      [50, 48],
      [30, 48],
    ],
    anchor: [40, 44],
    accesses: [],
  };
}

function triangles(bucket: PhotoBucket) {
  const result: {
    center: THREE.Vector3;
    normal: THREE.Vector3;
    area: number;
  }[] = [];
  for (let offset = 0; offset < bucket.positions.length; offset += 9) {
    const a = new THREE.Vector3().fromArray(bucket.positions, offset);
    const b = new THREE.Vector3().fromArray(bucket.positions, offset + 3);
    const c = new THREE.Vector3().fromArray(bucket.positions, offset + 6);
    const cross = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    result.push({
      center: a
        .clone()
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3),
      normal: cross.clone().normalize(),
      area: cross.length() / 2,
    });
  }
  return result;
}

function mesh(bucket: PhotoBucket) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  const result = new THREE.Mesh(geometry, material);
  result.updateMatrixWorld(true);
  return {
    result,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

describe("photograph-oriented architecture primitives", () => {
  it.each(PAVILION_NUMBERS)(
    "registers P%i's front, observer-right and inward depth independently of vertex order",
    (number) => {
      const entity = ENTITIES.find((entry) => entry.id === `indumoveis:pavilion:${number}`)!;
      const presentation = getPavilionPresentation(entity)!;
      const normal = new THREE.Vector3(presentation.frontNormal[0], 0, presentation.frontNormal[1]);
      const observerRight = new THREE.Vector3(normal.z, 0, -normal.x);
      const original = createPhotoBuilder(entity, 4, 1);
      const origin = new THREE.Vector3(...original.world([0, 0, 0]));
      const right = new THREE.Vector3(...original.world([original.builder.w, 0, 0])).sub(origin);
      const inward = new THREE.Vector3(...original.world([0, 0, 1])).sub(origin);

      expect(original.builder.w).toBeGreaterThan(0);
      expect(original.builder.depth).toBeGreaterThan(0);
      expect(right.clone().normalize().dot(observerRight)).toBeGreaterThan(0.999);
      expect(right.dot(normal)).toBeCloseTo(0, 5);
      expect(inward.dot(normal)).toBeLessThan(-0.999);
      expect(inward.length()).toBeCloseTo(1, 10);

      const frontPoint = new THREE.Vector3(
        presentation.frontEdge[0][0],
        0,
        presentation.frontEdge[0][1],
      );
      expect(origin.clone().sub(frontPoint).dot(normal)).toBeCloseTo(0, 8);
      const inwardExtents = entity.polygon.map(([x, z]) =>
        new THREE.Vector3(x, 0, z).sub(origin).dot(inward),
      );
      expect(Math.min(...inwardExtents)).toBeGreaterThanOrEqual(-0.001);
      expect(Math.max(...inwardExtents)).toBeCloseTo(original.builder.depth, 8);

      for (const polygon of [
        [...entity.polygon.slice(2), ...entity.polygon.slice(0, 2)],
        [...entity.polygon].reverse(),
      ]) {
        const reordered = createPhotoBuilder({ ...entity, polygon }, 4, 1);
        expect(reordered.world([0, 0, 0])).toEqual(original.world([0, 0, 0]));
        expect(reordered.world([reordered.builder.w, 1, 1])).toEqual(
          original.world([original.builder.w, 1, 1]),
        );
        expect(reordered.builder.depth).toBeCloseTo(original.builder.depth, 8);
      }
    },
  );

  it("puts photo-left Brigada at P3's +X tip, toward Administration", () => {
    const kit = createPhotoBuilder(specimen(), 4, 1);
    const photoLeft = kit.world([0, 0, 0]);
    const photoRight = kit.world([kit.builder.w, 0, 0]);
    expect(photoLeft[0]).toBe(50);
    expect(photoRight[0]).toBe(30);
    expect(photoLeft[2]).toBe(40);
    expect(kit.world([0, 0, 1])[2]).toBe(41);
  });

  it("winds every closed box face outward, including its lit top and underside", () => {
    const kit = createPhotoBuilder(specimen(), 4, 1);
    kit.builder.box("architecturalFrame", 6, 2, 3, 4, 2, 1);
    const faces = triangles(kit.main.get("architecturalFrame")!);
    const center = new THREE.Vector3(...kit.world([6, 2, 3]));
    expect(faces).toHaveLength(12);
    for (const face of faces) {
      expect(face.area).toBeGreaterThan(0);
      expect(face.normal.dot(face.center.clone().sub(center))).toBeGreaterThan(0.49);
    }
    expect(faces.filter(({ normal }) => normal.y > 0.999)).toHaveLength(2);
    expect(faces.filter(({ normal }) => normal.y < -0.999)).toHaveLength(2);
    expect(
      new Set(
        faces.map(({ normal }) =>
          normal
            .toArray()
            .map((v) => Math.round(v))
            .join(","),
        ),
      ).size,
    ).toBe(6);
  });

  it.each([
    [
      [2, 1, 2],
      [10, 1, 2],
    ],
    [
      [2, 1, 2],
      [2, 4, 2],
    ],
    [
      [2, 1, 2],
      [9, 3, 5],
    ],
  ] as [PhotoVertex, PhotoVertex][])(
    "keeps axis-aligned and sloping structural beams closed and outward (%j → %j)",
    (a, b) => {
      const kit = createPhotoBuilder(specimen(), 4, 1);
      kit.builder.beam("architecturalFrame", a, b, 0.1);
      const center = new THREE.Vector3(...kit.world(a))
        .add(new THREE.Vector3(...kit.world(b)))
        .multiplyScalar(0.5);
      const faces = triangles(kit.main.get("architecturalFrame")!);
      expect(faces).toHaveLength(12);
      for (const face of faces) {
        expect(face.area).toBeGreaterThan(0);
        expect(face.normal.dot(face.center.clone().sub(center))).toBeGreaterThan(0.049);
      }
    },
  );

  it("gives the pitched marquee upward roof normals and a separate downward soffit", () => {
    const kit = createPhotoBuilder(specimen(), 4, 1);
    kit.builder.pitchedCanopy(2, 18, -2.5, -0.2, 3.6, 0.7);
    // Broad roof triangles are separated by physical area, not by bucket order;
    // edge closures and small steel beams are intentionally much smaller.
    const roofFaces = triangles(kit.main.get("paintedSheet")!).filter(({ area }) => area > 1);
    expect(roofFaces).toHaveLength(8);
    expect(roofFaces.filter(({ normal }) => normal.y > 0.99)).toHaveLength(4);
    expect(roofFaces.filter(({ normal }) => normal.y < -0.99)).toHaveLength(4);
    for (const { center, normal } of roofFaces) {
      const localX = 50 - center.x;
      const topAtX = 3.6 + 0.7 * (1 - Math.abs(localX - 10) / 8);
      const expectedY = normal.y > 0 ? topAtX : topAtX - 0.055;
      expect(center.y).toBeCloseTo(expectedY, 8);
      expect(center.z).toBeGreaterThan(37.4);
      expect(center.z).toBeLessThan(39.9);
    }
    const members = triangles(kit.main.get("architecturalFrame")!);
    expect(members.some(({ normal }) => Math.abs(normal.y) > 0.1 && Math.abs(normal.y) < 0.9)).toBe(
      true,
    );
    expect(kit.main.has("glass")).toBe(false);
    expect(kit.fine.size).toBe(0);
  });

  it("keeps opaque gates and recessed glazing separate, with gates retained when fine ribs are hidden", () => {
    const kit = createPhotoBuilder(specimen(), 4, 1);
    kit.builder.gate(1, 5, 0.1, 3);
    kit.builder.window(8, 12, 1, 2.8);
    expect(kit.main.has("paintedSheet")).toBe(true);
    expect(kit.main.has("glass")).toBe(true);
    expect(kit.fine.has("paintedSheet")).toBe(true);
    expect(kit.fine.has("glass")).toBe(false);
    const portal = mesh(kit.main.get("paintedSheet")!);
    const glazing = mesh(kit.main.get("glass")!);
    try {
      const gateRay = new THREE.Raycaster(
        new THREE.Vector3(...kit.world([3, 1.8, -2])),
        new THREE.Vector3(0, 0, 1),
      );
      const windowRay = new THREE.Raycaster(
        new THREE.Vector3(...kit.world([10, 1.8, -2])),
        new THREE.Vector3(0, 0, 1),
      );
      expect(gateRay.intersectObject(portal.result)).not.toHaveLength(0);
      expect(gateRay.intersectObject(glazing.result)).toHaveLength(0);
      expect(windowRay.intersectObject(glazing.result)).not.toHaveLength(0);
      expect(windowRay.intersectObject(portal.result)).toHaveLength(0);
      // A far/medium LOD can remove every fine rib and still retain the same
      // front-sided opaque gate surface and its support frame.
      kit.fine.clear();
      expect(gateRay.intersectObject(portal.result)).not.toHaveLength(0);
      expect(kit.main.has("architecturalFrame")).toBe(true);
      expect(kit.main.has("concrete")).toBe(true);
    } finally {
      portal.dispose();
      glazing.dispose();
    }
  });

  it("restores the main batch after nested fine detail and a cancelled detail callback", () => {
    const kit = createPhotoBuilder(specimen(), 4, 1);
    kit.builder.detail(() => {
      kit.builder.box("paintedSheet", 2, 2, 1, 1, 1, 0.1);
      kit.builder.detail(() => kit.builder.box("paintedSheet", 4, 2, 1, 1, 1, 0.1));
      kit.builder.box("paintedSheet", 6, 2, 1, 1, 1, 0.1);
    });
    expect(() =>
      kit.builder.detail(() => {
        throw new Error("cancelled refinement");
      }),
    ).toThrow("cancelled refinement");
    kit.builder.box("paintedWall", 8, 2, 1, 1, 1, 0.2);
    expect(kit.main.has("paintedSheet")).toBe(false);
    expect(kit.fine.has("paintedWall")).toBe(false);
    expect(kit.main.has("paintedWall")).toBe(true);
    expect(kit.fine.get("paintedSheet")!.positions.length / 9).toBe(36);
  });

  it("leaves the original territory, accesses and commercial attributes untouched", () => {
    const before = JSON.stringify(ENTITIES);
    for (const number of PAVILION_NUMBERS) {
      const entity = ENTITIES.find((entry) => entry.id === `indumoveis:pavilion:${number}`)!;
      const kit = createPhotoBuilder(entity, 4, 1);
      kit.builder.gate(kit.builder.w * 0.2, kit.builder.w * 0.4, 0.1, 3);
      kit.builder.window(kit.builder.w * 0.55, kit.builder.w * 0.8, 1, 2.8);
      kit.builder.pitchedCanopy(0.5, kit.builder.w - 0.5, -1, 0, 3, 0.4);
      kit.builder.gablePanel(0, kit.builder.w, 4, 1, 0);
      const points: Point[] = [
        [kit.min[0], kit.min[2]],
        [kit.max[0], kit.max[2]],
      ];
      expect(points.flat().every(Number.isFinite)).toBe(true);
      for (const bucket of [...kit.main.values(), ...kit.fine.values()]) {
        expect(bucket.colors.length).toBe(bucket.positions.length);
        expect(bucket.uvs.length).toBe((bucket.positions.length / 3) * 2);
        expect(bucket.positions.every(Number.isFinite)).toBe(true);
        expect(bucket.colors.every(Number.isFinite)).toBe(true);
      }
    }
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });
});
