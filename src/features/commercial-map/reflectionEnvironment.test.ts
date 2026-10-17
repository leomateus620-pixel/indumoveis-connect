import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

const preparation = vi.hoisted(() => ({
  failAfterBinding: false,
  sourceDisposals: 0,
  sourcePoles: [0, 0],
  targets: [] as { target: import("three").WebGLRenderTarget; disposals: number }[],
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  // Exercise the ownership boundary through the same public renderer calls as
  // PMREM, including a throw after targets have acquired GPU ownership.
  class PMREMGenerator {
    private scratch: import("three").WebGLRenderTarget | null = null;
    constructor(private renderer: import("three").WebGLRenderer) {}
    fromEquirectangular(source: import("three").Texture) {
      source.addEventListener("dispose", () => preparation.sourceDisposals++);
      const image = source.image as { data: Uint8Array; width: number; height: number };
      preparation.sourcePoles = [
        image.data[2],
        image.data[(image.height - 1) * image.width * 4 + 2],
      ];
      const make = () => {
        const target = new actual.WebGLRenderTarget(336, 256, {
          depthBuffer: false,
          type: actual.HalfFloatType,
        });
        const record = { target, disposals: 0 };
        target.addEventListener("dispose", () => record.disposals++);
        preparation.targets.push(record);
        return target;
      };
      const output = make();
      this.scratch = make();
      this.renderer.xr.enabled = false;
      this.renderer.autoClear = false;
      this.renderer.toneMapping = actual.NoToneMapping;
      this.renderer.setRenderTarget(output);
      this.renderer.setRenderTarget(this.scratch);
      if (preparation.failAfterBinding) throw new Error("prefilter failed after GPU binding");
      return output;
    }
    dispose() {
      this.scratch?.dispose();
    }
  }
  return { ...actual, PMREMGenerator };
});

import { createReflectionEnvironment } from "./reflectionEnvironment";

function rendererStub() {
  const initialTarget = new THREE.WebGLRenderTarget(32, 32);
  let target: THREE.WebGLRenderTarget | null = initialTarget;
  let face = 2,
    mip = 3;
  const stub = {
    xr: { enabled: true },
    autoClear: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    getRenderTarget: () => target,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => mip,
    setRenderTarget(next: THREE.WebGLRenderTarget | null, nextFace = 0, nextMip = 0) {
      target = next;
      face = nextFace;
      mip = nextMip;
    },
  };
  return { renderer: stub as unknown as THREE.WebGLRenderer, initialTarget };
}

beforeEach(() => {
  preparation.failAfterBinding = false;
  preparation.sourceDisposals = 0;
  preparation.targets = [];
});

describe("deferred reflection environment ownership", () => {
  it("keeps only the filtered atlas and restores the exact renderer state after preparation", () => {
    const { renderer, initialTarget } = rendererStub();
    const original = renderer.setRenderTarget;
    const previousDisposed = vi.fn();
    initialTarget.addEventListener("dispose", previousDisposed);
    const environment = createReflectionEnvironment(renderer);
    expect(environment.target).toBe(preparation.targets[0].target);
    expect(environment.textureBytes).toBe(336 * 256 * 8);
    expect(environment.peakTextureBytes).toBe(512 * 256 * 4 + 2 * 336 * 256 * 8);
    expect(preparation.targets.map((record) => record.disposals)).toEqual([0, 1]);
    expect(preparation.sourceDisposals).toBe(1);
    expect(preparation.sourcePoles[1]).toBeGreaterThan(preparation.sourcePoles[0] + 20);
    expect(renderer.setRenderTarget).toBe(original);
    expect(renderer.getRenderTarget()).toBe(initialTarget);
    expect(renderer.getActiveCubeFace()).toBe(2);
    expect(renderer.getActiveMipmapLevel()).toBe(3);
    expect(renderer.xr.enabled).toBe(true);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(previousDisposed).not.toHaveBeenCalled();
    environment.dispose();
    environment.dispose();
    expect(preparation.targets.map((record) => record.disposals)).toEqual([1, 1]);
    initialTarget.dispose();
  });

  it("releases every bound generated target when prefiltering throws without disposing the existing target", () => {
    preparation.failAfterBinding = true;
    const { renderer, initialTarget } = rendererStub();
    const original = renderer.setRenderTarget;
    const previousDisposed = vi.fn();
    initialTarget.addEventListener("dispose", previousDisposed);
    expect(() => createReflectionEnvironment(renderer)).toThrow("prefilter failed");
    expect(preparation.targets.map((record) => record.disposals)).toEqual([1, 1]);
    expect(preparation.sourceDisposals).toBe(1);
    expect(renderer.setRenderTarget).toBe(original);
    expect(renderer.getRenderTarget()).toBe(initialTarget);
    expect(renderer.getActiveCubeFace()).toBe(2);
    expect(renderer.getActiveMipmapLevel()).toBe(3);
    expect(renderer.xr.enabled).toBe(true);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(previousDisposed).not.toHaveBeenCalled();
    initialTarget.dispose();
  });
});
