import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { polygonBounds } from "@/features/commercial-map/geometry";
import type { InteriorEnvironment, PavilionPlan } from "./data";
import { framePavilion1Bounds, pavilion1ViewDirection } from "./pavilion1Framing";
import {
  PAVILION_1_ARTWORK,
  pavilion1RoomForHit,
  type Pavilion1ModelControls,
} from "./pavilion1Artwork";

interface SceneOptions {
  host: HTMLDivElement;
  labels: HTMLDivElement;
  plan: PavilionPlan;
  onChoose: (code: string) => void;
  onReady: () => void;
  onUnavailable: () => void;
}

function release(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  const bitmaps = new Set<ImageBitmap>();
  for (const texture of textures) {
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap)
      bitmaps.add(texture.image);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export function openPavilion1Model({
  host,
  labels,
  plan,
  onChoose,
  onReady,
  onUnavailable,
}: SceneOptions): Pavilion1ModelControls & { dispose(): void } {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  host.appendChild(canvas);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, host.clientWidth < 700 ? 1.4 : 1.75),
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 12000);
  const orbit = new OrbitControls(camera, canvas);
  orbit.minDistance = 48;
  orbit.maxDistance = 8400;
  orbit.minPolarAngle = 0.04;
  orbit.maxPolarAngle = Math.PI * 0.455;
  orbit.rotateSpeed = 0.65;
  orbit.screenSpacePanning = false;
  scene.add(new THREE.HemisphereLight(0xfff8eb, 0xc8afa0, 1.8));
  const sun = new THREE.DirectionalLight(0xfff2db, 2.15);
  const { minX, maxX, minY, maxY } = plan.bounds;
  sun.target.position.set((minX + maxX) / 2, 0, (minY + maxY) / 2);
  sun.position.copy(sun.target.position).add(new THREE.Vector3(-350, 750, -450));
  const shadowSpan = Math.hypot(maxX - minX, maxY - minY) * 0.51;
  Object.assign(sun.shadow.camera, {
    left: -shadowSpan,
    right: shadowSpan,
    top: shadowSpan,
    bottom: -shadowSpan,
    near: 1,
    far: 2000,
  });
  const shadowSize = host.clientWidth < 700 ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.normalBias = 0.22;
  sun.castShadow = true;
  scene.add(sun.target, sun);
  // The architecture and sun are fixed. Bake the shadow map once per model load.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const modelBounds = new THREE.Box3();
  const roomBounds = new Map<string, THREE.Box3>();
  const outline = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x5a2944, depthTest: false, depthWrite: false }),
  );
  outline.visible = false;
  outline.renderOrder = 5;
  scene.add(outline);
  const modelLabels = Array.from(labels.querySelectorAll<HTMLButtonElement>("[data-room]")).flatMap(
    (element) => {
      const room = plan.environments.find(
        (environment) => environment.code === element.dataset.room,
      );
      return room
        ? [
            {
              element,
              room,
              anchor: new THREE.Vector3(room.label[0], 13, room.label[1]),
              width: element.offsetWidth || 31,
              height: element.offsetHeight || 24,
            },
          ]
        : [];
    },
  );
  let active: InteriorEnvironment | undefined;
  let model: THREE.Object3D | undefined;
  let firstModelFrame = false;
  let handle = 0;
  let disposed = false;
  let width = 0;
  let height = 0;
  const projected = new THREE.Vector3();
  function render() {
    handle = 0;
    if (disposed || !width || !height) return;
    renderer.render(scene, camera);
    if (model && !firstModelFrame) {
      firstModelFrame = true;
      onReady();
    }
    const placed: { x: number; y: number; width: number; height: number }[] = [];
    const rank = (label: (typeof modelLabels)[number]) =>
      label.element.getAttribute("aria-pressed") === "true" ||
      label.element === document.activeElement
        ? 0
        : ["01", "12", "14"].includes(label.room.code)
          ? 1
          : 2;
    for (const label of modelLabels.sort((a, b) => rank(a) - rank(b))) {
      const { element, anchor } = label;
      projected.copy(anchor).project(camera);
      const offscreen =
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1;
      const x = ((projected.x + 1) * width) / 2;
      const y = ((1 - projected.y) * height) / 2;
      const overlaps = placed.some(
        (other) =>
          Math.abs(x - other.x) * 2 < label.width + other.width + 6 &&
          Math.abs(y - other.y) * 2 < label.height + other.height + 6,
      );
      element.hidden = !model || offscreen || overlaps;
      if (element.hidden) continue;
      placed.push({ x, y, width: label.width, height: label.height });
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }
  function invalidate() {
    if (!disposed && !handle) handle = window.requestAnimationFrame(render);
  }
  const focus = (environment?: InteriorEnvironment) => {
    active = environment;
    if (!width || !height) return;
    let bounds = environment ? roomBounds.get(environment.code) : modelBounds;
    if (!bounds || bounds.isEmpty()) {
      const b = environment
        ? polygonBounds(environment.parts.flatMap((part) => part.polygon))
        : plan.bounds;
      bounds = new THREE.Box3(
        new THREE.Vector3(b.minX, 0, b.minY),
        new THREE.Vector3(b.maxX, 24, b.maxY),
      );
    }
    const direction = pavilion1ViewDirection(
      width,
      height,
      environment ? bounds.getSize(new THREE.Vector3()) : undefined,
    );
    const surface = host.getBoundingClientRect();
    const workspace = host.closest(".arq-canvas");
    const toggle = workspace?.querySelector(".arq-p1-view-toggle")?.getBoundingClientRect();
    const toolbar = workspace?.querySelector(".arq-view-controls")?.getBoundingClientRect();
    const side = Math.min(22, width * 0.035);
    const top = Math.min(
      height * 0.2,
      Math.max(side, (toggle?.bottom ?? surface.top) - surface.top + 7),
    );
    const bottom = Math.min(
      height * 0.38,
      Math.max(side, surface.bottom - (toolbar?.top ?? surface.bottom) + 7),
    );
    camera.setViewOffset(width, height, 0, (bottom - top) / 2, width, height);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const { target, position } = framePavilion1Bounds(
      bounds,
      direction,
      (tan * (width - 2 * side)) / height,
      (tan * (height - top - bottom)) / height,
    );
    camera.position.copy(position);
    orbit.target.copy(target);
    orbit.update();
    invalidate();
  };
  function resize() {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    width = rect.width;
    height = rect.height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    focus(active);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  orbit.addEventListener("change", invalidate);

  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundPoint = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const pick = (event: PointerEvent) => {
    if (!firstModelFrame || !model) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / width) * 2 - 1,
      1 - ((event.clientY - rect.top) / height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    const intersection = raycaster.intersectObject(model)[0];
    const point = intersection?.point ?? raycaster.ray.intersectPlane(floor, groundPoint);
    if (!point) return;
    let owner: string | undefined;
    for (
      let node: THREE.Object3D | null = intersection?.object ?? null;
      node && !owner;
      node = node.parent
    )
      owner = node.userData.environmentCode;
    const code = pavilion1RoomForHit(plan, [point.x, point.z], owner);
    if (code) onChoose(code);
  };
  const pointers = new Set<number>();
  let start: { x: number; y: number } | undefined;
  const down = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    start =
      event.button === 0 && pointers.size === 1
        ? { x: event.clientX, y: event.clientY }
        : undefined;
  };
  const move = (event: PointerEvent) => {
    if (start && Math.hypot(start.x - event.clientX, start.y - event.clientY) > 5)
      start = undefined;
  };
  const up = (event: PointerEvent) => {
    if (
      pointers.has(event.pointerId) &&
      start &&
      Math.hypot(start.x - event.clientX, start.y - event.clientY) <= 5
    )
      pick(event);
    pointers.delete(event.pointerId);
    start = undefined;
  };
  const cancel = () => {
    start = undefined;
    pointers.clear();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cancel);
  canvas.addEventListener("webglcontextlost", onUnavailable);

  const abort = new AbortController();
  async function load() {
    const response = await fetch(PAVILION_1_ARTWORK.model, { signal: abort.signal });
    if (!response.ok) throw new Error("Pavilion model unavailable");
    const bytes = await response.arrayBuffer();
    if (disposed) return;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, "");
    if (disposed) {
      release(gltf.scene);
      return;
    }
    model = gltf.scene;
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    scene.add(model);
    model.updateMatrixWorld(true);
    modelBounds.setFromObject(model);
    model.traverse((node) => {
      const code = node.userData.environmentCode;
      if (typeof code !== "string") return;
      const box = roomBounds.get(code) ?? new THREE.Box3();
      box.expandByObject(node);
      roomBounds.set(code, box);
    });
    focus(active);
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }
  void load().catch(() => {
    if (!disposed) onUnavailable();
  });

  return {
    fit: () => focus(),
    focus,
    highlight(codes, sale) {
      const positions: number[] = [];
      for (const room of plan.environments.filter((item) => codes.includes(item.code))) {
        for (const part of room.parts) {
          for (let index = 1; index < part.polygon.length; index++) {
            const [x1, z1] = part.polygon[index - 1];
            const [x2, z2] = part.polygon[index];
            positions.push(x1, 1, z1, x2, 1, z2);
          }
        }
      }
      outline.geometry.dispose();
      outline.geometry = new THREE.BufferGeometry();
      outline.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      outline.visible = positions.length > 0;
      outline.material.color.set(sale ? 0x075451 : 0x5a2944);
      invalidate();
    },
    zoom(factor) {
      const offset = camera.position.clone().sub(orbit.target);
      offset.setLength(
        THREE.MathUtils.clamp(offset.length() / factor, orbit.minDistance, orbit.maxDistance),
      );
      camera.position.copy(orbit.target).add(offset);
      orbit.update();
      invalidate();
    },
    rotate(angle) {
      const offset = camera.position.clone().sub(orbit.target).applyAxisAngle(floor.normal, angle);
      camera.position.copy(orbit.target).add(offset);
      orbit.update();
      invalidate();
    },
    dispose() {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(handle);
      observer.disconnect();
      orbit.removeEventListener("change", invalidate);
      orbit.dispose();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      canvas.removeEventListener("webglcontextlost", onUnavailable);
      if (model) release(model);
      sun.shadow.dispose();
      outline.geometry.dispose();
      outline.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
