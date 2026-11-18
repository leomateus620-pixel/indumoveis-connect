import * as THREE from "three";
import type { MapEntity } from "./data/territory";
import { getArchitectureDefinition } from "./architecture";
import type { SurfaceQuality } from "./surfaceMaterials";
import { DAYLIGHT } from "./daylight";
import { PARK_SHADOWS } from "./visualTheme";

const shadowMapSize = 1024;

/** One cached architectural shadow map in Detailed. Balanced/Light keep the
 * cheaper contact projections. Camera navigation never dirties this map. */
export function createSolarShadows(light: THREE.DirectionalLight, entities: readonly MapEntity[]) {
  const direction = new THREE.Vector3(...DAYLIGHT.sunDirection);
  const sourcePoints: THREE.Vector3[] = [];
  for (const entity of entities) {
    const definition = getArchitectureDefinition(entity);
    if (!definition) continue;
    // Small overhangs and photographic details can exceed the source eave.
    // Fit their ground projection as well as the source volume itself.
    const ground = -0.18;
    const height = definition.height + 0.7;
    for (const [x, z] of entity.polygon) {
      sourcePoints.push(
        new THREE.Vector3(x, ground, z),
        new THREE.Vector3(x, height, z),
        new THREE.Vector3(x, height, z).addScaledVector(direction, (ground - height) / direction.y),
      );
    }
  }
  // Optional scenery arrives after the core. Refit on insertion, using actual
  // caster bounds (including instanced crowns) and their ground projections.
  // Panning, wind, LOD and lighting temperature never touch this camera.
  const fitted = new WeakSet<THREE.Object3D>();
  const camera = light.shadow.camera;
  function fitCamera() {
    if (!sourcePoints.length) return;
    const bounds = new THREE.Box3().setFromPoints(sourcePoints);
    const center = bounds.getCenter(new THREE.Vector3());
    light.target.position.copy(center);
    light.position.copy(center).addScaledVector(direction, 220);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
    camera.position.copy(light.position);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const fit = new THREE.Box3(),
      projected = new THREE.Vector3();
    for (const point of sourcePoints)
      fit.expandByPoint(projected.copy(point).applyMatrix4(camera.matrixWorldInverse));
    camera.left = fit.min.x - 3;
    camera.right = fit.max.x + 3;
    camera.bottom = fit.min.y - 3;
    camera.top = fit.max.y + 3;
    camera.near = Math.max(0.1, -fit.max.z - 5);
    camera.far = -fit.min.z + 5;
    camera.updateProjectionMatrix();
  }
  fitCamera();
  light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  const { bias, normalBias, radius, intensity } = PARK_SHADOWS.solar;
  Object.assign(light.shadow, { bias, normalBias, radius, intensity });
  light.shadow.autoUpdate = false;
  light.castShadow = false;
  let enabled = false,
    disposed = false;
  return {
    get enabled() {
      return enabled;
    },
    // Conservative colour + depth-buffer estimate, not measured driver memory.
    get textureBytes() {
      return light.shadow.map ? shadowMapSize ** 2 * 8 : 0;
    },
    setQuality(quality: SurfaceQuality) {
      if (disposed) return;
      const next = quality === "detailed" && sourcePoints.length > 0;
      if (next && !enabled) light.shadow.needsUpdate = true;
      enabled = next;
      light.castShadow = enabled;
    },
    includeCasters(group: THREE.Object3D) {
      if (disposed || fitted.has(group)) return;
      fitted.add(group);
      const before = sourcePoints.length;
      group.updateWorldMatrix(true, true);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
        const bounds = new THREE.Box3().setFromObject(object);
        if (bounds.isEmpty()) return;
        for (const x of [bounds.min.x, bounds.max.x])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const top = new THREE.Vector3(x, bounds.max.y, z);
            sourcePoints.push(
              new THREE.Vector3(x, Math.min(-0.18, bounds.min.y), z),
              top,
              top.clone().addScaledVector(direction, (-0.18 - top.y) / direction.y),
            );
          }
      });
      if (before === sourcePoints.length) return;
      fitCamera();
      if (enabled) light.shadow.needsUpdate = true;
    },
    invalidate() {
      if (enabled && !disposed) light.shadow.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      light.castShadow = false;
      light.shadow.dispose();
    },
  };
}
