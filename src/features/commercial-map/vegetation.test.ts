import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENTITIES, TREES } from "./data/territory";
import { getArchitectureDefinition } from "./architecture";
import { pointInPolygon } from "./geometry";
import { createVegetation, VEGETATION, CONTEXT_WOODLAND } from "./vegetation";
import { auditPlanting, derivePresentationPlanting, distanceToPolygon, PLANTING } from "./planting";

const lifecycle = vi.hoisted(() => ({
  created: [] as { resource: { dispose(): void }; disposals: number }[],
}));
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  const constructors = [
    "BufferGeometry",
    "CylinderGeometry",
    "IcosahedronGeometry",
    "PlaneGeometry",
    "MeshLambertMaterial",
    "MeshBasicMaterial",
    "InstancedMesh",
    "DataTexture",
  ] as const;
  return {
    ...actual,
    ...Object.fromEntries(
      constructors.map((kind) => [
        kind,
        new Proxy(actual[kind], {
          construct(target, args, newTarget) {
            const resource = Reflect.construct(target, args, newTarget),
              record = { resource, disposals: 0 };
            lifecycle.created.push(record);
            resource.addEventListener("dispose", () => record.disposals++);
            return resource;
          },
        }),
      ]),
    ),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  lifecycle.created.length = 0;
});
const meshes = (model: ReturnType<typeof createVegetation>) =>
  model.group.children as THREE.InstancedMesh[];
const centres = (model: ReturnType<typeof createVegetation>, family: string) => {
  const matrix = new THREE.Matrix4();
  return meshes(model)
    .filter((mesh) => mesh.name.startsWith(family))
    .flatMap((mesh) =>
      Array.from({ length: mesh.count }, (_, index) => {
        mesh.getMatrixAt(index, matrix);
        return [matrix.elements[12], matrix.elements[14]].join(",");
      }),
    )
    .sort();
};

