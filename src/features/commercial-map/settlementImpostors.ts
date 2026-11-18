import * as THREE from "three";
import type { LandscapeUniforms } from "./regionalLandscape";

// One projected, geolocated image per measured roof or canopy group. A single instanced
// draw positions each card on the DEM. Outside the low orbit, the aerial takes over.
export function createSettlementImpostors(samples: Float32Array, uniforms: LandscapeUniforms) {
  if (!samples.length || samples.length % 9 || !samples.every(Number.isFinite))
    throw new Error("invalid-settlement-positions");
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geometry.setIndex(quad.index);
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.setAttribute("uv", quad.getAttribute("uv"));
  const cards = new THREE.InstancedInterleavedBuffer(samples, 9);
  geometry.setAttribute("site", new THREE.InterleavedBufferAttribute(cards, 2, 0));
  geometry.setAttribute("dimensions", new THREE.InterleavedBufferAttribute(cards, 3, 2));
  geometry.setAttribute("rect", new THREE.InterleavedBufferAttribute(cards, 4, 5));
  geometry.instanceCount = samples.length / 9;
  const material = new THREE.ShaderMaterial({
    name: "santa-rosa-neighbourhood-impostors",
    uniforms,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    vertexShader: `
      uniform vec2 landscapeEast;
      uniform vec2 landscapeNorth;
      uniform vec2 landscapeOrigin;
      uniform float landscapeScale;
      attribute vec2 site;
      attribute vec3 dimensions;
      attribute vec4 rect;
      varying vec2 spriteUV;
      varying float visibility;
      varying float haze;
      void main() {
        vec2 tangent = normalize(vec2(site.y, -site.x));
        vec2 metres = site + tangent * (uv.x - .5) * dimensions.x;
        vec2 world = landscapeOrigin + landscapeScale * (landscapeEast * metres.x + landscapeNorth * metres.y);
        vec3 positionWorld = vec3(world.x, -.18 + landscapeScale * (dimensions.z + uv.y * dimensions.y), world.y);
        vec3 eye = cameraPosition - positionWorld;
        visibility = 1. - smoothstep(.44, .78, eye.y / max(1., length(eye)));
        haze = .018 + .065 * smoothstep(350., 1500., length(eye) / landscapeScale);
        spriteUV = rect.xy + uv * rect.zw;
        gl_Position = projectionMatrix * viewMatrix * vec4(positionWorld, 1.);
      }
    `,
    fragmentShader: `
      uniform sampler2D landscapeSettlement;
      uniform vec3 landscapeLight;
      uniform vec3 landscapeAir;
      varying vec2 spriteUV;
      varying float visibility;
      varying float haze;
      void main() {
        vec4 sampleColour = texture2D(landscapeSettlement, spriteUV);
        float coverage = smoothstep(.06, .65, sampleColour.a) * visibility;
        if (coverage < .1) discard;
        // Compress the brightest photographed walls into the range of the light roofs
        // in the park, preserving the local window rhythm after the shared tone mapper.
        float value = dot(sampleColour.rgb,vec3(.2126,.7152,.0722));
        float shoulder = 1. - .30*smoothstep(.27,.85,value);
        vec3 colour = sampleColour.rgb * shoulder * mix(vec3(1.), landscapeLight, .62);
        gl_FragColor = vec4(mix(colour, landscapeAir, haze), coverage);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "santa-rosa-registered-roofs-and-canopies";
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.userData.commercialPickable = false;
  return mesh;
}
