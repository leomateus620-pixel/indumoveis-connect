import * as THREE from "three";
import { createSettlementImpostors } from "./settlementImpostors";
import { URBAN_REFERENCE } from "./urbanReference";
import maskUrl from "./assets/landscape-mask.png?url";
import maskFrame from "./assets/landscape-mask.json";
import type { QualityTier } from "./navigation";

const directory = "/landscape/santa-rosa/";
const origin = [95, 28] as const; // AEQD centre in the registered park drawing
const { u, v } = URBAN_REFERENCE.axis;
type Level = "compact" | "detail";
type TextureSet = Record<
  "near" | "mid" | "far" | "low" | "high" | "settlement" | "depth",
  THREE.Texture
>;

export function createLandscapeUniforms(radiance: THREE.Color, horizon: THREE.Color) {
  const sampler = () => ({ value: null as THREE.Texture | null });
  return {
    landscapeActive: { value: false },
    landscapeNear: sampler(),
    landscapeMid: sampler(),
    landscapeFar: sampler(),
    landscapeLow: sampler(),
    landscapeHigh: sampler(),
    landscapeDepth: sampler(),
    landscapeMask: sampler(),
    landscapeRelief: sampler(),
    landscapeSettlement: sampler(),
    // Differentials of the registered drawing. Components project an XZ offset onto E/N.
    landscapeEast: { value: new THREE.Vector2(u[0], v[0]) },
    landscapeNorth: { value: new THREE.Vector2(u[1], v[1]) },
    landscapeOrigin: { value: new THREE.Vector2(...origin) },
    landscapeScale: { value: URBAN_REFERENCE.unitsPerMetre },
    landscapeMaskFrame: {
      value: new THREE.Vector4().fromArray([...maskFrame.origin, ...maskFrame.extent]),
    },
    landscapeLight: { value: radiance },
    landscapeAir: { value: horizon },
  };
}

export type LandscapeUniforms = ReturnType<typeof createLandscapeUniforms>;

// The imagery is already sunlit. Work in linear light and apply only the shared illuminant,
// exposure and distance haze. Neither the aerial coordinates nor the panorama rotates with orbit.
export const aerialShader = `
  uniform bool landscapeActive;
  uniform sampler2D landscapeNear;
  uniform sampler2D landscapeMid;
  uniform sampler2D landscapeFar;
  uniform vec2 landscapeEast;
  uniform vec2 landscapeNorth;
  uniform vec2 landscapeOrigin;
  uniform float landscapeScale;
  uniform vec3 landscapeLight;
  uniform vec3 landscapeAir;
  vec2 landscapeEN(vec2 worldOffset) {
    return vec2(dot(worldOffset, landscapeEast), dot(worldOffset, landscapeNorth));
  }
  vec3 landscapeAerial(vec2 worldXZ) {
    vec2 metres = landscapeEN(worldXZ - landscapeOrigin) / landscapeScale;
    float radius = length(metres);
    vec3 ground;
    if (radius < 1990.) {
      ground = texture2D(landscapeNear, metres / 4096. + .5).rgb;
      if (radius > 1450.) ground = mix(ground, texture2D(landscapeMid, metres / 8192. + .5).rgb,
        smoothstep(1450., 1990., radius));
    } else if (radius < 3980.) {
      ground = texture2D(landscapeMid, metres / 8192. + .5).rgb;
      if (radius > 3450.) ground = mix(ground, texture2D(landscapeFar, metres / 50000. + .5).rgb,
        smoothstep(3450., 3980., radius));
    } else ground = texture2D(landscapeFar, metres / 50000. + .5).rgb;
    float haze = .18 * smoothstep(450., 4800., radius) + .44 * smoothstep(3500., 22000., radius);
    return mix(ground * mix(vec3(1.), landscapeLight, .72), landscapeAir, haze);
  }
`;

