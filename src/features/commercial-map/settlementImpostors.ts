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
// coordinates. Appearance packs the material ID and vertical course in A;
// RGB carries optical colour, or UV and optical brightness for alpha-cut crowns.
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
      varying float course;
      varying float finishCode;
      varying vec2 crownUV;
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
        float packed = floor(appearance.a * 255. + .5);
        tile = mod(packed, 16.);
        course = floor(packed / 16.);
        crownUV = appearance.rg;
        // Optical imagery has a slight warm cast even on neutral roofs.
        finishCode = tile == 10. ? floor(appearance.b*255.+.5) : float(appearance.r > appearance.g * 1.083 &&
                           appearance.r > appearance.b * 1.21);
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
      varying float course;
      varying float finishCode;
      varying vec2 crownUV;
      varying float eyeMetres;
      vec4 materialTile(float id, vec2 uv, vec2 dx, vec2 dy) {
        vec2 cell = vec2(mod(id, 4.), 3. - floor(id * .25));
        return textureGrad(landscapeSettlement, (cell + .0625 + uv * .875) * .25,
                           dx * .21875, dy * .21875);
      }
      vec3 repeatMaterial(float id, vec2 uv) {
        // Mip selection uses the continuous physical coordinates across a repeat.
        vec2 wrapped = vec2(1. - abs(mod(uv.x,2.)-1.), fract(uv.y));
        return materialTile(id, wrapped, dFdx(uv), dFdy(uv)).rgb;
      }
      void main() {
        vec3 normal = normalize(cross(dFdx(geographic), dFdy(geographic)));
        vec3 sun = normalize(vec3(-.82,.57,1.4));
        vec3 colour;
        if (tile >= 11.5) {
          vec2 uv = crownUV;
          vec4 tuft = materialTile(tile, uv, dFdx(uv), dFdy(uv));
          if (tuft.a < .40) discard;
          // Measured optical brightness and illumination tie the authored crown
          // into the underlying stand while the alpha edge keeps its leaf gaps.
          float observed = tint.b;
          float leafLight = max(.015, dot(tuft.rgb, vec3(.2126,.7152,.0722)));
          float reference = tile < 12.5 ? .162 : (tile < 13.5 ? .094 : (tile < 14.5 ? .121 : .159));
          vec3 pigment = mix(vec3(.82,1.10,.82), tuft.rgb / leafLight, .19);
          colour = observed * pigment * clamp(sqrt(leafLight / reference), .62, 1.38)
                 * (.79 + .29 * max(0., dot(normal, sun)));
        } else if (tile > 10.5) {
          // Solid projecting slabs, the base, parapets and technical volumes
          // come from the eight measured Jutsu prototypes.
          colour = tint * (.75 + .29*max(0., dot(normal,sun)));
        } else if (tile > 9.5) {
          float family = mod(finishCode, 8.);
          float side = mod(floor(finishCode/8.), 4.);
          float span = floor(finishCode/32.);
          float quadrant = mod(family, 4.);
          vec2 cell = vec2(mod(quadrant, 2.), 1. - floor(quadrant*.5));
          vec2 source = crownUV * vec2(span,course);
          // Front, return and party wall are drawn differently. Both sides
          // use orthographic exports of the very same editable building.
          float uWidth = side < .5 ? .63 : (side < 1.5 ? .29 : .13);
          float uStart = side < .5 ? .018 : (side < 1.5 ? .69 : .76);
          vec2 local = vec2(uStart + uWidth*(1. - abs(mod(source.x,2.)-1.)), fract(source.y));
          vec2 uv = (cell + .0625 + .875*local)*.5;
          vec2 coverage = vec2(uWidth,1.)*.4375;
          colour = materialTile(4.+floor(family*.25),uv,dFdx(source)*coverage,dFdy(source)*coverage).rgb
                 * (.78 + .27*max(0.,dot(normal,sun)));
        } else if (tile > 8.5) {
          colour = tint * .72;
        } else if (tile > 7.5) {
          // Select an undistorted local plane on the steep sides of the stand.
          // Aerial projection there would stretch a leaf into a vertical stripe.
          vec3 axis = abs(normal);
          vec2 plane = axis.z > max(axis.x, axis.y) ? geographic.xy :
                       (axis.x > axis.y ? geographic.yz : geographic.xz);
          vec2 uv = plane / 9.;
          vec2 inside = .27 + .46 * (1. - abs(mod(uv, 2.) - 1.));
          vec3 foliage = materialTile(13., inside, dFdx(uv)*.46, dFdy(uv)*.46).rgb;
          float leafLight = dot(foliage, vec3(.2126,.7152,.0722));
          float textureLight = clamp(.62 + 3.35 * leafLight, .64, 1.32);
          float undergrowth = course / 15.;
          if (undergrowth < .46 && textureLight < (.98 - .48*undergrowth)) discard;
          colour = tint * vec3(.90,1.09,.84) * textureLight
                 * (.69 + .22 * max(0., dot(normal, sun)) + .10*undergrowth);
        } else if (normal.z < .46) {
          vec2 along = normalize(vec2(-normal.y, normal.x));
          float span = tile >= 5.5 ? 16. : (tile >= 3.5 ? 10.6 : 8.6);
          vec3 wall = repeatMaterial(tile, vec2(dot(geographic.xy, along)/span, course));
          colour = wall * (.78 + .24 * max(0., dot(normal, sun))) + tint * .034;
        } else {
          vec2 ridge = vec2(1.,0.);
          if (length(normal.xy) > .035) ridge = normalize(vec2(-normal.y, normal.x));
          vec2 uv = vec2(dot(geographic.xy, ridge), dot(geographic.xy, vec2(-ridge.y, ridge.x)));
          bool ceramic = finishCode > .5;
          float id = tile >= 5.5 ? 10. : (tile >= 3.5 && normal.z > .995 ? 11. :
                     (ceramic ? 8. : (normal.z > .995 ? 10. : 9.)));
          vec3 finish = repeatMaterial(id, uv / (id == 11. ? 9. : 3.2));
          vec3 optical = mix(tint, registeredAlbedo(geographic.xy), .22);
          colour = mix(optical, finish, id == 8. ? .58 : .53)
                 * (.76 + .32 * max(0., dot(normal, sun)));
        }
        float haze = .009 + .046 * smoothstep(350., 1500., eyeMetres)
                          + .11 * smoothstep(1500., 4200., eyeMetres);
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
