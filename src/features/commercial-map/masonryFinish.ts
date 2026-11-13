import type { MeshStandardMaterial } from "three";

/** Filtered brick courses over the authored wall colour and mineral finish. */
export function applyMasonryFinish(material: MeshStandardMaterial, painted = false) {
  const compile = material.onBeforeCompile,
    cache = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = `varying vec3 masonryWorld;\n${shader.vertexShader}`.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nmasonryWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
    shader.fragmentShader = `varying vec3 masonryWorld;\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 wallNormal = abs(cross(dFdx(masonryWorld), dFdy(masonryWorld)));
      float courseX = wallNormal.z >= wallNormal.x ? masonryWorld.x : masonryWorld.z;
      vec2 brickGrid = vec2(courseX, masonryWorld.y) / vec2(.24,.08);
      // Derive the filter width before offsetting alternate courses.
      vec2 brickWidth = max(fwidth(brickGrid), vec2(.001));
      brickGrid.x += mod(floor(brickGrid.y), 2.0) * .5;
      vec2 brickEdge = min(fract(brickGrid), 1.0 - fract(brickGrid));
      vec2 mortar = 1.0 - smoothstep(vec2(.025) - brickWidth * .5,
        vec2(.025) + brickWidth * .5, brickEdge);
      float brickVisible = 1.0 - smoothstep(.20, .70, max(brickWidth.x, brickWidth.y));
      diffuseColor.rgb = mix(diffuseColor.rgb,
        ${painted ? "diffuseColor.rgb * .76" : "vec3(.29, .23, .18)"},
        max(mortar.x, mortar.y) * brickVisible * ${painted ? ".45" : ".30"});
    `,
    );
  };
  material.customProgramCacheKey = () => `${cache.call(material)}:mineral-masonry-v3:${painted}`;
}
