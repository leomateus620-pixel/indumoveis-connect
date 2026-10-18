import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { bindPbrAtlas, type PbrAtlas } from "./pbrAtlas";
import { createSoftwareMaterials } from "./softwareMaterials";

const atlas = (): PbrAtlas => ({
  textures: [0, 1, 2].map(
    () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
  ) as PbrAtlas["textures"],
  textureBytes: 12,
  width: 512,
  compressed: false,
});

describe("presentation-only diffuse materials for Automatic software", () => {
  it("leaves disabled hardware meshes and material arrays untouched without creating mirrors", () => {
    const controller = createSoftwareMaterials({ enabled: false });
    const standard = new THREE.MeshStandardMaterial(),
      basic = new THREE.MeshBasicMaterial();
    const array = [standard, basic],
      geometry = new THREE.BufferGeometry(),
      root = new THREE.Group();
    const a = new THREE.Mesh(geometry, standard),
      b = new THREE.Mesh(geometry, array);
    root.add(a, b);
    controller.sync(root);
    controller.update();
    controller.setEnabled(false);
    expect(controller.materialCount).toBe(0);
    expect(a.material).toBe(standard);
    expect(b.material).toBe(array);
    controller.dispose();
    controller.dispose();
    expect(a.material).toBe(standard);
    expect(b.material).toBe(array);
    geometry.dispose();
    standard.dispose();
    basic.dispose();
  });

  it("shares one Lambert per canonical source and preserves color, albedo, alpha, geometry and render state", () => {
    const controller = createSoftwareMaterials({ enabled: true }),
      geometry = new THREE.BufferGeometry(),
      map = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({
      color: "#989f9b",
      map,
      vertexColors: true,
      side: THREE.DoubleSide,
      alphaTest: 0.3,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    });
    source.normalMap = source.bumpMap = source.roughnessMap = source.aoMap = source.envMap = map;
    const roughness = source.roughness,
      metalness = source.metalness,
      root = new THREE.Group();
    const a = new THREE.Mesh(geometry, source),
      b = new THREE.Mesh(geometry, source);
    root.add(a, b);
    controller.sync(root);
    const mirror = a.material as unknown as THREE.MeshLambertMaterial;
    expect(mirror).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(b.material).toBe(mirror);
    expect(controller.materialCount).toBe(1);
    expect(mirror.color.equals(source.color)).toBe(true);
    expect(mirror.map).toBe(map);
    for (const key of [
      "vertexColors",
      "side",
      "alphaTest",
      "transparent",
      "opacity",
      "depthWrite",
      "polygonOffset",
      "polygonOffsetFactor",
      "polygonOffsetUnits",
    ] as const)
      expect(mirror[key]).toBe(source[key]);
    expect(mirror.normalMap).toBeNull();
    expect(mirror.bumpMap).toBeNull();
    expect(mirror.aoMap).toBeNull();
    expect(mirror.envMap).toBeNull();
    expect(a.geometry).toBe(geometry);
    expect(source.roughness).toBe(roughness);
    expect(source.metalness).toBe(metalness);
    const version = mirror.version;
    source.color.set("#63735f");
    source.opacity = 0.5;
    source.normalMap = null;
    source.needsUpdate = true;
    for (let i = 0; i < 20; i++) controller.update();
    expect(mirror.color.equals(source.color)).toBe(true);
    expect(mirror.opacity).toBe(0.5);
    expect(mirror.version).toBe(version);
    expect(controller.materialCount).toBe(1);
    source.side = THREE.FrontSide;
    controller.update();
    expect(mirror.side).toBe(THREE.FrontSide);
    expect(mirror.version).toBeGreaterThan(version);
    const featureVersion = mirror.version;
    controller.update();
    expect(mirror.version).toBe(featureVersion);
    controller.setEnabled(false);
    expect(a.material).toBe(source);
    expect(b.material).toBe(source);
    controller.setEnabled(true);
    expect(a.material).toBe(mirror);
    expect(controller.materialCount).toBe(1);
    controller.dispose();
    geometry.dispose();
    source.dispose();
    map.dispose();
  });

  it("follows a late atlas map/hook exactly while keeping costly PBR maps absent and restores its live canonical source", () => {
    const controller = createSoftwareMaterials({ enabled: true }),
      source = new THREE.MeshStandardMaterial({ color: "#989f9b" }),
      geometry = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(geometry, source),
      maps = atlas();
    controller.sync(mesh);
    const mirror = mesh.material as unknown as THREE.MeshLambertMaterial;
    const version = mirror.version;
    bindPbrAtlas(source, "concrete", maps);
    source.envMap = maps.textures[0];
    controller.update();
    expect(mirror.map).toBe(maps.textures[0]);
    expect(mirror.onBeforeCompile).toBe(source.onBeforeCompile);
    expect(mirror.customProgramCacheKey).toBe(source.customProgramCacheKey);
    expect(mirror.version).toBeGreaterThan(version);
    const shader = {
      uniforms: {},
      vertexShader: "",
      fragmentShader: "#include <map_fragment>",
    } as Parameters<typeof mirror.onBeforeCompile>[0];
    mirror.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.surfaceAtlasRect).toBeDefined();
    expect(shader.fragmentShader).toContain("surfaceAtlasRead( map, vMapUv )");
    expect(mirror.normalMap || mirror.bumpMap || mirror.aoMap || mirror.envMap).toBeNull();
    const settled = mirror.version;
    controller.update();
    controller.sync(mesh);
    controller.update();
    expect(mirror.version).toBe(settled);
    controller.setEnabled(false);
    expect(mesh.material).toBe(source);
    expect(source.normalMap).toBe(maps.textures[1]);
    expect(source.roughnessMap).toBe(maps.textures[2]);
    controller.dispose();
    geometry.dispose();
    source.dispose();
    maps.textures.forEach((t) => t.dispose());
  });

  it("handles late meshes, temporary floor swaps and arrays without losing external canonical replacements", () => {
    const controller = createSoftwareMaterials({ enabled: true }),
      root = new THREE.Group(),
      geometry = new THREE.BufferGeometry();
    const temporary = new THREE.MeshLambertMaterial(),
      standard = new THREE.MeshStandardMaterial(),
      second = new THREE.MeshStandardMaterial(),
      basic = new THREE.MeshBasicMaterial();
    const floor: THREE.Mesh = new THREE.Mesh(geometry, temporary);
    root.add(floor);
    controller.sync(root);
    expect(floor.material).toBe(temporary);
    floor.material = standard;
    controller.sync(root);
    const firstMirror = floor.material;
    expect(firstMirror).not.toBe(standard);
    const canonical = [standard, basic, second],
      late = new THREE.Mesh(geometry, canonical);
    root.add(late);
    controller.sync(root);
    expect(Array.isArray(late.material)).toBe(true);
    expect(late.material).not.toBe(canonical);
    const presented = late.material as THREE.Material[];
    expect(presented[0]).toBe(firstMirror);
    expect(presented[1]).toBe(basic);
    expect(presented[2]).not.toBe(second);
    controller.setEnabled(false);
    expect(late.material).toBe(canonical);
    expect(floor.material).toBe(standard);
    controller.setEnabled(true);
    const replacement = new THREE.MeshStandardMaterial();
    floor.material = replacement;
    // A manual/profile switch may precede the next sync: keep this latest swap.
    controller.setEnabled(false);
    expect(floor.material).toBe(replacement);
    controller.setEnabled(true);
    controller.sync(root);
    expect(floor.material).not.toBe(replacement);
    controller.dispose();
    expect(floor.material).toBe(replacement);
    expect(late.material).toBe(canonical);
    geometry.dispose();
    for (const material of [temporary, standard, second, basic, replacement]) material.dispose();
  });

  it("retains source-array changes and canonicalizes an externally edited presentation array", () => {
    const controller = createSoftwareMaterials({ enabled: true }),
      geometry = new THREE.BufferGeometry();
    const a = new THREE.MeshStandardMaterial(),
      b = new THREE.MeshStandardMaterial(),
      basic = new THREE.MeshBasicMaterial(),
      array = [a, basic];
    const mesh = new THREE.Mesh(geometry, array);
    controller.sync(mesh);
    array[0] = b;
    controller.sync(mesh);
    expect((mesh.material as THREE.Material[])[0]).not.toBe(a);
    (mesh.material as THREE.Material[])[1] = a;
    controller.sync(mesh);
    controller.setEnabled(false);
    expect(mesh.material).toEqual([b, a]);
    controller.dispose();
    geometry.dispose();
    a.dispose();
    b.dispose();
    basic.dispose();
  });

  it("restores all meshes and disposes owned mirrors once, never source materials, textures or geometry", () => {
    const controller = createSoftwareMaterials({ enabled: true }),
      geometry = new THREE.BufferGeometry(),
      source = new THREE.MeshStandardMaterial(),
      map = new THREE.Texture();
    source.map = map;
    const sourceDispose = vi.spyOn(source, "dispose"),
      textureDispose = vi.spyOn(map, "dispose"),
      geometryDispose = vi.spyOn(geometry, "dispose");
    const mesh = new THREE.Mesh(geometry, source);
    controller.sync(mesh);
    const mirrorDispose = vi.spyOn(mesh.material, "dispose");
    controller.dispose();
    controller.dispose();
    controller.update();
    controller.sync(mesh);
    controller.setEnabled(true);
    expect(mesh.material).toBe(source);
    expect(mirrorDispose).toHaveBeenCalledTimes(1);
    expect(controller.materialCount).toBe(0);
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
    expect(geometryDispose).not.toHaveBeenCalled();
    source.dispose();
    map.dispose();
    geometry.dispose();
  });
});
