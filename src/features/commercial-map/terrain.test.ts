import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES, MAP_BOUNDS, type MapEntity, type Point } from "./data/territory";
import { pointInPolygon, signedPolygonArea } from "./geometry";
import { createTerrain, deriveProtectedGround, deriveTerrainTopology, TERRAIN } from "./terrain";

const extent = { minX: -1000, minY: -1000, maxX: 1200, maxY: 1200 };
const area = (cells: readonly Point[][]) =>
  cells.reduce((sum, cell) => sum + Math.abs(signedPolygonArea(cell)), 0);
const inside = (point: Point, cells: readonly Point[][]) =>
  cells.some((cell) => pointInPolygon(point, cell));

describe("continuous source-protected commercial map terrain", () => {
  it("protects source polygons and existing internal circulation without keeping the rectangular presentation margin", () => {
    const before = JSON.stringify(ENTITIES);
    const protectedCells = deriveProtectedGround(ENTITIES);
    const topology = deriveTerrainTopology(protectedCells, extent);
    for (const entity of ENTITIES) {
      const samples: Point[] = [
        entity.anchor,
        ...entity.polygon,
        ...entity.polygon.map(([x, y]): Point => [
          x * 0.99 + entity.anchor[0] * 0.01,
          y * 0.99 + entity.anchor[1] * 0.01,
        ]),
      ];
      for (const point of samples) expect(inside(point, protectedCells), entity.id).toBe(true);
      // Interior points must never receive any external albedo, roughness or bump.
      expect(inside(entity.anchor, topology.exteriorCells), entity.id).toBe(false);
    }
    // Unclassified paths between P14/P12 and between the pavilions/avenue were
    // legitimate visible floors, despite not having their own entity identity.
    expect(inside([60, 80], protectedCells)).toBe(true);
    expect(inside([80, 92], protectedCells)).toBe(true);
    // Concave southwest and northeast source margins become soil, not a white
    // rectangle inferred from the enclosing commercial bounds.
    expect(inside([10, 90], protectedCells)).toBe(false);
    expect(inside([180, 10], protectedCells)).toBe(false);
    expect(inside([MAP_BOUNDS.minX - 8, MAP_BOUNDS.minY - 8], topology.exteriorCells)).toBe(true);
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });

  it("forms an exact nonoverlapping partition with continuous source seams and unchanged slanted edges", () => {
    const topology = deriveTerrainTopology(deriveProtectedGround(ENTITIES), extent);
    const total = (extent.maxX - extent.minX) * (extent.maxY - extent.minY);
    expect(area(topology.protectedCells) + area(topology.exteriorCells)).toBeCloseTo(total, 5);
    // Dense, offset probes do not land on slab boundaries; every probe belongs
    // to exactly one region, including the inclined entrance and eastern edge.
    for (let x = 4.17; x < 188; x += 2.19)
      for (let y = 6.23; y < 104; y += 2.37) {
        const hits = [...topology.protectedCells, ...topology.exteriorCells].filter((cell) =>
          pointInPolygon([x, y], cell),
        );
        expect(hits).toHaveLength(1);
      }
    for (const [a, b, c, d] of topology.protectedCells) {
      expect(
        topology.exteriorCells.some(
          (cell) =>
            cell.some(([x, y]) => x === a[0] && y === a[1]) &&
            cell.some(([x, y]) => x === b[0] && y === b[1]),
        ),
      ).toBe(true);
      expect(
        topology.exteriorCells.some(
          (cell) =>
            cell.some(([x, y]) => x === c[0] && y === c[1]) &&
            cell.some(([x, y]) => x === d[0] && y === d[1]),
        ),
      ).toBe(true);
    }
  });

  it("uses source outlines instead of a rectangle even for a new concave schematic", () => {
    const entity: MapEntity = {
      id: "source",
      kind: "lot",
      polygon: [
        [1, 1],
        [5, 1],
        [5, 3],
        [3, 3],
        [3, 5],
        [1, 5],
      ],
      anchor: [2, 2],
      label: "source",
      location: "test",
      source: "test",
      confidence: "test",
    };
    const cells = deriveProtectedGround([entity]);
    expect(area(cells)).toBe(12);
    expect(inside([4, 4], cells)).toBe(false);
    expect(inside([2, 4], cells)).toBe(true);
  });

  it("uses exactly two matte batches, upward normals and world-anchored UVs at any terrain size", () => {
    const terrain = createTerrain(ENTITIES, { extent, maps: false });
    try {
      expect(terrain.group.children).toHaveLength(2);
      expect(terrain.material).toBeInstanceOf(THREE.MeshLambertMaterial);
      expect(terrain.material.envMap).toBeNull();
      expect(terrain.material.envMapIntensity).toBe(0);
      for (const child of terrain.group.children) {
        const mesh = child as THREE.Mesh;
        const positions = mesh.geometry.getAttribute("position"),
          normals = mesh.geometry.getAttribute("normal"),
          uv = mesh.geometry.getAttribute("uv");
        for (let i = 0; i < positions.count; i++) {
          expect(positions.getY(i)).toBeCloseTo(
            mesh.name === "external-soil" ? TERRAIN.baseElevation : TERRAIN.elevation,
            6,
          );
          expect(normals.getY(i)).toBeCloseTo(1, 6);
          const tile = mesh.name === "external-soil" ? 1 : 2.8;
          expect(uv.getX(i)).toBeCloseTo(positions.getX(i) / tile, 5);
          expect(uv.getY(i)).toBeCloseTo(positions.getZ(i) / tile, 5);
        }
        expect(mesh.userData.entityId).toBeUndefined();
        expect(mesh.castShadow).toBe(false);
        expect(mesh.receiveShadow).toBe(mesh.name === "preserved-circulation-floor");
      }
      const protectedBefore = JSON.stringify(terrain.topology.protectedCells);
      terrain.setExtent({ minX: -2000, minY: -2000, maxX: 2200, maxY: 2200 });
      expect(JSON.stringify(terrain.topology.protectedCells)).toBe(protectedBefore);
      const mesh = terrain.group.children[0] as THREE.Mesh;
      const positions = mesh.geometry.getAttribute("position"),
        uv = mesh.geometry.getAttribute("uv");
      for (let i = 0; i < positions.count; i++) {
        expect(uv.getX(i)).toBe(positions.getX(i));
        expect(uv.getY(i)).toBe(positions.getZ(i));
      }
    } finally {
      terrain.dispose();
    }
  });

  it("shares the gray PBR circulation material without taking ownership of its resources", () => {
    const material = new THREE.MeshStandardMaterial({ color: "#989f9b", vertexColors: true });
    const disposed = vi.spyOn(material, "dispose");
    const terrain = createTerrain(ENTITIES, { extent, maps: false, foundationMaterial: material });
    const floor = terrain.group.getObjectByName("preserved-circulation-floor") as THREE.Mesh;
    expect(floor.material).toBe(material);
    const colors = floor.geometry.getAttribute("color");
    for (let i = 0; i < colors.count; i++) {
      expect([colors.getX(i), colors.getY(i), colors.getZ(i)]).toEqual([1, 1, 1]);
    }
    terrain.dispose();
    terrain.dispose();
    expect(disposed).not.toHaveBeenCalled();
    material.dispose();
  });

  it("keeps the large underlay behind preserved circulation without modifying shared floor depth or geometry", () => {
    const shared = new THREE.MeshStandardMaterial({ color: "#989f9b" });
    const before = JSON.stringify(ENTITIES);
    const terrain = createTerrain(ENTITIES, {
      extent: { minX: -5263, minY: -5181, maxX: 5327, maxY: 5333 },
      maps: false,
      foundationMaterial: shared,
    });
    try {
      const soil = terrain.group.getObjectByName("external-soil") as THREE.Mesh;
      const floor = terrain.group.getObjectByName("preserved-circulation-floor") as THREE.Mesh;
      const floorGeometry = floor.geometry;
      const positions = Array.from(floorGeometry.getAttribute("position").array);
      // These visual witnesses previously leaked green despite lying in one
      // intact concrete cell, without any source landscape at either location.
      for (const witness of [
        [55.9323, 81.3789],
        [58.9614, 76.2451],
      ] as Point[]) {
        expect(inside(witness, terrain.topology.protectedCells)).toBe(true);
        expect(ENTITIES.some((entity) => pointInPolygon(witness, entity.polygon))).toBe(false);
      }
      expect(soil.material).toBe(terrain.material);
      expect(terrain.material.polygonOffset).toBe(true);
      expect(terrain.material.polygonOffsetFactor).toBeGreaterThan(0);
      expect(terrain.material.polygonOffsetUnits).toBeGreaterThan(0);
      for (const tier of ["light", "balanced", "detailed"] as const) terrain.setQuality(tier);
      terrain.setExtent({ minX: -6000, minY: -6000, maxX: 6000, maxY: 6000 });
      expect(floor.material).toBe(shared);
      expect(shared.polygonOffset).toBe(false);
      expect(shared.polygonOffsetFactor).toBe(0);
      expect(shared.polygonOffsetUnits).toBe(0);
      expect(shared.depthWrite).toBe(true);
      expect(floor.geometry).toBe(floorGeometry);
      expect(Array.from(floor.geometry.getAttribute("position").array)).toEqual(positions);
      expect(terrain.material.polygonOffset).toBe(true);
      expect(JSON.stringify(ENTITIES)).toBe(before);
    } finally {
      terrain.dispose();
      shared.dispose();
    }
  });

  it("cannot intercept commercial picking even if accidentally added to raycaster candidates", () => {
    const terrain = createTerrain(ENTITIES, { extent, maps: false });
    try {
      terrain.group.updateMatrixWorld(true);
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(-50, 10, -50),
        new THREE.Vector3(0, -1, 0),
      );
      expect(raycaster.intersectObject(terrain.group, true)).toHaveLength(0);
      raycaster.ray.origin.set(90, 10, 50);
      expect(raycaster.intersectObject(terrain.group, true)).toHaveLength(0);
    } finally {
      terrain.dispose();
    }
  });

  it("prepares compact deterministic mipmapped material once and keeps light quality coherent", () => {
    const a = createTerrain(ENTITIES, { extent }),
      b = createTerrain(ENTITIES, { extent });
    try {
      expect(a.textures.map((texture) => texture.image.width)).toEqual([512, 256]);
      expect(a.textureBytes).toBeLessThan(1.7 * 1024 * 1024);
      for (let i = 0; i < a.textures.length; i++) {
        expect(a.textures[i].image.data).toEqual(b.textures[i].image.data);
        expect(a.textures[i].generateMipmaps).toBe(true);
        expect(a.textures[i].minFilter).toBe(THREE.LinearMipmapLinearFilter);
      }
      expect(a.textures[0].colorSpace).toBe(THREE.SRGBColorSpace);
      expect(a.textures[1].colorSpace).toBe(THREE.NoColorSpace);
      a.setQuality("detailed");
      expect(a.material.bumpMap).toBe(a.textures[1]);
      const originalMap = a.material.map;
      a.updateDetail(20);
      const detailedBump = a.material.bumpScale;
      a.setQuality("light");
      expect(a.material.bumpScale).toBeLessThan(detailedBump);
      expect(a.material.map).toBe(originalMap);
      a.updateDetail(200);
      expect(a.material.bumpScale).toBe(0);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it("retains coloured soil when an optional map fails and disposes partial allocations", () => {
    const update = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, "needsUpdate")!.set!;
    const disposed = vi.spyOn(THREE.Texture.prototype, "dispose");
    let allocations = 0;
    const textureUpdate = vi
      .spyOn(THREE.Texture.prototype, "needsUpdate", "set")
      .mockImplementation(function (this: THREE.Texture, value: boolean) {
        if (++allocations === 2) throw new Error("simulated terrain texture failure");
        update.call(this, value);
      });
    try {
      const terrain = createTerrain(ENTITIES, { extent });
      expect(disposed).toHaveBeenCalledTimes(2);
      expect(terrain.textures).toHaveLength(0);
      expect(terrain.material.map).toBeNull();
      expect(terrain.material.color.getHexString()).toBe("aab78b");
      expect(terrain.group.children).toHaveLength(2);
      terrain.dispose();
    } finally {
      textureUpdate.mockRestore();
      disposed.mockRestore();
    }
  });

  it("releases replaced extent geometry and all resources exactly once on repeated disposal", () => {
    const terrain = createTerrain(ENTITIES, { extent });
    const original = (terrain.group.children[0] as THREE.Mesh).geometry;
    const originalDisposed = vi.fn(),
      materialDisposed = vi.fn(),
      textureDisposed = vi.fn();
    original.addEventListener("dispose", originalDisposed);
    terrain.material.addEventListener("dispose", materialDisposed);
    terrain.textures[0].addEventListener("dispose", textureDisposed);
    terrain.setExtent({ ...extent, maxX: extent.maxX + 100 });
    expect(originalDisposed).toHaveBeenCalledTimes(1);
    terrain.dispose();
    terrain.dispose();
    expect(originalDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(textureDisposed).toHaveBeenCalledTimes(1);
    expect(terrain.group.children).toHaveLength(0);
  });

  it.each([true, false])(
    "keeps atmosphere uniforms and protected resources stable across viewport resize (maps=%s)",
    (maps) => {
      const terrain = createTerrain(ENTITIES, { extent, maps });
      try {
        const material = terrain.material;
        const floor = terrain.group.children[1] as THREE.Mesh;
        const floorGeometry = floor.geometry;
        const mapsBefore = [...terrain.textures];
        const version = material.version;
        const shader = {
          uniforms: {},
          vertexShader: "#include <worldpos_vertex>",
          fragmentShader: "#include <opaque_fragment>",
        } as Parameters<typeof material.onBeforeCompile>[0];
        material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
        const uniforms = {
          center: shader.uniforms.terrainHorizonCenter,
          range: shader.uniforms.terrainHorizonRange,
          color: shader.uniforms.terrainHorizonColor,
        };
        terrain.setAtmosphere({ center: [95.5, 55], start: 500, end: 1000 }, "#dce9ec");
        expect(uniforms.center.value.toArray()).toEqual([95.5, 55]);
        expect(uniforms.range.value.toArray()).toEqual([500, 1000]);
        terrain.setExtent({ minX: -2200, minY: -1800, maxX: 2300, maxY: 2400 });
        terrain.setAtmosphere({ center: [95.5, 55], start: 700, end: 1400 }, "#dce9ec");
        expect(shader.uniforms.terrainHorizonCenter).toBe(uniforms.center);
        expect(shader.uniforms.terrainHorizonRange).toBe(uniforms.range);
        expect(shader.uniforms.terrainHorizonColor).toBe(uniforms.color);
        expect(uniforms.range.value.toArray()).toEqual([700, 1400]);
        expect(uniforms.color.value.getHexString()).toBe("dce9ec");
        expect(terrain.material).toBe(material);
        expect(material.version).toBe(version);
        expect(floor.geometry).toBe(floorGeometry);
        terrain.textures.forEach((texture, index) => expect(texture).toBe(mapsBefore[index]));
      } finally {
        terrain.dispose();
      }
    },
  );

  it("starts with only a one-pixel coloured map and prepares rich maps once without changing the albedo shader variant", () => {
    const update = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, "needsUpdate")!.set!;
    const allocations: number[] = [];
    const textureUpdate = vi
      .spyOn(THREE.Texture.prototype, "needsUpdate", "set")
      .mockImplementation(function (this: THREE.Texture, value: boolean) {
        allocations.push((this.image as { width: number }).width);
        update.call(this, value);
      });
    let terrain: ReturnType<typeof createTerrain> | undefined;
    try {
      terrain = createTerrain(ENTITIES, { extent, deferMaps: true });
      const material = terrain.material;
      const version = material.version;
      const placeholder = material.map as THREE.DataTexture;
      const placeholderDisposed = vi.fn();
      placeholder.addEventListener("dispose", placeholderDisposed);
      expect(allocations).toEqual([1]);
      expect(terrain.textures).toHaveLength(0);
      expect(terrain.textureBytes).toBe(4);
      expect(placeholder.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(Array.from(placeholder.image.data!)).toEqual([170, 183, 139, 255]);
      expect(material.color.getHexString()).toBe("ffffff");
      expect(terrain.prepareMaps()).toBe(true);
      expect(allocations).toEqual([1, 512, 256]);
      expect(terrain.textures).toHaveLength(2);
      expect(terrain.textureBytes).toBe(1_747_628);
      expect(terrain.material).toBe(material);
      expect(material.map).toBe(terrain.textures[0]);
      expect(material.version).toBe(version);
      expect(placeholderDisposed).toHaveBeenCalledTimes(1);
      expect(terrain.prepareMaps()).toBe(true);
      expect(allocations).toEqual([1, 512, 256]);
      terrain.dispose();
      expect(placeholderDisposed).toHaveBeenCalledTimes(1);
    } finally {
      terrain?.dispose();
      textureUpdate.mockRestore();
    }
  });

  it("does not allocate rich maps after unmount or when optional maps are disabled", () => {
    const terrain = createTerrain(ENTITIES, { extent, deferMaps: true });
    const placeholderDisposed = vi.fn();
    terrain.material.map!.addEventListener("dispose", placeholderDisposed);
    terrain.dispose();
    const textureUpdate = vi.spyOn(THREE.Texture.prototype, "needsUpdate", "set");
    try {
      expect(terrain.prepareMaps()).toBe(false);
      expect(textureUpdate).not.toHaveBeenCalled();
      expect(placeholderDisposed).toHaveBeenCalledTimes(1);
      const disabled = createTerrain(ENTITIES, { extent, maps: false, deferMaps: true });
      expect(disabled.prepareMaps()).toBe(false);
      expect(disabled.textureBytes).toBe(0);
      expect(disabled.material.map).toBeNull();
      expect(textureUpdate).not.toHaveBeenCalled();
      disabled.dispose();
    } finally {
      textureUpdate.mockRestore();
    }
  });

  it("keeps the pending map and releases partial rich maps if deferred preparation fails", () => {
    const terrain = createTerrain(ENTITIES, { extent, deferMaps: true });
    const placeholder = terrain.material.map;
    const version = terrain.material.version;
    const update = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, "needsUpdate")!.set!;
    const disposed = vi.spyOn(THREE.Texture.prototype, "dispose");
    let calls = 0;
    const textureUpdate = vi
      .spyOn(THREE.Texture.prototype, "needsUpdate", "set")
      .mockImplementation(function (this: THREE.Texture, value: boolean) {
        if (++calls === 2) throw new Error("simulated deferred map preparation failure");
        update.call(this, value);
      });
    try {
      expect(terrain.prepareMaps()).toBe(false);
      expect(disposed).toHaveBeenCalledTimes(2);
      expect(terrain.textureBytes).toBe(4);
      expect(terrain.textures).toHaveLength(0);
      expect(terrain.material.map).toBe(placeholder);
      expect(terrain.material.version).toBe(version);
      expect(terrain.prepareMaps()).toBe(false);
      expect(calls).toBe(2);
      terrain.dispose();
      expect(disposed).toHaveBeenCalledTimes(3);
    } finally {
      terrain.dispose();
      textureUpdate.mockRestore();
      disposed.mockRestore();
    }
  });

  it("reuses only the fixed CPU pixel buffers on warm reopens while each renderer owns independent GPU textures", () => {
    const first = createTerrain(ENTITIES, { extent });
    const second = createTerrain(ENTITIES, { extent, deferMaps: true });
    const firstDisposed = vi.fn(),
      secondDisposed = vi.fn();
    try {
      second.prepareMaps();
      first.textures.forEach((texture, index) => {
        expect(second.textures[index]).not.toBe(texture);
        expect(second.textures[index].image.data).toBe(texture.image.data);
        texture.addEventListener("dispose", firstDisposed);
        second.textures[index].addEventListener("dispose", secondDisposed);
      });
      expect(
        first.textures.reduce((bytes, texture) => bytes + texture.image.data!.byteLength, 0),
      ).toBe(1_310_720);
      first.dispose();
      expect(firstDisposed).toHaveBeenCalledTimes(2);
      expect(secondDisposed).not.toHaveBeenCalled();
      expect(second.material.map).toBe(second.textures[0]);
      second.dispose();
      expect(secondDisposed).toHaveBeenCalledTimes(2);
    } finally {
      first.dispose();
      second.dispose();
    }
  });
});
