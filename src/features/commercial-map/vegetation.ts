import * as THREE from "three";
import { TREES, type Point } from "./data/territory";
import { auditPlanting } from "./planting";
import { auditContextPlanting, CONTEXT_PLANTING, type ContextPlanting } from "./contextPlanting";
import type { SurfaceQuality } from "./surfaceMaterials";

export { CONTEXT_WOODLAND } from "./contextPlanting";

export const VEGETATION = {
  cellSize: 64,
  leafAtlasSize: 128,
  nearDistances: { light: 55, balanced: 95, detailed: 130 },
  nearTriangleBudget: 30_000,
  leavesPerTree: 450,
  species: ["broadleaf", "upright", "spreading"],
} as const;
const random = (i: number, seed: number) => {
  const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453123;
  return v - Math.floor(v);
};
type Batch = { position: number[]; normal: number[]; uv: number[]; color: number[] };
const batch = (): Batch => ({ position: [], normal: [], uv: [], color: [] });

function append(target: Batch, geometry: THREE.BufferGeometry, color: THREE.Color) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  try {
    const p = source.getAttribute("position"),
      n = source.getAttribute("normal"),
      uv = source.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      target.position.push(p.getX(i), p.getY(i), p.getZ(i));
      target.normal.push(n.getX(i), n.getY(i), n.getZ(i));
      target.uv.push(uv?.getX(i) ?? 0, uv?.getY(i) ?? 0);
      target.color.push(color.r, color.g, color.b);
    }
  } finally {
    if (source !== geometry) source.dispose();
  }
}
function finish(data: Batch) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, values] of Object.entries(data))
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, name === "uv" ? 2 : 3));
  geometry.computeBoundingSphere();
  return geometry;
}
function leafAtlas() {
  const size = VEGETATION.leafAtlasSize,
    pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1,
        v = ((y + 0.5) / size) * 2 - 1;
      const edge =
        Math.abs(u) / Math.max(0.001, Math.sqrt(Math.max(0, 1 - v * v)) * (0.72 + 0.15 * v));
      const vein =
        Math.exp(-Math.abs(u) * 40) * 16 +
        Math.max(0, Math.cos(v * 32 + Math.abs(u) * 16)) ** 8 * 5;
      const grain = Math.sin(x * 1.8 + y * 2.3) * 3;
      pixels.set(
        [
          Math.round(205 + vein + grain),
          Math.round(224 + vein * 0.6 + grain),
          Math.round(183 + vein * 0.3 + grain),
          Math.round(THREE.MathUtils.smoothstep(1 - edge, 0, 0.06) * 255),
        ],
        (y * size + x) * 4,
      );
    }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  try {
    texture.name = "indumoveis-shared-leaf-atlas";
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    texture.dispose();
    throw error;
  }
}

/** Approved source symbols remain distinguishable from individually reviewed
 * satellite crowns. No automatic row generation or new lot planting occurs. */
