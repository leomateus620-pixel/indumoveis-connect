import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { buildArchitecture } from "./architecture";
import { createPavement } from "./pavement";
import { createSurfaceMaterials } from "./surfaceMaterials";

describe("renderer-owned semantic surface materials", () => {
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
      for (const material of Object.values(surfaces.materials)) {
        expect(material.map).toBeNull();
        expect(material.bumpMap).toBeNull();
        expect(material.roughnessMap).toBeNull();
        expect(material.color.getHex()).toBeGreaterThan(0);
        expect(material.envMapIntensity).toBeGreaterThan(0);
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
        const texture = a.textures[i];
        expect(texture.image.width).toBe(128);
        expect(texture.generateMipmaps).toBe(true);
        expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        expect(texture.wrapS).toBe(THREE.RepeatWrapping);
        expect(texture.image.data).toEqual(b.textures[i].image.data);
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
});
