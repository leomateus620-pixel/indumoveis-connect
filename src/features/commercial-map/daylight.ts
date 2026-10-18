import * as THREE from "three";

/** One world-oriented art direction for visible sky, filtered reflections and
 * local lights. Direction points from the park towards the sun, not camera.
 * These are presentation choices, not a time/location solar simulation. */
export const DAYLIGHT = {
  sunDirection: [-0.5, Math.SQRT1_2, 0.5] as readonly [number, number, number],
  sunlight: { color: "#fff4e3", intensity: 2.8 },
  hemisphere: { sky: "#d5e4ef", ground: "#b6b9a0", intensity: 1.55 },
  fill: { color: "#dbe8f5", intensity: 0.45 },
  sky: { zenith: "#6fa9d6", mid: "#9bc6e1", horizon: "#dce9ec" },
  ground: { nearHorizon: "#b9c4a6", nadir: "#879773" },
  horizonBandRadians: 0.02,
  panorama: { width: 1024, height: 512 },
  simplePanorama: { width: 64, height: 32 },
  environment: { width: 512, height: 256 },
} as const;

export type DaylightSky = {
  texture: THREE.DataTexture;
  /** RGBA8 source; excludes Three's renderer-owned cubemap and driver overhead. */
  textureBytes: number;
  fallback: boolean;
  detail: "simple" | "rich";
  dispose(): void;
};

const colors = {
  zenith: new THREE.Color(DAYLIGHT.sky.zenith),
  mid: new THREE.Color(DAYLIGHT.sky.mid),
  horizon: new THREE.Color(DAYLIGHT.sky.horizon),
  ground: new THREE.Color(DAYLIGHT.ground.nearHorizon),
  nadir: new THREE.Color(DAYLIGHT.ground.nadir),
  cloud: new THREE.Color("#f4f6f2"),
  sun: new THREE.Color(DAYLIGHT.sunlight.color),
};
const horizonY = Math.sin(DAYLIGHT.horizonBandRadians);

/** Few wide, soft cloud banks. Every centre/basis lives on the world sphere;
 * no UV-noise seam, longitude stretch, pole pinch or camera-relative motion. */
const cloudBanks = [
  { azimuth: -1.05, elevation: 0.105, width: 0.22, height: 0.028, opacity: 0.72 },
  { azimuth: 0.7, elevation: 0.15, width: 0.27, height: 0.043, opacity: 0.75 },
  { azimuth: 2.6, elevation: 0.12, width: 0.2, height: 0.03, opacity: 0.68 },
  { azimuth: -2.5, elevation: 0.105, width: 0.3, height: 0.035, opacity: 0.76 },
].map(({ azimuth, elevation, width, height, opacity }) => {
  const cosElevation = Math.cos(elevation);
  const centre = [
    Math.cos(azimuth) * cosElevation,
    Math.sin(elevation),
    Math.sin(azimuth) * cosElevation,
  ];
  const horizontal = [-Math.sin(azimuth), 0, Math.cos(azimuth)];
  const vertical = [
    -Math.sin(elevation) * Math.cos(azimuth),
    cosElevation,
    -Math.sin(elevation) * Math.sin(azimuth),
  ];
  return { centre, horizontal, vertical, width, height, opacity };
});

/** Allocation-free inner sampler; input must be a normalized world direction.
 * Result is linear RGB until the caller explicitly encodes it as sRGB. */
