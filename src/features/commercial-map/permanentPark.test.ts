import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { pointInPolygon, polygonBounds } from "./geometry";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { createPermanentPark } from "./permanentPark";
import { createPermanentParkLabels, visiblePermanentParkLabels } from "./permanentParkLabels";
import {
  EXPORURAL_GROUND,
  EXPORURAL_ROADS,
  EXPORURAL_EDGE_TREES,
  ARENA_APPROACH,
  PERMANENT_PARK_LANDMARKS,
  permanentParkPolygon,
} from "./permanentParkLayout";
import { pavementUnionCells } from "./pavement";
import { deriveRoadRibbon } from "./roadGeometry";
import { REFERENCE_ROADS } from "./urbanReference";

describe("schematic permanent park presentation", () => {
  it("retains distinct landmark identities outside all source territory, without parking or commercial inventory", () => {
    expect(PERMANENT_PARK_LANDMARKS.map((landmark) => landmark.id)).toEqual([
      "pavilhao-9",
      "pavilhao-7",
      "pavilhoes-6-10-11",
      "pavilhao-5",
      "alameda",
      "mirante",
      "arena",
      "sede",
      "etnia-polonesa",
      "etnia-italiana",
      "etnia-alema",
      "etnia-afro",
    ]);
    const polygons = PERMANENT_PARK_LANDMARKS.map(permanentParkPolygon);
    for (const [i, polygon] of polygons.entries()) {
      const a = polygonBounds(polygon);
      for (const other of [...ENTITIES.map((entity) => entity.polygon), ...polygons.slice(i + 1)]) {
        const b = polygonBounds(other);
        expect(a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY).toBe(
          false,
        );
        expect(polygon.some((point) => pointInPolygon(point, other))).toBe(false);
      }
    }
  });
  it("keeps the rural ground and source-derived roads clear of all protected entities and unions crossings", () => {
    const ground = polygonBounds(EXPORURAL_GROUND);
    expect(EXPORURAL_ROADS).toHaveLength(9);
    const cells = pavementUnionCells(EXPORURAL_ROADS.map((road) => road.polygon));
    const overlaps = (a: ReturnType<typeof polygonBounds>, b: ReturnType<typeof polygonBounds>) =>
      a.minX < b.maxX - 1e-8 &&
      a.maxX > b.minX + 1e-8 &&
      a.minY < b.maxY - 1e-8 &&
      a.maxY > b.minY + 1e-8;
    for (const entity of ENTITIES)
      expect(overlaps(ground, polygonBounds(entity.polygon))).toBe(false);
    for (const [x, z] of EXPORURAL_EDGE_TREES) {
      for (const polygon of [
        ...EXPORURAL_ROADS.map((road) => road.polygon),
        ...ENTITIES.map((entity) => entity.polygon),
        ...PERMANENT_PARK_LANDMARKS.map(permanentParkPolygon),
      ]) {
        const bounds = polygonBounds(polygon);
        const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
        const dz = Math.max(bounds.minY - z, 0, z - bounds.maxY);
        expect(Math.hypot(dx, dz)).toBeGreaterThan(1.25);
      }
    }
    for (const [index, cell] of cells.entries()) {
      for (const other of cells.slice(index + 1))
        expect(overlaps(polygonBounds(cell), polygonBounds(other))).toBe(false);
      for (const entity of ENTITIES)
        expect(overlaps(polygonBounds(cell), polygonBounds(entity.polygon))).toBe(false);
    }
  });
  it("joins source-proven roads and the Mirante-to-Arena approach without crossing protected entities", () => {
    const road = (name: string) => EXPORURAL_ROADS.find((item) => item.name === name)!.polygon;
    const pastor = road("Rua Pastor Albert Lehenbauer"),
      east = road("Rua Ubiretama");
    for (const name of ["Rua Bruno Schwartz", "Rua Johan Muller", "Rua Gustavo Bessel"]) {
      const bounds = polygonBounds(road(name));
      const z = (bounds.minY + bounds.maxY) / 2;
      expect(pointInPolygon([bounds.minX - 0.05, z], pastor)).toBe(true);
      expect(pointInPolygon([bounds.maxX + 0.05, z], east)).toBe(true);
    }
    const buenos = REFERENCE_ROADS.find((item) => item.id === "park-buenos-aires")!;
    const ribbon = deriveRoadRibbon(buenos.path, buenos.width);
    const onBoundary = (p: [number, number]) =>
      ribbon.some((a, i) => {
        const b = ribbon[(i + 1) % ribbon.length];
        return (
          Math.abs(
            Math.hypot(p[0] - a[0], p[1] - a[1]) +
              Math.hypot(p[0] - b[0], p[1] - b[1]) -
              Math.hypot(b[0] - a[0], b[1] - a[1]),
          ) < 1e-7
        );
      });
    // Brasília's source strip bridges the Paraguay/Pastor intersection.
    const brasilia = road("Rua Brasília — recorte norte");
    expect(pointInPolygon([80.65, -32.94], brasilia)).toBe(true);
    expect(pointInPolygon([80.65, -32.94], pastor)).toBe(true);
    const paraguay = road("Rua Paraguai");
    expect(pointInPolygon([80.6, -32.94], brasilia)).toBe(true);
    expect(pointInPolygon([80.6, -32.94], paraguay)).toBe(true);
    expect(onBoundary(paraguay[0])).toBe(true);
    expect(onBoundary(paraguay[3])).toBe(true);
    const mirante = PERMANENT_PARK_LANDMARKS.find((item) => item.id === "mirante")!;
    const arena = PERMANENT_PARK_LANDMARKS.find((item) => item.id === "arena")!;
    const alameda = PERMANENT_PARK_LANDMARKS.find((item) => item.id === "alameda")!;
    expect(
      (alameda.bounds[3] - alameda.bounds[1]) / (alameda.bounds[2] - alameda.bounds[0]),
    ).toBeCloseTo(210 / 150);
    expect(ARENA_APPROACH.landing[0]).toBe(alameda.bounds[2]);
    expect(ARENA_APPROACH.landing[2]).toBe(ARENA_APPROACH.stairs[0]);
    expect(
      (ARENA_APPROACH.canopy[3] - ARENA_APPROACH.canopy[1]) /
        (ARENA_APPROACH.canopy[2] - ARENA_APPROACH.canopy[0]),
    ).toBeCloseTo(196 / 80);
    const approachCells = pavementUnionCells(
      [ARENA_APPROACH.landing, ARENA_APPROACH.canopy].map(([x0, z0, x1, z1]) => [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ]),
    );
    for (const [index, cell] of approachCells.entries())
      for (const other of approachCells.slice(index + 1)) {
        const a = polygonBounds(cell),
          b = polygonBounds(other);
        expect(
          a.minX < b.maxX - 1e-8 &&
            a.maxX > b.minX + 1e-8 &&
            a.minY < b.maxY - 1e-8 &&
            a.maxY > b.minY + 1e-8,
        ).toBe(false);
      }
    expect(ARENA_APPROACH.stairs[0]).toBe(mirante.bounds[2]);
    expect(ARENA_APPROACH.stairs[2]).toBe(ARENA_APPROACH.plaza[0]);
    expect(ARENA_APPROACH.plaza[2]).toBe(arena.bounds[0]);
    for (const box of [
      ARENA_APPROACH.stairs,
      ARENA_APPROACH.plaza,
      ARENA_APPROACH.landing,
      ARENA_APPROACH.canopy,
    ])
      for (const entity of ENTITIES) {
        const b = polygonBounds(entity.polygon);
        expect(box[0] < b.maxX && box[2] > b.minX && box[1] < b.maxY && box[3] > b.minY).toBe(
          false,
        );
      }
  });
  it("uses bounded static batches, avoids picking, and disposes only owned buffers", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const surfaces = createSurfaceMaterials({ maps: false });
    const materialDispose = vi.spyOn(surfaces.materials.paintedSheet, "dispose");
    const context = createPermanentPark(surfaces);
    const geometries: THREE.BufferGeometry[] = [];
    try {
      expect(context.metadata.schematic).toBe(true);
      expect(context.metadata.drawBatches).toBeLessThanOrEqual(8);
      context.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.push(object.geometry);
        expect(object.userData.commercialPickable).toBe(false);
        expect(object.userData.entityId).toBeUndefined();
        expect(object.castShadow).toBe(false);
        const positions = object.geometry.getAttribute("position");
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      });
      context.group.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(200, 30, -5), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(context.group, true)).toHaveLength(0);
      const spies = geometries.map((geometry) => vi.spyOn(geometry, "dispose"));
      context.dispose();
      context.dispose();
      expect(spies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
      expect(materialDispose).not.toHaveBeenCalled();
    } finally {
      context.dispose();
      surfaces.dispose();
      getContext.mockRestore();
    }
  });
  it("suppresses distant and overlapping context labels while allowing close exploration", () => {
    const camera = new THREE.PerspectiveCamera(45, 390 / 844, 0.1, 1000);
    camera.position.set(0, 0, 150);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const labels = [
      { text: "Arena", position: [0, 0, 0] as [number, number, number], mode: 0 as const },
      { text: "Mirante", position: [0.1, 0, 0] as [number, number, number], mode: 0 as const },
    ];
    expect(visiblePermanentParkLabels(labels, camera, 390, 844)).toEqual([false, false]);
    camera.position.z = 50;
    camera.updateMatrixWorld();
    expect(visiblePermanentParkLabels(labels, camera, 390, 844)).toEqual([true, false]);
  });
  it("builds one optional label atlas, preserves the group overview and disposes its own resources", () => {
    const fillText = vi.fn();
    const drawing = { beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), fillText };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(drawing as never);
    const labels = createPermanentParkLabels();
    try {
      expect(labels).not.toBeNull();
      expect(labels!.labels).toBe(14);
      expect(labels!.textureBytes).toBe(512 * 448 * 4);
      expect(fillText.mock.calls.map((args) => args[0])).toEqual([
        "Pavilhão 9",
        "Pavilhão 7",
        "Pavilhões 6, 10 e 11",
        "Pavilhão 5",
        "Exporural",
        "Alameda Gastronômica",
        "Mirante",
        "Arena",
        "Casa / Sede",
        "Etnia Polonesa",
        "Etnia Italiana",
        "Etnia Alemã",
        "Etnia Afro",
        "Casas das Etnias",
      ]);
      const mesh = labels!.mesh;
      expect(mesh.userData.commercialPickable).toBe(false);
      expect(mesh.geometry.getAttribute("position").count).toBe(56);
      expect(mesh.geometry.index!.count).toBe(84);
      const material = mesh.material as THREE.ShaderMaterial;
      const texture = material.uniforms.atlas.value as THREE.CanvasTexture;
      const disposeGeometry = vi.spyOn(mesh.geometry, "dispose");
      const disposeMaterial = vi.spyOn(material, "dispose");
      const disposeTexture = vi.spyOn(texture, "dispose");
      labels!.dispose();
      labels!.dispose();
      expect(disposeGeometry).toHaveBeenCalledTimes(1);
      expect(disposeMaterial).toHaveBeenCalledTimes(1);
      expect(disposeTexture).toHaveBeenCalledTimes(1);
    } finally {
      labels?.dispose();
      getContext.mockRestore();
    }
  });
});
