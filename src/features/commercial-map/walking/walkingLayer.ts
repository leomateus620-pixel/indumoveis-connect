import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Point } from "../data/territory";
import { REFERENCE_UNITS_PER_METRE } from "../urbanReference";
import { distance, interpolate } from "./network";
import { permitsAvatar } from "./position";
import type { WalkingOverlay } from "./useParkWalking";

const blue = "#086bd8";
const vehicleClearance = 0.035;
const personHeight = 2.25 * REFERENCE_UNITS_PER_METRE;

function markerTexture(arrival: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "white";
  context.beginPath();
  context.arc(32, 32, 29, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = blue;
  context.beginPath();
  context.arc(32, 32, 22, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "white";
  context.fillStyle = "white";
  context.lineWidth = 3;
  if (arrival) {
    context.beginPath();
    context.moveTo(24, 44);
    context.lineTo(24, 21);
    context.lineTo(42, 21);
    context.lineTo(39, 28);
    context.lineTo(42, 35);
    context.lineTo(24, 35);
    context.stroke();
  } else {
    context.beginPath();
    context.arc(32, 32, 6, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(32, 32, 12, 0, Math.PI * 2);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWalkingLayer(scene: THREE.Scene, heightAt: (point: Point) => number) {
  const group = new THREE.Group();
  group.name = "walking-overlay";
  scene.add(group);
  const texture = markerTexture(false),
    flag = markerTexture(true);
  const icon = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }),
  );
  const arrival = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flag, depthTest: false, depthWrite: false }),
  );
  icon.renderOrder = 15;
  arrival.renderOrder = 14;
  arrival.center.set(0.5, 0.17);
  const body = new THREE.Group();
  body.scale.setScalar(personHeight / 1.68);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const jacket = new THREE.MeshBasicMaterial({ color: "#1585ed" });
  const trousers = new THREE.MeshBasicMaterial({ color: "#142844" });
  const face = new THREE.MeshBasicMaterial({ color: "#cb9274" });
  const white = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  function part(
    parent: THREE.Group,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    at: [number, number, number],
    scale: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    mesh.scale.set(...scale);
    parent.add(mesh);
  }
  part(body, sphere, face, [0, 1.48, 0.05], [0.16, 0.19, 0.16]);
  part(body, sphere, trousers, [0, 1.59, 0.016], [0.167, 0.1, 0.166]);
  part(body, cube, jacket, [0, 1.015, 0], [0.36, 0.46, 0.25]);
  part(body, cube, white, [0, 1.07, -0.137], [0.16, 0.07, 0.018]);
  const limbs = [-1, 1].flatMap((side) => {
    const leg = new THREE.Group(),
      arm = new THREE.Group();
    leg.position.set(side * 0.09, 0.83, 0);
    arm.position.set(side * 0.23, 1.2, 0);
    part(leg, cube, trousers, [0, -0.38, 0], [0.14, 0.76, 0.17]);
    part(leg, cube, white, [0, -0.78, 0.06], [0.15, 0.1, 0.27]);
    part(arm, cube, jacket, [0, -0.18, 0], [0.09, 0.36, 0.12]);
    part(arm, sphere, face, [0, -0.39, 0], [0.05, 0.075, 0.052]);
    body.add(leg, arm);
    return [leg, arm];
  });
  const tint = new THREE.MeshBasicMaterial({
    color: blue,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const outline = new THREE.MeshBasicMaterial({
    color: blue,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), tint);
  const border = new THREE.Mesh(new THREE.RingGeometry(0.963, 1, 48), outline);
  const uncertainty = new THREE.Group();
  uncertainty.add(disc, border);
  uncertainty.rotation.x = -Math.PI / 2;
  const stroke = new Line2(
    new LineGeometry(),
    new LineMaterial({ color: blue, linewidth: 4, depthWrite: false }),
  );
  const alternate = new Line2(
    new LineGeometry(),
    new LineMaterial({ color: "#6aa8eb", linewidth: 3, depthWrite: false }),
  );
  const casing = new Line2(
    new LineGeometry(),
    new LineMaterial({ color: "#f7fbff", linewidth: 7, depthWrite: false }),
  );
  const arrows = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide }),
  );
  alternate.renderOrder = 9;
  casing.renderOrder = 10;
  stroke.renderOrder = 11;
  arrows.renderOrder = 12;
  group.add(alternate, casing, stroke, arrows, uncertainty, arrival, icon, body);

  let person: WalkingOverlay["person"] = null;
  let previousOverlay: WalkingOverlay | undefined;
  let oldPath: Point[] | undefined;
  let oldAlternate: Point[] | undefined;
  let entry: Point | null = null;
  let isAvatar = false;
  const distanceVector = new THREE.Vector3();
  let lastTime = 0,
    stride = 0;
  const routeHeight = new Map<string, number>();
  const routeGround = (p: Point) => {
    const key = p.join(",");
    const cached = routeHeight.get(key);
    if (cached !== undefined) return cached;
    const y = heightAt(p);
    if (routeHeight.size > 2_000) routeHeight.clear();
    routeHeight.set(key, y);
    return y;
  };
  function replace(mesh: THREE.Mesh, xyz: number[]) {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(xyz, 3),
    );
    mesh.visible = xyz.length > 0;
  }
  const xyz = (p: Point, offset: number) => [p[0], routeGround(p) + offset, p[1]];

  function replaceLine(line: Line2, path: Point[], lift: number) {
    line.geometry.dispose();
    line.geometry = new LineGeometry();
    // Line2 expects at least two vertices. A flag alone represents arrival.
    line.visible = path.length > 1;
    if (line.visible) line.geometry.setPositions(path.flatMap((p) => xyz(p, lift)));
  }

  return {
    refreshGround() {
      routeHeight.clear();
      oldPath = undefined;
      oldAlternate = undefined;
      if (previousOverlay) this.set(previousOverlay);
    },
    set(overlay: WalkingOverlay) {
      previousOverlay = overlay;
      person = overlay.person;
      entry = overlay.entry;
      if (person) {
        const [x, z] = person.point;
        const y = heightAt(person.point) + vehicleClearance;
        body.position.set(x, y, z);
        icon.position.copy(body.position);
        uncertainty.position.set(x, y - 0.006, z);
        uncertainty.scale.setScalar(person.radius);
        if (person.heading !== undefined) body.rotation.y = person.heading;
      }
      if (entry) arrival.position.set(entry[0], routeGround(entry) + 0.1, entry[1]);
      if (oldAlternate !== overlay.alternate) {
        oldAlternate = overlay.alternate;
        replaceLine(alternate, overlay.alternate, 0.034);
      }
      if (oldPath === overlay.path) return;
      oldPath = overlay.path;
      const path = overlay.path.flatMap((p, i, points) => {
        if (i === 0) return [p];
        const a = points[i - 1];
        const count = Math.max(1, Math.ceil(distance(a, p) / 1.5));
        return Array.from({ length: count }, (_, step) => interpolate(a, p, (step + 1) / count));
      });
      replaceLine(casing, path, 0.042);
      replaceLine(stroke, path, 0.055);
      const arrowVertices = overlay.turns.flatMap(({ point: [x, z], angle }) => {
        const dx = Math.sin(angle),
          dz = Math.cos(angle);
        return [
          xyz([x + dx * 0.69, z + dz * 0.69], 0.075),
          xyz([x - dx * 0.29 + dz * 0.36, z - dz * 0.29 - dx * 0.36], 0.075),
          xyz([x - dx * 0.29 - dz * 0.36, z - dz * 0.29 + dx * 0.36], 0.075),
        ].flat();
      });
      replace(arrows, arrowVertices);
    },
    frame(
      camera: THREE.PerspectiveCamera,
      viewportHeight: number,
      polar: number,
      now: number,
      reduceMotion: boolean,
    ) {
      camera.getWorldDirection(distanceVector);
      const pixelsPerUnit = (position: THREE.Vector3) => {
        const depth =
          (position.x - camera.position.x) * distanceVector.x +
          (position.y - camera.position.y) * distanceVector.y +
          (position.z - camera.position.z) * distanceVector.z;
        return depth > 0
          ? viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360) * depth)
          : 0;
      };
      const iconScale = person ? pixelsPerUnit(icon.position) : 0;
      const flagScale = entry ? pixelsPerUnit(arrival.position) : 0;
      isAvatar = Boolean(
        person &&
        iconScale &&
        permitsAvatar(
          isAvatar,
          personHeight * iconScale,
          (polar * 180) / Math.PI,
          person.approximate,
        ),
      );
      body.visible = !!person && isAvatar;
      icon.visible = !!person && !!iconScale && !isAvatar;
      arrival.visible = !!entry && !!flagScale;
      uncertainty.visible = !!person && person.radius * iconScale >= 7;
      if (icon.visible) icon.scale.setScalar((person?.approximate ? 23 : 27) / iconScale);
      if (arrival.visible) arrival.scale.setScalar(27 / flagScale);
      const animating = !!person?.moving && body.visible && !reduceMotion;
      stride = animating ? stride + (Math.min(now - lastTime, 50) / 1000) * 11 : 0;
      lastTime = now;
      limbs.forEach((limb, i) => {
        limb.rotation.x = Math.sin(stride) * (i === 0 || i === 3 ? 0.43 : -0.43);
      });
      return { animating, representation: !person ? "none" : isAvatar ? "avatar" : "icon" };
    },
    dispose() {
      group.removeFromParent();
      const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>([
        texture,
        flag,
      ]);
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          resources.add(object.geometry);
          resources.add(object.material);
        } else if (object instanceof THREE.Sprite) resources.add(object.material);
      });
      resources.forEach((resource) => resource.dispose());
    },
  };
}
