import * as THREE from "three";
import { TREES, type Point } from "./data/territory";
import { auditPlanting } from "./planting";
import { auditContextPlanting, CONTEXT_PLANTING, type ContextPlanting } from "./contextPlanting";
import type { SurfaceQuality } from "./surfaceMaterials";
import { P1_PHOTO_PLANTER, P1_PHOTO_TREE } from "./photoPavilionSetting";
import { DAYLIGHT } from "./daylight";
import type { ParkLotTree } from "./parkLotPlanting";
import { TERRAIN } from "./terrain";
import { PARK_VEGETATION } from "./visualTheme";

export { CONTEXT_WOODLAND } from "./contextPlanting";

export const VEGETATION = {
  cellSize: 64,
  leafAtlasSize: 128,
  nearDistances: { light: 55, balanced: 95, detailed: 130 },
  nearTriangleBudget: 30_000,
  leavesPerTree: 450,
  sway: { x: 0.035, z: 0.022 },
  species: ["broadleaf", "upright", "spreading"],
} as const;

// The crown centres serve both leaf sprays and distant silhouettes. Each
// profile shares its wood and foliage geometry across all trees of that form.
const TREE_PROFILES = [
  {
    width: 1.25,
    lobeHeight: 0.8,
    taper: [0.16, 0.12, 0.083, 0.028],
    joints: [
      [0, -0.08, 0],
      [0.12, 0.65, 0.03],
      [0.22, 1.43, -0.05],
      [0.3, 2.27, -0.12],
    ],
    lobes: [
      [0.76, 2.75, -0.2],
      [0.45, 3.23, 0.51],
      [-0.4, 2.78, 0.69],
      [-0.71, 2.95, 0.12],
      [-0.36, 3.18, -0.63],
      [0.19, 2.63, -0.61],
      [0.18, 3.57, -0.07],
    ],
    branchRoots: [1, 2, 1, 2, 2, 1, 3],
    branchRadii: [0.067, 0.044, 0.012],
  },
  {
    width: 0.92,
    lobeHeight: 0.92,
    taper: [0.105, 0.09, 0.063, 0.028],
    joints: [
      [0, -0.08, 0],
      [0.018, 0.91, -0.015],
      [0.035, 1.88, 0.02],
      [0.012, 2.71, 0.02],
    ],
    lobes: [
      [0.53, 2.51, 0.18],
      [-0.17, 2.72, 0.55],
      [-0.56, 3.13, -0.09],
      [0.14, 3.38, -0.51],
      [0.43, 3.47, 0.23],
      [-0.23, 3.92, 0.12],
      [0.12, 4.15, -0.14],
    ],
    branchRoots: [1, 2, 2, 2, 2, 3, 3],
    branchRadii: [0.05, 0.032, 0.01],
  },
  {
    width: 1.48,
    lobeHeight: 0.65,
    taper: [0.2, 0.14, 0.1, 0.035],
    joints: [
      [0, -0.08, 0],
      [-0.035, 0.59, 0.016],
      [-0.22, 1.37, 0.09],
      [-0.44, 2.06, 0.21],
    ],
    lobes: [
      [0.91, 2.62, -0.12],
      [0.69, 2.67, 0.47],
      [0.18, 2.85, 0.82],
      [-0.61, 2.78, 0.51],
      [-0.9, 2.62, -0.16],
      [-0.48, 2.75, -0.68],
      [0.25, 2.89, -0.67],
    ],
    branchRoots: [1, 1, 2, 3, 2, 2, 1],
    branchRadii: [0.081, 0.048, 0.014],
  },
] as const;

const random = (i: number, seed: number) => {
  const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453123;
  return v - Math.floor(v);
};
type Batch = { position: number[]; normal: number[]; uv: number[]; color: number[] };
const batch = (): Batch => ({ position: [], normal: [], uv: [], color: [] });