describe("organic instanced planting", () => {
  it("preserves all approved centres and source geometry under LOD, quality, orbit-independent wind and reopens", () => {
    const before = JSON.stringify([TREES, ENTITIES]);
    const a = createVegetation(),
      b = createVegetation();
    try {
      const expected = [...TREES, ...derivePresentationPlanting()]
        .map(([x, z]) => [Math.fround(x), Math.fround(z)].join(","))
        .sort();
      expect(centres(a, "tree-wood")).toEqual(expected);
      expect(centres(a, "tree-near")).toEqual(expected);
      expect(centres(a, "tree-far")).toEqual(expected);
      const transforms = meshes(a).map((mesh) => Array.from(mesh.instanceMatrix.array));
      expect(transforms).toEqual(meshes(b).map((mesh) => Array.from(mesh.instanceMatrix.array)));
      a.updateLod(400);
      a.setQuality("light");
      a.animate(22, true);
      a.updateLod(30, [90, 40]);
      expect(meshes(a).map((mesh) => Array.from(mesh.instanceMatrix.array))).toEqual(transforms);
      expect(meshes(a).some((mesh) => mesh.name.startsWith("tree-near") && mesh.visible)).toBe(
        true,
      );
      expect(
        meshes(a)
          .filter((mesh) => mesh.name.startsWith("tree-near") && mesh.visible)
          .reduce(
            (sum, mesh) => sum + (mesh.count * mesh.geometry.getAttribute("position").count) / 3,
            0,
          ),
      ).toBeLessThanOrEqual(VEGETATION.nearTriangleBudget);
      a.updateLod(600);
      expect(
        meshes(a)
          .filter((mesh) => mesh.name.startsWith("tree-near"))
          .every((mesh) => !mesh.visible),
      ).toBe(true);
      expect(
        meshes(a)
          .filter((mesh) => mesh.name.startsWith("tree-far"))
          .every((mesh) => mesh.visible),
      ).toBe(true);
      expect(a.metadata.totalTrees).toBe(expected.length);
      expect(a.metadata.automaticPlanting).toBe(false);
      expect(a.metadata.auditedTrees).toEqual(auditPlanting());
      const matrix = new THREE.Matrix4();
      for (const mesh of meshes(a).filter((mesh) => mesh.name.startsWith("tree-wood"))) {
        const ids = mesh.userData.plantingIds as string[];
        expect(ids).toHaveLength(mesh.count);
        ids.forEach((id, slot) => {
          const record = a.metadata.auditedTrees.find((entry) => entry.id === id)!;
          mesh.getMatrixAt(slot, matrix);
          expect(matrix.elements[12]).toBeCloseTo(record.world[0], 4);
          expect(matrix.elements[14]).toBeCloseTo(record.world[1], 4);
        });
      }
      expect(a.metadata.textureMaps).toBe(2);
      expect(a.textureBytes).toBeLessThan(110_000);
      expect(a.metadata.maximumVisibleDraws).toBeLessThanOrEqual(37);
      expect(JSON.stringify([TREES, ENTITIES])).toBe(before);
    } finally {
      a.dispose();
      a.dispose();
      b.dispose();
    }
    expect(lifecycle.created.every((record) => record.disposals === 1)).toBe(true);
  });

  it("adds only individually audited crowns in the Arvoredo sidewalk and pavilion frontage", () => {
    const points = derivePresentationPlanting();
    expect(points.length).toBeGreaterThan(10);
    expect(points.length).toBeLessThanOrEqual(PLANTING.maximumAdditional);
    expect(derivePresentationPlanting()).toEqual(points);
    for (const point of points) {
      expect(
        auditPlanting().some(
          (record) =>
            record.origin === "satellite-crown" &&
            record.world[0] === point[0] &&
            record.world[1] === point[1],
        ),
      ).toBe(true);
      expect(
        ENTITIES.some((entity) => entity.kind === "lot" && pointInPolygon(point, entity.polygon)),
      ).toBe(false);
      for (const entity of ENTITIES.filter(
        (entity) =>
          (entity.kind === "road" && entity.id !== "indumoveis:road:arvoredo") ||
          getArchitectureDefinition(entity),
      )) {
        expect(pointInPolygon(point, entity.polygon)).toBe(false);
        expect(distanceToPolygon(point, entity.polygon)).toBeGreaterThanOrEqual(
          PLANTING.crownClearance,
        );
        if (getArchitectureDefinition(entity))
          expect(distanceToPolygon(point, entity.polygon)).toBeGreaterThanOrEqual(2.4);
      }
      for (const entity of ENTITIES)
        for (const access of entity.accesses ?? [])
          expect(Math.hypot(point[0] - access[0], point[1] - access[1])).toBeGreaterThanOrEqual(
            2.4,
          );
    }
  });

  it("uses connected woody branches, three volumetric leaf species and shared cutout atlas rather than a mesh per leaf", () => {
    const model = createVegetation({ additionalPlanting: false });
    try {
      expect(model.metadata.species).toHaveLength(3);
      expect(model.metadata.approvedTrees).toBe(TREES.length);
      expect(model.metadata.additionalTrees).toBe(0);
      const near = meshes(model).filter((mesh) => mesh.name.startsWith("tree-near"));
      expect(new Set(near.map((mesh) => mesh.geometry)).size).toBe(3);
      expect(new Set(near.map((mesh) => mesh.material)).size).toBe(1);
      const material = near[0].material as THREE.MeshLambertMaterial;
      expect((material.map as THREE.DataTexture).image.width).toBe(VEGETATION.leafAtlasSize);
      expect(material.map!.generateMipmaps).toBe(true);
      expect(material.alphaTest).toBeGreaterThan(0);
      expect(material.transparent).toBe(false);
      expect(near.every((mesh) => mesh.frustumCulled && mesh.boundingSphere !== null)).toBe(true);
      for (const mesh of near) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        expect(box.max.x - box.min.x).toBeGreaterThan(2);
        expect(box.max.z - box.min.z).toBeGreaterThan(2);
        expect(mesh.geometry.getAttribute("position").count / 3).toBe(VEGETATION.leavesPerTree * 2);
      }
      // Every branch is baked into one woody batch per species/cell.
      expect(
        meshes(model)
          .filter((mesh) => mesh.name.startsWith("tree-wood"))
          .every((mesh) => mesh.geometry.getAttribute("position").count > 600),
      ).toBe(true);
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(TREES[0][0], 10, TREES[0][1]),
        new THREE.Vector3(0, -1, 0),
      );
      model.group.updateMatrixWorld(true);
      expect(raycaster.intersectObject(model.group, true)).toHaveLength(0);
    } finally {
      model.dispose();
    }
  });

  it("releases all partial allocations on atlas upload or geometry preparation errors", () => {
    const failure = new Error("Injected vegetation failure");
    const setter = vi
      .spyOn(THREE.Texture.prototype, "needsUpdate", "set")
      .mockImplementation(() => {
        throw failure;
      });
    expect(() => createVegetation()).toThrow(failure);
    expect(lifecycle.created.every((record) => record.disposals === 1)).toBe(true);
    setter.mockRestore();
    lifecycle.created.length = 0;
    vi.spyOn(THREE.BufferGeometry.prototype, "translate").mockImplementation(() => {
      throw failure;
    });
    expect(() => createVegetation()).toThrow(failure);
    expect(lifecycle.created.every((record) => record.disposals === 1)).toBe(true);
  });

  it("creates an isolated external instance while preserving thirty internal audited trees and independently owned resources", () => {
    const before = JSON.stringify([ENTITIES, TREES]);
    const internal = createVegetation({ quality: "light" });
    const context = createVegetation({ contextPlanting: CONTEXT_WOODLAND, quality: "light" });
    try {
      expect(internal.metadata.totalTrees).toBe(30);
      expect(internal.metadata.approximateContext).toBe(false);
      expect(context.metadata.totalTrees).toBe(CONTEXT_WOODLAND.length);
      expect(context.metadata.contextTrees).toBe(CONTEXT_WOODLAND.length);
      expect(context.metadata.approvedTrees).toBe(0);
      expect(context.metadata.additionalTrees).toBe(0);
      expect(context.metadata.approximateContext).toBe(true);
      expect(context.metadata.maximumHeight).toBeLessThanOrEqual(5.2 + 1e-8);
      expect(context.metadata.groundElevation).toBe(-0.15);
      expect(context.metadata.textureMaps).toBe(2);
      expect(context.textureBytes).toBe(internal.textureBytes);
      expect(centres(context, "tree-wood")).toEqual(
        CONTEXT_WOODLAND.map(({ world }) => world.map(Math.fround).join(",")).sort(),
      );
      const matrix = new THREE.Matrix4();
      const transforms = meshes(context).map((mesh) => Array.from(mesh.instanceMatrix.array));
      context.updateLod(20, [-20, 70]);
      context.setQuality("balanced");
      context.animate(20, true);
      expect(meshes(context).map((mesh) => Array.from(mesh.instanceMatrix.array))).toEqual(
        transforms,
      );
      for (const mesh of meshes(context).filter((mesh) => mesh.name.startsWith("tree-wood"))) {
        const ids = mesh.userData.plantingIds as string[];
        ids.forEach((id, slot) => {
          const record = context.metadata.auditedTrees.find((entry) => entry.id === id)!;
          expect(record.origin).toBe("satellite-mass");
          mesh.getMatrixAt(slot, matrix);
          expect(matrix.elements[12]).toBeCloseTo(record.world[0], 4);
          expect(matrix.elements[14]).toBeCloseTo(record.world[1], 4);
          expect(matrix.elements[13]).toBeCloseTo(context.metadata.groundElevation);
        });
      }
      context.group.updateMatrixWorld(true);
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(CONTEXT_WOODLAND[0].world[0], 20, CONTEXT_WOODLAND[0].world[1]),
        new THREE.Vector3(0, -1, 0),
      );
      expect(raycaster.intersectObject(context.group, true)).toHaveLength(0);
      // Disposing one context must never free resources used by the park.
      const sourceAtlas = (
        meshes(internal).find((mesh) => mesh.name.startsWith("tree-near"))!
          .material as THREE.MeshLambertMaterial
      ).map!;
      const externalAtlas = (
        meshes(context).find((mesh) => mesh.name.startsWith("tree-near"))!
          .material as THREE.MeshLambertMaterial
      ).map!;
      expect(sourceAtlas).not.toBe(externalAtlas);
      context.dispose();
      expect(lifecycle.created.find((entry) => entry.resource === sourceAtlas)!.disposals).toBe(0);
      expect(lifecycle.created.find((entry) => entry.resource === externalAtlas)!.disposals).toBe(
        1,
      );
      expect(JSON.stringify([ENTITIES, TREES])).toBe(before);
    } finally {
      context.dispose();
      internal.dispose();
    }
    expect(lifecycle.created.every((record) => record.disposals === 1)).toBe(true);
  });

  it("treats an explicit empty contextual list as a replacement without adding internal symbols", () => {
    const context = createVegetation({ contextPlanting: [] });
    try {
      expect(context.metadata.totalTrees).toBe(0);
      expect(context.metadata.auditedTrees).toHaveLength(0);
      expect(context.metadata.approvedTrees).toBe(0);
      expect(context.metadata.approximateContext).toBe(true);
      expect(centres(context, "tree-wood")).toHaveLength(0);
    } finally {
      context.dispose();
    }
  });
});
