import * as THREE from "three";
import { patchGroundVariation } from "./groundVariation";

export type AtlasFamily = "mineral" | "concrete" | "asphalt" | "paintedMetal" | "grass";
export type PbrTexture = THREE.DataTexture | THREE.CompressedTexture;
export type PbrAtlas = {
  textures: [PbrTexture, PbrTexture, PbrTexture];
  textureBytes: number;
  width: number;
  compressed: boolean;
};
const FAMILY_INDEX: Record<AtlasFamily, number> = {
  mineral: 0,
  concrete: 1,
  asphalt: 2,
  paintedMetal: 3,
  grass: 4,
};
// Mean linear RGB of the authored inner cells at both source sizes. Center
// their detail on the authored material colour so loading the full atlas does
// not darken the palette (the source albedo texels are decoded from sRGB).
const LINEAR_ALBEDO_MEAN: Record<AtlasFamily, string> = {
  mineral: "vec3(.895)",
  concrete: "vec3(.891)",
  asphalt: "vec3(.882)",
  paintedMetal: "vec3(.943)",
  grass: "vec3(.876, .884, .843)",
};

/** UVs still express world repeats authored by architecture/pavement. Sampling
 * wraps within a padded atlas cell, not across its neighbours. Explicit gradients
 * keep mip selection stable at repeat seams instead of deriving from fract(). */
export function atlasRect(family: AtlasFamily): THREE.Vector4 {
  const index = FAMILY_INDEX[family];
  return new THREE.Vector4(
    ((index % 4) + 1 / 16) / 4,
    (Math.floor(index / 4) + 1 / 16) / 2,
    0.875 / 4,
    0.875 / 2,
  );
}

export function bindPbrAtlas(
  material: THREE.MeshStandardMaterial,
  family: AtlasFamily,
  atlas: PbrAtlas,
) {
  const [albedo, normal, orm] = atlas.textures;
  material.map = albedo;
  material.normalMap = normal;
  material.roughnessMap = material.aoMap = orm;
  material.bumpMap = null;
  material.aoMapIntensity = family === "paintedMetal" ? 0.15 : family === "grass" ? 0.22 : 0.38;
  const rect = { value: atlasRect(family) };
  material.onBeforeCompile = (shader) => {
    patchGroundVariation(shader, family);
    shader.uniforms.surfaceAtlasRect = rect;
    // The shared world field carries grass colour at distance. One oblique
    // tile per channel carries its close detail without a parcel-aligned grid.
    shader.fragmentShader = `uniform vec4 surfaceAtlasRect;
      vec4 surfaceAtlasRead(sampler2D atlasMap, vec2 worldUv) {
        ${family === "grass" ? "worldUv = mat2(.8,.6,-.6,.8) * worldUv * .79;" : ""}
        return textureGrad(atlasMap,
          surfaceAtlasRect.xy + fract(worldUv) * surfaceAtlasRect.zw,
          dFdx(worldUv) * surfaceAtlasRect.zw, dFdy(worldUv) * surfaceAtlasRect.zw);
      }
      ${
        family === "grass"
          ? `
      vec4 surfaceAtlasReadNormal(sampler2D atlasMap, vec2 worldUv) {
        vec4 sampleNormal = surfaceAtlasRead(atlasMap, worldUv);
        sampleNormal.xy = mat2(.8,-.6,.6,.8) * (sampleNormal.xy - .5) + .5;
        return sampleNormal;
      }`
          : ""
      }
      ${shader.fragmentShader}`;
    for (const [chunk, textureName, uv] of [
      ["map_fragment", "map", "vMapUv"],
      ["normal_fragment_maps", "normalMap", "vNormalMapUv"],
      ["roughnessmap_fragment", "roughnessMap", "vRoughnessMapUv"],
      ["aomap_fragment", "aoMap", "vAoMapUv"],
    ]) {
      const source = THREE.ShaderChunk[chunk as keyof typeof THREE.ShaderChunk];
      let replacement = source.replaceAll(
        `texture2D( ${textureName}, ${uv} )`,
        `${family === "grass" && textureName === "normalMap" ? "surfaceAtlasReadNormal" : "surfaceAtlasRead"}( ${textureName}, ${uv} )`,
      );
      if (chunk === "map_fragment") {
        const closeDetail =
          family === "grass" || family === "asphalt" || family === "concrete"
            ? "1.0 - smoothstep(.06, .30, max(fwidth(vMapUv.x), fwidth(vMapUv.y)))"
            : "1.0";
        const strength = family === "paintedMetal" ? ".28" : family === "grass" ? ".65" : "1.0";
        replacement = replacement.replace(
          "diffuseColor *= sampledDiffuseColor;",
          `sampledDiffuseColor.rgb = vec3(1.0) +
            (sampledDiffuseColor.rgb - ${LINEAR_ALBEDO_MEAN[family]}) * ${strength} * (${closeDetail});
            diffuseColor *= sampledDiffuseColor;`,
        );
      }
      shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, replacement);
    }
  };
  material.customProgramCacheKey = () => `indumoveis-pbr-atlas-v5-${family}`;
  material.needsUpdate = true;
}

