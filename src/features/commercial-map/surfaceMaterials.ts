import * as THREE from "three";
import { PARK_SURFACE_COLORS, VISUAL_THEME } from "./visualTheme";
import { bindPbrAtlas, loadPbrAtlas, type AtlasFamily, type PbrTexture } from "./pbrAtlas";
import { patchGroundVariation } from "./groundVariation";
import { applyMasonryFinish } from "./masonryFinish";

export type SurfaceQuality = "light" | "balanced" | "detailed";
export type SurfaceFamily =
  | "paintedWall"
  | "concrete"
  | "asphalt"
  | "whitePaint"
  | "paintedSheet"
  | "exposedMetal"
  | "glass"
  | "warmAccent"
  | "masonryBrick"
  | "paintedMasonry"
  | "architecturalFrame"
  | "grass";

/** Resolved sRGB colours; this lazy renderer module never consumes CSS/OKLCH. */
export const SURFACE_PALETTE: Record<SurfaceFamily, string> = {
  paintedWall: VISUAL_THEME.wall,
  concrete: PARK_SURFACE_COLORS.concrete,
  asphalt: PARK_SURFACE_COLORS.asphalt,
  whitePaint: PARK_SURFACE_COLORS.whitePaint,
  paintedSheet: VISUAL_THEME.roof,
  exposedMetal: VISUAL_THEME.metal,
  glass: VISUAL_THEME.glass,
  warmAccent: VISUAL_THEME.warm,
  masonryBrick: PARK_SURFACE_COLORS.brick,
  paintedMasonry: PARK_SURFACE_COLORS.paintedMasonry,
  architecturalFrame: PARK_SURFACE_COLORS.architecturalFrame,
  grass: PARK_SURFACE_COLORS.grass,
};

