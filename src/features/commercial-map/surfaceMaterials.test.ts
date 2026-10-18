import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { buildArchitecture } from "./architecture";
import { createPavement } from "./pavement";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { VISUAL_THEME } from "./visualTheme";
import type { PbrAtlas } from "./pbrAtlas";

const atlasLoad = vi.hoisted(() => vi.fn());
vi.mock("./pbrAtlas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pbrAtlas")>()),
  loadPbrAtlas: atlasLoad,
}));

function testAtlas(): PbrAtlas {
  const textures = [0, 1, 2].map(
    () => new THREE.DataTexture(new Uint8Array(64), 4, 4),
  ) as PbrAtlas["textures"];
  return { textures, textureBytes: 192, width: 512, compressed: true };
}

describe("renderer-owned semantic surface materials", () => {
  it.each([true, false])(
    "keeps concrete matte grey and distinct from white paint/facades with maps=%s",
    (maps) => {
      const surfaces = createSurfaceMaterials({ maps });
      try {
        const { concrete, whitePaint, paintedWall, paintedSheet } = surfaces.materials;
        const luminance = (color: THREE.Color) =>
          color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
        expect(luminance(concrete.color)).toBeLessThan(luminance(whitePaint.color) * 0.5);
        expect(luminance(concrete.color)).toBeLessThan(luminance(paintedWall.color) * 0.5);
        expect(
          Math.max(concrete.color.r, concrete.color.g, concrete.color.b) -
            Math.min(concrete.color.r, concrete.color.g, concrete.color.b),
        ).toBeLessThan(0.04);
        expect(concrete.metalness).toBe(0);
        expect(concrete.roughness).toBeGreaterThanOrEqual(0.9);
        expect(whitePaint.color.getHexString()).toBe("f3f1e6");
        expect(paintedWall.color.getHexString()).toBe(
          new THREE.Color(VISUAL_THEME.wall).getHexString(),
        );
        expect(paintedSheet.color.getHexString()).toBe(
          new THREE.Color(VISUAL_THEME.roof).getHexString(),
        );
      } finally {
        surfaces.dispose();
      }
    },
  );
  it("loads a complete atlas once after readiness and shares its actual normal/AO/roughness maps without touching glass or world geometry", async () => {
    const atlas = testAtlas();
    atlasLoad.mockReset().mockResolvedValue(atlas);
    const surfaces = createSurfaceMaterials();
    const fallbackDisposed = vi.fn();
    surfaces.textures.forEach((texture) => texture.addEventListener("dispose", fallbackDisposed));
    const first = surfaces.prepareCompressed({} as THREE.WebGLRenderer);
    expect(surfaces.prepareCompressed({} as THREE.WebGLRenderer)).toBe(first);
    const result = await first;
    expect(result.loaded).toBe(true);
    expect(result.textureBytes).toBe(192);
    expect(atlasLoad).toHaveBeenCalledTimes(1);
    expect(fallbackDisposed).toHaveBeenCalledTimes(4);
    for (const [family, material] of Object.entries(surfaces.materials)) {
      if (family === "glass") {
        expect(material.map).toBeNull();
        expect(material.normalMap).toBeNull();
        continue;
      }
      expect(material.map).toBe(atlas.textures[0]);
      expect(material.normalMap).toBe(atlas.textures[1]);
      expect(material.aoMap).toBe(atlas.textures[2]);
      expect(material.roughnessMap).toBe(material.aoMap);
      expect(material.bumpMap).toBeNull();
      expect(material.aoMapIntensity).toBeGreaterThan(0);
      expect(material.normalScale.x).toBeGreaterThan(0);
    }
    const material = surfaces.materials.paintedSheet;
    const version = material.version;
    surfaces.updateDetail(200);
    expect(material.normalScale.length()).toBe(0);
    surfaces.setQuality("light");
    surfaces.updateDetail(20);
    expect(material.normalScale.x).toBeGreaterThan(0);
    expect(material.version).toBe(version);
    surfaces.dispose();
  });

  it("keeps all procedural maps on optional atlas failure and does not retry or fetch when maps are disabled", async () => {
    atlasLoad.mockReset().mockRejectedValue(new Error("atlas download failed"));
    const surfaces = createSurfaceMaterials();
    const before = [...surfaces.textures];
    const result = await surfaces.prepareCompressed({} as THREE.WebGLRenderer);
    expect(result.loaded).toBe(false);
    expect(result.source).toBe("procedural");
    expect(surfaces.textures).toEqual(before);
    expect(surfaces.materials.paintedSheet.normalMap).toBeNull();
    await surfaces.prepareCompressed({} as THREE.WebGLRenderer);
    expect(atlasLoad).toHaveBeenCalledTimes(1);
    surfaces.dispose();
    const disabled = createSurfaceMaterials({ maps: false });
    expect((await disabled.prepareCompressed({} as THREE.WebGLRenderer)).reason).toBe(
      "maps-disabled",
    );
    expect(atlasLoad).toHaveBeenCalledTimes(1);
    disabled.dispose();
  });

  it("aborts on unmount and disposes a late atlas without binding it to disposed materials", async () => {
    const atlas = testAtlas();
    let resolve: (atlas: PbrAtlas) => void = () => {};
    atlasLoad.mockReset().mockImplementation(
      () =>
        new Promise<PbrAtlas>((done) => {
          resolve = done;
        }),
    );
    const surfaces = createSurfaceMaterials();
    const preparation = surfaces.prepareCompressed({} as THREE.WebGLRenderer);
    const map = surfaces.materials.concrete.map;
    const disposed = vi.fn();
    atlas.textures.forEach((texture) => texture.addEventListener("dispose", disposed));
    surfaces.dispose();
    surfaces.dispose();
    expect(atlasLoad.mock.calls[0][2].aborted).toBe(true);
    resolve(atlas);
    expect((await preparation).loaded).toBe(false);
    expect(disposed).toHaveBeenCalledTimes(3);
    expect(surfaces.materials.concrete.map).toBe(map);
  });

  it("waits for the existing controller to become idle before introducing the normal/AO shader variant", async () => {
    vi.useFakeTimers();
    const atlas = testAtlas();
    atlasLoad.mockReset().mockResolvedValue(atlas);
    const surfaces = createSurfaceMaterials();
    const original = surfaces.materials.concrete.map;
    let idle = false;
    const preparation = surfaces.prepareCompressed({} as THREE.WebGLRenderer, {
      canCommit: () => idle,
    });
    try {
      await Promise.resolve();
      expect(surfaces.materials.concrete.map).toBe(original);
      expect(surfaces.materials.concrete.normalMap).toBeNull();
      idle = true;
      await vi.advanceTimersByTimeAsync(80);
      expect((await preparation).loaded).toBe(true);
      expect(surfaces.materials.concrete.normalMap).toBe(atlas.textures[1]);
    } finally {
      surfaces.dispose();
      vi.useRealTimers();
    }
  });
  it("binds the shared daylight explicitly so per-family intensities survive renderer scene defaults", () => {
    const surfaces = createSurfaceMaterials({ maps: false });
    const environment = new THREE.Texture();
    const textureDisposed = vi.fn();
    environment.addEventListener("dispose", textureDisposed);
    surfaces.setEnvironment(environment);
    const version = surfaces.materials.glass.version;
    surfaces.setEnvironment(environment);
    expect(surfaces.materials.glass.version).toBe(version);
    expect(surfaces.materials.glass.envMap).toBe(environment);
    expect(surfaces.materials.glass.envMapIntensity).toBeGreaterThan(
      surfaces.materials.asphalt.envMapIntensity,
    );
    surfaces.setEnvironment(null);
    expect(surfaces.materials.glass.envMap).toBeNull();
    surfaces.dispose();
    expect(textureDisposed).not.toHaveBeenCalled();
    environment.dispose();
  });
  it("keeps semantic local materials usable when optional surface maps are unavailable", () => {
    const surfaces = createSurfaceMaterials({ maps: false });
    try {
      expect(surfaces.textures).toHaveLength(0);
      expect(surfaces.textureBytes).toBe(0);
      surfaces.setQuality("light");
      for (const [family, material] of Object.entries(surfaces.materials)) {
        expect(material.map).toBeNull();
        expect(material.bumpMap).toBeNull();
        expect(material.roughnessMap).toBeNull();
        expect(material.color.getHex()).toBeGreaterThan(0);
        if (family !== "grass") expect(material.envMapIntensity).toBeGreaterThan(0);
        expect(material.envMapIntensity).toBeLessThan(0.5);
      }
      expect(surfaces.materials.paintedSheet).not.toBe(surfaces.materials.paintedWall);
      expect(surfaces.materials.paintedSheet.color.getHex()).not.toBe(
        surfaces.materials.paintedWall.color.getHex(),
      );
    } finally {
      surfaces.dispose();
    }
  });

  it("disposes partially prepared maps and retains the same colour fallback after a texture failure", () => {
    const update = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, "needsUpdate")!.set!;
    let allocations = 0;
    const dispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    const textureUpdate = vi
      .spyOn(THREE.Texture.prototype, "needsUpdate", "set")
      .mockImplementation(function (this: THREE.Texture, value: boolean) {
        allocations++;
        if (allocations === 2) throw new Error("simulated texture preparation failure");
        update.call(this, value);
      });
    try {
      const surfaces = createSurfaceMaterials();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(surfaces.textureBytes).toBe(0);
      expect(surfaces.textures).toHaveLength(0);
      expect(surfaces.materials.asphalt.map).toBeNull();
      expect(surfaces.materials.asphalt.color.getHex()).toBeGreaterThan(0);
      surfaces.dispose();
    } finally {
      textureUpdate.mockRestore();
      dispose.mockRestore();
    }
  });

  it("keeps local albedo in sRGB and roughness/relief as linear data with deterministic mipmapped maps", () => {
    const a = createSurfaceMaterials(),
      b = createSurfaceMaterials();
    try {
      const { paintedWall, concrete, asphalt, paintedSheet, glass, exposedMetal } = a.materials;
      expect(paintedWall.map).toBe(concrete.map);
      expect(asphalt.map).toBe(concrete.map);
      expect(paintedWall.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(paintedSheet.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(paintedSheet.bumpMap!.colorSpace).toBe(THREE.NoColorSpace);
      expect(asphalt.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
      expect(exposedMetal.metalness).toBeGreaterThan(paintedSheet.metalness);
      expect(asphalt.metalness).toBe(0);
      expect(glass.transparent).toBe(false);
      for (let i = 0; i < a.textures.length; i++) {
        const texture = a.textures[i] as THREE.DataTexture;
        expect(texture.image.width).toBe(128);
        expect(texture.generateMipmaps).toBe(true);
        expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        expect(texture.wrapS).toBe(THREE.RepeatWrapping);
        expect(texture.image.data).toEqual((b.textures[i] as THREE.DataTexture).image.data);
      }
      expect(a.textureBytes).toBe(Math.ceil((128 ** 2 * 4 * 4) / 3) * 4);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it("retains moderate daylight reflections in light and fades relief without recreating resources", () => {
    const surfaces = createSurfaceMaterials();
    try {
      const material = surfaces.materials.paintedSheet;
      const map = material.map;
      surfaces.setQuality("detailed");
      surfaces.updateDetail(20);
      expect(material.bumpScale).toBeGreaterThan(0);
      expect(material.envMapIntensity).toBeGreaterThan(0);
      surfaces.updateDetail(200);
      expect(material.bumpScale).toBe(0);
      surfaces.setQuality("light");
      surfaces.updateDetail(20);
      expect(material.envMapIntensity).toBeGreaterThan(0);
      expect(material.envMapIntensity).toBeLessThan(surfaces.materials.glass.envMapIntensity);
      expect(material.bumpScale).toBeGreaterThan(0);
      expect(surfaces.materials.paintedSheet).toBe(material);
      expect(material.map).toBe(map);
      expect(material.color.getHex()).not.toBe(0);
    } finally {
      surfaces.dispose();
    }
  });

  it("shares exact maps/materials across architecture and pavement with one explicit disposal owner", () => {
    const surfaces = createSurfaceMaterials();
    const model = buildArchitecture(ENTITIES, surfaces);
    const pavement = createPavement(ENTITIES, surfaces);
    const materialDisposed = vi.fn(),
      textureDisposed = vi.fn();
    surfaces.materials.concrete.addEventListener("dispose", materialDisposed);
    surfaces.textures[0].addEventListener("dispose", textureDisposed);
    const floor = model.group.children.find(
      (child) => child.name === "floors-contact",
    ) as THREE.Mesh;
    expect(floor.material).toBe((pavement.group.children[1] as THREE.Mesh).material);
    expect(model.textureBytes + pavement.textureBytes).toBe(0);
    expect(pavement.resources.every((resource) => resource instanceof THREE.BufferGeometry)).toBe(
      true,
    );
    model.dispose();
    pavement.resources.forEach((resource) => resource.dispose());
    expect(materialDisposed).not.toHaveBeenCalled();
    expect(textureDisposed).not.toHaveBeenCalled();
    surfaces.dispose();
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(textureDisposed).toHaveBeenCalledTimes(1);
  });

  it("omits actual optional shader maps in software while preserving material identity, albedo and physical properties", () => {
    const surfaces = createSurfaceMaterials({ software: true });
    const material = surfaces.materials.concrete;
    const original = {
      material,
      albedo: material.map,
      color: material.color.getHex(),
      roughness: material.roughness,
      metalness: material.metalness,
    };
    const textureDisposed = vi.fn();
    surfaces.textures.forEach((t) => t.addEventListener("dispose", textureDisposed));
    try {
      for (const m of Object.values(surfaces.materials)) {
        expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
        for (const key of ["normalMap", "bumpMap", "roughnessMap", "aoMap", "envMap"] as const)
          expect(m[key]).toBeNull();
      }
      expect(material.map).not.toBeNull();
      const softwareVersion = material.version;
      surfaces.setSoftwareMode(true);
      surfaces.setQuality("detailed");
      surfaces.updateDetail(15);
      expect(material.version).toBe(softwareVersion);
      surfaces.setSoftwareMode(false);
      expect(material.bumpMap).toBe(surfaces.textures[1]);
      expect(material.roughnessMap).toBe(surfaces.textures[1]);
      expect({
        material: surfaces.materials.concrete,
        albedo: material.map,
        color: material.color.getHex(),
        roughness: material.roughness,
        metalness: material.metalness,
      }).toEqual(original);
      expect(textureDisposed).not.toHaveBeenCalled();
      surfaces.setSoftwareMode(true);
      expect(material.bumpMap).toBeNull();
      expect(material.roughnessMap).toBeNull();
      surfaces.dispose();
      surfaces.dispose();
      expect(textureDisposed).toHaveBeenCalledTimes(4);
    } finally {
      surfaces.dispose();
    }
  });

  it("commits an atlas during software mode, retains complete maps for manual restore and owns them exactly once", async () => {
    const atlas = testAtlas();
    atlasLoad.mockReset().mockResolvedValue(atlas);
    const surfaces = createSurfaceMaterials({ software: true });
    const fallbackDisposed = vi.fn(),
      atlasDisposed = vi.fn();
    surfaces.textures.forEach((t) => t.addEventListener("dispose", fallbackDisposed));
    atlas.textures.forEach((t) => t.addEventListener("dispose", atlasDisposed));
    const environment = new THREE.Texture(),
      environmentDisposed = vi.spyOn(environment, "dispose");
    try {
      surfaces.setEnvironment(environment);
      expect((await surfaces.prepareCompressed({} as THREE.WebGLRenderer)).loaded).toBe(true);
      expect(fallbackDisposed).toHaveBeenCalledTimes(4);
      expect(atlasDisposed).not.toHaveBeenCalled();
      for (const [family, m] of Object.entries(surfaces.materials)) {
        if (family !== "glass") expect(m.map).toBe(atlas.textures[0]);
        for (const key of ["normalMap", "bumpMap", "roughnessMap", "aoMap", "envMap"] as const)
          expect(m[key]).toBeNull();
      }
      surfaces.setSoftwareMode(false);
      for (const [family, m] of Object.entries(surfaces.materials)) {
        if (family !== "glass") {
          expect(m.normalMap).toBe(atlas.textures[1]);
          expect(m.aoMap).toBe(atlas.textures[2]);
          expect(m.roughnessMap).toBe(atlas.textures[2]);
        }
        if (family !== "grass") expect(m.envMap).toBe(environment);
      }
      surfaces.setSoftwareMode(true);
      surfaces.dispose();
      surfaces.dispose();
      expect(atlasDisposed).toHaveBeenCalledTimes(3);
      expect(environmentDisposed).not.toHaveBeenCalled();
    } finally {
      surfaces.dispose();
      environment.dispose();
    }
  });

  it("preserves latest environment and full maps when software starts after the atlas or changes during preparation", async () => {
    const atlas = testAtlas();
    let finish: (a: PbrAtlas) => void = () => {};
    atlasLoad.mockReset().mockImplementation(
      () =>
        new Promise<PbrAtlas>((resolve) => {
          finish = resolve;
        }),
    );
    const surfaces = createSurfaceMaterials(),
      environment = new THREE.Texture();
    try {
      const pending = surfaces.prepareCompressed({} as THREE.WebGLRenderer);
      surfaces.setSoftwareMode(true);
      surfaces.setEnvironment(environment);
      finish(atlas);
      await pending;
      expect(surfaces.materials.paintedSheet.normalMap).toBeNull();
      surfaces.setSoftwareMode(false);
      const m = surfaces.materials.paintedSheet,
        version = m.version;
      expect(m.normalMap).toBe(atlas.textures[1]);
      expect(m.envMap).toBe(environment);
      surfaces.setSoftwareMode(false);
      expect(m.version).toBe(version);
      surfaces.setSoftwareMode(true);
      surfaces.setEnvironment(null);
      surfaces.setSoftwareMode(false);
      expect(m.normalMap).toBe(atlas.textures[1]);
      expect(m.envMap).toBeNull();
      expect(m.map).toBe(atlas.textures[0]);
    } finally {
      surfaces.dispose();
      environment.dispose();
    }
  });

  it("retains procedural restoration after an optional atlas failure while software maps stay omitted", async () => {
    atlasLoad.mockReset().mockRejectedValue(new Error("software atlas failure"));
    const surfaces = createSurfaceMaterials({ software: true });
    try {
      const albedo = surfaces.materials.concrete.map;
      expect((await surfaces.prepareCompressed({} as THREE.WebGLRenderer)).loaded).toBe(false);
      expect(surfaces.materials.concrete.bumpMap).toBeNull();
      expect(surfaces.materials.concrete.map).toBe(albedo);
      surfaces.setSoftwareMode(false);
      expect(surfaces.materials.concrete.bumpMap).toBe(surfaces.textures[1]);
      expect(surfaces.materials.concrete.roughnessMap).toBe(surfaces.textures[1]);
    } finally {
      surfaces.dispose();
    }
  });
});