export const horizonShader = `
  uniform sampler2D landscapeLow;
  uniform sampler2D landscapeHigh;
  uniform sampler2D landscapeDepth;
  vec2 panoramaUV(vec2 eye, vec2 ray, float slope, float eyeAboveReference,
                  float radius, out float horizontalTravel) {
    // Intersect the camera ray with a cylinder at the texel's observed radius, then
    // project that point from the offline camera. This includes both horizontal and
    // vertical movement relative to the two panoramas' common geographical origin.
    float along = dot(eye, ray);
    horizontalTravel = max(1., sqrt(max(0., radius * radius - dot(eye, eye) + along * along)) - along);
    vec2 point = eye + horizontalTravel * ray;
    float elevation = degrees(atan(eyeAboveReference + slope * horizontalTravel, max(.1, length(point))));
    return vec2(atan(point.x, point.y) / (2. * 3.14159265), (elevation + 16.) / 24.);
  }
  vec4 panoramaLayer(sampler2D picture, bool high, vec2 eye, vec2 ray, float slope,
                     float height, vec2 dx, vec2 dy, out float distanceM) {
    float above = height - (high ? 72. : 16.);
    float radius = 3700.;
    vec2 uv;
    for (int i = 0; i < 2; i++) {
      uv = panoramaUV(eye, ray, slope, above, radius, distanceM);
      vec2 layers = texture2D(landscapeDepth, uv).rg;
      radius = 950. * pow(25000. / 950., high ? layers.g : layers.r);
    }
    uv = panoramaUV(eye, ray, slope, above, radius, distanceM);
    if (uv.y <= 0. || uv.y >= 1.) return vec4(0.);
    // Gradients come from the angular footprint of a pixel, independently of a step from
    // a wall to its background in the depth image. Such a step must never blur a facade.
    return textureGrad(picture, uv, dx, dy);
  }
  vec4 landscapePanorama(vec3 direction, out float travel) {
    travel = 25000.;
    if (direction.y > .24 || direction.y < -.51) return vec4(0.);
    vec2 horizontal = normalize(landscapeEN(direction.xz));
    vec2 eye = landscapeEN(cameraPosition.xz - landscapeOrigin) / landscapeScale;
    float height = cameraPosition.y / landscapeScale;
    float slope = direction.y / max(.001, length(direction.xz));
    float longitude = atan(horizontal.x, horizontal.y) / (2. * 3.14159265);
    float latitude = degrees(asin(direction.y)) / 24.;
    vec2 dx = vec2(fract(dFdx(longitude)+.5)-.5, dFdx(latitude));
    vec2 dy = vec2(fract(dFdy(longitude)+.5)-.5, dFdy(latitude));
    // Prefer the closer photographic projection. Blend only where the reference heights
    // are nearly equidistant; both samples refer to a depth-reprojected line of sight.
    float blend = smoothstep(40.,48.,height);
    vec4 low = vec4(0.);
    float lowTravel = 25000.;
    if (blend < 1.)
      low = panoramaLayer(landscapeLow, false, eye, horizontal, slope, height, dx, dy, lowTravel);
    if (blend <= 0.) { travel=lowTravel; return low; }
    vec4 high = panoramaLayer(landscapeHigh, true, eye, horizontal, slope, height, dx, dy, travel);
    if (blend >= 1.) return high;
    travel = mix(lowTravel, travel, blend);
    float coverage = mix(low.a, high.a, blend);
    return vec4(mix(low.rgb * low.a, high.rgb * high.a, blend)/max(.0001,coverage),coverage);
  }
  vec3 panoramaColour(vec3 colour) {
    return colour * mix(vec3(1.), landscapeLight, .72);
  }
  vec3 landscapeBackground(vec3 sky, vec3 direction) {
    if (direction.y > .24) return sky;
    float reach = (cameraPosition.y + .18) / max(.000001, -direction.y);
    float groundDistance = reach * length(direction.xz) / landscapeScale;
    vec3 base = sky;
    if (direction.y < 0. && groundDistance < 25000.)
      base = mix(landscapeAerial(cameraPosition.xz + direction.xz * reach), sky,
                 smoothstep(21000.,25000.,groundDistance));
    float observed;
    vec4 land = landscapePanorama(direction, observed);
    // Nearby occlusion is carried by the opaque relief mesh, buildings and crowns.
    // A visible distant structure contributes its actual opacity, without a planar fade.
    return mix(base, panoramaColour(land.rgb), land.a);
  }

`;