/** Bytes of the actual transcode, rather than download size or uncompressed
 * source estimates. Shared atlas maps are counted once, including their mips. */
export function atlasTextureBytes(texture: THREE.Texture): number {
  const mipmaps = texture.mipmaps as { data?: ArrayBufferView }[];
  const image = texture.image as { data?: ArrayBufferView; width: number; height: number };
  if (mipmaps.length) return mipmaps.reduce((sum, mip) => sum + (mip.data?.byteLength ?? 0), 0);
  return image.data?.byteLength ?? image.width * image.height * 4;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("surface-atlas-aborted"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("surface-atlas-aborted"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Three's existing Basis transcoder runs in one worker. No encoder, decoder
 * dependency update or remote CDN enters the application. The three maps are
 * committed atomically by the library only after all transcodes succeed. */
export async function loadPbrAtlas(
  renderer: THREE.WebGLRenderer,
  width: 512 | 1024,
  signal: AbortSignal,
): Promise<PbrAtlas> {
  const { KTX2Loader } = await import("three/addons/loaders/KTX2Loader.js");
  if (signal.aborted) throw new Error("surface-atlas-aborted");
  const loader = new KTX2Loader().setTranscoderPath("/commercial-map/basis/").setWorkerLimit(1);
  const received = new Set<THREE.Texture>();
  let committed = false;
  let initialization: Promise<void> | null = null;
  let initialized = false;
  let released = false;
  const releaseLoader = () => {
    if (released) return;
    released = true;
    loader.dispose();
  };
  try {
    loader.detectSupport(renderer);
    const buffers = await abortable(
      Promise.all(
        ["albedo", "normal", "orm"].map(async (kind) => {
          const response = await fetch(`/commercial-map/pbr/surfaces-${width}-${kind}.ktx2`, {
            signal,
          });
          if (!response.ok) throw new Error(`surface-atlas-http-${response.status}`);
          return response.arrayBuffer();
        }),
      ),
      signal,
    );
    // Initialize before submitting worker tasks. Aborting while the public
    // transcoder scripts load must not leave a late-created Blob URL or spawn
    // a worker after this owner has already been disposed.
    initialization = loader.init().then(() => {
      initialized = true;
    });
    await abortable(initialization, signal);
    const tasks = buffers.map(
      (buffer) =>
        new Promise<THREE.Texture>((resolve, reject) => {
          loader.parse(
            buffer,
            (texture) => {
              if (signal.aborted) {
                texture.dispose();
                reject(new Error("surface-atlas-aborted"));
              } else {
                received.add(texture);
                resolve(texture);
              }
            },
            reject,
          );
        }),
    );
    const textures = (await abortable(Promise.all(tasks), signal)) as PbrAtlas["textures"];
    textures.forEach((texture, index) => {
      texture.name = `indumoveis-pbr-atlas-${["albedo", "normal", "orm"][index]}`;
      texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.channel = 0;
      texture.anisotropy = 2;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
    });
    committed = true;
    return {
      textures,
      width,
      textureBytes: textures.reduce((sum, texture) => sum + atlasTextureBytes(texture), 0),
      compressed: textures.every(
        (texture) => (texture as THREE.CompressedTexture).isCompressedTexture === true,
      ),
    };
  } finally {
    if (initialized) releaseLoader();
    else if (initialization) void initialization.then(releaseLoader, releaseLoader);
    if (!committed) received.forEach((texture) => texture.dispose());
  }
}
