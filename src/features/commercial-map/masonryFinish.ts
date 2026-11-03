import type { MeshStandardMaterial } from "three";

/** Estimated brick coursing on P12's documented masonry only. Screen-space
 * filtering removes joints below a pixel instead of producing moire. Shared
 * mineral maps continue to provide relief; no additional texture is allocated. */
export function applyMasonryFinish(material: MeshStandardMaterial) {
  const compile = material.onBeforeCompile,
    cache = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = `varying vec2 masonryPlane;\n${shader.vertexShader}`.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvec3 masonryPosition=(modelMatrix*vec4(transformed,1.0)).xyz; masonryPlane=masonryPosition.xy;",
    );
    shader.fragmentShader = `varying vec2 masonryPlane;\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 brickGrid=masonryPlane/vec2(.24,.08);
      brickGrid.x+=mod(floor(brickGrid.y),2.0)*.5;
      vec2 brickWidth=max(fwidth(brickGrid),vec2(.001));
      vec2 brickEdge=min(fract(brickGrid),1.0-fract(brickGrid));
      vec2 mortar=1.0-smoothstep(vec2(.025)-brickWidth*.5,vec2(.025)+brickWidth*.5,brickEdge);
      float brickVisible=1.0-smoothstep(.25,.9,max(brickWidth.x,brickWidth.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.42,.41,.36),max(mortar.x,mortar.y)*brickVisible*.7);
    `,
    );
  };
  material.customProgramCacheKey = () => `${cache.call(material)}:mineral-masonry-v1`;
}
