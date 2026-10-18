import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const controls = vi.hoisted(() => ({
  init: () => Promise.resolve(),
  parse: (
    _buffer: ArrayBuffer,
    _done: (texture: import("three").Texture) => void,
    _fail: (error: Error) => void,
  ) => {},
  paths: [] as string[],
  workers: [] as number[],
  disposed: 0,
  parsed: 0,
}));
vi.mock("three/addons/loaders/KTX2Loader.js", () => ({
  KTX2Loader: class {
    setTranscoderPath(path: string) {
      controls.paths.push(path);
      return this;
    }
    setWorkerLimit(limit: number) {
      controls.workers.push(limit);
      return this;
    }
    detectSupport() {
      return this;
    }
    init() {
      return controls.init();
    }
    parse(
      buffer: ArrayBuffer,
      done: (texture: THREE.Texture) => void,
      fail: (error: Error) => void,
    ) {
      controls.parsed++;
      controls.parse(buffer, done, fail);
    }
    dispose() {
      controls.disposed++;
    }
  },
}));
import { loadPbrAtlas } from "./pbrAtlas";

beforeEach(() => {
  controls.paths = [];
  controls.workers = [];
  controls.disposed = controls.parsed = 0;
  controls.init = () => Promise.resolve();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("deferred Basis worker ownership", () => {
  it("uses one local worker for three shared maps and counts the actual transcode buffers", async () => {
    controls.parse = (_buffer, done) =>
      done(
        new THREE.CompressedTexture(
          [
            { data: new Uint8Array(64), width: 8, height: 8 },
            { data: new Uint8Array(16), width: 4, height: 4 },
          ],
          8,
          8,
          THREE.RGBA_BPTC_Format,
        ),
      );
    const atlas = await loadPbrAtlas({} as THREE.WebGLRenderer, 512, new AbortController().signal);
    expect(controls.paths).toEqual(["/commercial-map/basis/"]);
    expect(controls.workers).toEqual([1]);
    expect(controls.parsed).toBe(3);
    expect(controls.disposed).toBe(1);
    expect(atlas.textureBytes).toBe(240);
    expect(atlas.compressed).toBe(true);
    expect(atlas.textures[0].colorSpace).toBe(THREE.SRGBColorSpace);
    for (const texture of atlas.textures.slice(1)) {
      expect(texture.colorSpace).toBe(THREE.NoColorSpace);
      expect(texture.channel).toBe(0);
    }
    atlas.textures.forEach((texture) => texture.dispose());
  });

  it("disposes successful partial transcodes if another map fails instead of committing a mixed atlas", async () => {
    const disposed = vi.fn();
    let index = 0;
    controls.parse = (_buffer, done, fail) => {
      if (++index === 2) {
        fail(new Error("normal transcode failed"));
        return;
      }
      const texture = new THREE.DataTexture(new Uint8Array(16), 2, 2);
      texture.addEventListener("dispose", disposed);
      done(texture);
    };
    await expect(
      loadPbrAtlas({} as THREE.WebGLRenderer, 512, new AbortController().signal),
    ).rejects.toThrow("normal transcode failed");
    expect(disposed).toHaveBeenCalledTimes(2);
    expect(controls.disposed).toBe(1);
  });

  it("does not submit work or retain late transcoder initialization after unmount", async () => {
    let resolveInit: () => void = () => {};
    let initStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      initStarted = resolve;
    });
    controls.init = () => {
      initStarted();
      return new Promise<void>((resolve) => {
        resolveInit = resolve;
      });
    };
    const controller = new AbortController();
    const preparation = loadPbrAtlas({} as THREE.WebGLRenderer, 512, controller.signal);
    await started;
    controller.abort();
    await expect(preparation).rejects.toThrow("surface-atlas-aborted");
    expect(controls.parsed).toBe(0);
    expect(controls.disposed).toBe(0);
    resolveInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(controls.disposed).toBe(1);
    expect(controls.parsed).toBe(0);
  });
});
