import * as THREE from "three";
import panoramaUrl from "./assets/daylight.png?url";
import daylightPalette from "./daylightPalette.json";
import { PARK_DAYLIGHT } from "./visualTheme";

/** One world direction for sky, filtered reflections, direct light and shadows. */
export const DAYLIGHT = {
  ...daylightPalette,
  ...PARK_DAYLIGHT,
  panorama: { width: 1024, height: 512 },
  simplePanorama: { width: 64, height: 32 },
  environment: { width: 512, height: 256 },
} as const;

export type DaylightSky = {
  texture: THREE.Texture;
  /** Estimated RGBA8 texture storage, excluding driver overhead. */
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
  sun: new THREE.Color(DAYLIGHT.sunlight.color),
};
const horizonY = Math.sin(DAYLIGHT.horizonBandRadians);

/** Both the baked panorama and the immediate fallback use this gradient. The
 * horizon matches the terrain's atmosphere color before output transforms. */
function sampleGradient(x: number, y: number, z: number, target: THREE.Color) {
  target.copy(colors.horizon);
  if (Math.abs(y) <= horizonY) return target;
  if (y < -horizonY) {
    target.lerp(colors.ground, THREE.MathUtils.smoothstep(-y, horizonY, 0.42));
    target.lerp(colors.nadir, THREE.MathUtils.smoothstep(-y, 0.42, 1));
    return target;
  }
  const midY = DAYLIGHT.skyMidY;
  target.lerp(colors.mid, THREE.MathUtils.smoothstep(y, horizonY, midY));
  target.lerp(colors.zenith, THREE.MathUtils.smoothstep(y, midY, 1));
  const [sx, sy, sz] = DAYLIGHT.sunDirection;
  const sunDot = Math.max(0, x * sx + y * sy + z * sz);
  const { amount, exponent } = DAYLIGHT.solarGlow;
  const clearHorizon = THREE.MathUtils.smoothstep(y, horizonY, horizonY + 0.025);
  return target.lerp(colors.sun, sunDot ** exponent * amount * clearHorizon);
}

/** Returns sRGB byte channels for the immediate world-direction gradient. */
export function sampleDaylightDirection(
  direction: readonly [number, number, number],
): [number, number, number] {
  const length = Math.hypot(...direction);
  if (!length || !direction.every(Number.isFinite)) throw new Error("daylight-invalid-direction");
  const color = sampleGradient(
    direction[0] / length,
    direction[1] / length,
    direction[2] / length,
    new THREE.Color(),
  ).convertLinearToSRGB();
  return [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];
}

// Only the immediate and fallback reflection gradients are created at runtime.
// Reopenings share CPU bytes but always own separate GPU texture objects.
const gradientCache = new Map<string, Uint8Array>();

export function createDaylightPixels(width: number, height: number): Uint8Array {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > DAYLIGHT.panorama.width ||
    height > DAYLIGHT.panorama.height
  )
    throw new Error("daylight-invalid-panorama-size");
  const key = `${width}x${height}`;
  const cached = gradientCache.get(key);
  if (cached) return cached;
  const pixels = new Uint8Array(width * height * 4);
  const color = new THREE.Color();
  const longitudes = Array.from({ length: width }, (_, column) => {
    const azimuth = ((column + 0.5) / width - 0.5) * Math.PI * 2;
    return [Math.cos(azimuth), Math.sin(azimuth)];
  });
  for (let row = 0, offset = 0; row < height; row++) {
    // Match Three's equirectUv at texel centers, with constant pole rows.
    const elevation =
      row === 0
        ? -Math.PI / 2
        : row === height - 1
          ? Math.PI / 2
          : ((row + 0.5) / height - 0.5) * Math.PI;
    const y = Math.sin(elevation),
      radial = Math.cos(elevation);
    for (const [x, z] of longitudes) {
      sampleGradient(x * radial, y, z * radial, color).convertLinearToSRGB();
      pixels[offset++] = Math.round(color.r * 255);
      pixels[offset++] = Math.round(color.g * 255);
      pixels[offset++] = Math.round(color.b * 255);
      pixels[offset++] = 255;
    }
  }
  if (gradientCache.size >= 4) gradientCache.delete(gradientCache.keys().next().value!);
  gradientCache.set(key, pixels);
  return pixels;
}

function configurePanorama<T extends THREE.Texture>(texture: T, name: string): T {
  try {
    texture.name = name;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    // Offline image and CPU gradient have the same south-first row order.
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    texture.dispose();
    throw error;
  }
}

function gradientTexture(width: number, height: number, name: string) {
  return configurePanorama(
    new THREE.DataTexture(createDaylightPixels(width, height), width, height),
    name,
  );
}

