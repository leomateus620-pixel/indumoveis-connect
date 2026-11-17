import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDaylightBackground, createDaylightSky, prepareDaylightSky } from "./daylight";
import { createMapLighting } from "./mapLighting";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { readLightingPreference, writeLightingPreference } from "./lightingPreference";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("park lighting", () => {
  it("retains the last preference independently of quality even if storage is unavailable", () => {
    localStorage.setItem("indumoveis:map-quality", "light");
    localStorage.setItem("indumoveis:map-lighting", "invalid");
    expect(readLightingPreference()).toBe("natural");
    writeLightingPreference("warm");
    expect(readLightingPreference()).toBe("warm");
    expect(localStorage.getItem("indumoveis:map-quality")).toBe("light");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("denied");
    });
    expect(readLightingPreference()).toBe("natural");
    expect(() => writeLightingPreference("warm")).not.toThrow();
  });

  it("transitions physical lights from the displayed sample and keeps the solar shadow static", () => {
    const lighting = createMapLighting("natural");
    const initialKey = lighting.profileKey;
    const solarPosition = lighting.sun.position.clone();
    const initialSun = lighting.sun.color.clone();
    const initialFill = lighting.fill.intensity;
    const shadow = lighting.sun.shadow;
    shadow.needsUpdate = false;
    lighting.select("warm", 100);
    expect(lighting.update(190, false)).toBe(true);
    expect(lighting.mix).toBeCloseTo(0.5);
    lighting.select("natural", 195);
    lighting.update(285, false);
    expect(lighting.mix).toBeCloseTo(0.25);
    lighting.select("warm", 290);
    lighting.update(290, true);
    expect(lighting.mix).toBe(1);
    expect(lighting.profileKey).not.toBe(initialKey);
    expect(lighting.sun.color.b).toBeLessThan(initialSun.b);
    expect(lighting.hemisphere.color.b).toBeGreaterThan(lighting.hemisphere.color.r);
    expect(lighting.fill.intensity).toBeGreaterThan(initialFill);
    expect(lighting.sun.position.equals(solarPosition)).toBe(true);
    expect(lighting.sun.shadow).toBe(shadow);
    expect(shadow.needsUpdate).toBe(false);
    expect(lighting.transitioning).toBe(false);
    expect(lighting.update(500, false)).toBe(false);
  });

  it("late panorama and PMREM bindings use the current mode without new shader variants or texture owners", async () => {
    const lighting = createMapLighting("natural");
    const sky = createDaylightSky();
    const background = createDaylightBackground(sky.texture, lighting.skyRadiance);
    const surfaces = createSurfaceMaterials({ maps: false, skyRadiance: lighting.skyRadiance });
    const glass = surfaces.materials.glass;
    const shader = {
      vertexShader: "",
      fragmentShader: "#include <envmap_physical_pars_fragment>",
      uniforms: {} as Record<string, { value: unknown }>,
    };
    glass.onBeforeCompile(
      shader as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    const lateSky = prepareDaylightSky({ fail: true });
    lighting.select("warm", 0);
    lighting.update(210, false);
    const loaded = await lateSky;
    background.setTexture(loaded.texture);
    const cubeUv = new THREE.Texture();
    surfaces.setEnvironment(cubeUv);
    const version = glass.version;
    const program = glass.customProgramCacheKey();
    expect(shader.uniforms.parkSkyRadiance.value).toBe(lighting.skyRadiance);
    expect(background.mesh.material.uniforms.skyRadiance.value).toBe(lighting.skyRadiance);
    expect(lighting.skyRadiance.r).toBeGreaterThan(lighting.skyRadiance.b);
    for (const tier of ["light", "balanced", "detailed"] as const) {
      surfaces.setQuality(tier);
      lighting.select("natural", 300);
      lighting.update(301, true);
      lighting.select("warm", 302);
      lighting.update(303, true);
      expect(glass.envMap).toBe(cubeUv);
      expect(glass.customProgramCacheKey()).toBe(program);
      expect(glass.version).toBe(version);
    }
    const released = vi.fn();
    cubeUv.addEventListener("dispose", released);
    surfaces.dispose();
    background.dispose();
    sky.dispose();
    loaded.dispose();
    expect(released).not.toHaveBeenCalled();
    cubeUv.dispose();
    expect(released).toHaveBeenCalledOnce();
  });
});
