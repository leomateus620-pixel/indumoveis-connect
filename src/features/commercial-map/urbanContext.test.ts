import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { pointInPolygon } from "./geometry";
import { URBAN_REFERENCE, REFERENCE_ROADS } from "./urbanReference";
import { deriveRoadRibbon } from "./roadGeometry";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { deriveUrbanContact } from "./urbanContact";
import { DAYLIGHT } from "./daylight";
import {
  createUrbanContext,
  deriveUrbanHouses,
  deriveUrbanRoads,
  deriveResidentialBuffer,
  urbanPolygonAllowed,
  URBAN_CONTEXT,
} from "./urbanContext";

const captureIndexing = vi.hoisted(() => ({
  active: false,
  pairs: [] as { before: THREE.BufferGeometry; after: THREE.BufferGeometry }[],
}));
vi.mock("three/addons/utils/BufferGeometryUtils.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("three/addons/utils/BufferGeometryUtils.js")>();
  return {
    ...original,
    mergeVertices(geometry: THREE.BufferGeometry, tolerance: number) {
      const indexed = original.mergeVertices(geometry, tolerance);
      if (captureIndexing.active) captureIndexing.pairs.push({ before: geometry, after: indexed });
      return indexed;
    },
  };
});
const elementCount = (geometry: THREE.BufferGeometry) =>
  geometry.index?.count ?? geometry.getAttribute("position").count;
const vertexIndex = (geometry: THREE.BufferGeometry, element: number) =>
  geometry.index?.getX(element) ?? element;

