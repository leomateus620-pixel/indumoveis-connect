import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLandscapeUniforms,
  createRegionalLandscape,
  landscapeQuality,
} from "./regionalLandscape";
import { projectReferenceCoordinate } from "./urbanReference";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture() {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["payload"]),
      arrayBuffer: async () => new Float32Array(9).buffer,
    })),
  );
  vi.stubGlobal("URL", { createObjectURL: () => "blob:fixture", revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    "Image",
    class {
      width = 64;
      height = 32;
      async decode() {}
    },
  );
  const uniforms = createLandscapeUniforms(new THREE.Color(), new THREE.Color());
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 4 },
    initTexture: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  return {
    scene: createRegionalLandscape(renderer, uniforms, async () => {}, vi.fn()),
    uniforms,
    renderer,
  };
}

describe("Santa Rosa landscape", () => {
  it("projects true north and east in the same directions as the park registration", () => {
    const uniforms = createLandscapeUniforms(new THREE.Color(), new THREE.Color());
    const anchor = [-54.478510885847626, -27.845042119845623];
    const [x, z] = projectReferenceCoordinate(anchor);
    expect(x).toBeCloseTo(95, 4);
    expect(z).toBeCloseTo(28, 4);
    const north = projectReferenceCoordinate([anchor[0], anchor[1] + 0.001]);
    const east = projectReferenceCoordinate([anchor[0] + 0.001, anchor[1]]);
    for (const [point, axis] of [
      [north, uniforms.landscapeNorth.value],
      [east, uniforms.landscapeEast.value],
    ] as const) {
      const direction = new THREE.Vector2(point[0] - x, point[1] - z).normalize();
      expect(direction.dot(axis)).toBeCloseTo(1, 8);
    }
  });

  it("uses the compact level on small drawing buffers, constrained GPUs and light profiles", () => {
    expect(landscapeQuality("detailed", 1468, 8192, 8)).toBe("detail");
    expect(landscapeQuality("detailed", 1468, 8192, 2)).toBe("compact");
    expect(landscapeQuality("balanced", 700, 8192)).toBe("compact");
    expect(landscapeQuality("balanced", 1366, 2048)).toBe("compact");
    expect(landscapeQuality("light", 2048, 8192)).toBe("compact");
  });

  it("publishes complete levels, shares the relief, measures presented frames and releases all textures on exit", async () => {
    const { scene, uniforms, renderer } = fixture();
    const dispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    scene.request("detail");
    await vi.advanceTimersByTimeAsync(225);
    expect(scene.stats.level).toBe("compact");
    expect(scene.stats.finalAt).toBeUndefined();
    scene.presented(200);
    expect(scene.stats.compactAt).toBe(200);
    const relief = scene.group.children[0];
    expect(relief.userData.commercialPickable).toBe(false);
    expect(uniforms.landscapeActive.value).toBe(true);
    await vi.runAllTimersAsync();
    expect(scene.stats.level).toBe("detail");
    expect(scene.group.children).toHaveLength(2);
    expect(scene.group.children[0]).toBe(relief);
    expect(scene.stats.featureCount).toBe(1);
    expect(dispose).toHaveBeenCalledTimes(7);
    expect(renderer.initTexture).toHaveBeenCalledTimes(16);
    expect(scene.stats.peakTextureBytes).toBeGreaterThan(scene.stats.textureBytes);
    scene.presented(300);
    expect(scene.stats.finalAt).toBe(300);
    scene.dispose();
    scene.dispose();
    expect(scene.stats.textureBytes).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(16);
    expect(uniforms.landscapeActive.value).toBe(false);
  });

  it("cancels late decodes and never publishes a half-loaded world", async () => {
    const { scene, uniforms, renderer } = fixture();
    scene.request("detail");
    await vi.advanceTimersByTimeAsync(30);
    scene.dispose();
    await vi.runAllTimersAsync();
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    expect(uniforms.landscapeNear.value).toBeNull();
    expect(scene.stats.level).toBe("pending");
    expect(scene.group.children).toHaveLength(0);
  });
});
