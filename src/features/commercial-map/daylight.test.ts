import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createDaylightBackground,
  createDaylightPixels,
  createDaylightSky,
  DAYLIGHT,
  sampleDaylightDirection,
} from "./daylight";

describe("shared world-direction daylight", () => {
  it("keeps the exact horizon on either side, blue zenith and a grounded lower hemisphere", () => {
    const horizon = [220, 233, 236];
    for (const elevation of [-0.019, 0, 0.019])
      for (const azimuth of [-Math.PI, -1, 0, 1, Math.PI])
        expect(
          sampleDaylightDirection([
            Math.cos(elevation) * Math.cos(azimuth),
            Math.sin(elevation),
            Math.cos(elevation) * Math.sin(azimuth),
          ]),
        ).toEqual(horizon);
    const zenith = sampleDaylightDirection([0, 1, 0]);
    expect(zenith[2]).toBeGreaterThan(zenith[0] + 80);
    const ground = sampleDaylightDirection([0, -1, 0]);
    expect(ground[1]).toBeGreaterThan(ground[0]);
    expect(ground[2]).toBeLessThan(zenith[2]);
    expect(sampleDaylightDirection([0, 10, 0])).toEqual(zenith);
  });

  it("has a seamless world sampler at longitude wrap and the poles, independent of UV coordinates", () => {
    for (const elevation of [0.07, 0.12, 0.3, 0.7]) {
      const left = sampleDaylightDirection([-Math.cos(elevation), Math.sin(elevation), -1e-8]);
      const right = sampleDaylightDirection([-Math.cos(elevation), Math.sin(elevation), 1e-8]);
      expect(left).toEqual(right);
    }
    const pole = sampleDaylightDirection([0, 1, 0]);
    for (let azimuth = -Math.PI; azimuth <= Math.PI; azimuth += 0.21)
      expect(
        sampleDaylightDirection([Math.cos(azimuth) * 1e-8, 1, Math.sin(azimuth) * 1e-8]),
      ).toEqual(pole);
  });

  it("adds a few soft low clouds above the horizon without turning clear sky into a noise field", () => {
    const azimuth = -1.05,
      elevation = 0.105;
    const direction: [number, number, number] = [
      Math.cos(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(azimuth) * Math.cos(elevation),
    ];
    const cloud = sampleDaylightDirection(direction),
      clear = sampleDaylightDirection(direction, false);
    expect(cloud[0]).toBeGreaterThan(clear[0] + 10);
    let cloudSamples = 0;
    for (let azimuth = -Math.PI; azimuth < Math.PI; azimuth += 0.06)
      for (let y = 0.07; y < 0.9; y += 0.06) {
        const radius = Math.sqrt(1 - y * y);
        const direction: [number, number, number] = [
          Math.cos(azimuth) * radius,
          y,
          Math.sin(azimuth) * radius,
        ];
        const cloud = sampleDaylightDirection(direction),
          clear = sampleDaylightDirection(direction, false);
        if (cloud.some((channel, index) => channel - clear[index] > 3)) cloudSamples++;
      }
    expect(cloudSamples).toBeGreaterThan(5);
    expect(cloudSamples).toBeLessThan(90);
  });

  it("aligns a low-energy warm solar lobe with the same fixed world light direction", () => {
    const direction = DAYLIGHT.sunDirection;
    expect(Math.hypot(...direction)).toBeCloseTo(1, 8);
    expect(Math.asin(direction[1])).toBeCloseTo(Math.PI / 4, 8);
    const towards = sampleDaylightDirection(direction, false);
    const opposite = sampleDaylightDirection([-direction[0], direction[1], -direction[2]], false);
    expect(towards[0] - opposite[0]).toBeGreaterThan(towards[2] - opposite[2]);
    expect(towards[0]).toBeGreaterThan(opposite[0] + 5);
    expect(towards.every((channel) => channel <= 255)).toBe(true);
  });

  it("encodes the same sampler into south-first panoramas with uniform poles and cached CPU bytes", () => {
    const width = 128,
      height = 64;
    const pixels = createDaylightPixels(width, height);
    expect(createDaylightPixels(width, height)).toBe(pixels);
    expect(pixels).toHaveLength(width * height * 4);
    for (const row of [0, height - 1])
      for (let column = 1; column < width; column++)
        expect(
          Array.from(pixels.slice((row * width + column) * 4, (row * width + column) * 4 + 4)),
        ).toEqual(Array.from(pixels.slice(row * width * 4, row * width * 4 + 4)));
    const column = 31,
      row = 43;
    const elevation = (row / (height - 1) - 0.5) * Math.PI;
    const azimuth = ((column + 0.5) / width - 0.5) * Math.PI * 2;
    const expected = sampleDaylightDirection([
      Math.cos(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(azimuth) * Math.cos(elevation),
    ]);
    expect(
      Array.from(pixels.slice((row * width + column) * 4, (row * width + column) * 4 + 3)),
    ).toEqual(expected);
  });

  it("shares immutable panorama bytes across reopen while each renderer owns and disposes its own texture", () => {
    const a = createDaylightSky(),
      b = createDaylightSky();
    const aDisposed = vi.fn(),
      bDisposed = vi.fn();
    a.texture.addEventListener("dispose", aDisposed);
    b.texture.addEventListener("dispose", bDisposed);
    expect(a.texture).not.toBe(b.texture);
    expect(a.texture.image.data).toBe(b.texture.image.data);
    expect(a.texture.image.width).toBe(1024);
    expect(a.texture.image.height).toBe(512);
    expect(a.textureBytes).toBe(1024 * 512 * 4);
    expect(a.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(a.texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(a.texture.flipY).toBe(false);
    expect(a.texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(a.texture.generateMipmaps).toBe(false);
    expect(a.texture.minFilter).toBe(THREE.LinearFilter);
    a.dispose();
    a.dispose();
    expect(aDisposed).toHaveBeenCalledTimes(1);
    expect(bDisposed).not.toHaveBeenCalled();
    b.dispose();
    expect(bDisposed).toHaveBeenCalledTimes(1);
  });

  it("provides the same immediate simple blue gradient for deliberate low detail and rich-preparation failure", () => {
    const simple = createDaylightSky({ detail: "simple" }),
      failed = createDaylightSky({ fail: true });
    expect(simple.fallback).toBe(false);
    expect(failed.fallback).toBe(true);
    expect(simple.detail).toBe("simple");
    expect(failed.detail).toBe("simple");
    expect(simple.texture.image.data).toBe(failed.texture.image.data);
    expect(simple.textureBytes).toBe(64 * 32 * 4);
    expect(sampleDaylightDirection([0, 1, 0], false)[2]).toBeGreaterThan(200);
    simple.dispose();
    failed.dispose();
  });

  it("disposes a partially allocated rich texture and retains a usable fallback on texture preparation errors", () => {
    const update = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, "needsUpdate")!.set!;
    const disposed = vi.spyOn(THREE.Texture.prototype, "dispose");
    let calls = 0;
    const textureUpdate = vi
      .spyOn(THREE.Texture.prototype, "needsUpdate", "set")
      .mockImplementation(function (this: THREE.Texture, value: boolean) {
        if (++calls === 1) throw new Error("simulated sky texture preparation failure");
        update.call(this, value);
      });
    try {
      const sky = createDaylightSky();
      expect(disposed).toHaveBeenCalledTimes(1);
      expect(sky.fallback).toBe(true);
      expect(sky.texture.image.width).toBe(64);
      sky.dispose();
      expect(disposed).toHaveBeenCalledTimes(2);
    } finally {
      textureUpdate.mockRestore();
      disposed.mockRestore();
    }
  });

  it("rejects invalid directions and unbounded preview allocations", () => {
    expect(() => sampleDaylightDirection([0, 0, 0])).toThrow("invalid-direction");
    expect(() => sampleDaylightDirection([Infinity, 0, 0])).toThrow("invalid-direction");
    expect(() => createDaylightPixels(0, 0)).toThrow("invalid-panorama-size");
    expect(() => createDaylightPixels(4096, 2048)).toThrow("invalid-panorama-size");
  });

  it("switches direct sky textures without recompiling, blocking picking or taking texture ownership", () => {
    const simple = createDaylightSky({ detail: "simple" }),
      rich = createDaylightSky();
    const background = createDaylightBackground(simple.texture);
    const material = background.mesh.material;
    const materialDisposed = vi.fn(),
      geometryDisposed = vi.fn(),
      textureDisposed = vi.fn();
    material.addEventListener("dispose", materialDisposed);
    background.mesh.geometry.addEventListener("dispose", geometryDisposed);
    simple.texture.addEventListener("dispose", textureDisposed);
    rich.texture.addEventListener("dispose", textureDisposed);
    const version = material.version;
    const initialMatrix = background.mesh.matrix.toArray();
    const scene = new THREE.Scene();
    scene.add(background.mesh);
    background.mesh.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
    expect(raycaster.intersectObject(background.mesh)).toHaveLength(0);
    background.setTexture(rich.texture);
    expect(material.uniforms.panorama.value).toBe(rich.texture);
    expect(material.version).toBe(version);
    expect(background.mesh.matrix.toArray()).toEqual(initialMatrix);
    expect(material.side).toBe(THREE.BackSide);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(background.mesh.frustumCulled).toBe(false);
    expect(background.mesh.renderOrder).toBeGreaterThan(0);
    expect(background.mesh.geometry.getIndex()!.count / 3).toBe(12);
    background.dispose();
    background.dispose();
    expect(scene.children).toHaveLength(0);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(textureDisposed).not.toHaveBeenCalled();
    simple.dispose();
    rich.dispose();
    expect(textureDisposed).toHaveBeenCalledTimes(2);
  });
});
