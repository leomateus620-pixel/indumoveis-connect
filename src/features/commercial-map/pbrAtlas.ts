import * as THREE from "three";

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
  material.aoMapIntensity = family === "paintedMetal" ? 0.25 : 0.55;
  const rect = { value: atlasRect(family) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.surfaceAtlasRect = rect;
    shader.fragmentShader = `uniform vec4 surfaceAtlasRect;
      vec4 surfaceAtlasRead(sampler2D atlasMap, vec2 worldUv) {
        return textureGrad(atlasMap,
          surfaceAtlasRect.xy + fract(worldUv) * surfaceAtlasRect.zw,
          dFdx(worldUv) * surfaceAtlasRect.zw,
          dFdy(worldUv) * surfaceAtlasRect.zw);
      }
      ${shader.fragmentShader}`;
    for (const [chunk, textureName, uv] of [
      ["map_fragment", "map", "vMapUv"],
      ["normal_fragment_maps", "normalMap", "vNormalMapUv"],
      ["roughnessmap_fragment", "roughnessMap", "vRoughnessMapUv"],
      ["aomap_fragment", "aoMap", "vAoMapUv"],
    ]) {
      const source = THREE.ShaderChunk[chunk as keyof typeof THREE.ShaderChunk];
      const replacement = source.replaceAll(
        `texture2D( ${textureName}, ${uv} )`,
        `surfaceAtlasRead( ${textureName}, ${uv} )`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, replacement);
    }
  };
  material.customProgramCacheKey = () => "indumoveis-pbr-atlas-v1";
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
