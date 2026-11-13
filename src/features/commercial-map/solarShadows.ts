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
  const bounds = new THREE.Box3().setFromPoints(sourcePoints);
  const center = bounds.getCenter(new THREE.Vector3());
  light.target.position.copy(center);
  light.position.copy(center).addScaledVector(direction, 220);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();
  const camera = light.shadow.camera;
  camera.position.copy(light.position);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const fit = new THREE.Box3();
  for (const point of sourcePoints)
    fit.expandByPoint(point.applyMatrix4(camera.matrixWorldInverse));
  if (!fit.isEmpty()) {
    camera.left = fit.min.x - 3;
    camera.right = fit.max.x + 3;
    camera.bottom = fit.min.y - 3;
    camera.top = fit.max.y + 3;
    camera.near = Math.max(0.1, -fit.max.z - 5);
    camera.far = -fit.min.z + 5;
  }
  camera.updateProjectionMatrix();
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
