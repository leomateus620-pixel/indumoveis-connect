/** Shared world-space colour field. No new texture, grid tied to parcels or
 * camera-relative phase. The fine PBR atlas remains separately mip-filtered. */
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
    float broad=parkGroundNoise(p/27.0+vec2(13.2,-7.4));
    float middle=parkGroundNoise(p/6.7+vec2(broad*2.1,5.3));
    float dry=smoothstep(.43,.84,broad*.72+middle*.28);
    vec3 living=mix(vec3(.85,1.015,.80),vec3(1.055,1.005,.93),dry);
    return living*(.965+(middle-.5)*.105);
  }
`;

type ShaderSource = { vertexShader: string; fragmentShader: string };
export function patchGroundVariation(shader: ShaderSource, family: string) {
  if (!["grass", "asphalt", "concrete"].includes(family)) return;
  shader.vertexShader = `varying vec2 parkSurfaceWorld;\n${shader.vertexShader}`.replace(
    "#include <worldpos_vertex>",
    "#include <worldpos_vertex>\nparkSurfaceWorld=(modelMatrix*vec4(transformed,1.0)).xz;",
  );
  shader.fragmentShader = `varying vec2 parkSurfaceWorld;\n${GROUND_VARIATION_GLSL}\n${shader.fragmentShader}`;
  const tint =
    family === "grass"
      ? "diffuseColor.rgb*=parkGrassVariation(parkSurfaceWorld);"
      : `diffuseColor.rgb*=1.0+(parkGroundNoise(parkSurfaceWorld/${family === "asphalt" ? "10.3" : "7.9"})-.5)*${family === "asphalt" ? ".105" : ".065"};`;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <color_fragment>",
    `#include <color_fragment>\n${tint}`,
  );
}