/** Keep the world colour field on the inexpensive floor during startup. */
export function createInitialGrassMaterial(name: string) {
  const material = new THREE.MeshLambertMaterial({
    name,
    color: SURFACE_PALETTE.grass,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => patchGroundVariation(shader, "grass");
  material.customProgramCacheKey = () => "indumoveis-procedural-ground-v3-grass";
  return material;
}

export interface SurfaceMaterials {
  materials: Record<SurfaceFamily, THREE.MeshStandardMaterial>;
  textures: readonly PbrTexture[];
  /** RGBA8 + full mip chain, shared maps counted once. No compressed-file estimate. */
  textureBytes: number;
  setQuality(tier: SurfaceQuality): void;
  /** Presentation camera distance: fades surface relief before it can shimmer. */
  updateDetail(distance: number): void;
  setEnvironment(texture: THREE.Texture | null): void;
  /** Automatic software-only shader policy. Full maps remain owned for restore. */
  setSoftwareMode(enabled: boolean): void;
  prepareCompressed(
    renderer: THREE.WebGLRenderer,
    options?: { fail?: boolean; resolution?: 512 | 1024; canCommit?: () => boolean },
  ): Promise<{
    loaded: boolean;
    textureBytes: number;
    source: "basis" | "procedural";
    compressed: boolean;
    reason?: string;
  }>;
  dispose(): void;
}

const MAP_SIZE = 128;
type LocalMap = "mineral-albedo" | "mineral-data" | "sheet-albedo" | "sheet-data";
const localMapPixels = new Map<LocalMap, Uint8Array>();

/** Fixed seeds and wrapped sampling give the same seamless material on reload. */
function surfaceMap(kind: "mineral" | "sheet", data: boolean) {
  const size = MAP_SIZE;
  const key = `${kind}-${data ? "data" : "albedo"}` as const;
  let pixels = localMapPixels.get(key);
  if (!pixels) {
    pixels = new Uint8Array(size * size * 4);
    let seed = kind === "sheet" ? 918273 : 725913;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const grain = (seed >>> 24) / 255 - 0.5;
        // Sheet ribs follow V. G carries near-final roughness while R supplies
        // the independent bump height, both stored as linear data.
        const rib = Math.cos((x / size) * Math.PI * 8);
        const red = kind === "sheet" ? 165 + rib * 17 + grain * 2 : 238 + grain * 14;
        const green = kind === "sheet" ? 226 + rib * 5 + grain * 2 : 245 + grain * 8;
        const albedo = kind === "sheet" ? 254 + rib * 0.6 : 253 + grain * 3;
        const offset = (y * size + x) * 4;
        pixels[offset] = Math.round(data ? red : albedo);
        pixels[offset + 1] = Math.round(data ? green : albedo);
        pixels[offset + 2] = Math.round(data ? 255 : albedo);
        pixels[offset + 3] = 255;
      }
    // Keep bounded CPU pixels on reopen. Each renderer owns its Texture objects.
    localMapPixels.set(key, pixels);
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  try {
    texture.name = `indumoveis-${kind}-${data ? "surface-data" : "albedo"}`;
    texture.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 2;
    texture.needsUpdate = true;
  } catch (error) {
    texture.dispose();
    throw error;
  }
  return texture;
}

/** One owner per renderer. Architecture and pavement reuse this exact library;
 * no remote dependency, per-face materials, shaders or render-loop allocation. */
export function createSurfaceMaterials(
  options: { maps?: boolean; software?: boolean } = {},
): SurfaceMaterials {
  const textures: PbrTexture[] = [];
  let disposed = false;
  let textureBytes = 0;
  let compressed = false;
  let atlasReady = false;
  let preparation: ReturnType<SurfaceMaterials["prepareCompressed"]> | null = null;
  const controller = new AbortController();
  if (options.maps !== false) {
    try {
      textures.push(surfaceMap("mineral", false));
      textures.push(surfaceMap("mineral", true));
      textures.push(surfaceMap("sheet", false));
      textures.push(surfaceMap("sheet", true));
    } catch {
      // Textures enhance materiality but never gate a locally lit first frame.
      // A partial allocation has the same explicit owner as the complete set.
      for (const texture of textures) texture.dispose();
      textures.length = 0;
    }
  }
  textureBytes = textures.length * Math.ceil((MAP_SIZE * MAP_SIZE * 4 * 4) / 3);
  const make = (family: SurfaceFamily, roughness: number, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({
      name: `indumoveis-${family}`,
      color: SURFACE_PALETTE[family],
      roughness,
      metalness,
      vertexColors: true,
      envMapIntensity: 0.5,
    });
    return material;
  };
  const materials = {
    paintedWall: make("paintedWall", 0.93),
    concrete: make("concrete", 0.94),
    asphalt: make("asphalt", 1),
    whitePaint: make("whitePaint", 0.87),
    paintedSheet: make("paintedSheet", 0.74),
    exposedMetal: make("exposedMetal", 0.43, 0.67),
    glass: make("glass", 0.32, 0.06),
    warmAccent: make("warmAccent", 0.84),
    masonryBrick: make("masonryBrick", 0.94),
    paintedMasonry: make("paintedMasonry", 0.91),
    architecturalFrame: make("architecturalFrame", 0.76, 0.025),
    grass: make("grass", 1),
  };
  applyMasonryFinish(materials.masonryBrick);
  applyMasonryFinish(materials.paintedMasonry, true);
  for (const family of ["grass", "asphalt", "concrete"] as const) {
    materials[family].onBeforeCompile = (shader) => patchGroundVariation(shader, family);
    materials[family].customProgramCacheKey = () => `indumoveis-procedural-ground-v3-${family}`;
  }
  if (textures.length === 4) {
    const [mineralAlbedo, mineralData, sheetAlbedo, sheetData] = textures;
    for (const family of [
      "paintedWall",
      "concrete",
      "asphalt",
      "warmAccent",
      "masonryBrick",
      "paintedMasonry",
    ] as const) {
      materials[family].map = mineralAlbedo;
      materials[family].bumpMap = mineralData;
      materials[family].roughnessMap = mineralData;
    }
    materials.paintedSheet.map = sheetAlbedo;
    materials.paintedSheet.bumpMap = sheetData;
    materials.paintedSheet.roughnessMap = sheetData;
  }
  const detailMapKeys = ["normalMap", "bumpMap", "roughnessMap", "aoMap"] as const;
  const optionalMapKeys = [...detailMapKeys, "envMap"] as const;
  type OptionalMapState = Record<(typeof optionalMapKeys)[number], THREE.Texture | null>;
  const fullMaps = new Map<THREE.MeshStandardMaterial, OptionalMapState>();
  for (const material of Object.values(materials))
    fullMaps.set(material, {
      normalMap: material.normalMap,
      bumpMap: material.bumpMap,
      roughnessMap: material.roughnessMap,
      aoMap: material.aoMap,
      envMap: material.envMap,
    });
  let softwareMode = false;
  function applyOptionalMaps(material: THREE.MeshStandardMaterial) {
    const full = fullMaps.get(material)!;
    let changed = false;
    for (const key of optionalMapKeys) {
      const next = softwareMode ? null : full[key];
      if (material[key] === next) continue;
      material[key] = next;
      changed = true;
    }
    // Zeroing normalScale/intensities would still execute texture/BRDF paths.
    // Null references remove their USE_* shader defines and texture samples.
    if (changed) material.needsUpdate = true;
  }
  function setSoftwareMode(enabled: boolean) {
    if (disposed || softwareMode === enabled) return;
    if (enabled)
      for (const material of Object.values(materials)) {
        const full = fullMaps.get(material)!;
        for (const key of optionalMapKeys) full[key] = material[key];
      }
    softwareMode = enabled;
    for (const material of Object.values(materials)) applyOptionalMaps(material);
  }
  setSoftwareMode(options.software === true);
  // All surfaces remain valid under local directional/hemisphere light if the
  // optional environment is disabled or fails. Glass uses no transmission pass.
  const relief: Partial<Record<SurfaceFamily, number>> = {
    paintedWall: 0.004,
    concrete: 0.011,
    asphalt: 0.008,
    paintedSheet: 0.004,
    warmAccent: 0.006,
    masonryBrick: 0.012,
    paintedMasonry: 0.008,
    grass: 0.008,
  };
  let quality: SurfaceQuality = "balanced";
  let lastDistance = 80;
  const normals: Partial<Record<SurfaceFamily, number>> = {
    paintedWall: 0.105,
    concrete: 0.19,
    asphalt: 0.16,
    whitePaint: 0.08,
    // The atlas normal already encodes corrugations. A large multiplier turns
    // them into dark blue stripes on curved and oblique roofs; retain a subtle
    // filtered relief without a new texture, shader or extra draw.
    paintedSheet: 0.025,
    exposedMetal: 0.075,
    warmAccent: 0.1,
    masonryBrick: 0.13,
    paintedMasonry: 0.1,
    architecturalFrame: 0.035,
    grass: 0.135,
  };
  function updateDetail(distance: number) {
    lastDistance = distance;
    const fade = THREE.MathUtils.smoothstep(distance, 35, 150);
    for (const [key, value] of Object.entries(relief))
      materials[key as SurfaceFamily].bumpScale =
        value * (1 - fade) * (quality === "light" ? 0.6 : 1);
    if (atlasReady)
      for (const [key, value] of Object.entries(normals))
        materials[key as SurfaceFamily].normalScale.setScalar(
          value * (1 - fade) * (quality === "light" ? 0.55 : 1),
        );
  }
  function setQuality(tier: SurfaceQuality) {
    quality = tier;
    const reflection: Record<SurfaceFamily, number> = {
      paintedWall: 0.1,
      concrete: 0.065,
      asphalt: 0.022,
      whitePaint: 0.075,
      paintedSheet: 0.24,
      exposedMetal: 0.47,
      glass: 0.53,
      warmAccent: 0.09,
      masonryBrick: 0.045,
      paintedMasonry: 0.065,
      architecturalFrame: 0.16,
      grass: 0,
    };
    for (const [family, material] of Object.entries(materials))
      material.envMapIntensity =
        reflection[family as SurfaceFamily] * (tier === "light" ? 0.65 : 1);
    updateDetail(lastDistance);
  }
  setQuality(quality);
  return {
    materials,
    get textures() {
      return textures;
    },
    get textureBytes() {
      return textureBytes;
    },
    setQuality,
    updateDetail,
    setSoftwareMode,
    setEnvironment(texture) {
      if (disposed) return;
      for (const [family, material] of Object.entries(materials)) {
        if (family === "grass") continue;
        fullMaps.get(material)!.envMap = texture;
        applyOptionalMaps(material);
      }
    },
    prepareCompressed(renderer, preparationOptions = {}) {
      if (preparation) return preparation;
      preparation = (async () => {
        const result = (loaded: boolean, reason?: string) => ({
          loaded,
          textureBytes,
          source: atlasReady ? ("basis" as const) : ("procedural" as const),
          compressed,
          ...(reason ? { reason } : {}),
        });
        if (disposed || options.maps === false)
          return result(false, disposed ? "disposed" : "maps-disabled");
        const timeout = setTimeout(() => controller.abort(), 20_000);
        try {
          if (preparationOptions.fail) throw new Error("Laboratory surface atlas failure");
          const atlas = await loadPbrAtlas(
            renderer,
            preparationOptions.resolution ?? (quality === "detailed" ? 1024 : 512),
            controller.signal,
          );
          if (preparationOptions.canCommit) {
            try {
              await new Promise<void>((resolve, reject) => {
                let timer: ReturnType<typeof setTimeout>;
                const finish = (error?: Error) => {
                  clearTimeout(timer);
                  controller.signal.removeEventListener("abort", abort);
                  if (error) reject(error);
                  else resolve();
                };
                const abort = () => finish(new Error("surface-atlas-aborted"));
                const check = () => {
                  if (controller.signal.aborted) abort();
                  else if (preparationOptions.canCommit!()) finish();
                  else timer = setTimeout(check, 80);
                };
                controller.signal.addEventListener("abort", abort, { once: true });
                check();
              });
            } catch (error) {
              atlas.textures.forEach((texture) => texture.dispose());
              throw error;
            }
          }
          if (disposed) {
            atlas.textures.forEach((texture) => texture.dispose());
            return result(false, "disposed");
          }
          const families: Partial<Record<SurfaceFamily, AtlasFamily>> = {
            paintedWall: "mineral",
            concrete: "concrete",
            asphalt: "asphalt",
            whitePaint: "mineral",
            paintedSheet: "paintedMetal",
            // Smooth structural steel uses the mineral microstructure and its
            // own metalness/roughness, not the corrugation of painted roofs.
            exposedMetal: "mineral",
            warmAccent: "mineral",
            masonryBrick: "mineral",
            paintedMasonry: "mineral",
            // Painted structural members are smooth; corrugated roof relief
            // must not turn beams, jambs and lattice columns into striped tubes.
            architecturalFrame: "mineral",
            grass: "grass",
          };
          for (const [family, cell] of Object.entries(families)) {
            const material = materials[family as SurfaceFamily];
            bindPbrAtlas(material, cell, atlas);
            if (family === "masonryBrick") applyMasonryFinish(material);
            if (family === "paintedMasonry") applyMasonryFinish(material, true);
            const full = fullMaps.get(material)!;
            for (const key of detailMapKeys) full[key] = material[key];
            // Environment may have arrived while software maps were omitted;
            // retain that desired reference and the complete newly loaded atlas.
            applyOptionalMaps(material);
          }
          textures.forEach((texture) => texture.dispose());
          textures.splice(0, textures.length, ...atlas.textures);
          textureBytes = atlas.textureBytes;
          compressed = atlas.compressed;
          atlasReady = true;
          updateDetail(lastDistance);
          return result(true);
        } catch (error) {
          return result(
            false,
            error instanceof Error ? error.message : "surface-atlas-preparation",
          );
        } finally {
          clearTimeout(timeout);
        }
      })();
      return preparation;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
