import * as THREE from "three";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  atlasRect,
  atlasTextureBytes,
  bindPbrAtlas,
  type AtlasFamily,
  type PbrAtlas,
} from "./pbrAtlas";

describe("commercial PBR atlas", () => {
  it("contains real mipmapped UASTC KTX2 assets in two bounded resolutions with correct colour/data transfer functions", () => {
    const directory = resolve(process.cwd(), "public/commercial-map/pbr");
    const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
    let downloadBytes = 0;
    for (const asset of manifest.assets as { file: string; bytes: number; sha256: string }[]) {
      const bytes = readFileSync(resolve(directory, asset.file));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(Array.from(bytes.subarray(0, 12))).toEqual([
        171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10,
      ]);
      const width = view.getUint32(20, true),
        height = view.getUint32(24, true);
      expect([512, 1024]).toContain(width);
      expect(height).toBe(width / 2);
      expect(view.getUint32(40, true)).toBe(Math.log2(width) + 1);
      expect(view.getUint32(44, true)).toBe(2); // Zstandard, not a renamed PNG.
      const descriptor = view.getUint32(48, true);
      expect(view.getUint8(descriptor + 12)).toBe(166); // UASTC LDR colour model.
      expect(view.getUint8(descriptor + 14)).toBe(asset.file.includes("albedo") ? 2 : 1);
      expect(bytes.byteLength).toBe(asset.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      downloadBytes += bytes.byteLength;
    }
    expect(downloadBytes).toBeLessThan(800_000);
  });

  it("keeps every repeating sample in its own padded cell and uses stable world gradients for normal/albedo/AO", () => {
    const families: AtlasFamily[] = ["mineral", "concrete", "asphalt", "paintedMetal", "grass"];
    for (let index = 0; index < families.length; index++) {
      const rect = atlasRect(families[index]);
      for (const u of [-100.5, -0.001, 0, 0.5, 0.999, 100.1])
        for (const v of [-70.2, 0, 0.5, 0.999, 72.8]) {
          const x = rect.x + (u - Math.floor(u)) * rect.z;
          const y = rect.y + (v - Math.floor(v)) * rect.w;
          expect(Math.floor(x * 4)).toBe(index % 4);
          expect(Math.floor(y * 2)).toBe(Math.floor(index / 4));
        }
    }
    const textures = [0, 1, 2].map(
      () => new THREE.DataTexture(new Uint8Array(16), 2, 2),
    ) as PbrAtlas["textures"];
    const material = new THREE.MeshStandardMaterial();
    bindPbrAtlas(material, "paintedMetal", {
      textures,
      width: 512,
      textureBytes: 48,
      compressed: false,
    });
    const shader = {
      uniforms: {},
      fragmentShader: [
        "map_fragment",
        "normal_fragment_maps",
        "roughnessmap_fragment",
        "aomap_fragment",
      ]
        .map((chunk) => `#include <${chunk}>`)
        .join("\n"),
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("textureGrad(atlasMap");
    expect(shader.fragmentShader).toContain("dFdx(worldUv)");
    expect(shader.fragmentShader).toContain("surfaceAtlasRead( normalMap, vNormalMapUv )");
    expect(shader.fragmentShader).toContain("surfaceAtlasRead( aoMap, vAoMapUv ).r");
    expect(shader.fragmentShader).toContain("surfaceAtlasRead( roughnessMap, vRoughnessMapUv )");
    expect(material.bumpMap).toBeNull();
    textures.forEach((texture) => texture.dispose());
    material.dispose();
  });

  it("accounts for actual uploaded mip bytes rather than source image or download size", () => {
    const texture = new THREE.CompressedTexture(
      [
        { data: new Uint8Array(256), width: 16, height: 16 },
        { data: new Uint8Array(64), width: 8, height: 8 },
        { data: new Uint8Array(16), width: 4, height: 4 },
      ],
      16,
      16,
      THREE.RGBA_BPTC_Format,
    );
    expect(atlasTextureBytes(texture)).toBe(336);
    texture.dispose();
  });
});