export function createVegetation(
  options: {
    quality?: SurfaceQuality;
    additionalPlanting?: boolean;
    /** Defined (including []) replaces internal planting for a separate context
     * instance. It never appends trees to the commercial audit or inventory. */
    contextPlanting?: readonly ContextPlanting[];
  } = {},
) {
  const group = new THREE.Group();
  const approximateContext = options.contextPlanting !== undefined;
  const groundElevation = approximateContext ? CONTEXT_PLANTING.groundElevation : 0;
  group.name = approximateContext ? "indumoveis-context-woodland" : "indumoveis-organic-planting";
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
    for (const resource of [...resources].reverse())
      try {
        release(resource);
      } catch (error) {
        failures.push(error);
      }
    group.clear();
    if (failures.length) throw new AggregateError(failures, "Vegetation resource cleanup failed");
  };
  const time = { value: 0 },
    motion = { value: 0 };
  try {
    const plantingAudit = approximateContext
      ? auditContextPlanting(options.contextPlanting!)
      : auditPlanting(undefined, options.additionalPlanting !== false);
    const additional = plantingAudit.filter((record) => record.origin === "satellite-crown"),
      points = plantingAudit.map((record) => record.world);
    const texture = own(leafAtlas());
    const leavesMaterial = own(
      new THREE.MeshLambertMaterial({
        map: texture,
        color: "#ffffff",
        vertexColors: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        // A restrained through-light term prevents black backlit leaf cards;
        // sun and hemisphere diffuse lighting still provide the main shading.
        emissive: "#6c8251",
        emissiveIntensity: 0.14,
      }),
    );
    leavesMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.canopyTime = time;
      shader.uniforms.canopyMotion = motion;
      shader.vertexShader =
        `uniform float canopyTime; uniform float canopyMotion;\n${shader.vertexShader}`.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float canopyTip = smoothstep(1.2, 4.8, position.y);
        transformed.x += sin(canopyTime * 0.8 + instanceMatrix[3].x * 0.37 + position.y) * 0.035 * canopyTip * canopyMotion;
        transformed.z += cos(canopyTime * 0.65 + instanceMatrix[3].z * 0.29 + position.x) * 0.022 * canopyTip * canopyMotion;
      #endif`,
        );
    };
    leavesMaterial.customProgramCacheKey = () => "indumoveis-organic-leaves-v3";
    const farMaterial = own(
      new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true }),
    );
    const woodMaterial = own(
      new THREE.MeshLambertMaterial({ color: "#73634e", vertexColors: true }),
    );
    const up = new THREE.Vector3(0, 1, 0),
      matrix = new THREE.Matrix4(),
      rotation = new THREE.Quaternion();
    const greens = ["#507443", "#6e874c", "#476e43"];
    const leafGreens = ["#6d8c50", "#7f9458", "#5d8050"];
    const variants = Array.from({ length: 3 }, (_, variant) => {
      const width = [1.25, 0.92, 1.48][variant],
        height = [1, 1.17, 0.92][variant];
      const wood = batch(),
        near = batch(),
        far = batch();
      const joints = [
        [0, -0.08, 0],
        [0.035, 0.75, 0.025],
        [-0.04, 1.5, 0.055],
        [0.035, 2.25, -0.04],
      ].map(([x, y, z]) => new THREE.Vector3(x, y * height, z));
      const ends = Array.from({ length: 7 }, (_, i) => {
        const a = i * 2.399 + variant * 0.53,
          r = (0.55 + random(i, variant + 9) * 0.52) * width;
        return new THREE.Vector3(
          Math.cos(a) * r,
          (2.3 + random(i, 8) * 1.25) * height,
          Math.sin(a) * r,
        );
      });
      const segment = (a: THREE.Vector3, b: THREE.Vector3, lower: number, upper: number) => {
        const direction = b.clone().sub(a),
          geometry = own(new THREE.CylinderGeometry(upper, lower, direction.length(), 7));
        geometry.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()),
        );
        geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
        append(wood, geometry, new THREE.Color("#c0b294"));
        release(geometry);
      };
      for (let i = 1; i < joints.length; i++)
        segment(joints[i - 1], joints[i], 0.15 - i * 0.025, 0.14 - i * 0.026);
      ends.forEach((end, i) => {
        const root = joints[(i % 2) + 1],
          elbow = root.clone().lerp(end, 0.55);
        elbow.y -= 0.1;
        segment(root, elbow, 0.068, 0.043);
        segment(elbow, end, 0.044, 0.012);
        const lobe = own(new THREE.IcosahedronGeometry(0.82, 0)),
          p = lobe.getAttribute("position");
        for (let j = 0; j < p.count; j++) {
          const x = p.getX(j),
            y = p.getY(j),
            z = p.getZ(j),
            rough = 1 + Math.sin(x * 7 + y * 4 + z * 6 + i) * 0.12;
          p.setXYZ(j, x * rough, y * rough, z * rough);
        }
        lobe.scale(width * 0.85, 0.8, width * 0.82);
        lobe.translate(...end.toArray());
        lobe.computeVertexNormals();
        append(
          far,
          lobe,
          new THREE.Color(greens[variant]).lerp(new THREE.Color("#9ca76b"), (i % 3) * 0.08),
        );
        release(lobe);
      });
      // Small leaves form dense branch-end sprays, each in one cheap quad.
      // There are no per-leaf objects, blend layers or additional draw calls.
      for (let i = 0; i < VEGETATION.leavesPerTree; i++) {
        const centre = ends[i % ends.length],
          a = random(i, 31 + variant) * Math.PI * 2,
          v = random(i, 62) * 2 - 1;
        const r = Math.cbrt(random(i, 87)) * 0.78,
          radial = Math.sqrt(1 - v * v);
        const p = centre
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(a) * radial * r * width,
              v * r * 0.95,
              Math.sin(a) * radial * r * width,
            ),
          );
        const leaf = own(
          new THREE.PlaneGeometry(0.21 + random(i, 18) * 0.11, 0.3 + random(i, 40) * 0.12),
        );
        // Gently inclined leaf faces receive daylight from above while
        // deterministic tilt/azimuth/roll preserve a volumetric silhouette.
        leaf.rotateX(Math.PI / 2 + (random(i, 23) - 0.5) * 1.8);
        leaf.rotateY(a);
        leaf.rotateZ((random(i, 29) - 0.5) * 1.2);
        leaf.translate(...p.toArray());
        leaf.computeVertexNormals();
        append(
          near,
          leaf,
          new THREE.Color(leafGreens[variant]).lerp(
            new THREE.Color("#9eac70"),
            random(i, 70) * 0.18,
          ),
        );
        release(leaf);
      }
      return { wood: own(finish(wood)), near: own(finish(near)), far: own(finish(far)) };
    });
    const cells = new Map<string, { centre: Point; points: { point: Point; index: number }[] }>();
    points.forEach((point, index) => {
      const x = Math.floor(point[0] / VEGETATION.cellSize),
        z = Math.floor(point[1] / VEGETATION.cellSize),
        key = `${x}:${z}`;
      if (!cells.has(key))
        cells.set(key, {
          centre: [(x + 0.5) * VEGETATION.cellSize, (z + 0.5) * VEGETATION.cellSize],
          points: [],
        });
      cells.get(key)!.points.push({ point, index });
    });
    const lodPairs: { near: THREE.InstancedMesh; far: THREE.InstancedMesh; centre: Point }[] = [];
    let maximumHeight = 0;
    for (const cell of cells.values())
      for (let variant = 0; variant < 3; variant++) {
        const members = cell.points.filter(({ index }) => index % 3 === variant);
        if (!members.length) continue;
        const model = variants[variant];
        const modelHeight = Math.max(
          ...Object.values(model).map((geometry) => {
            geometry.computeBoundingBox();
            return geometry.boundingBox!.max.y;
          }),
        );
        const meshes = (Object.keys(model) as (keyof typeof model)[]).map((kind) => {
          const mesh = own(
            new THREE.InstancedMesh(
              model[kind],
              kind === "wood" ? woodMaterial : kind === "near" ? leavesMaterial : farMaterial,
              members.length,
            ),
          );
          mesh.name = `tree-${kind}-${variant}`;
          mesh.userData.planting = true;
          mesh.userData.plantingIds = members.map(({ index }) => plantingAudit[index].id);
          mesh.raycast = () => {};
          members.forEach(({ point, index }, slot) => {
            const requestedScale = (0.91 + random(index, 17) * 0.2) * plantingAudit[index].scale;
            const s = approximateContext
              ? Math.min(requestedScale, CONTEXT_PLANTING.maximumHeight / modelHeight)
              : requestedScale;
            maximumHeight = Math.max(maximumHeight, modelHeight * s);
            rotation.setFromAxisAngle(up, index * 2.399);
            matrix.compose(
              new THREE.Vector3(point[0], groundElevation, point[1]),
              rotation,
              new THREE.Vector3(s, s, s),
            );
            mesh.setMatrixAt(slot, matrix);
            mesh.setColorAt(
              slot,
              new THREE.Color("#ffffff").lerp(new THREE.Color("#d4dfae"), random(index, 47) * 0.14),
            );
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          mesh.computeBoundingSphere();
          if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.08;
          group.add(mesh);
          return mesh;
        });
        lodPairs.push({ near: meshes[1], far: meshes[2], centre: cell.centre });
      }
    const size = 64,
      pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const radius = Math.hypot(
          (x + 0.5 - size / 2) / (size / 2),
          (y + 0.5 - size / 2) / (size / 2),
        );
        pixels.set(
          [33, 48, 36, Math.round(Math.max(0, 1 - radius) ** 1.5 * 68)],
          (y * size + x) * 4,
        );
      }
    const contact = own(new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat));
    contact.colorSpace = THREE.SRGBColorSpace;
    contact.generateMipmaps = true;
    contact.minFilter = THREE.LinearMipmapLinearFilter;
    contact.needsUpdate = true;
    const contactMaterial = own(
      new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false }),
    );
    const contactGeometry = own(new THREE.PlaneGeometry(3.8, 2.8));
    contactGeometry.rotateX(-Math.PI / 2);
    const contacts = own(new THREE.InstancedMesh(contactGeometry, contactMaterial, points.length));
    contacts.name = "tree-contact";
    contacts.userData.plantingIds = plantingAudit.map((record) => record.id);
    contacts.raycast = () => {};
    points.forEach((point, i) => {
      matrix.makeTranslation(
        point[0] + 0.35,
        approximateContext ? groundElevation + 0.003 : 0.073,
        point[1] + 0.22,
      );
      contacts.setMatrixAt(i, matrix);
    });
    contacts.instanceMatrix.needsUpdate = true;
    contacts.computeBoundingSphere();
    group.add(contacts);
    let quality = options.quality ?? "balanced",
      lastDistance = 80,
      lastTarget: Point | undefined;
    const updateLod = (distance: number, target?: Point) => {
      lastDistance = distance;
      lastTarget = target;
      let trianglesLeft = VEGETATION.nearTriangleBudget;
      const ordered = target
        ? [...lodPairs].sort(
            (a, b) =>
              Math.hypot(a.centre[0] - target[0], a.centre[1] - target[1]) -
              Math.hypot(b.centre[0] - target[0], b.centre[1] - target[1]),
          )
        : lodPairs;
      for (const pair of ordered) {
        const local =
          !target ||
          Math.hypot(pair.centre[0] - target[0], pair.centre[1] - target[1]) < distance * 0.9 + 50;
        const triangles = pair.near.count * VEGETATION.leavesPerTree * 2;
        pair.near.visible =
          distance < VEGETATION.nearDistances[quality] && local && triangles <= trianglesLeft;
        if (pair.near.visible) trianglesLeft -= triangles;
        pair.far.visible = !pair.near.visible;
      }
    };
    updateLod(lastDistance);
    return {
      group,
      textureBytes: Math.ceil(((size * size + VEGETATION.leafAtlasSize ** 2) * 4 * 4) / 3),
      metadata: {
        approvedTrees: approximateContext ? 0 : TREES.length,
        additionalTrees: additional.length,
        contextTrees: approximateContext ? points.length : 0,
        totalTrees: points.length,
        species: VEGETATION.species,
        cellCount: cells.size,
        maximumVisibleDraws: lodPairs.length * 2 + 1,
        nearTriangleBudget: VEGETATION.nearTriangleBudget,
        textureMaps: 2,
        approximatePlanting: true,
        approximateContext,
        automaticPlanting: false,
        maximumHeight,
        groundElevation,
        auditedTrees: plantingAudit,
      },
      animate(seconds: number, enabled: boolean) {
        time.value = seconds;
        motion.value = enabled ? 1 : 0;
      },
      setQuality(tier: SurfaceQuality) {
        quality = tier;
        updateLod(lastDistance, lastTarget);
      },
      updateLod,
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