function sampleDirection(x: number, y: number, z: number, clouds: boolean, target: THREE.Color) {
  target.copy(colors.horizon);
  // A shallow, identical horizon on both sides lets distant terrain disappear
  // without a horizon seam. Clouds, solar glow and ground colour start outside.
  if (Math.abs(y) <= horizonY) return target;
  if (y < -horizonY) {
    const below = -y;
    target.lerp(colors.ground, THREE.MathUtils.smoothstep(below, horizonY, 0.42));
    target.lerp(colors.nadir, THREE.MathUtils.smoothstep(below, 0.42, 1));
    return target;
  }
  target.lerp(colors.mid, THREE.MathUtils.smoothstep(y, horizonY, 0.1));
  target.lerp(colors.zenith, THREE.MathUtils.smoothstep(y, 0.1, 1));
  const clearHorizon = THREE.MathUtils.smoothstep(y, horizonY, horizonY + 0.025);
  if (clouds) {
    let cloud = 0;
    for (const bank of cloudBanks) {
      const facing = x * bank.centre[0] + y * bank.centre[1] + z * bank.centre[2];
      if (facing < 0.9) continue;
      const h =
        (x * bank.horizontal[0] + y * bank.horizontal[1] + z * bank.horizontal[2]) / bank.width;
      const v = (x * bank.vertical[0] + y * bank.vertical[1] + z * bank.vertical[2]) / bank.height;
      // Offset lobes make a low cloud bank with rounded shoulders rather than
      // an ellipsoid cutout, hard noise threshold or repeated cloud sprites.
      const density =
        Math.exp(-h * h * 2.2 - v * v * 1.6) * 0.68 +
        Math.exp(-((h - 0.6) ** 2) * 4.1 - (v + 0.22) ** 2 * 2.2) * 0.38 +
        Math.exp(-((h + 0.63) ** 2) * 4.8 - (v + 0.15) ** 2 * 2.6) * 0.32;
      cloud = Math.max(cloud, THREE.MathUtils.smoothstep(density, 0.12, 0.93) * bank.opacity);
    }
    target.lerp(colors.cloud, cloud * clearHorizon);
  }
  const [sx, sy, sz] = DAYLIGHT.sunDirection;
  const sunDot = Math.max(0, x * sx + y * sy + z * sz);
  // Broad, low-energy warm lobe. No HDR disc, lens flare or additional light.
  target.lerp(colors.sun, Math.pow(sunDot, 48) * 0.09 * clearHorizon);
  return target;
}

/** Public reference sampler for invariant tests and atmosphere diagnostics.
 * Returns sRGB byte channels. Scalar multiples represent the same direction. */
export function sampleDaylightDirection(
  direction: readonly [number, number, number],
  clouds = true,
): [number, number, number] {
  const length = Math.hypot(...direction);
  if (!length || !direction.every(Number.isFinite)) throw new Error("daylight-invalid-direction");
  const color = sampleDirection(
    direction[0] / length,
    direction[1] / length,
    direction[2] / length,
    clouds,
    new THREE.Color(),
  ).convertLinearToSRGB();
  return [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];
}

// CPU data is immutable by contract and shared across renderer reopenings and
// PMREM preparation. GPU Texture objects always have independent ownership.
// Four LRU entries bound retained memory even for development preview sizes.
const panoramaCache = new Map<string, Uint8Array>();
const MAX_CACHED_PANORAMAS = 4;

/** Same direction sampler feeds visible 1024×512 sky and 512×256 reflections.
 * Returned bytes are borrowed read-only; upload or inspect them without edits.
 * DataTexture.flipY=false + Three equirectUv: first row south, last row zenith. */
export function createDaylightPixels(width: number, height: number, clouds = true): Uint8Array {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > DAYLIGHT.panorama.width ||
    height > DAYLIGHT.panorama.height
  )
    throw new Error("daylight-invalid-panorama-size");
  const key = `${width}x${height}:${clouds ? "rich" : "simple"}`;
  const cached = panoramaCache.get(key);
  if (cached) {
    panoramaCache.delete(key);
    panoramaCache.set(key, cached);
    return cached;
  }
  const pixels = new Uint8Array(width * height * 4);
  const color = new THREE.Color();
  for (let row = 0; row < height; row++) {
    // Match v=asin(dir.y)/PI+0.5, including an identical constant pole row.
    const elevation = (row / (height - 1) - 0.5) * Math.PI;
    const y = Math.sin(elevation),
      radial = Math.cos(elevation);
    for (let column = 0; column < width; column++) {
      const azimuth = ((column + 0.5) / width - 0.5) * Math.PI * 2;
      sampleDirection(
        Math.cos(azimuth) * radial,
        y,
        Math.sin(azimuth) * radial,
        clouds,
        color,
      ).convertLinearToSRGB();
      pixels.set(
        [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255), 255],
        (row * width + column) * 4,
      );
    }
  }
  panoramaCache.set(key, pixels);
  if (panoramaCache.size > MAX_CACHED_PANORAMAS)
    panoramaCache.delete(panoramaCache.keys().next().value!);
  return pixels;
}