function ownSky(
  texture: THREE.Texture,
  detail: DaylightSky["detail"],
  fallback: boolean,
): DaylightSky {
  const { width, height } = detail === "rich" ? DAYLIGHT.panorama : DAYLIGHT.simplePanorama;
  let disposed = false;
  return {
    texture,
    textureBytes: width * height * 4,
    fallback,
    detail,
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
    },
  };
}

function createClearSky(fallback: boolean) {
  const { width, height } = DAYLIGHT.simplePanorama;
  return ownSky(
    gradientTexture(width, height, "indumoveis-world-daylight-simple"),
    "simple",
    fallback,
  );
}

/** Immediate clear gradient. Loading and decoding clouds is deferred. */
export function createDaylightSky() {
  return createClearSky(false);
}

// Decoded image and downsampled reflection source are immutable after creation.
// Never share the GPU textures across renderers or retain an in-flight request.
let decodedPanorama: HTMLImageElement | undefined;
let reflectionPixels: Uint8Array | undefined;

async function loadPanorama(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (decodedPanorama) return decodedPanorama;
  const response = await fetch(panoramaUrl, { signal });
  if (!response.ok) throw new Error("daylight-panorama-unavailable");
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    if (
      image.naturalWidth !== DAYLIGHT.panorama.width ||
      image.naturalHeight !== DAYLIGHT.panorama.height
    )
      throw new Error("daylight-panorama-size");
    return (decodedPanorama ??= image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareDaylightSky(options: { fail?: boolean; signal?: AbortSignal } = {}) {
  try {
    if (options.fail) throw new Error("Laboratory daylight sky failure");
    const image = await loadPanorama(options.signal);
    return ownSky(
      configurePanorama(new THREE.Texture(image), "indumoveis-world-daylight-clouds"),
      "rich",
      false,
    );
  } catch {
    options.signal?.throwIfAborted();
    return createClearSky(true);
  }
}

/** Downsample the same visible sky once for the PMREM input. A failed rich sky
 * uses the same clear gradient as the visible fallback, with its own texture. */
export function createDaylightReflectionSource(sky?: DaylightSky) {
  const { width, height } = DAYLIGHT.environment;
  const name = "indumoveis-soft-daylight-source";
  if (sky?.detail === "rich" && decodedPanorama) {
    if (!reflectionPixels) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.imageSmoothingQuality = "high";
        context.drawImage(decodedPanorama, 0, 0, width, height);
        reflectionPixels = new Uint8Array(context.getImageData(0, 0, width, height).data.buffer);
      }
    }
    if (reflectionPixels)
      return configurePanorama(new THREE.DataTexture(reflectionPixels, width, height), name);
  }
  return gradientTexture(width, height, name);
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
    const previousPanorama = { value: texture as THREE.Texture | null };
    const panoramaBlend = { value: 1 };
    const blendDurationMs = 180;
    let blendStart: number | undefined;
    let blendAwaitingFrame = false;
    material = new THREE.ShaderMaterial({
      name: "indumoveis-world-daylight-background",
      uniforms: { panorama, previousPanorama, panoramaBlend },
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
        uniform sampler2D previousPanorama;
        uniform float panoramaBlend;
        varying vec3 vWorldDirection;
        void main() {
          vec3 direction = normalize(vWorldDirection);
          vec2 uv = vec2(
            atan(direction.z, direction.x) * 0.15915494309189535 + 0.5,
            asin(clamp(direction.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5
          );
          vec3 sky = texture2D(panorama, uv).rgb;
          if (panoramaBlend < 1.0) {
            sky = mix(texture2D(previousPanorama, uv).rgb, sky, panoramaBlend);
          }
          gl_FragColor = vec4(sky, 1.0);
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
      setTexture(next: THREE.Texture, blend?: { from: THREE.Texture; start: number }) {
        if (disposed) return;
        panorama.value = next;
        previousPanorama.value = blend?.from ?? next;
        blendStart = blend?.start;
        blendAwaitingFrame = blend !== undefined;
        panoramaBlend.value = blend ? 0 : 1;
      },
      update(now: number) {
        if (blendStart === undefined || disposed) return false;
        // Deferred PMREM preparation can occupy the time between publication
        // and the next draw. Start the transition on a frame the user sees.
        if (blendAwaitingFrame) {
          blendStart = Math.max(blendStart, now);
          blendAwaitingFrame = false;
        }
        panoramaBlend.value = THREE.MathUtils.smoothstep(now - blendStart, 0, blendDurationMs);
        if (panoramaBlend.value < 1) return true;
        blendStart = undefined;
        previousPanorama.value = panorama.value;
        return false;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        mesh.removeFromParent();
        panorama.value = null;
        previousPanorama.value = null;
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
