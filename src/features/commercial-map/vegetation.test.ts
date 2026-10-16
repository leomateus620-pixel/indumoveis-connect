import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TREES } from "./data/territory";
import { createVegetation } from "./vegetation";

// Observe actual Three allocations and dispose events, without replacing their
// geometry or material behavior. This catches unregistered, partially built resources.
const lifecycle = vi.hoisted(() => ({
  created: [] as { kind: string; resource: { dispose(): void }; disposals: number }[],
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
            const resource = Reflect.construct(target, args, newTarget);
            const record = { kind, resource, disposals: 0 };
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

function appearance(model: ReturnType<typeof createVegetation>) {
  return model.group.children.map((child) => {
    const mesh = child as THREE.InstancedMesh;
    return {
      geometry: Array.from(mesh.geometry.getAttribute("position").array),
      transforms: Array.from(mesh.instanceMatrix.array),
      colors: mesh.instanceColor ? Array.from(mesh.instanceColor.array) : null,
    };
  });
}

function sourceCentres(mesh: THREE.InstancedMesh) {
  const transform = new THREE.Matrix4();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, transform);
    return [transform.elements[12], transform.elements[14]];
  });
}

describe("optional presentation vegetation ownership", () => {
  it("keeps every approved tree centre and deterministic crowns through capability and motion changes", () => {
    const source = JSON.stringify(TREES);
    // The same factory is used by Leve, Equilibrado and Detalhado. Capability
    // changes only turn its shared canopy uniform on/off, never rebuild planting.
    const models = Array.from({ length: 3 }, () => createVegetation());
    try {
      const expectedCentres = TREES.map((point) => point.map((value) => Math.fround(value)))
        .map((point) => point.join(","))
        .sort();
      for (const model of models) {
        const meshes = model.group.children as THREE.InstancedMesh[];
        const trunk = meshes.find((mesh) => mesh.geometry.type === "CylinderGeometry")!;
        expect(
          sourceCentres(trunk)
            .map((point) => point.join(","))
            .sort(),
        ).toEqual(expectedCentres);
        const crowns = meshes.filter((mesh) => mesh.geometry.type === "BufferGeometry");
        expect(
          crowns
            .flatMap(sourceCentres)
            .map((point) => point.join(","))
            .sort(),
        ).toEqual(expectedCentres);
        const before = appearance(model);
        model.animate(8.5, false);
        model.animate(16.25, true);
        expect(appearance(model)).toEqual(before);
        expect(appearance(model)).toEqual(appearance(models[0]));
      }
      expect(JSON.stringify(TREES)).toBe(source);
    } finally {
      for (const model of models) {
        model.dispose();
        model.dispose();
        expect(model.group.children).toHaveLength(0);
      }
    }
    expect(lifecycle.created.length).toBeGreaterThan(0);
    expect(lifecycle.created.every((record) => record.disposals === 1)).toBe(true);
  });

  it("releases every allocation once when contact texture preparation throws before return", () => {
    const failure = new Error("Injected contact texture preparation failure");
    vi.spyOn(THREE.Texture.prototype, "needsUpdate", "set").mockImplementation(() => {
      throw failure;
    });
    expect(() => createVegetation()).toThrow(failure);
    const texture = lifecycle.created.find((record) => record.kind === "DataTexture");
    expect(texture, "the failure must occur after a contact texture was allocated").toBeDefined();
    expect(lifecycle.created.some((record) => record.kind === "InstancedMesh")).toBe(true);
    expect(lifecycle.created.every((record) => record.disposals === 1)).toBe(true);
  });

  it("cleans partial crown geometry when preparation fails before a mesh can own it", () => {
    const failure = new Error("Injected crown preparation failure");
    vi.spyOn(THREE.BufferGeometry.prototype, "translate").mockImplementation(() => {
      throw failure;
    });
    expect(() => createVegetation()).toThrow(failure);
    expect(lifecycle.created.some((record) => record.kind === "IcosahedronGeometry")).toBe(true);
    expect(lifecycle.created.every((record) => record.disposals === 1)).toBe(true);
  });
});