function skyTexture(width: number, height: number, clouds: boolean) {
  const texture = new THREE.DataTexture(
    createDaylightPixels(width, height, clouds),
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  try {
    texture.name = `indumoveis-world-daylight-${clouds ? "clouds" : "simple"}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    texture.dispose();
    throw error;
  }
}

/** Synchronous 64×32 gradient is available for the first useful frame. Request
 * rich only in the renderer's existing deferred-ready task; no sky RAF needed.
 * Preparation failure keeps the same blue gradient and world orientation. */
export function createDaylightSky(
  options: { fail?: boolean; detail?: "simple" | "rich" } = {},
): DaylightSky {
  let detail = options.detail ?? "rich";
  let fallback = false;
  let texture: THREE.DataTexture;
  try {
    if (options.fail) throw new Error("Laboratory daylight sky failure");
    const size = detail === "rich" ? DAYLIGHT.panorama : DAYLIGHT.simplePanorama;
    texture = skyTexture(size.width, size.height, detail === "rich");
  } catch {
    detail = "simple";
    fallback = true;
    texture = skyTexture(DAYLIGHT.simplePanorama.width, DAYLIGHT.simplePanorama.height, false);
  }
  let disposed = false;
  return {
    texture,
    textureBytes: texture.image.width * texture.image.height * 4,
    fallback,
    detail,
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
    },
  };
}

/** Direct panorama background avoids Three's automatic equirectangular→cube
 * allocation. One unit box supplies world ray directions; the shader removes
 * view translation and pins depth to the far clip, so it needs no camera-follow
 * transform, scale, far-plane change or per-frame update. Never add it to the
 * protected commercial group or use it to calculate commercial bounds. */
export function createDaylightBackground(texture: THREE.Texture) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  let material: THREE.ShaderMaterial | undefined;
  try {
    const panorama = { value: texture as THREE.Texture | null };
    material = new THREE.ShaderMaterial({
      name: "indumoveis-world-daylight-background",
      uniforms: { panorama },
      side: THREE.BackSide,
      // Draw after opaque floors: the depth test rejects hidden sky fragments
      // before sampling the panorama, avoiding a second full-screen shading
      // pass in the common overview/top views.
      depthTest: true,
      depthWrite: false,
      fog: false,
      toneMapped: true,
      vertexShader: `
        varying vec3 vWorldDirection;
        void main() {
          vWorldDirection = position;
          vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = clip.xyww;
        }
      `,
      fragmentShader: `
        uniform sampler2D panorama;
        varying vec3 vWorldDirection;
        void main() {
          vec3 direction = normalize(vWorldDirection);
          vec2 uv = vec2(
            atan(direction.z, direction.x) * 0.15915494309189535 + 0.5,
            asin(clamp(direction.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5
          );
          gl_FragColor = vec4(texture2D(panorama, uv).rgb, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "indumoveis-world-daylight-background";
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.userData.commercialPickable = false;
    mesh.raycast = () => {};
    let disposed = false;
    return {
      mesh,
      setTexture(next: THREE.Texture) {
        if (!disposed) panorama.value = next;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        mesh.removeFromParent();
        panorama.value = null;
        geometry.dispose();
        material!.dispose();
      },
    };
  } catch (error) {
    geometry.dispose();
    material?.dispose();
    throw error;
  }
}
