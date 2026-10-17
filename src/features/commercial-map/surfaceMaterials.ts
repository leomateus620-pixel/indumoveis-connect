import * as THREE from "three";
import { VISUAL_THEME } from "./visualTheme";

export type SurfaceQuality = "light" | "balanced" | "detailed";
export type SurfaceFamily =
  | "paintedWall"
  | "concrete"
  | "asphalt"
  | "whitePaint"
  | "paintedSheet"
  | "exposedMetal"
  | "glass"
  | "warmAccent";

/** Resolved sRGB colours; this lazy renderer module never consumes CSS/OKLCH. */
export const SURFACE_PALETTE: Record<SurfaceFamily, string> = {
  paintedWall: VISUAL_THEME.wall,
  concrete: VISUAL_THEME.concrete,
  asphalt: VISUAL_THEME.road,
  whitePaint: "#f3f1e6",
  paintedSheet: VISUAL_THEME.roof,
  exposedMetal: VISUAL_THEME.metal,
  glass: VISUAL_THEME.glass,
  warmAccent: VISUAL_THEME.warm,
};

export interface SurfaceMaterials {
  materials: Record<SurfaceFamily, THREE.MeshStandardMaterial>;
  textures: readonly THREE.DataTexture[];
  /** RGBA8 + full mip chain, shared maps counted once. No compressed-file estimate. */
  textureBytes: number;
  setQuality(tier: SurfaceQuality): void;
  /** Presentation camera distance: fades surface relief before it can shimmer. */
  updateDetail(distance: number): void;
  setEnvironment(texture: THREE.Texture | null): void;
  dispose(): void;
}

const MAP_SIZE = 128;

/** Fixed seeds and wrapped sampling give the same seamless material on reload. */
function surfaceMap(kind: "mineral" | "sheet", data: boolean) {
  const size = MAP_SIZE;
  const pixels = new Uint8Array(size * size * 4);
  let seed = kind === "sheet" ? 918273 : 725913;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = (seed >>> 24) / 255 - 0.5;
      // Sheet ribs follow V; a single period repeats without an edge seam.
      const rib = Math.cos((x / size) * Math.PI * 8);
      const value = Math.round(
        data
          ? kind === "sheet"
            ? 164 + rib * 18 + grain * 3
            : 240 + grain * 18
          : kind === "sheet"
            ? 246 + rib * 3 + grain * 2
            : 248 + grain * 10,
      );
      pixels.set([value, value, value, 255], (y * size + x) * 4);
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
export function createSurfaceMaterials(options: { maps?: boolean } = {}): SurfaceMaterials {
  const textures: THREE.DataTexture[] = [];
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
    paintedWall: make("paintedWall", 0.88),
    concrete: make("concrete", 0.95),
    asphalt: make("asphalt", 0.98),
    whitePaint: make("whitePaint", 0.87),
    paintedSheet: make("paintedSheet", 0.76, 0.14),
    exposedMetal: make("exposedMetal", 0.42, 0.72),
    glass: make("glass", 0.25, 0.08),
    warmAccent: make("warmAccent", 0.84),
  };
  if (textures.length === 4) {
    const [mineralAlbedo, mineralData, sheetAlbedo, sheetData] = textures;
    for (const family of ["paintedWall", "concrete", "asphalt", "warmAccent"] as const) {
      materials[family].map = mineralAlbedo;
      materials[family].bumpMap = mineralData;
      materials[family].roughnessMap = mineralData;
    }
    materials.paintedSheet.map = sheetAlbedo;
    materials.paintedSheet.bumpMap = sheetData;
    materials.paintedSheet.roughnessMap = sheetData;
  }
  // All surfaces remain valid under local directional/hemisphere light if the
  // optional environment is disabled or fails. Glass uses no transmission pass.
  const relief: Partial<Record<SurfaceFamily, number>> = {
    paintedWall: 0.009,
    concrete: 0.018,
    asphalt: 0.013,
    paintedSheet: 0.022,
    warmAccent: 0.006,
  };
  let quality: SurfaceQuality = "balanced";
  let lastDistance = 80;
  function updateDetail(distance: number) {
    lastDistance = distance;
    const fade = THREE.MathUtils.smoothstep(distance, 35, 150);
    for (const [key, value] of Object.entries(relief))
      materials[key as SurfaceFamily].bumpScale =
        value * (1 - fade) * (quality === "light" ? 0.6 : 1);
  }
  function setQuality(tier: SurfaceQuality) {
    quality = tier;
    const reflection: Record<SurfaceFamily, number> = {
      paintedWall: 0.13,
      concrete: 0.09,
      asphalt: 0.06,
      whitePaint: 0.1,
      paintedSheet: 0.35,
      exposedMetal: 0.48,
      glass: 0.72,
      warmAccent: 0.14,
    };
    for (const [family, material] of Object.entries(materials))
      material.envMapIntensity =
        reflection[family as SurfaceFamily] * (tier === "light" ? 0.65 : 1);
    updateDetail(lastDistance);
  }
  setQuality(quality);
  return {
    materials,
    textures,
    textureBytes: textures.length * Math.ceil((MAP_SIZE * MAP_SIZE * 4 * 4) / 3),
    setQuality,
    updateDetail,
    setEnvironment(texture) {
      for (const material of Object.values(materials)) {
        if (material.envMap === texture) continue;
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
    dispose() {
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
