import * as THREE from "three";

type MaterialValue = THREE.Material | THREE.Material[];
type Mirror = { source: THREE.MeshStandardMaterial; material: THREE.MeshLambertMaterial };
type Registration = {
  mesh: THREE.Mesh;
  canonical: MaterialValue;
  presented: MaterialValue | null;
  presentedSlots: THREE.Material[] | null;
};

const featureKeys = [
  "vertexColors",
  "side",
  "shadowSide",
  "flatShading",
  "fog",
  "wireframe",
  "transparent",
  "premultipliedAlpha",
  "alphaHash",
  "alphaToCoverage",
  "toneMapped",
  "dithering",
  "clippingPlanes",
  "clipIntersection",
  "clipShadows",
] as const;
const renderKeys = [
  "opacity",
  "visible",
  "emissiveIntensity",
  "depthTest",
  "depthWrite",
  "depthFunc",
  "colorWrite",
  "polygonOffset",
  "polygonOffsetFactor",
  "polygonOffsetUnits",
  "blending",
  "blendSrc",
  "blendDst",
  "blendEquation",
  "blendSrcAlpha",
  "blendDstAlpha",
  "blendEquationAlpha",
  "blendAlpha",
  "stencilWrite",
  "stencilWriteMask",
  "stencilFunc",
  "stencilRef",
  "stencilFuncMask",
  "stencilFail",
  "stencilZFail",
  "stencilZPass",
  "wireframeLinewidth",
  "precision",
  "forceSinglePass",
] as const;
const mapKeys = ["map", "alphaMap", "emissiveMap"] as const;

/** Presentation-only diffuse mirrors for Automatic/software. Canonical Standard
 * materials stay live with their original owner. No texture is owned here. */
export function createSoftwareMaterials(options: { enabled: boolean }) {
  let enabled = options.enabled;
  let disposed = false;
  const mirrors = new Map<THREE.MeshStandardMaterial, Mirror>();
  const sources = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
  const registrations = new Map<THREE.Mesh, Registration>();

  function updateMirror({ source, material }: Mirror) {
    let changed = false;
    const sourceFields = source as unknown as Record<string, unknown>;
    const mirrorFields = material as unknown as Record<string, unknown>;
    for (const key of featureKeys) {
      if (mirrorFields[key] === sourceFields[key]) continue;
      mirrorFields[key] = sourceFields[key];
      changed = true;
    }
    for (const key of renderKeys) mirrorFields[key] = sourceFields[key];
    if (Boolean(material.alphaTest) !== Boolean(source.alphaTest)) changed = true;
    material.alphaTest = source.alphaTest;
    material.color.copy(source.color);
    material.emissive.copy(source.emissive);
    material.blendColor.copy(source.blendColor);
    for (const key of mapKeys) {
      if (material[key] === source[key]) continue;
      material[key] = source[key];
      changed = true;
    }
    if (material.onBeforeCompile !== source.onBeforeCompile) {
      material.onBeforeCompile = source.onBeforeCompile;
      changed = true;
    }
    if (material.customProgramCacheKey !== source.customProgramCacheKey) {
      material.customProgramCacheKey = source.customProgramCacheKey;
      changed = true;
    }
    // Numeric colour/opacity uniforms never dirty the program. Normal, bump,
    // roughness, AO and environment are deliberately absent from this shader.
    if (changed) material.needsUpdate = true;
  }

  function canonicalMaterial(material: THREE.Material) {
    return sources.get(material) ?? material;
  }
  function canonicalValue(value: MaterialValue): MaterialValue {
    if (!Array.isArray(value)) return canonicalMaterial(value);
    return value.some((material) => sources.has(material)) ? value.map(canonicalMaterial) : value;
  }
  function presentationMaterial(material: THREE.Material) {
    if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return material;
    const source = material as THREE.MeshStandardMaterial;
    let mirror = mirrors.get(source);
    if (!mirror) {
      mirror = { source, material: new THREE.MeshLambertMaterial() };
      mirror.material.name = `${source.name || "standard"}:software-diffuse`;
      mirrors.set(source, mirror);
      sources.set(mirror.material, source);
      updateMirror(mirror);
    }
    return mirror.material;
  }
  function hasOwnPresentation(record: Registration) {
    const current = record.mesh.material;
    return (
      current === record.presented &&
      (!Array.isArray(current) ||
        (record.presentedSlots?.length === current.length &&
          current.every((material, i) => material === record.presentedSlots![i])))
    );
  }
  function captureExternal(record: Registration) {
    if (hasOwnPresentation(record)) return;
    record.canonical = canonicalValue(record.mesh.material);
    record.presented = null;
    record.presentedSlots = null;
  }
  function present(record: Registration) {
    const canonical = record.canonical;
    if (Array.isArray(canonical)) {
      const needsMirrors = canonical.some(
        (material) => (material as THREE.MeshStandardMaterial).isMeshStandardMaterial,
      );
      if (!needsMirrors) {
        record.mesh.material = canonical;
        record.presented = canonical;
        record.presentedSlots = null;
        return;
      }
      const presented =
        Array.isArray(record.presented) && record.presented !== canonical ? record.presented : [];
      const slots = record.presentedSlots ?? [];
      presented.length = slots.length = canonical.length;
      for (let i = 0; i < canonical.length; i++)
        presented[i] = slots[i] = presentationMaterial(canonical[i]);
      record.mesh.material = presented;
      record.presented = presented;
      record.presentedSlots = slots;
    } else {
      record.presented = presentationMaterial(canonical);
      record.mesh.material = record.presented;
      record.presentedSlots = null;
    }
  }

  return {
    /** Register late meshes/material swaps before compilation. Disabled mode
     * records canonical references only, without copying materials or arrays. */
    sync(root: THREE.Object3D) {
      if (disposed) return;
      root.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh) return;
        const mesh = object as THREE.Mesh;
        let record = registrations.get(mesh);
        if (!record) {
          record = {
            mesh,
            canonical: canonicalValue(mesh.material),
            presented: null,
            presentedSlots: null,
          };
          registrations.set(mesh, record);
        } else captureExternal(record);
        if (enabled) present(record);
      });
    },
    /** Uniform/reference sync only. No material, texture, array or mesh is
     * allocated here; call sync() when the scene adds/replaces materials. */
    update() {
      if (disposed || !enabled) return;
      for (const mirror of mirrors.values()) updateMirror(mirror);
    },
    setEnabled(next: boolean) {
      if (disposed || enabled === next) return;
      for (const record of registrations.values()) captureExternal(record);
      enabled = next;
      for (const record of registrations.values()) {
        if (enabled) present(record);
        else {
          record.mesh.material = record.canonical;
          record.presented = null;
          record.presentedSlots = null;
        }
      }
    },
    get materialCount() {
      return mirrors.size;
    },
    dispose() {
      if (disposed) return;
      for (const record of registrations.values()) {
        captureExternal(record);
        record.mesh.material = record.canonical;
      }
      disposed = true;
      for (const mirror of mirrors.values()) mirror.material.dispose();
      mirrors.clear();
      registrations.clear();
    },
  };
}
