import * as THREE from "three";
import { SURFACE_PALETTE, type SurfaceFamily, type SurfaceMaterials } from "./surfaceMaterials";
import { P1_PHOTO_PLANTER } from "./photoPavilionSetting";

export function createPhotoPavilionSetting(surfaces: SurfaceMaterials) {
  const group = new THREE.Group();
  group.name = "photo-p1-front-planter";
  const resources: THREE.BufferGeometry[] = [];
  const { center, radius, upperRadius, soilRadius, bottom, baseTop, rimTop, soilTop } =
    P1_PHOTO_PLANTER;

  function add(
    family: SurfaceFamily,
    color: string,
    emit: (triangle: (a: number[], b: number[], c: number[]) => void) => void,
  ) {
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const value = new THREE.Color(color);
    const materialBase = new THREE.Color(SURFACE_PALETTE[family]);
    const tint = [value.r / materialBase.r, value.g / materialBase.g, value.b / materialBase.b];
    emit((a, b, c) => {
      for (const p of [a, b, c]) {
        positions.push(center[0] + p[0], p[1], center[1] + p[2]);
        colors.push(...tint);
        uvs.push(p[0], p[2] + p[1]);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    resources.push(geometry);
    const mesh = new THREE.Mesh(geometry, surfaces.materials[family]);
    mesh.name = `photo-p1-planter-${family}`;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.raycast = () => {};
    group.add(mesh);
  }

  function ring(
    family: SurfaceFamily,
    color: string,
    outer: number,
    inner: number,
    low: number,
    high: number,
  ) {
    add(family, color, (triangle) => {
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const b = ((i + 1) / 64) * Math.PI * 2;
        const p = (r: number, angle: number, y: number) => [
          Math.cos(angle) * r,
          y,
          Math.sin(angle) * r,
        ];
        const oa = p(outer, a, high),
          ob = p(outer, b, high),
          ia = p(inner, a, high),
          ib = p(inner, b, high);
        const oal = p(outer, a, low),
          obl = p(outer, b, low),
          ial = p(inner, a, low),
          ibl = p(inner, b, low);
        // Top, exterior and interior walls have independent outward normals.
        triangle(oa, ia, ib);
        triangle(oa, ib, ob);
        triangle(oal, oa, ob);
        triangle(oal, ob, obl);
        triangle(ial, ibl, ib);
        triangle(ial, ib, ia);
      }
    });
  }
  ring("concrete", "#747878", radius, soilRadius, bottom, baseTop);
  ring("whitePaint", "#dedfd8", upperRadius, soilRadius, baseTop, rimTop);
  add("warmAccent", "#655c43", (triangle) => {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2,
        b = ((i + 1) / 64) * Math.PI * 2;
      triangle(
        [0, soilTop, 0],
        [Math.cos(b) * soilRadius, soilTop, Math.sin(b) * soilRadius],
        [Math.cos(a) * soilRadius, soilTop, Math.sin(a) * soilRadius],
      );
    }
  });
  let disposed = false;
  return {
    group,
    textureBytes: 0,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of resources) geometry.dispose();
      group.clear();
    },
  };
}
