import * as THREE from "three";
import type { MapLightingMode } from "./types";
import daylightPalette from "./daylightPalette.json";
import { PARK_DAYLIGHT } from "./visualTheme";

const profiles = {
  natural: {
    ...PARK_DAYLIGHT,
    revision: 2,
    skyRadiance: [1, 1, 1],
  },
  warm: {
    sunlight: { color: "#ffd09b", intensity: 3.36 },
    hemisphere: { sky: "#c9dfff", ground: "#a7a193", intensity: 0.99 },
    fill: { color: "#d9e7ff", intensity: 0.26 },
    exposure: 1.03,
    // Linear incident radiance. The atmosphere, panorama and prefiltered
    // reflections all sample this same illuminant before tone mapping.
    skyRadiance: [1.23, 0.94, 0.8],
    revision: 1,
  },
} as const;

function resolveProfile(mode: MapLightingMode) {
  const profile = profiles[mode];
  return {
    key: `${mode}@${profile.revision}`,
    sun: new THREE.Color(profile.sunlight.color),
    sky: new THREE.Color(profile.hemisphere.sky),
    ground: new THREE.Color(profile.hemisphere.ground),
    fill: new THREE.Color(profile.fill.color),
    radiance: new THREE.Color().fromArray(profile.skyRadiance),
  };
}

const natural = resolveProfile("natural");
const warm = resolveProfile("warm");
export const NATURAL_LIGHT_KEY = natural.key;
const baseHorizon = new THREE.Color(daylightPalette.sky.horizon);

export function createMapLighting(initial: MapLightingMode) {
  const hemisphere = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  const fill = new THREE.DirectionalLight();
  const skyRadiance = new THREE.Color();
  const horizon = new THREE.Color();
  sun.position.set(...PARK_DAYLIGHT.sunDirection).multiplyScalar(180);
  fill.position.set(...PARK_DAYLIGHT.fill.position);
  let mode = initial;
  let mix = initial === "warm" ? 1 : 0;
  let from = mix;
  let start = 0;
  let exposure = 1;

  function apply(t: number) {
    mix = t;
    sun.color.lerpColors(natural.sun, warm.sun, t);
    hemisphere.color.lerpColors(natural.sky, warm.sky, t);
    hemisphere.groundColor.lerpColors(natural.ground, warm.ground, t);
    fill.color.lerpColors(natural.fill, warm.fill, t);
    skyRadiance.lerpColors(natural.radiance, warm.radiance, t);
    horizon.copy(baseHorizon).multiply(skyRadiance);
    const a = profiles.natural;
    const b = profiles.warm;
    sun.intensity = THREE.MathUtils.lerp(a.sunlight.intensity, b.sunlight.intensity, t);
    hemisphere.intensity = THREE.MathUtils.lerp(a.hemisphere.intensity, b.hemisphere.intensity, t);
    fill.intensity = THREE.MathUtils.lerp(a.fill.intensity, b.fill.intensity, t);
    exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, t);
  }

  apply(mix);
  return {
    sun,
    hemisphere,
    fill,
    skyRadiance,
    horizon,
    get exposure() {
      return exposure;
    },
    get mix() {
      return mix;
    },
    get mode() {
      return mode;
    },
    get profileKey() {
      return mode === "warm" ? warm.key : natural.key;
    },
    get transitioning() {
      return mix !== (mode === "warm" ? 1 : 0);
    },
    select(next: MapLightingMode, now: number) {
      if (mode === next) return;
      // Reversing a fade starts from the last frame actually presented.
      mode = next;
      from = mix;
      start = now;
    },
    update(now: number, reducedMotion: boolean) {
      const target = mode === "warm" ? 1 : 0;
      if (mix === target) return false;
      const t = reducedMotion ? 1 : THREE.MathUtils.smoothstep(now - start, 0, 180);
      apply(THREE.MathUtils.lerp(from, target, t));
      return true;
    },
  };
}
