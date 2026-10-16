import * as THREE from "three";
import { TREES } from "./data/territory";

/** Presentation only: every source tree keeps its centre, in every profile. */
export function createVegetation() {
  const group = new THREE.Group();
  // Ownership starts at allocation, including temporary crown geometry. A failed
  // optional preparation must be as safe as leaving a successfully built scene.
  const resources = new Set<{ dispose(): void }>();
  let disposed = false;
  const own = <T extends { dispose(): void }>(resource: T): T => {
    resources.add(resource);
    return resource;
  };
  const release = (resource: { dispose(): void }) => {
    if (resources.delete(resource)) resource.dispose();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    for (const resource of [...resources].reverse()) {
      try {
        release(resource);
      } catch (error) {
        failures.push(error);
      }
    }
    group.clear();
    if (failures.length) throw new AggregateError(failures, "Vegetation resource cleanup failed");
  };
  const time = { value: 0 };
  const motion = { value: 0 };
  try {
    const foliage = own(new THREE.MeshLambertMaterial({ color: "#ffffff" }));
    foliage.onBeforeCompile = (shader) => {
      shader.uniforms.canopyTime = time;
      shader.uniforms.canopyMotion = motion;
      shader.vertexShader = `uniform float canopyTime; uniform float canopyMotion;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float canopyTip = smoothstep(-0.55, 1.2, position.y);
        transformed.x += sin(canopyTime * 0.8 + instanceMatrix[3].x * 0.37 + position.y) * 0.025 * canopyTip * canopyMotion;
        transformed.z += cos(canopyTime * 0.65 + instanceMatrix[3].z * 0.29) * 0.018 * canopyTip * canopyMotion;
      #endif`,
      );
    };
    foliage.customProgramCacheKey = () => "indumoveis-canopy-v1";
    const trunkGeometry = own(new THREE.CylinderGeometry(0.09, 0.16, 1.45, 6));
    const trunkMaterial = own(new THREE.MeshLambertMaterial({ color: "#76634f" }));
    const trunks = own(new THREE.InstancedMesh(trunkGeometry, trunkMaterial, TREES.length));
    group.add(trunks);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const greens = ["#3f6546", "#657c4e", "#8da56c"];
    // Three reusable clustered crowns; no unique meshes or per-leaf geometry.
    for (let variant = 0; variant < 3; variant++) {
      const positions: number[] = [];
      const normals: number[] = [];
      for (let lobe = 0; lobe < 4; lobe++) {
        const geometry = own(new THREE.IcosahedronGeometry(0.7, 1));
        const angle = lobe * 2.399 + variant * 0.6;
        geometry.scale(0.95 + variant * 0.08, 1.05 + (lobe % 2) * 0.18, 0.86);
        geometry.translate(
          Math.cos(angle) * (lobe ? 0.38 : 0),
          lobe ? (lobe % 2) * 0.28 : 0.35,
          Math.sin(angle) * (lobe ? 0.38 : 0),
        );
        positions.push(...geometry.getAttribute("position").array);
        normals.push(...geometry.getAttribute("normal").array);
        release(geometry);
      }
      const geometry = own(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      const points = TREES.map((point, index) => ({ point, index })).filter(
        ({ index }) => index % 3 === variant,
      );
      const crowns = own(new THREE.InstancedMesh(geometry, foliage, points.length));
      points.forEach(({ point, index }, slot) => {
        const size = 0.88 + ((index * 17) % 7) * 0.055;
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), index * 2.399);
        matrix.compose(
          position.set(point[0], 1.72, point[1]),
          rotation,
          scale.set(size, size * (1 + (index % 3) * 0.07), size),
        );
        crowns.setMatrixAt(slot, matrix);
        crowns.setColorAt(slot, new THREE.Color(greens[(index * 7 + variant) % 3]));
      });
      crowns.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      group.add(crowns);
    }
    TREES.forEach((point, index) => {
      matrix.makeTranslation(point[0], 0.64, point[1]);
      trunks.setMatrixAt(index, matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    // Soft static canopy contact, shared 64² RGBA + mipmaps, no shadow pass.
    const size = 64,
      pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const radius = Math.hypot(
          (x + 0.5 - size / 2) / (size / 2),
          (y + 0.5 - size / 2) / (size / 2),
        );
        const offset = (y * size + x) * 4;
        pixels[offset] = 33;
        pixels[offset + 1] = 48;
        pixels[offset + 2] = 36;
        pixels[offset + 3] = Math.round(Math.max(0, 1 - radius) ** 1.5 * 68);
      }
    const contact = own(new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat));
    contact.colorSpace = THREE.SRGBColorSpace;
    contact.generateMipmaps = true;
    contact.minFilter = THREE.LinearMipmapLinearFilter;
    contact.needsUpdate = true;
    const contactMaterial = own(
      new THREE.MeshBasicMaterial({
        map: contact,
        transparent: true,
        depthWrite: false,
      }),
    );
    const contactGeometry = own(new THREE.PlaneGeometry(3.8, 2.8));
    contactGeometry.rotateX(-Math.PI / 2);
    const contacts = own(new THREE.InstancedMesh(contactGeometry, contactMaterial, TREES.length));
    TREES.forEach((point, index) => {
      matrix.makeTranslation(point[0] + 0.35, -0.067, point[1] + 0.22);
      contacts.setMatrixAt(index, matrix);
    });
    contacts.instanceMatrix.needsUpdate = true;
    group.add(contacts);
    return {
      group,
      textureBytes: Math.ceil((size * size * 4 * 4) / 3),
      animate(seconds: number, enabled: boolean) {
        time.value = seconds;
        motion.value = enabled ? 1 : 0;
      },
      dispose,
    };
  } catch (error) {
    try {
      dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Vegetation creation and cleanup failed", {
        cause: error,
      });
    }
    throw error;
  }
}