describe("approximate residential context outside the source park", () => {
  it("keeps the denser reference-inspired homes inside separate contextual parcels without changing source geometry", () => {
    const before = JSON.stringify(ENTITIES);
    const a = deriveUrbanHouses(),
      b = deriveUrbanHouses();
    expect(a).toEqual(b);
    expect(a).toHaveLength(32);
    expect(new Set(a.map((h) => h.roof))).toEqual(new Set(["hip", "gable", "flat"]));
    expect(a.filter((h) => h.pool).length).toBeGreaterThanOrEqual(8);
    for (const house of a) {
      expect(urbanPolygonAllowed(house.footprint)).toBe(true);
      expect(urbanPolygonAllowed(house.parcel)).toBe(true);
      expect(house.parcel.every(([, z]) => z >= URBAN_CONTEXT.minimumZ)).toBe(true);
      for (const road of REFERENCE_ROADS) {
        const ribbon = deriveRoadRibbon(road.path, road.width + 1.05);
        expect(
          house.footprint.some((p) => pointInPolygon(p, ribbon)),
          house.form + " " + road.id,
        ).toBe(false);
      }
      expect(house.footprint.every((p) => pointInPolygon(p, house.parcel))).toBe(true);
    }
    expect(JSON.stringify(ENTITIES)).toBe(before);
    expect(urbanPolygonAllowed(ENTITIES[0].polygon)).toBe(false);
    expect(
      urbanPolygonAllowed([
        [70, 50],
        [76, 50],
        [76, 56],
        [70, 56],
      ]),
    ).toBe(false);
  });
  it("has finite south-side geometry and explicit noncommercial picking even when raycast recursively includes the whole context", () => {
    const context = createUrbanContext();
    try {
      let meshCount = 0;
      context.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        meshCount++;
        const p = object.geometry.getAttribute("position"),
          n = object.geometry.getAttribute("normal");
        for (let i = 0; i < p.count; i++) {
          expect(
            [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)].every(
              Number.isFinite,
            ),
          ).toBe(true);
          expect(p.getZ(i)).toBeGreaterThanOrEqual(URBAN_CONTEXT.minimumZ);
        }
        expect(object.userData.entityId).toBeUndefined();
        expect(object.userData.commercialPickable).toBe(false);
        expect(object.castShadow || object.receiveShadow).toBe(false);
        expect(object.frustumCulled).toBe(true);
      });
      expect(meshCount).toBeLessThanOrEqual(37);
      context.group.updateMatrixWorld(true);
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(51, 20, 106.5),
        new THREE.Vector3(0, -1, 0),
      );
      expect(raycaster.intersectObject(context.group, true)).toHaveLength(0);
      expect(context.metadata.commercialInventory).toBe(false);
      expect(context.metadata.triangleCount).toBeLessThan(65000);
      expect(context.metadata.textureBytes).toBe(0);
    } finally {
      context.dispose();
    }
  });
  it("indexes every static batch without changing expanded triangle order, attributes or hard-edge/UV seams", () => {
    captureIndexing.active = true;
    captureIndexing.pairs.length = 0;
    const context = createUrbanContext();
    try {
      const categories = new Map<THREE.BufferGeometry, string>();
      context.group.traverse((object) => {
        if (object instanceof THREE.Mesh) categories.set(object.geometry, object.name);
      });
      expect(captureIndexing.pairs.length).toBe(categories.size);
      let originalElements = 0,
        vertices = 0;
      for (const { before, after } of captureIndexing.pairs) {
        const index = after.getIndex()!;
        expect(index).not.toBeNull();
        expect(index.count).toBe(before.getAttribute("position").count);
        originalElements += index.count;
        vertices += after.getAttribute("position").count;
        expect(Object.keys(after.attributes)).toEqual(Object.keys(before.attributes));
        for (const name of Object.keys(before.attributes)) {
          const a = before.getAttribute(name),
            b = after.getAttribute(name);
          expect(b.itemSize).toBe(a.itemSize);
          expect(b.normalized).toBe(a.normalized);
          let maximumError = 0;
          for (let element = 0; element < index.count; element++)
            for (let channel = 0; channel < a.itemSize; channel++)
              maximumError = Math.max(
                maximumError,
                Math.abs(
                  a.array[element * a.itemSize + channel] -
                    b.array[index.getX(element) * b.itemSize + channel],
                ),
              );
          // mergeVertices quantizes all attributes at 1e-6; signed values
          // around zero share one truncation bucket up to two units wide.
          expect(maximumError, categories.get(after) + ":" + name).toBeLessThanOrEqual(2e-6);
        }
      }
      expect(context.metadata.indexCount).toBe(originalElements);
      expect(context.metadata.triangleCount).toBe(originalElements / 3);
      expect(context.metadata.vertexCount).toBe(vertices);
      expect(vertices).toBeLessThan(originalElements * 0.85);
      context.updateLod(900, [95, 55]);
      context.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.name !== "urban-detail") return;
        expect(object.geometry.drawRange.count).toBe(object.userData.persistentDetailIndices);
        expect(object.geometry.drawRange.count % 3).toBe(0);
        expect(object.geometry.drawRange.count).toBeLessThanOrEqual(object.geometry.index!.count);
      });
    } finally {
      context.dispose();
      captureIndexing.active = false;
      captureIndexing.pairs.length = 0;
    }
  });
  it("uses spatial batches and bounded LOD without changing any mesh transform or commercial bounds", () => {
    const context = createUrbanContext({ quality: "detailed" });
    try {
      context.group.updateMatrixWorld(true);
      const matrix = JSON.stringify(context.group.children.map((g) => g.matrixWorld.toArray()));
      const detailedVertices = () => {
        let total = 0;
        context.group.traverse((o) => {
          if (o instanceof THREE.Mesh && o.name === "urban-detail" && o.visible)
            total += Math.min(o.geometry.drawRange.count, elementCount(o.geometry));
        });
        return total;
      };
      context.updateLod(30, [80, 140]);
      const closeVertices = detailedVertices();
      const foliage = context.group.children
        .flatMap((g) => g.children)
        .filter((o) => o.name === "urban-foliage");
      expect(foliage.length).toBe(5);
      context.setQuality("light");
      context.updateLod(500, [95, 55]);
      expect(detailedVertices()).toBeGreaterThan(0);
      expect(detailedVertices()).toBeLessThan(closeVertices);
      expect(foliage.every((o) => o.visible)).toBe(true);
      context.setQuality("detailed");
      context.updateLod(40, [80, 140]);
      expect(detailedVertices()).toBe(closeVertices);
      context.group.updateMatrixWorld(true);
      expect(JSON.stringify(context.group.children.map((g) => g.matrixWorld.toArray()))).toBe(
        matrix,
      );
      expect(context.metadata.spatialBatches).toBe(5);
    } finally {
      context.dispose();
    }
  });
  it("shares final PBR textures through owned clones with preserved atlas shader callbacks and valid facade UVs", () => {
    const surfaces = createSurfaceMaterials({ maps: false });
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const disposeTexture = vi.spyOn(texture, "dispose");
    const shader = vi.fn(),
      cacheKey = () => "urban-final-atlas-fixture";
    for (const source of [surfaces.materials.paintedWall, surfaces.materials.paintedSheet]) {
      source.map = source.normalMap = texture;
      source.onBeforeCompile = shader;
      source.customProgramCacheKey = cacheKey;
    }
    const context = createUrbanContext({ sharedSurfaces: surfaces });
    try {
      const glass = (context.group.getObjectByName("urban-glass") as THREE.Mesh)
        .material as THREE.MeshStandardMaterial;
      expect(glass.color.equals(surfaces.materials.glass.color)).toBe(true);
      expect(glass.roughness).toBeLessThan(0.4);
      surfaces.setSoftwareMode(true);
      context.updateLod(50);
      for (const name of ["urban-walls", "urban-roof", "urban-glass"]) {
        const material = (context.group.getObjectByName(name) as THREE.Mesh)
          .material as THREE.MeshStandardMaterial;
        expect(
          material.normalMap ||
            material.bumpMap ||
            material.roughnessMap ||
            material.aoMap ||
            material.envMap,
        ).toBeNull();
      }
      surfaces.setSoftwareMode(false);
      context.updateLod(50);
      context.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !["urban-walls", "urban-roof"].includes(object.name))
          return;
        const material = object.material as THREE.MeshStandardMaterial;
        expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
        expect(material).not.toBe(surfaces.materials.paintedWall);
        expect(material).not.toBe(surfaces.materials.paintedSheet);
        expect(material.color.getHex()).toBe(0xffffff);
        expect(material.map).toBe(texture);
        expect(material.onBeforeCompile).toBe(shader);
        expect(material.customProgramCacheKey).toBe(cacheKey);
        const uv = object.geometry.getAttribute("uv");
        for (let i = 0; i < elementCount(object.geometry); i += 3) {
          const [a, b, c] = [0, 1, 2].map((j) => vertexIndex(object.geometry, i + j));
          const area =
            (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) -
            (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a));
          expect(Math.abs(area)).toBeGreaterThan(0);
        }
      });
      context.dispose();
      expect(disposeTexture).not.toHaveBeenCalled();
    } finally {
      context.dispose();
      surfaces.dispose();
      texture.dispose();
    }
  });
  it("releases partially prepared batches and owned materials when geometry preparation fails", () => {
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const disposeMaterial = vi.spyOn(THREE.Material.prototype, "dispose");
    const fail = vi
      .spyOn(THREE.BufferGeometry.prototype, "computeVertexNormals")
      .mockImplementationOnce(() => {
        throw new Error("urban-geometry-fixture");
      });
    try {
      expect(() => createUrbanContext()).toThrow("urban-geometry-fixture");
      expect(disposeGeometry).toHaveBeenCalledTimes(1);
      expect(disposeMaterial).toHaveBeenCalledTimes(10);
    } finally {
      fail.mockRestore();
      disposeGeometry.mockRestore();
      disposeMaterial.mockRestore();
    }
  });
  it("disposes owned resources once while preserving borrowed asphalt material", () => {
    const surfaces = createSurfaceMaterials({ maps: false });
    const asphaltDispose = vi.spyOn(surfaces.materials.asphalt, "dispose");
    const context = createUrbanContext({ sharedSurfaces: surfaces });
    const geometrySpies: ReturnType<typeof vi.spyOn>[] = [];
    context.group.traverse((o) => {
      if (o instanceof THREE.Mesh) geometrySpies.push(vi.spyOn(o.geometry, "dispose"));
    });
    context.dispose();
    context.dispose();
    context.updateLod(20);
    context.setQuality("light");
    expect(geometrySpies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(asphaltDispose).not.toHaveBeenCalled();
    expect(context.group.children).toHaveLength(0);
    surfaces.dispose();
    expect(asphaltDispose).toHaveBeenCalledTimes(1);
  });
  it("keeps the field-edge canopy outside parcels and street corridors and bakes contact from the fixed world sun", () => {
    const context = createUrbanContext();
    try {
      const buffer = deriveResidentialBuffer();
      expect(buffer.length).toBeGreaterThanOrEqual(10);
      for (const center of buffer) {
        const disc = Array.from({ length: 32 }, (_, i): [number, number] => [
          center[0] + Math.cos((i * Math.PI) / 16) * 2.2475,
          center[1] + Math.sin((i * Math.PI) / 16) * 2.2475,
        ]);
        expect(urbanPolygonAllowed(disc)).toBe(true);
        for (const polygon of [
          ...context.houses.map((h) => h.parcel),
          ...deriveUrbanRoads().map((r) => deriveRoadRibbon(r.path, r.width + 1.05)),
        ])
          expect(disc.some((point) => pointInPolygon(point, polygon))).toBe(false);
      }
      expect(context.metadata.landscaping.housesWithTrees).toBeGreaterThanOrEqual(24);
      expect(context.metadata.landscaping.pools).toBeGreaterThanOrEqual(4);
      expect(
        context.metadata.architecture.filter((a) => a.landscape.tree?.species === "palm").length,
      ).toBeGreaterThanOrEqual(3);
      const contact = context.group.getObjectByName("urban-contact") as THREE.Mesh;
      const geometry = contact.geometry;
      const positions = geometry.getAttribute("position");
      const shadeAt = (point: [number, number]) => {
        for (let i = 0; i < elementCount(geometry); i += 3)
          if (
            pointInPolygon(
              point,
              [0, 1, 2].map((j) => {
                const v = vertexIndex(geometry, i + j);
                return [positions.getX(v), positions.getZ(v)];
              }),
            )
          )
            return true;
        return false;
      };
      // A mirrored garage/wing must cast from its rendered side of the home,
      // with the world sun unchanged. Canonical metadata alone is insufficient.
      for (const [index, architecture] of context.metadata.architecture.entries()) {
        if (architecture.handedness > 0) continue;
        const house = context.houses[index];
        const expected = deriveUrbanContact(
          [
            {
              center: house.center,
              heading: house.heading,
              structuralVolumes: architecture.structuralVolumes.map((v) => ({
                ...v,
                x0: -v.x1,
                x1: -v.x0,
              })),
            },
          ],
          {
            sunDirection: DAYLIGHT.sunDirection,
            groundElevation: URBAN_CONTEXT.groundY,
            buildingBaseElevation: -0.1,
          },
        );
        for (const cell of expected.cells) {
          const centroid: [number, number] = [
            cell.reduce((sum, p) => sum + p[0], 0) / cell.length,
            cell.reduce((sum, p) => sum + p[1], 0) / cell.length,
          ];
          expect(shadeAt(centroid)).toBe(true);
        }
      }
      const snapshot = JSON.stringify(Array.from(geometry.getAttribute("position").array));
      context.updateLod(30, [130, 140]);
      context.setQuality("light");
      context.updateLod(800, [-40, 100]);
      expect(JSON.stringify(Array.from(geometry.getAttribute("position").array))).toBe(snapshot);
      expect(context.metadata.staticContact.dynamicPasses).toBe(0);
      expect(context.metadata.staticContact.sourceVolumes).toBeGreaterThan(context.houses.length);
    } finally {
      context.dispose();
    }
  });
  it("uses mapped street connections, two continuous circles and separated contextual parcels without replacing the source", () => {
    const before = JSON.stringify(ENTITIES),
      context = createUrbanContext();
    try {
      const road = context.group.getObjectByName("urban-road") as THREE.Mesh;
      const p = road.geometry.getAttribute("position");
      const asphaltAt = (point: [number, number]) => {
        for (let i = 0; i < elementCount(road.geometry); i += 3)
          if (
            pointInPolygon(
              point,
              [0, 1, 2].map((j) => {
                const v = vertexIndex(road.geometry, i + j);
                return [p.getX(v), p.getZ(v)];
              }),
            )
          )
            return true;
        return false;
      };
      for (const x of [50, 80, 110]) {
        expect(asphaltAt([x, 95.81])).toBe(true);
        expect(asphaltAt([x, 102.9])).toBe(true);
        expect(asphaltAt([x, 94.5])).toBe(false);
      }
      const graph = deriveUrbanRoads();
      expect(graph.find((r) => r.id === "campeira")!.connects).toContain("tuparendi");
      for (const id of ["musicanto", "fenasoja", "10-de-agosto"]) {
        const r = graph.find((r) => r.id === id)!;
        expect(r.terminal).toBe(true);
        expect(r.connects).toEqual(["benvenuto"]);
        const end = r.path.at(-1)!;
        expect(asphaltAt([end[0], end[1] + 4])).toBe(false);
      }
      const end = graph.find((r) => r.id === "campeira")!.path.at(-1)!;
      expect(graph.find((r) => r.id === "tuparendi")!.path).toContainEqual(end);
      expect(asphaltAt(end)).toBe(true);
      const paintGeometry = (context.group.getObjectByName("urban-paint") as THREE.Mesh).geometry;
      const paint = paintGeometry.getAttribute("position");
      const paintAt = (point: [number, number]) => {
        for (let i = 0; i < elementCount(paintGeometry); i += 3)
          if (
            pointInPolygon(
              point,
              [0, 1, 2].map((j) => {
                const v = vertexIndex(paintGeometry, i + j);
                return [paint.getX(v), paint.getZ(v)];
              }),
            )
          )
            return true;
        return false;
      };
      // Both directions remain complete across the seam with source asphalt;
      // the north arrow used to be cut by the commercial floor protection.
      for (const side of [-1, 1])
        expect(paintAt([62.36, URBAN_REFERENCE.avenueCenter + (side * 9.75) / 4])).toBe(true);
      for (const r of [URBAN_REFERENCE.roundabout, URBAN_REFERENCE.secondaryJunction]) {
        expect(asphaltAt(r.center)).toBe(false);
        for (let i = 0; i < 200; i++) {
          const angle = (i * Math.PI) / 100;
          expect(
            asphaltAt([
              r.center[0] + Math.cos(angle) * (r.centerlineRadius + r.roadWidth * 0.4),
              r.center[1] + Math.sin(angle) * (r.centerlineRadius + r.roadWidth * 0.4),
            ]),
          ).toBe(true);
        }
      }
      expect(context.metadata.roundabout.center[0]).toBeLessThan(-45);
      expect(context.metadata.secondaryJunction.center[0]).toBeLessThan(
        context.metadata.roundabout.center[0] - 40,
      );
      expect(context.metadata.avenue).toMatchObject({
        shared: true,
        duplicate: false,
        sourceId: "indumoveis:road:benvenuto",
        southEdge: 103.05,
      });
      expect(context.houses.filter((h) => h.cluster === 3)).toHaveLength(6);
      expect(context.houses.filter((h) => h.cluster === 4)).toHaveLength(2);
      expect(new Set(context.houses.map((h) => h.form)).size).toBe(6);
      expect(JSON.stringify(ENTITIES)).toBe(before);
    } finally {
      context.dispose();
    }
  });
});
