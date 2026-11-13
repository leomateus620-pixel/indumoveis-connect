import * as THREE from "three";
import type { MapEntity, Point } from "./data/territory";
import { polygonBounds, type Bounds } from "./geometry";
import { pavementUnionCells } from "./pavement";
import { SURFACE_PALETTE, type SurfaceQuality } from "./surfaceMaterials";
import { patchGroundCoordinates } from "./groundVariation";
import { subtractPolygons } from "./parkGeometry";
import { PARK_SURFACE_COLORS } from "./visualTheme";

/** All distances use drawing units (10 PDF points), not surveyed metres.
 * The former board already sat at -0.15. Keeping its elevation preserves the
 * approved landscape (-0.08), asphalt (-0.025), walks (-0.018) and lot floors.
 * Relief is material-only: no hill, pebble or stain can protrude into a lot. */
export const TERRAIN = {
  elevation: -0.15,
  baseElevation: -0.18,
  albedoSize: 128,
  detailSize: 128,
  detailTile: 2.8,
  bump: 0.005,
  // Keep the surroundings readable before the blend starts, then reach
  // the sky colour before the low, grazing rays reach the clip plane.
  hazeStartDiagonals: 1.05,
  hazeEndDiagonals: 2.85,
} as const;

export type TerrainTopology = {
  /** Source-derived backing for existing unclassified circulation floors.
   * This is a presentation silhouette, never an official cadastral boundary. */
  protectedCells: Point[][];
  exteriorCells: Point[][];
  protectedBounds: Bounds;
  extent: Bounds;
};

const rectangle = (minX: number, minY: number, maxX: number, maxY: number): Point[] => [
  [minX, minY],
  [maxX, minY],
  [maxX, maxY],
  [minX, maxY],
];

/** Fill only the vertical interior spans of the source-polygon union. This
 * retains the white/neutral circulation between buildings and roads that had
 * previously borrowed the artificial rectangular board as their floor. Upper
 * and lower boundaries follow actual source edges, including slanted edges and
 * the entrance; no commercial perimeter is inferred from MAP_BOUNDS alone.
 * Decomposition happens once on creation, never during a camera gesture. */
export function deriveProtectedGround(entities: readonly MapEntity[]): Point[][] {
  const union = pavementUnionCells(entities.map((entity) => entity.polygon));
  const bands = new Map<
    number,
    { x0: number; x1: number; low0: number; low1: number; high0: number; high1: number }
  >();
  for (const [a, b, c, d] of union) {
    const previous = bands.get(a[0]);
    if (previous) {
      previous.low0 = Math.min(previous.low0, a[1]);
      previous.low1 = Math.min(previous.low1, b[1]);
      previous.high0 = Math.max(previous.high0, d[1]);
      previous.high1 = Math.max(previous.high1, c[1]);
    } else
      bands.set(a[0], {
        x0: a[0],
        x1: b[0],
        low0: a[1],
        low1: b[1],
        high0: d[1],
        high1: c[1],
      });
  }
  return [...bands.values()].map(({ x0, x1, low0, low1, high0, high1 }) => [
    [x0, low0],
    [x1, low1],
    [x1, high1],
    [x0, high0],
  ]);
}

/** The complement and neutral backing share the exact seam and elevation;
 * they have no coplanar overlapping faces. Extent can change on viewport resize
 * without changing the protected source contour or world texture coordinates. */
export function deriveTerrainTopology(
  protectedCells: Point[][],
  requestedExtent: Bounds,
): TerrainTopology {
  if (!protectedCells.length) throw new Error("terrain-requires-commercial-polygons");
  if (!Object.values(requestedExtent).every(Number.isFinite))
    throw new Error("terrain-invalid-extent");
  const protectedBounds = polygonBounds(protectedCells.flat());
  const extent = {
    minX: Math.min(requestedExtent.minX, protectedBounds.minX - 1),
    minY: Math.min(requestedExtent.minY, protectedBounds.minY - 1),
    maxX: Math.max(requestedExtent.maxX, protectedBounds.maxX + 1),
    maxY: Math.max(requestedExtent.maxY, protectedBounds.maxY + 1),
  };
  const exteriorCells = [
    rectangle(extent.minX, extent.minY, protectedBounds.minX, extent.maxY),
    rectangle(protectedBounds.maxX, extent.minY, extent.maxX, extent.maxY),
  ];
  let previousX = protectedBounds.minX;
  for (const [a, b, c, d] of protectedCells) {
    // Also cover an x gap if a future source revision has disconnected pieces.
    if (a[0] > previousX) exteriorCells.push(rectangle(previousX, extent.minY, a[0], extent.maxY));
    exteriorCells.push(
      [[a[0], extent.minY], [b[0], extent.minY], b, a],
      [d, c, [c[0], extent.maxY], [d[0], extent.maxY]],
    );
    previousX = b[0];
  }
  return { protectedCells, exteriorCells, protectedBounds, extent };
}

