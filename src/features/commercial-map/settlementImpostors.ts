import * as THREE from "three";
import { regionalAlbedo } from "./regionalAlbedo";
import type { LandscapeUniforms } from "./regionalLandscape";

// Some static hosts declare the file's gzip encoding. Fetch has already
// inflated those responses. Other hosts deliver the encoded octets verbatim.
export async function decodeSettlement(encoded: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(encoded);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return encoded;
  if (typeof DecompressionStream === "function") {
    const decoded = new Blob([encoded]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(decoded).arrayBuffer();
  }
  const { gunzipSync } = await import("three/examples/jsm/libs/fflate.module.js");
  return Uint8Array.from(gunzipSync(bytes)).buffer;
}

// Both texture tiers share this static mesh. It uses eighth-metre geographic
// coordinates, sRGB roof/canopy samples and a local photographic material ID.
export function createSettlementMesh(buffer: ArrayBuffer, uniforms: LandscapeUniforms) {
  const header = new DataView(buffer);
  if (buffer.byteLength < 20 || header.getUint32(0) !== 0x53524d31)
    throw new Error("invalid-settlement-header");
  const roofs = header.getUint32(4, true);
  const stands = header.getUint32(8, true);
  const vertices = header.getUint32(12, true);
  const elements = header.getUint32(16, true);
  if (
    !vertices ||
    !elements ||
    elements % 3 ||
    buffer.byteLength !== 20 + vertices * 10 + elements * 4
  )
    throw new Error("invalid-settlement-length");

  const deltas = new Int16Array(buffer, 20, vertices * 3);
  const position = new Int16Array(vertices * 3);
  for (let axis = 0; axis < 3; axis++) {
    let coordinate = 0;
    for (let i = 0; i < vertices; i++) {
      coordinate += deltas[axis * vertices + i];
      position[i * 3 + axis] = coordinate;
    }
  }
  const appearance = new Uint8Array(buffer, 20 + vertices * 6, vertices * 4);
  // The preceding two sections have a combined stride of ten bytes. An odd
  // vertex count can place index data halfway through a uint32.
  const encoded = new DataView(buffer, 20 + vertices * 10);
  const indices = new Uint32Array(elements);
  let index = 0;
  for (let i = 0; i < elements; i++) {
    index = (index + encoded.getUint32(i * 4, true)) >>> 0;
    if (index >= vertices) throw new Error("invalid-settlement-index");
    indices[i] = index;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("appearance", new THREE.BufferAttribute(appearance, 4, true));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = new THREE.ShaderMaterial({
    name: "santa-rosa-neighbourhood-volumes",
    uniforms,
    vertexShader: `
      uniform vec2 landscapeEast;
      uniform vec2 landscapeNorth;
      uniform vec2 landscapeOrigin;
      uniform float landscapeScale;
      attribute vec4 appearance;
      varying vec3 geographic;
      varying vec3 tint;
      varying float tile;
      varying float eyeMetres;
      #include <common>
      void main() {
        geographic = position * .125;
        vec2 world = landscapeOrigin + landscapeScale * (landscapeEast * geographic.x + landscapeNorth * geographic.y);
        vec3 positionWorld = vec3(world.x, -.18 + landscapeScale * geographic.z, world.y);
        eyeMetres = length(cameraPosition - positionWorld) / landscapeScale;
        // Convert the sampled optical colours from sRGB once per vertex.
        tint = mix(pow(appearance.rgb * .9478673 + .0521327, vec3(2.4)), appearance.rgb / 12.92,
                   lessThanEqual(appearance.rgb, vec3(.04045)));
        tile = appearance.a * 255.;
        gl_Position = projectionMatrix * viewMatrix * vec4(positionWorld, 1.);
      }`,
    fragmentShader: `
      ${regionalAlbedo}
      uniform sampler2D landscapeSettlement;
      uniform vec3 landscapeLight;
      uniform vec3 landscapeAir;
      varying vec3 geographic;
      varying vec3 tint;
      varying float tile;
      varying float eyeMetres;
      vec3 localMaterial(vec2 repeatUV) {
        // Mirror repeats inside each padded photographic tile. Gradients of the
        // unwrapped coordinates keep the mip stable at the mirror boundaries.
        float materialId = floor(tile + .5);
        vec2 cell = vec2(mod(materialId, 2.), 3. - floor(materialId * .5));
        vec2 scale = vec2(.5,.25);
        vec2 mirrored = 1. - abs(mod(repeatUV, 2.) - 1.);
        vec2 uv = (cell + .0625 + mirrored * .875) * scale;
        return textureGrad(landscapeSettlement, uv, dFdx(repeatUV) * .875 * scale, dFdy(repeatUV) * .875 * scale).rgb;
      }
      void main() {
        vec3 normal = normalize(cross(dFdx(geographic), dFdy(geographic)));
        vec3 colour;
        if (tile > 5.5) {
          colour = tint * .78;
        } else if (tile > 4.5) {
          float leaf = localMaterial((geographic.xy + geographic.z * vec2(.4,.7)) / 5.).g;
          float light = .91 + .13 * dot(normal, normalize(vec3(-.82,.57,1.4)));
          colour = tint * light * (1. + (leaf - .43) * .55 * (1. - smoothstep(180.,800.,eyeMetres)));
        } else if (normal.z < .45) {
          vec2 along = normalize(vec2(-normal.y, normal.x));
          vec2 size = vec2(tile > 3.5 ? 14. : 10., tile < 1.5 ? 6. : 3.5);
          vec3 wall = localMaterial(vec2(dot(geographic.xy, along), geographic.z) / size);
          // Pale plaster receives indirect light below the eave. Compress its
          // bright end against the observed roof colour from this very footprint.
          float luminance = dot(wall, vec3(.2126,.7152,.0722));
          float light = .65 + .12 * dot(normal.xy, vec2(-.82,.57));
          colour = mix(wall, .75 * tint + .04, .34) * light / (1. + .40 * luminance);
        } else {
          vec3 photo = registeredAlbedo(geographic.xy);
          colour = mix(tint, photo, .35) * (.94 + .14 * dot(normal, normalize(vec3(-.82,.57,1.4))));
        }
        float haze = .018 + .065 * smoothstep(350., 1500., eyeMetres)
                          + .15 * smoothstep(1500., 4000., eyeMetres);
        colour *= mix(vec3(1.), landscapeLight, .62);
        gl_FragColor = vec4(mix(colour, landscapeAir, haze), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "santa-rosa-registered-roofs-and-canopies";
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.userData.commercialPickable = false;
  mesh.userData.featureCount = roofs + stands;
  return mesh;
}
