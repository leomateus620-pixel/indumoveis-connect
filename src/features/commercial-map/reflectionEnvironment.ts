import * as THREE from "three";

export interface ReflectionEnvironment {
  target: THREE.WebGLRenderTarget;
  /** Resident RGBA16F CubeUV atlas; roughness LODs are packed, not mipmapped. */
  textureBytes: number;
  /** Temporary source + all simultaneously owned PMREM targets. */
  peakTextureBytes: number;
  dispose(): void;
}

const SOURCE_WIDTH = 256;
const SOURCE_HEIGHT = 128;

function ownFilteredEnvironment(
  target: THREE.WebGLRenderTarget,
  textureBytes: number,
  peakTextureBytes: number,
): ReflectionEnvironment {
  // Separate closure: the retained owner cannot capture preparation scratch
  // targets, the source pixels, generator or renderer state through its scope.
  let released = false;
  return {
    target,
    textureBytes,
    peakTextureBytes,
    dispose() {
      if (released) return;
      released = true;
      target.dispose();
    },
  };
}

/** A quiet local sky/ground with two broad light bands. No city, remote HDR,
 * specular sun point or texture dependency can gate the first useful frame. */
function environmentPixels() {
  const pixels = new Uint8Array(SOURCE_WIDTH * SOURCE_HEIGHT * 4);
  const sky = [218, 231, 239];
  const horizon = [224, 224, 211];
  const ground = [144, 157, 143];
  for (let y = 0; y < SOURCE_HEIGHT; y++) {
    // DataTexture flipY=false: v=0 is the south pole in equirectUv(), so the
    // upper/sky hemisphere belongs to the last rows of this typed array.
    const elevation = -Math.cos(((y + 0.5) / SOURCE_HEIGHT) * Math.PI);
    const skyMix = THREE.MathUtils.smoothstep(elevation, -0.12, 0.45);
    const horizonMix = Math.exp(-(elevation * elevation) / 0.075);
    for (let x = 0; x < SOURCE_WIDTH; x++) {
      const azimuth = ((x + 0.5) / SOURCE_WIDTH) * Math.PI * 2;
      const distance = (centre: number) =>
        Math.atan2(Math.sin(azimuth - centre), Math.cos(azimuth - centre));
      const upper = THREE.MathUtils.smoothstep(elevation, -0.05, 0.35);
      const broadLight =
        (Math.exp(-(distance(0.7) ** 2) / 0.3) * 0.38 +
          Math.exp(-(distance(3.6) ** 2) / 0.55) * 0.23) *
        upper;
      const offset = (y * SOURCE_WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const base = ground[channel] + (sky[channel] - ground[channel]) * skyMix;
        const ambient = base + (horizon[channel] - base) * horizonMix * 0.5;
        pixels[offset + channel] = Math.round(ambient + (255 - ambient) * broadLight);
      }
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

/** One synchronous, deferred preparation with explicit ownership even if GPU
 * work throws. In Three 0.186 a fresh generator skips internal initialization
 * when a target argument is supplied. Track the documented renderer's public
 * target binding calls instead; no engine-private method or shader is patched. */
export function createReflectionEnvironment(
  renderer: THREE.WebGLRenderer,
  options: { fail?: boolean } = {},
): ReflectionEnvironment {
  const previous = {
    target: renderer.getRenderTarget(),
    face: renderer.getActiveCubeFace(),
    mip: renderer.getActiveMipmapLevel(),
    xr: renderer.xr.enabled,
    autoClear: renderer.autoClear,
    toneMapping: renderer.toneMapping,
    setRenderTarget: renderer.setRenderTarget,
  };
  type BoundTarget = NonNullable<Parameters<THREE.WebGLRenderer["setRenderTarget"]>[0]>;
  const owned = new Set<BoundTarget>();
  const disposed = new WeakSet<BoundTarget>();
  const markDisposed = (event: { target: unknown }) => {
    disposed.add(event.target as BoundTarget);
  };
  let source: THREE.DataTexture | null = null;
  let generator: THREE.PMREMGenerator | null = null;
  let output: THREE.WebGLRenderTarget | null = null;
  let failure: unknown;
  const release = (resource: { dispose(): void }) => {
    try {
      resource.dispose();
    } catch (error) {
      failure ??= error;
    }
  };
  renderer.setRenderTarget = function (target, face, mip) {
    if (target && target !== previous.target && !owned.has(target)) {
      owned.add(target);
      target.addEventListener("dispose", markDisposed);
    }
    return previous.setRenderTarget.call(this, target, face, mip);
  };
  try {
    source = new THREE.DataTexture(
      environmentPixels(),
      SOURCE_WIDTH,
      SOURCE_HEIGHT,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    source.name = "indumoveis-soft-daylight-source";
    source.colorSpace = THREE.SRGBColorSpace;
    source.mapping = THREE.EquirectangularReflectionMapping;
    source.minFilter = source.magFilter = THREE.LinearFilter;
    source.generateMipmaps = false;
    source.needsUpdate = true;
    generator = new THREE.PMREMGenerator(renderer);
    if (options.fail) throw new Error("Laboratory reflection environment failure");
    output = generator.fromEquirectangular(source);
    output.texture.name = "indumoveis-soft-daylight-pmrem";
  } catch (error) {
    failure = error;
  } finally {
    // Restore exact identity before any cleanup; a failing PMREM cannot leave
    // a stale hook, offscreen target, XR state or clear policy on this renderer.
    renderer.setRenderTarget = previous.setRenderTarget;
    try {
      previous.setRenderTarget.call(renderer, previous.target, previous.face, previous.mip);
    } catch (error) {
      failure ??= error;
    }
    renderer.xr.enabled = previous.xr;
    renderer.autoClear = previous.autoClear;
    renderer.toneMapping = previous.toneMapping;
    if (generator) release(generator);
    if (source) release(source);
    for (const target of owned) {
      if ((failure || target !== output) && !disposed.has(target)) release(target);
      target.removeEventListener("dispose", markDisposed);
    }
  }
  if (failure || !output) throw failure ?? new Error("Reflection environment was not prepared");
  // RGBA16F, no depth/stencil, samples=0 and no ordinary mip chain in Three's
  // equirectangular path. 256px source gives cubeSize64 / atlas336×256 in r186.
  const textureBytes = output.width * output.height * 8;
  const peakTextureBytes =
    SOURCE_WIDTH * SOURCE_HEIGHT * 4 +
    [...owned].reduce((sum, target) => sum + target.width * target.height * 8, 0);
  return ownFilteredEnvironment(output, textureBytes, peakTextureBytes);
}