// Static DEM surface in registered drawing coordinates. A denser grid near the park
// gives the hills beyond the avenue and Arena parallax while the 25 km panorama stays on the sky.
function createRegionalRelief(uniforms: LandscapeUniforms) {
  const geometry = new THREE.PlaneGeometry(2, 2, 104, 104);
  const material = new THREE.ShaderMaterial({
    name: "santa-rosa-ground-relief",
    uniforms,
    vertexShader: `
      uniform sampler2D landscapeRelief;
      uniform sampler2D landscapeMask;
      uniform vec4 landscapeMaskFrame;
      uniform vec2 landscapeEast;
      uniform vec2 landscapeNorth;
      uniform vec2 landscapeOrigin;
      uniform float landscapeScale;
      varying vec3 regionalWorld;
      void main() {
        vec2 metres = sign(position.xy) * pow(abs(position.xy), vec2(1.6)) * 4096.;
        float relativeHeight = texture2D(landscapeRelief, metres / 8192. + .5).r * 255. - 128.;
        vec2 world = landscapeOrigin + (metres.x * landscapeEast + metres.y * landscapeNorth) * landscapeScale;
        vec2 uv = (world - landscapeMaskFrame.xy) / landscapeMaskFrame.zw;
        float grade = texture2D(landscapeMask, vec2(uv.x, 1. - uv.y)).g;
        float outer = 1. - smoothstep(3000., 3980., length(metres));
        regionalWorld = vec3(world.x, -.18 + relativeHeight * landscapeScale * grade * outer, world.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(regionalWorld, 1.);
      }
    `,
    fragmentShader: `
      ${aerialShader}
      ${horizonShader}
      uniform sampler2D landscapeMask;
      uniform vec4 landscapeMaskFrame;
      varying vec3 regionalWorld;
      void main() {
        vec2 uv = (regionalWorld.xz - landscapeMaskFrame.xy) / landscapeMaskFrame.zw;
        // The finite local underlay owns every pixel through the end of its feather.
        if (texture2D(landscapeMask, vec2(uv.x, 1. - uv.y)).r >= .004) discard;
        float radius = length(regionalWorld.xz - landscapeOrigin) / landscapeScale;
        if (radius >= 3980.) discard;
        vec3 surface = landscapeAerial(regionalWorld.xz);
        if (radius > 1350.) {
          vec3 ray = normalize(regionalWorld - cameraPosition);
          float observed;
          vec4 distant = landscapePanorama(ray, observed);
          float groundDistance = length(regionalWorld.xz-cameraPosition.xz)/landscapeScale;
          // Draw a measured roof or hill in front of the ground sample at full opacity.
          // A nearer slope blocks the view even if its satellite colour is darker/lighter.
          float visible = 1. - smoothstep(45.,150., observed-groundDistance);
          visible = max(visible,smoothstep(2850.,3650.,radius));
          float weight = smoothstep(1350.,1540.,radius) * visible * distant.a;
          surface = mix(surface,panoramaColour(distant.rgb),weight);
          if (distant.a < 1.) surface = mix(surface,landscapeAir,(1.-distant.a)*smoothstep(3550.,3980.,radius));
        }
        gl_FragColor = vec4(surface, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "santa-rosa-dsm";
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.userData.commercialPickable = false;
  return mesh;
}

export type LandscapeDiagnostic = {
  level: "pending" | Level;
  requested: Level;
  compactAt?: number;
  finalAt?: number;
  textureBytes: number;
  peakTextureBytes: number;
  downloadBytes: number;
  featureCount: number;
  featureBufferBytes: number;
  failure?: string;
};

export function landscapeQuality(
  tier: QualityTier,
  bufferWidth: number,
  maxSize: number,
  memory?: number,
): Level {
  if (tier === "light" || maxSize < 8192 || (memory !== undefined && memory < 4)) return "compact";
  return bufferWidth >= (tier === "detailed" ? 850 : 1200) ? "detail" : "compact";
}

function bytes(texture: THREE.Texture) {
  const { width, height } = texture.image as HTMLImageElement;
  return Math.ceil(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
}

export function createRegionalLandscape(
  renderer: THREE.WebGLRenderer,
  uniforms: LandscapeUniforms,
  compile: (mesh: THREE.Mesh) => Promise<unknown>,
  invalidate: () => void,
) {
  const stats: LandscapeDiagnostic = {
    level: "pending",
    requested: "compact",
    textureBytes: 0,
    peakTextureBytes: 0,
    downloadBytes: 0,
    featureCount: 0,
    featureBufferBytes: 0,
  };
  let current: TextureSet | undefined;
  let controller: AbortController | undefined;
  let disposed = false;
  let running = false;
  let failedLevel: Level | undefined;
  const auxiliary: THREE.Texture[] = [];
  const group = new THREE.Group();
  group.name = "indumoveis-santa-rosa-landscape";
  let relief: ReturnType<typeof createRegionalRelief> | undefined;
  let settlement: ReturnType<typeof createSettlementImpostors> | undefined;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // Decode concurrently. Upload at most one texture per turn after the park is interactive.
  async function readTexture(
    url: string,
    kind: "mask" | "depth" | "relief" | "aerial" | "panorama",
    signal: AbortSignal,
  ) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(url);
    const blob = await response.blob();
    stats.downloadBytes += blob.size;
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    try {
      image.src = objectUrl;
      await image.decode();
      signal.throwIfAborted();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    const texture = new THREE.Texture(image);
    texture.name = url;
    texture.colorSpace =
      kind === "aerial" || kind === "panorama" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS =
      kind === "depth" || kind === "panorama" ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = kind !== "depth" && kind !== "relief";
    texture.minFilter = texture.generateMipmaps
      ? THREE.LinearMipmapLinearFilter
      : THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    if (kind === "depth") texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.anisotropy = kind === "aerial" ? anisotropy : 1;
    texture.needsUpdate = true;
    return texture;
  }

  function publish(tier: Level, textures: TextureSet) {
    uniforms.landscapeNear.value = textures.near;
    uniforms.landscapeMid.value = textures.mid;
    uniforms.landscapeFar.value = textures.far;
    uniforms.landscapeLow.value = textures.low;
    uniforms.landscapeHigh.value = textures.high;
    uniforms.landscapeDepth.value = textures.depth;
    uniforms.landscapeSettlement.value = textures.settlement;
    uniforms.landscapeActive.value = true;
    if (current) Object.values(current).forEach((texture) => texture.dispose());
    current = textures;
    stats.level = tier;
    stats.textureBytes = [...auxiliary, ...Object.values(textures)].reduce(
      (sum, t) => sum + bytes(t),
      0,
    );
    invalidate();
  }

  async function prepare(level: Level, signal: AbortSignal) {
    const files: [string, "mask" | "depth" | "relief" | "aerial" | "panorama"][] = [
      [directory + "near-" + level + ".webp", "aerial"],
      [directory + "mid-" + level + ".webp", "aerial"],
      [directory + "far-" + level + ".webp", "aerial"],
      [directory + "horizon-low-" + level + ".webp", "panorama"],
      [directory + "horizon-high-" + level + ".webp", "panorama"],
      [directory + "settlement-" + level + ".webp", "aerial"],
      [directory + "depth-" + level + ".png", "depth"],
    ];
    if (!auxiliary.length) files.push([maskUrl, "mask"], [directory + "relief.png", "relief"]);
    let samples: Float32Array | undefined;
    if (!auxiliary.length) {
      const result = await fetch(directory + "settlement.bin", { signal });
      if (!result.ok) throw new Error("settlement-positions-unavailable");
      samples = new Float32Array(await result.arrayBuffer());
      stats.downloadBytes += samples.byteLength;
    }
    const results = await Promise.allSettled(
      files.map(([url, kind]) => readTexture(url, kind, signal)),
    );
    const textures = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    try {
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
      let inFlightBytes = stats.textureBytes;
      for (const texture of textures) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 24));
        signal.throwIfAborted();
        renderer.initTexture(texture);
        inFlightBytes += bytes(texture);
        stats.peakTextureBytes = Math.max(stats.peakTextureBytes, inFlightBytes);
      }
      const [near, mid, far, low, high, atlas, depth, mask, heightmap] = textures;
      if (samples) {
        settlement = createSettlementImpostors(samples, uniforms);
        relief = createRegionalRelief(uniforms);
        await compile(relief);
        signal.throwIfAborted();
        await compile(settlement);
        signal.throwIfAborted();
        group.add(relief, settlement);
        stats.featureBufferBytes = samples.byteLength;
        stats.featureCount = settlement.geometry.instanceCount;
        auxiliary.push(mask, heightmap);
        uniforms.landscapeRelief.value = heightmap;
        uniforms.landscapeMask.value = mask;
      }
      publish(level, { near, mid, far, low, high, settlement: atlas, depth });
    } catch (error) {
      if (settlement && !current) {
        settlement.geometry.dispose();
        settlement.material.dispose();
        settlement = undefined;
      }
      if (relief && !current) {
        relief.geometry.dispose();
        relief.material.dispose();
        relief = undefined;
      }
      textures.forEach((texture) => texture.dispose());
      throw error;
    }
  }

  async function reconcile() {
    if (running || disposed || stats.level === stats.requested) return;
    running = true;
    while (!disposed && stats.level !== stats.requested) {
      const level = current ? stats.requested : "compact";
      if (failedLevel === level) break;
      controller = new AbortController();
      try {
        await prepare(level, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          failedLevel = level;
          stats.failure = error instanceof Error ? error.message : "landscape-load";
        }
      }
    }
    running = false;
  }

  return {
    stats,
    group,
    request(level: Level) {
      if (disposed) return;
      if (level !== stats.requested) {
        stats.requested = level;
        stats.finalAt = undefined;
        stats.failure = undefined;
        failedLevel = undefined;
        if (current) controller?.abort();
      }
      void reconcile();
    },
    presented(now: number) {
      if (stats.level === "pending") return;
      if (stats.compactAt === undefined) {
        stats.compactAt = now;
        performance.mark("indumoveis-map:landscape-compact");
      }
      if (stats.level === stats.requested && stats.finalAt === undefined) {
        stats.finalAt = now;
        performance.mark("indumoveis-map:landscape-final");
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller?.abort();
      if (current) Object.values(current).forEach((texture) => texture.dispose());
      auxiliary.forEach((texture) => texture.dispose());
      settlement?.geometry.dispose();
      settlement?.material.dispose();
      settlement = undefined;
      group.removeFromParent();
      group.clear();
      relief?.geometry.dispose();
      relief?.material.dispose();
      relief = undefined;
      uniforms.landscapeActive.value = false;
      for (const sampler of [
        uniforms.landscapeNear,
        uniforms.landscapeMid,
        uniforms.landscapeFar,
        uniforms.landscapeLow,
        uniforms.landscapeHigh,
        uniforms.landscapeDepth,
        uniforms.landscapeMask,
        uniforms.landscapeRelief,
        uniforms.landscapeSettlement,
      ])
        sampler.value = null;
      stats.textureBytes = 0;
    },
  };
}
