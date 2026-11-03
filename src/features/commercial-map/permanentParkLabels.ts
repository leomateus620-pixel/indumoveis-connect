import * as THREE from "three";
import { PERMANENT_PARK_LANDMARKS } from "./permanentParkLayout";

type Label = {
  text: string;
  position: [number, number, number];
  mode: -1 | 0 | 1;
  offsetY?: number;
};
const closeDistance = 60;
const maxDistance = 90;
const labelHalfWidth = 47;
const labelHalfHeight = 11;

/** Deterministic projection-space collision test for the small contextual atlas. */
export function visiblePermanentParkLabels(
  labels: readonly Label[],
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  const placed: { x: number; y: number }[] = [];
  const projected = new THREE.Vector3();
  const cameraWorld = new THREE.Vector3();
  camera.getWorldPosition(cameraWorld);
  return labels.map((label) => {
    const distance = cameraWorld.distanceTo(projected.set(...label.position));
    if (
      distance > maxDistance ||
      (label.mode < 0 && distance > closeDistance) ||
      (label.mode > 0 && distance <= closeDistance)
    )
      return false;
    projected.project(camera);
    if (projected.z < -1 || projected.z > 1) return false;
    const x = ((projected.x + 1) * width) / 2;
    const y = ((1 - projected.y) * height) / 2 - (label.offsetY ?? 0);
    if (
      x < labelHalfWidth ||
      x > width - labelHalfWidth ||
      y < labelHalfHeight ||
      y > height - labelHalfHeight
    )
      return false;
    if (
      placed.some(
        (prior) =>
          Math.abs(prior.x - x) < labelHalfWidth * 2 + 4 &&
          Math.abs(prior.y - y) < labelHalfHeight * 2 + 4,
      )
    )
      return false;
    placed.push({ x, y });
    return true;
  });
}
/** One optional texture and draw call. No mesh is commercial or pickable. */
export function createPermanentParkLabels() {
  let texture: THREE.CanvasTexture | undefined;
  let material: THREE.ShaderMaterial | undefined;
  let geometry: THREE.BufferGeometry | undefined;
  try {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 448;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const positionOf = (id: string, height: number): [number, number, number] => {
      const [x0, z0, x1, z1] = PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!.bounds;
      return [(x0 + x1) / 2, height, (z0 + z1) / 2];
    };
    const labels: Label[] = [
      { text: "Pavilhão 9", position: positionOf("pavilhao-9", 4.8), mode: 0 },
      { text: "Pavilhão 7", position: positionOf("pavilhao-7", 4.4), mode: 0 },
      { text: "Pavilhões 6, 10 e 11", position: positionOf("pavilhoes-6-10-11", 4.4), mode: 0 },
      { text: "Pavilhão 5", position: positionOf("pavilhao-5", 4.4), mode: 0 },
      { text: "Exporural", position: [120, 3, -56], mode: 0 },
      { text: "Alameda Gastronômica", position: positionOf("alameda", 4), mode: 0, offsetY: 12 },
      { text: "Mirante", position: positionOf("mirante", 5.1), mode: 0, offsetY: -12 },
      { text: "Arena", position: positionOf("arena", 8.1), mode: 0 },
      { text: "Casa / Sede", position: positionOf("sede", 5.2), mode: 0 },
      { text: "Etnia Polonesa", position: positionOf("etnia-polonesa", 5), mode: -1 },
      { text: "Etnia Italiana", position: positionOf("etnia-italiana", 5), mode: -1 },
      { text: "Etnia Alemã", position: positionOf("etnia-alema", 5), mode: -1 },
      { text: "Etnia Afro", position: positionOf("etnia-afro", 5), mode: -1 },
      { text: "Casas das Etnias", position: [208, 5.2, 78.5], mode: 1 },
    ];
    const positions: number[] = [],
      uvs: number[] = [],
      offsets: number[] = [],
      visibility: number[] = [],
      indices: number[] = [];
    labels.forEach((label, i) => {
      const column = i % 2,
        row = Math.floor(i / 2),
        x = column * 256,
        y = row * 64;
      context.fillStyle = "rgba(250, 250, 245, 0.94)";
      context.beginPath();
      context.roundRect(x + 5, y + 8, 246, 48, 10);
      context.fill();
      context.font = "600 30px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#352e36";
      context.fillText(label.text, x + 128, y + 32, 230);
      const u0 = column / 2,
        u1 = (column + 1) / 2,
        v0 = 1 - (row + 1) / 7,
        v1 = 1 - row / 7;
      const vertices = [
        [-47, -11, u0, v0],
        [47, -11, u1, v0],
        [47, 11, u1, v1],
        [-47, 11, u0, v1],
      ];
      for (const [dx, dy, u, v] of vertices) {
        positions.push(...label.position);
        offsets.push(dx, dy + (label.offsetY ?? 0));
        uvs.push(u, v);
        visibility.push(0);
      }
      indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("labelOffset", new THREE.Float32BufferAttribute(offsets, 2));
    geometry.setAttribute("labelVisible", new THREE.Float32BufferAttribute(visibility, 1));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const viewport = new THREE.Vector2(1, 1);
    material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      uniforms: {
        atlas: { value: texture },
        viewport: { value: viewport },
      },
      vertexShader: `
        attribute vec2 labelOffset;
        attribute float labelVisible;
        varying vec2 vUv;
        uniform vec2 viewport;
        void main() {
          vUv = uv;
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          if (labelVisible < 0.5 || clip.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          clip.xy += labelOffset * 2.0 / max(viewport, vec2(1.0)) * clip.w;
          gl_Position = clip;
        }`,
      fragmentShader: `
        uniform sampler2D atlas;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(atlas, vUv);
          if (color.a < 0.01) discard;
          gl_FragColor = color;
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "permanent-park-labels";
    mesh.userData.commercialPickable = false;
    mesh.raycast = () => {};
    mesh.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getSize(viewport);
      const visible = visiblePermanentParkLabels(labels, camera, viewport.x, viewport.y);
      const attribute = geometry!.getAttribute("labelVisible") as THREE.BufferAttribute;
      let changed = false;
      visible.forEach((show, index) => {
        const value = show ? 1 : 0;
        if (attribute.getX(index * 4) === value) return;
        changed = true;
        for (let vertex = 0; vertex < 4; vertex++) attribute.setX(index * 4 + vertex, value);
      });
      if (changed) attribute.needsUpdate = true;
    };
    // Bounding sphere contains all anchors; clip-space offsets are deliberately
    // omitted, so keep this single small batch visible near frustum edges.
    mesh.frustumCulled = false;
    let disposed = false;
    return {
      mesh,
      labels: labels.length,
      textureBytes: canvas.width * canvas.height * 4,
      dispose() {
        if (disposed) return;
        disposed = true;
        geometry!.dispose();
        material!.dispose();
        texture!.dispose();
      },
    };
  } catch {
    geometry?.dispose();
    material?.dispose();
    texture?.dispose();
    return null;
  }
}
