import { Color } from "three";
import { PARK_SURFACE_COLORS } from "./visualTheme";

const grassBase = new Color(PARK_SURFACE_COLORS.grass);
function grassMultiplier(hex: string) {
  const color = new Color(hex);
  return `vec3(${(color.r / grassBase.r).toFixed(4)}, ${(color.g / grassBase.g).toFixed(4)}, ${(color.b / grassBase.b).toFixed(4)})`;
}

/** The same linear-light field is evaluated across terrain, lots and verges.
 * The two smooth, non-periodic scales stay visible after the microtexture mips out. */
export const GROUND_VARIATION_GLSL = `
  float parkGroundHash(vec2 p) {
    vec3 q=fract(vec3(p.xyx)*.1031);
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
  }
  float parkGroundNoise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(parkGroundHash(i),parkGroundHash(i+vec2(1.,0.)),f.x),
      mix(parkGroundHash(i+vec2(0.,1.)),parkGroundHash(i+vec2(1.,1.)),f.x),f.y);
  }
  vec3 parkGrassVariation(vec2 p) {
    float broad = parkGroundNoise(p / 37.0 + vec2(13.2, -7.4));
    float middle = parkGroundNoise(p / 7.7 + vec2(broad * 1.6, 5.3));
    float exposed = broad * .76 + middle * .24;
    vec3 living = mix(${grassMultiplier(PARK_SURFACE_COLORS.grassCool)},
      ${grassMultiplier(PARK_SURFACE_COLORS.grassOpen)}, smoothstep(.16, .79, exposed));
    return mix(living, ${grassMultiplier(PARK_SURFACE_COLORS.grassDry)},
      smoothstep(.56, .88, broad + (middle - .5) * .21) * .48) * (.97 + middle * .06);
  }
`;

type ShaderSource = { vertexShader: string; fragmentShader: string };

/** World position is needed even when the current material omits shadow/IBL
 * defines that would otherwise enable Three's worldpos chunk. */
export function patchGroundCoordinates(shader: ShaderSource) {
  shader.vertexShader = `varying vec2 parkSurfaceWorld;\n${shader.vertexShader}`.replace(
    "#include <worldpos_vertex>",
    "#include <worldpos_vertex>\nparkSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xz;",
  );
  shader.fragmentShader = `varying vec2 parkSurfaceWorld;\n${GROUND_VARIATION_GLSL}\n${shader.fragmentShader}`;
}

export function patchGroundVariation(shader: ShaderSource, family: string) {
  if (!["grass", "asphalt", "concrete"].includes(family)) return;
  patchGroundCoordinates(shader);
  const tint =
    family === "grass"
      ? "diffuseColor.rgb *= parkGrassVariation(parkSurfaceWorld);"
      : family === "asphalt"
        ? "diffuseColor.rgb *= .89 + .22 * parkGroundNoise(parkSurfaceWorld / 9.6);"
        : `float mineralWear = parkGroundNoise(parkSurfaceWorld / 6.3);
           diffuseColor.rgb *= mix(vec3(.94, .95, .96), vec3(1.055, 1.05, 1.035), mineralWear);`;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <color_fragment>",
    `#include <color_fragment>\n${tint}`,
  );
}
