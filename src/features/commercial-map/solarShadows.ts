import * as THREE from "three";
import type { MapEntity } from "./data/territory";
import { architectureVisualHeight } from "./architecture";
import type { SurfaceQuality } from "./surfaceMaterials";
import { DAYLIGHT } from "./daylight";

/** One cached architectural shadow map in Detailed. Balanced/Light keep the
 * cheaper contact projections. Camera navigation never dirties this map. */
export function createSolarShadows(light: THREE.DirectionalLight, entities: readonly MapEntity[]) {
  const bounds = new THREE.Box3();
  for (const e of entities)
    for (const [x, z] of e.polygon) {
      bounds.expandByPoint(new THREE.Vector3(x, 0, z));
      bounds.expandByPoint(new THREE.Vector3(x, architectureVisualHeight(e), z));
    }
  const center = bounds.getCenter(new THREE.Vector3());
  light.target.position.copy(center);
  light.position.copy(center).addScaledVector(new THREE.Vector3(...DAYLIGHT.sunDirection), 220);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();
  const camera = light.shadow.camera;
  camera.position.copy(light.position);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const fit = new THREE.Box3();
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        fit.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  camera.left = fit.min.x - 2;
  camera.right = fit.max.x + 2;
  camera.bottom = fit.min.y - 2;
  camera.top = fit.max.y + 2;
  camera.near = Math.max(0.1, -fit.max.z - 4);
  camera.far = -fit.min.z + 4;
  camera.updateProjectionMatrix();
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.00016;
  light.shadow.normalBias = 0.035;
  light.shadow.radius = 2;
  light.shadow.intensity = 0.55;
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
      return light.shadow.map ? 1024 * 1024 * 8 : 0;
    },
    setQuality(quality: SurfaceQuality) {
      if (disposed) return;
      const next = quality === "detailed";
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
