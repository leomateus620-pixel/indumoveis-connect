import * as THREE from "three";
import { createDaylightPixels, DAYLIGHT } from "./daylight";

export interface ReflectionEnvironment {
  target: THREE.WebGLRenderTarget;
  /** Resident RGBA16F CubeUV atlas; roughness LODs are packed, not mipmapped. */
  textureBytes: number;
  /** Temporary source + all simultaneously owned PMREM targets. */
  peakTextureBytes: number;
  dispose(): void;
}

const SOURCE_WIDTH = DAYLIGHT.environment.width;
const SOURCE_HEIGHT = DAYLIGHT.environment.height;

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
      createDaylightPixels(SOURCE_WIDTH, SOURCE_HEIGHT),
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
  // equirectangular path. The shared 512px daylight source gives cubeSize128;
  // count the actual atlas returned by this installed Three revision.
  const textureBytes = output.width * output.height * 8;
  const peakTextureBytes =
    SOURCE_WIDTH * SOURCE_HEIGHT * 4 +
    [...owned].reduce((sum, target) => sum + target.width * target.height * 8, 0);
  return ownFilteredEnvironment(output, textureBytes, peakTextureBytes);
}