function append(
  target: Batch,
  geometry: THREE.BufferGeometry,
  color: THREE.Color | ((point: THREE.Vector3) => THREE.Color),
) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  try {
    const p = source.getAttribute("position"),
      n = source.getAttribute("normal"),
      uv = source.getAttribute("uv");
    const point = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      target.position.push(p.getX(i), p.getY(i), p.getZ(i));
      target.normal.push(n.getX(i), n.getY(i), n.getZ(i));
      target.uv.push(uv?.getX(i) ?? 0, uv?.getY(i) ?? 0);
      const tint = typeof color === "function" ? color(point.fromBufferAttribute(p, i)) : color;
      target.color.push(tint.r, tint.g, tint.b);
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
      // Grayscale reflectance leaves the species hue in the vertex palette.
      const vein =
        Math.exp(-Math.abs(u) * 40) * 8 + Math.max(0, Math.cos(v * 32 + Math.abs(u) * 16)) ** 8 * 3;
      const value = Math.round(237 + vein + Math.sin(x * 1.8 + y * 2.3) * 2);
      pixels.set(
        [value, value, value, Math.round(THREE.MathUtils.smoothstep(1 - edge, 0, 0.06) * 255)],
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

/** Planting sources retain their separate audit records in the same batches. */
export function createVegetation(
  options: {
    quality?: SurfaceQuality;
    additionalPlanting?: boolean;
    /** One photo-confirmed P1 planter tree; appended to existing batches. */
    photoPavilionTree?: boolean;
    /** Registered positions with validated footprint clearance. */
    parkLotTrees?: readonly ParkLotTree[];
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
    const parkLotTrees = approximateContext ? [] : (options.parkLotTrees ?? []);
    const photographicTrees =
      !approximateContext && options.photoPavilionTree
        ? [
            {
              ...P1_PHOTO_TREE,
              origin: "photograph" as const,
              zone: "pavilion-frontage",
              ownerEntityId: "indumoveis:pavilion:1",
              sourceEntityIds: [P1_PHOTO_PLANTER.id],
              confidence: "visible-tree-local-approximation" as const,
              referenceImage: P1_PHOTO_PLANTER.sourcePhotograph,
              referencePixel: null,
              localRegistration: P1_PHOTO_PLANTER.condition,
              decision:
                "Photo 9: circular planter and tree on the interior front of P1; estimated centre, no surveyed species or height.",
            },
          ]
        : [];
    const plantingAudit = approximateContext
      ? auditContextPlanting(options.contextPlanting!)
      : [
          ...auditPlanting(undefined, options.additionalPlanting !== false),
          ...photographicTrees,
          ...parkLotTrees,
        ];
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
        transformed.x += sin(canopyTime * 0.8 + instanceMatrix[3].x * 0.37 + position.y) * ${VEGETATION.sway.x} * canopyTip * canopyMotion;
        transformed.z += cos(canopyTime * 0.65 + instanceMatrix[3].z * 0.29 + position.x) * ${VEGETATION.sway.z} * canopyTip * canopyMotion;
      #endif`,
        );
      // The authored normal belongs to the crown envelope. The cutout quad's
      // winding only determines its silhouette and must not flip this normal.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        "#include <normal_fragment_begin>\nnormal *= faceDirection;",
      );
    };
    leavesMaterial.customProgramCacheKey = () => "indumoveis-organic-leaves-v5";
    const farMaterial = own(
      new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true }),
    );
    const woodMaterial = own(
      new THREE.MeshStandardMaterial({
        color: PARK_VEGETATION.bark,
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
      }),
    );
    // One shared program, no bark texture per tree. Object-space longitudinal
    // furrows remain fixed on branches; screen derivatives suppress subpixels.
    woodMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 barkPosition;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nbarkPosition = position;",
      );
      shader.fragmentShader = `varying vec3 barkPosition;\n${shader.fragmentShader}`.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float barkPhase = barkPosition.x * 39.0 + barkPosition.z * 47.0 + sin(barkPosition.y * 2.7) * 1.7;
        float barkFilter = 1.0 - smoothstep(0.5, 2.2, fwidth(barkPhase));
        float barkFurrow = sin(barkPhase) * .085 + sin(barkPhase * 2.13) * .035;
        diffuseColor.rgb *= 1.0 + barkFurrow * barkFilter;
      `,
      );
    };
    woodMaterial.customProgramCacheKey = () => "indumoveis-diffuse-bark-v1";
    const up = new THREE.Vector3(0, 1, 0),
      matrix = new THREE.Matrix4(),
      rotation = new THREE.Quaternion();
    const barkTint = new THREE.Color(PARK_VEGETATION.barkTint);
    const tint = new THREE.Color();
    const swayRadius = Math.hypot(VEGETATION.sway.x, VEGETATION.sway.z);
    const variants = TREE_PROFILES.map((profile, variant) => {
      const palette = PARK_VEGETATION.crowns[variant];
      const { width, lobeHeight, taper, branchRoots, branchRadii } = profile;
      const wood = batch(),
        near = batch(),
        far = batch();
      const joints = profile.joints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const ends = profile.lobes.map(([x, y, z]) => new THREE.Vector3(x * width, y, z * width));
      const height = ends.reduce((sum, end) => sum + end.y, 0) / ends.length;
      const interior = new THREE.Color(palette.interior),
        canopy = new THREE.Color(palette.canopy),
        tips = new THREE.Color(palette.tips);
      const lobeAxes = ends.map((centre) =>
        new THREE.Vector3(
          centre.x / width,
          0.65 + (centre.y - height) * 0.6,
          centre.z / width,
        ).normalize(),
      );
      const crownColor = (point: THREE.Vector3, lobe: number, variation: number) => {
        const centre = ends[lobe],
          outward = lobeAxes[lobe];
        const exposure =
          ((point.x - centre.x) * outward.x) / width +
          (point.y - centre.y) * outward.y +
          ((point.z - centre.z) * outward.z) / width;
        const lightness = THREE.MathUtils.clamp(
          0.49 + exposure * 0.48 + (centre.y - height) * 0.22 + variation,
          0,
          1,
        );
        return lightness < 0.52
          ? tint.copy(interior).lerp(canopy, lightness / 0.52)
          : tint.copy(canopy).lerp(tips, (lightness - 0.52) / 0.48);
      };
      const segment = (a: THREE.Vector3, b: THREE.Vector3, lower: number, upper: number) => {
        const direction = b.clone().sub(a),
          geometry = own(new THREE.CylinderGeometry(upper, lower, direction.length(), 7));
        geometry.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()),
        );
        geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
        append(wood, geometry, barkTint);
        release(geometry);
      };
      for (let i = 1; i < joints.length; i++)
        segment(joints[i - 1], joints[i], taper[i - 1], taper[i]);
      ends.forEach((end, i) => {
        const root = joints[branchRoots[i]],
          elbow = root.clone().lerp(end, 0.55);
        elbow.y -= 0.1;
        const [base, middle, tip] = branchRadii;
        const fork = variant === 2 && i === 0;
        segment(root, elbow, fork ? taper[1] : base, fork ? taper[2] : middle);
        segment(elbow, end, fork ? taper[2] : middle, tip);
        const lobe = own(new THREE.IcosahedronGeometry(0.82, 1)),
          p = lobe.getAttribute("position");
        for (let j = 0; j < p.count; j++) {
          const x = p.getX(j),
            y = p.getY(j),
            z = p.getZ(j),
            rough = 1 + Math.sin(x * 7 + y * 4 + z * 6 + i) * 0.12;
          p.setXYZ(j, x * rough, y * rough, z * rough);
        }
        lobe.scale(width * 0.85, lobeHeight, width * 0.82);
        lobe.translate(...end.toArray());
        // IcosahedronGeometry is non-indexed: recomputing its normals would
        // shade each triangle as a separate facet. Ellipsoidal radial normals
        // keep volume and branch-lobe variation with a softer distant crown.
        const normals = lobe.getAttribute("normal"),
          normal = new THREE.Vector3();
        for (let j = 0; j < p.count; j++) {
          normal
            .set(
              (p.getX(j) - end.x) / (width * 0.85) ** 2,
              (p.getY(j) - end.y) / lobeHeight ** 2,
              (p.getZ(j) - end.z) / (width * 0.82) ** 2,
            )
            .normalize();
          normals.setXYZ(j, normal.x, normal.y, normal.z);
        }
        const variation = (random(i, 26) - 0.5) * 0.14;
        append(far, lobe, (point) => crownColor(point, i, variation));
        release(lobe);
      });
      // Small leaves form dense branch-end sprays, each in one cheap quad.
      // There are no per-leaf objects, blend layers or additional draw calls.
      const leafHeight = lobeHeight * 1.18;
      for (let i = 0; i < VEGETATION.leavesPerTree; i++) {
        const lobe = i % ends.length,
          centre = ends[lobe],
          a = random(i, 31 + variant) * Math.PI * 2,
          v = random(i, 62) * 2 - 1;
        const r = Math.cbrt(random(i, 87)) * 0.78,
          radial = Math.sqrt(1 - v * v);
        const p = centre
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(a) * radial * r * width,
              v * r * leafHeight,
              Math.sin(a) * radial * r * width,
            ),
          );
        const leaf = own(
          new THREE.PlaneGeometry(0.21 + random(i, 18) * 0.11, 0.3 + random(i, 40) * 0.12),
        );
        // Deterministic card tilt preserves the leaf silhouette. Shading uses
        // the envelope normal of the same lobe that represents this LOD afar.
        leaf.rotateX(Math.PI / 2 + (random(i, 23) - 0.5) * 1.8);
        leaf.rotateY(a);
        leaf.rotateZ((random(i, 29) - 0.5) * 1.2);
        leaf.translate(...p.toArray());
        const normal = new THREE.Vector3(
          (p.x - centre.x) / width ** 2,
          (p.y - centre.y) / leafHeight ** 2,
          (p.z - centre.z) / width ** 2,
        )
          .normalize()
          .addScaledVector(up, 0.18)
          .normalize();
        const normals = leaf.getAttribute("normal");
        for (let j = 0; j < normals.count; j++) normals.setXYZ(j, normal.x, normal.y, normal.z);
        append(near, leaf, crownColor(p, lobe, (random(i, 70) - 0.5) * 0.19 + 0.035));
        release(leaf);
      }
      const model = { wood: own(finish(wood)), near: own(finish(near)), far: own(finish(far)) };
      let modelHeight = 0;
      let modelRadius = 0;
      for (const kind of ["wood", "near", "far"] as const) {
        const positions = model[kind].getAttribute("position");
        const sway = kind === "near" ? swayRadius : 0;
        for (let i = 0; i < positions.count; i++) {
          modelHeight = Math.max(modelHeight, positions.getY(i));
          modelRadius = Math.max(
            modelRadius,
            Math.hypot(positions.getX(i), positions.getZ(i)) + sway,
          );
        }
      }
      return { model, modelHeight, modelRadius, width };
    });
    const instances = plantingAudit.map((record, index) => {
      const registered = "crownRadius" in record ? record : undefined;
      const variant = registered
        ? VEGETATION.species.indexOf(registered.form)
        : index % variants.length;
      const { modelHeight, modelRadius } = variants[variant];
      const requested = registered ? record.scale : (0.91 + random(index, 17) * 0.2) * record.scale;
      const vertical = approximateContext
        ? Math.min(requested, CONTEXT_PLANTING.maximumHeight / modelHeight)
        : requested;
      // The same horizontal scale applies to all three meshes. A small margin
      // covers the Float32 transform and the actual root/crown position stays fixed.
      const horizontal = registered
        ? Math.min(vertical, (registered.crownRadius * 0.999) / modelRadius)
        : vertical;
      const elevation = registered
        ? registered.ownerEntityId
          ? 0.05
          : TERRAIN.elevation
        : groundElevation;
      return { variant, vertical, horizontal, elevation };
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
    const instancePosition = new THREE.Vector3();
    const instanceScale = new THREE.Vector3();
    for (const cell of cells.values())
      for (let variant = 0; variant < variants.length; variant++) {
        const members = cell.points.filter(({ index }) => instances[index].variant === variant);
        if (!members.length) continue;
        const { model, modelHeight } = variants[variant];
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
            const { horizontal, vertical, elevation } = instances[index];
            maximumHeight = Math.max(maximumHeight, modelHeight * vertical);
            rotation.setFromAxisAngle(up, index * 2.399);
            matrix.compose(
              instancePosition.set(point[0], elevation, point[1]),
              rotation,
              instanceScale.set(horizontal, vertical, horizontal),
            );
            mesh.setMatrixAt(slot, matrix);
            mesh.setColorAt(
              slot,
              tint.setScalar(THREE.MathUtils.lerp(0.9, 1.05, random(index, 47))),
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
        const u = (x + 0.5) / (size / 2) - 1,
          v = (y + 0.5) / (size / 2) - 1,
          radius = Math.hypot(u, v),
          angle = Math.atan2(v, u);
        const edge = 0.91 + Math.cos(angle * 5 + 0.4) * 0.05 + Math.sin(angle * 3) * 0.035;
        const alpha = (1 - THREE.MathUtils.smoothstep(radius, 0.1, edge)) * 0.29;
        pixels.set([255, 255, 255, Math.round(alpha * 255)], (y * size + x) * 4);
      }
    const contact = own(new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat));
    contact.colorSpace = THREE.SRGBColorSpace;
    contact.generateMipmaps = true;
    contact.minFilter = THREE.LinearMipmapLinearFilter;
    contact.needsUpdate = true;
    const contactMaterial = own(
      new THREE.MeshBasicMaterial({
        map: contact,
        color: PARK_VEGETATION.shadow,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const contactGeometry = own(new THREE.PlaneGeometry());
    contactGeometry.rotateX(-Math.PI / 2);
    const contacts = own(
      new THREE.InstancedMesh(contactGeometry, contactMaterial, points.length * 2),
    );
    contacts.name = "tree-contact";
    contacts.userData.plantingIds = plantingAudit.flatMap((record) => [record.id, record.id]);
    contacts.raycast = () => {};
    const [sunX, sunY, sunZ] = DAYLIGHT.sunDirection;
    const shadowRotation = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(sunZ, -sunX));
    const groundRotation = new THREE.Quaternion();
    const centre = new THREE.Vector3(),
      sizeOnGround = new THREE.Vector3();
    const shadowY = approximateContext ? groundElevation + 0.004 : 0.052;
    points.forEach((point, i) => {
      const record = plantingAudit[i];
      const { variant, vertical, horizontal, elevation } = instances[i];
      const { modelHeight, width } = variants[variant];
      const crownHeight = modelHeight * 0.56 * vertical;
      const contactY = "crownRadius" in record ? elevation + 0.004 : shadowY;
      matrix.compose(
        centre.set(
          point[0] - (sunX * crownHeight) / sunY,
          contactY,
          point[1] - (sunZ * crownHeight) / sunY,
        ),
        shadowRotation,
        sizeOnGround.set((width * 2.35 + 1.5) * horizontal, 1, width * 2.45 * horizontal),
      );
      contacts.setMatrixAt(i * 2, matrix);
      matrix.compose(
        centre.set(point[0], contactY, point[1]),
        groundRotation,
        sizeOnGround.set(0.95 * horizontal, 1, 0.95 * horizontal),
      );
      contacts.setMatrixAt(i * 2 + 1, matrix);
    });
    contacts.instanceMatrix.needsUpdate = true;
    contacts.computeBoundingSphere();
    group.add(contacts);
    let quality = options.quality ?? "balanced",
      lastDistance = 80,
      lastTarget: Point | undefined;
    // Reuse the ordering buffer during gestures. Hysteresis retains a stable
    // silhouette when distance oscillates around an LOD boundary.
    const ordered = [...lodPairs];
    const updateLod = (distance: number, target?: Point) => {
      lastDistance = distance;
      lastTarget = target;
      let trianglesLeft = VEGETATION.nearTriangleBudget;
      if (target)
        ordered.sort(
          (a, b) =>
            Math.hypot(a.centre[0] - target[0], a.centre[1] - target[1]) -
            Math.hypot(b.centre[0] - target[0], b.centre[1] - target[1]),
        );
      for (const pair of ordered) {
        const local =
          !target ||
          Math.hypot(pair.centre[0] - target[0], pair.centre[1] - target[1]) < distance * 0.9 + 50;
        const triangles = pair.near.count * VEGETATION.leavesPerTree * 2;
        const threshold = VEGETATION.nearDistances[quality] + (pair.near.visible ? 4 : -4);
        pair.near.visible = distance < threshold && local && triangles <= trianglesLeft;
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
        photographicTrees: photographicTrees.length,
        parkLotTrees: parkLotTrees.length,
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