function surfaceGeometry(polygons: readonly Point[][], elevation: number = TERRAIN.elevation) {
  const vertices: number[] = [],
    uvs: number[] = [];
  for (const polygon of polygons) {
    const triangles = THREE.ShapeUtils.triangulateShape(
      polygon.map(([x, y]) => new THREE.Vector2(x, y)),
      [],
    );
    for (const [a, b, c] of triangles) {
      const points = [polygon[a], polygon[b], polygon[c]];
      const crossY =
        (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]) -
        (points[1][0] - points[0][0]) * (points[2][1] - points[0][1]);
      if (crossY < 0) [points[1], points[2]] = [points[2], points[1]];
      for (const [x, y] of points) {
        vertices.push(x, elevation, y);
        // World UVs never depend on mesh dimensions, camera or orbit target.
        uvs.push(x, y);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function hash(x: number, y: number, salt: number) {
  let n = Math.imul(x + salt, 374761393) ^ Math.imul(y - salt, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/** Periodic smooth value noise. Integer periods give seamless mipmapped maps. */
function noise(u: number, v: number, period: number, salt: number) {
  const x = u * period,
    y = v * period,
    ix = Math.floor(x),
    iy = Math.floor(y);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const fx = ease(x - ix),
    fy = ease(y - iy);
  const sample = (a: number, b: number) => hash(a % period, b % period, salt);
  const lower = THREE.MathUtils.lerp(sample(ix, iy), sample(ix + 1, iy), fx);
  const upper = THREE.MathUtils.lerp(sample(ix, iy + 1), sample(ix + 1, iy + 1), fx);
  return THREE.MathUtils.lerp(lower, upper, fy);
}

// Two compact, immutable CPU arrays survive warm reopens.
// Texture/GPU ownership is always per renderer; no disposed Texture is shared.
const terrainPixelCache: Partial<Record<"albedo" | "detail", Uint8Array>> = {};

function terrainPixels(kind: "albedo" | "detail") {
  const cached = terrainPixelCache[kind];
  if (cached) return cached;
  const size = kind === "albedo" ? TERRAIN.albedoSize : TERRAIN.detailSize;
  const pixels = new Uint8Array(size * size * 4);
  const grassColor = new THREE.Color(PARK_SURFACE_COLORS.grass);
  const sample = new THREE.Color();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const fine = hash(x, y, 271) - 0.5;
      const tufts = noise(u, v, 29, 59) - 0.5;
      const offset = (y * size + x) * 4;
      if (kind === "albedo") {
        // Center close grain on the same grass colour as the startup texture.
        // The shared non-periodic shader supplies the visible broad variation.
        sample
          .copy(grassColor)
          .multiplyScalar(1 + tufts * 0.08 + fine * 0.03)
          .convertLinearToSRGB();
        pixels[offset] = Math.round(sample.r * 255);
        pixels[offset + 1] = Math.round(sample.g * 255);
        pixels[offset + 2] = Math.round(sample.b * 255);
      } else {
        const value = Math.round(128 + tufts * 26 + fine * 13);
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
      }
      pixels[offset + 3] = 255;
    }
  terrainPixelCache[kind] = pixels;
  return pixels;
}

function terrainMap(kind: "albedo" | "detail") {
  const size = kind === "albedo" ? TERRAIN.albedoSize : TERRAIN.detailSize;
  const texture = new THREE.DataTexture(terrainPixels(kind), size, size, THREE.RGBAFormat);
  try {
    texture.name = `indumoveis-terrain-${kind}`;
    texture.colorSpace = kind === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.setScalar(1 / TERRAIN.detailTile);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 2;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    texture.dispose();
    throw error;
  }
}

/** Two static batches, no external asset, object scatter, picking or RAF loop.
 * The scene owns illumination; terrain never changes global exposure/lights. */
export function createTerrain(
  entities: readonly MapEntity[],
  options: {
    extent: Bounds;
    quality?: SurfaceQuality;
    maps?: boolean;
    deferMaps?: boolean;
    foundationMaterial?: THREE.Material;
    /** Presentation green cells cut the obsolete neutral floor at its origin. */
    foundationExclusions?: readonly Point[][];
  },
) {
  const group = new THREE.Group();
  group.name = "indumoveis-external-ground";
  const owned = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  const own = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T) => {
    owned.add(resource);
    return resource;
  };
  const textures: THREE.DataTexture[] = [];
  let placeholder: THREE.DataTexture | null = null;
  let mapsAttempted = false;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const resource of owned) resource.dispose();
    owned.clear();
    group.clear();
  };
  try {
    const protectedCells = deriveProtectedGround(entities);
    let topology = deriveTerrainTopology(protectedCells, options.extent);
    const material = own(
      new THREE.MeshLambertMaterial({
        name: "indumoveis-matte-external-soil",
        color: PARK_SURFACE_COLORS.grass,
        envMapIntensity: 0,
        // The finite horizon plane spans thousands of units. Its interpolated
        // depth can win against the circulation floor despite the real .03
        // height gap. Push only this background underlay away in raster depth;
        // commercial positions, shared materials and world UVs stay untouched.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 2,
      }),
    );
    const protectedDiagonal = Math.hypot(
      topology.protectedBounds.maxX - topology.protectedBounds.minX,
      topology.protectedBounds.maxY - topology.protectedBounds.minY,
    );
    const atmosphere = {
      center: { value: new THREE.Vector2() },
      range: { value: new THREE.Vector2(1e7, 2e7) },
      color: { value: new THREE.Color("#dce9ec") },
      parkCenter: {
        value: new THREE.Vector2(
          (topology.protectedBounds.minX + topology.protectedBounds.maxX) / 2,
          (topology.protectedBounds.minY + topology.protectedBounds.maxY) / 2,
        ),
      },
      parkRadius: {
        value: new THREE.Vector2(
          (topology.protectedBounds.maxX - topology.protectedBounds.minX) * 1.15,
          (topology.protectedBounds.maxY - topology.protectedBounds.minY) * 1.45,
        ),
      },
      distantSoil: { value: new THREE.Color(PARK_SURFACE_COLORS.distantGrass) },
    };
    material.onBeforeCompile = (shader) => {
      patchGroundCoordinates(shader);
      shader.uniforms.terrainHorizonCenter = atmosphere.center;
      shader.uniforms.terrainHorizonRange = atmosphere.range;
      shader.uniforms.terrainHorizonColor = atmosphere.color;
      shader.uniforms.terrainParkCenter = atmosphere.parkCenter;
      shader.uniforms.terrainParkRadius = atmosphere.parkRadius;
      shader.uniforms.terrainDistantSoil = atmosphere.distantSoil;
      shader.fragmentShader = `uniform vec2 terrainHorizonCenter;
          uniform vec2 terrainHorizonRange;
          uniform vec3 terrainHorizonColor;
          uniform vec2 terrainParkCenter;
          uniform vec2 terrainParkRadius;
          uniform vec3 terrainDistantSoil;
          ${shader.fragmentShader}`
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
            float parkImportance = 1.0 - smoothstep(.78, 2.0,
              length((parkSurfaceWorld - terrainParkCenter) / terrainParkRadius));
            if (parkImportance > 0.0) {
              diffuseColor.rgb = mix(terrainDistantSoil,
                diffuseColor.rgb * parkGrassVariation(parkSurfaceWorld), parkImportance);
            } else {
              diffuseColor.rgb = terrainDistantSoil;
            }`,
        )
        .replace(
          "#include <opaque_fragment>",
          `float distantAtmosphere = smoothstep(terrainHorizonRange.x, terrainHorizonRange.y,
              distance(parkSurfaceWorld, terrainHorizonCenter));
            outgoingLight = mix(outgoingLight, terrainHorizonColor, distantAtmosphere);
            #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => "indumoveis-ground-horizon-v4";
    if (options.maps !== false && options.deferMaps) {
      // Compile USE_MAP in the first useful frame without generating the full
      // deterministic field. Keeping a map on both sides avoids a later shader
      // variant merely because the richer albedo became available.
      const hex = Number.parseInt(PARK_SURFACE_COLORS.grass.slice(1), 16);
      placeholder = own(
        new THREE.DataTexture(
          new Uint8Array([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255]),
          1,
          1,
          THREE.RGBAFormat,
        ),
      );
      placeholder.name = "indumoveis-terrain-pending-albedo";
      placeholder.colorSpace = THREE.SRGBColorSpace;
      placeholder.minFilter = placeholder.magFilter = THREE.LinearFilter;
      placeholder.wrapS = placeholder.wrapT = THREE.RepeatWrapping;
      placeholder.repeat.setScalar(1 / TERRAIN.detailTile);
      placeholder.generateMipmaps = false;
      placeholder.needsUpdate = true;
      material.map = placeholder;
      material.color.set("#ffffff");
    }
    const foundation =
      options.foundationMaterial ??
      own(
        new THREE.MeshLambertMaterial({
          name: "indumoveis-preserved-circulation-base",
          color: SURFACE_PALETTE.concrete,
        }),
      );
    // A continuous underlay avoids GPU raster cracks from kilometre-long,
    // subpixel-width complement triangles at the source's tiny drafting slabs.
    // The protected backing occludes it completely; 0.03 drawing units is below
    // the existing floor separations, with no side skirt or artificial platform.
    const baseGeometry = (extent: Bounds) =>
      surfaceGeometry(
        [rectangle(extent.minX, extent.minY, extent.maxX, extent.maxY)],
        TERRAIN.baseElevation,
      );
    const ground = new THREE.Mesh(own(baseGeometry(topology.extent)), material);
    ground.name = "external-soil";
    const floorGeometry = own(
      surfaceGeometry(subtractPolygons(protectedCells, options.foundationExclusions ?? [])),
    );
    floorGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(floorGeometry.getAttribute("position").count * 3).fill(1),
        3,
      ),
    );
    const floorUvs = floorGeometry.getAttribute("uv");
    for (let i = 0; i < floorUvs.count; i++)
      floorUvs.setXY(i, floorUvs.getX(i) / 2.8, floorUvs.getY(i) / 2.8);
    const floor = new THREE.Mesh(floorGeometry, foundation);
    floor.name = "preserved-circulation-floor";
    for (const mesh of [ground, floor]) {
      mesh.raycast = () => {};
      mesh.userData.commercialPickable = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    let quality = options.quality ?? "balanced";
    let lastDistance = 80;
    function updateDetail(distance: number) {
      lastDistance = distance;
      material.bumpScale =
        TERRAIN.bump *
        (1 - THREE.MathUtils.smoothstep(distance, 30, 120)) *
        (quality === "light" ? 0.5 : 1);
    }
    function setQuality(tier: SurfaceQuality) {
      quality = tier;
      // Dry ground needs diffuse light, not a full-screen PBR/environment BRDF.
      // Reserve optional normal derivatives for the existing highest profile.
      const bumpMap = tier === "detailed" ? (textures[1] ?? null) : null;
      if (material.bumpMap !== bumpMap) {
        material.bumpMap = bumpMap;
        material.needsUpdate = true;
      }
      updateDetail(lastDistance);
    }
    function prepareMaps() {
      if (disposed || options.maps === false) return false;
      if (mapsAttempted) return textures.length === 2;
      mapsAttempted = true;
      const prepared: THREE.DataTexture[] = [];
      try {
        prepared.push(terrainMap("albedo"));
        prepared.push(terrainMap("detail"));
      } catch {
        for (const texture of prepared) texture.dispose();
        // A pending one-pixel map stays valid without changing USE_MAP; eager
        // preparation retains the original plain material colour fallback.
        return false;
      }
      prepared.forEach(own);
      textures.push(...prepared);
      material.map = textures[0];
      material.color.set("#ffffff");
      if (placeholder) {
        owned.delete(placeholder);
        placeholder.dispose();
        placeholder = null;
      }
      setQuality(quality);
      return true;
    }
    setQuality(quality);
    if (!options.deferMaps) prepareMaps();
    return {
      group,
      material,
      get textures(): readonly THREE.DataTexture[] {
        return textures;
      },
      get textureBytes() {
        return textures.reduce(
          (bytes, texture) =>
            bytes + Math.ceil((texture.image.width * texture.image.height * 4 * 4) / 3),
          placeholder ? 4 : 0,
        );
      },
      get topology() {
        return topology;
      },
      setExtent(extent: Bounds) {
        if (disposed) return;
        const next = deriveTerrainTopology(protectedCells, extent);
        if (
          Object.keys(next.extent).every(
            (key) => next.extent[key as keyof Bounds] === topology.extent[key as keyof Bounds],
          )
        )
          return;
        const previous = ground.geometry;
        ground.geometry = own(baseGeometry(next.extent));
        owned.delete(previous);
        previous.dispose();
        topology = next;
      },
      setQuality,
      updateDetail,
      prepareMaps,
      setAtmosphere(fade: { center: Point; start: number; end: number }, color: string) {
        atmosphere.center.value.set(...fade.center);
        atmosphere.range.value.set(
          Math.min(fade.start, protectedDiagonal * TERRAIN.hazeStartDiagonals),
          Math.min(fade.end, protectedDiagonal * TERRAIN.hazeEndDiagonals),
        );
        atmosphere.color.value.set(color);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
