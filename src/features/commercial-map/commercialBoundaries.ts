import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { MapEntity } from "./data/territory";
import { commercialBoundaries, LOT_GRAPHICS } from "./commercialPresentation";

/** Graphic cadastral ink, not physical walls/curbs. Two static batched draws,
 * plus reused interaction buffers. A single fragment owns core, tonal
 * separation and edge coverage: no coplanar core/halo or MSAA coverage dither. */
export function createCommercialBoundaries(entities: readonly MapEntity[]) {
  const group = new THREE.Group();
  group.name = "commercial-cadastral-ink";
  const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
  const boundaries = commercialBoundaries(entities);
  function line(
    positions: number[] | Float32Array,
    color: string,
    pixels: number,
    order: number,
    separator = 0,
  ) {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color,
      // One CSS pixel outside each visible edge contains the complete alpha
      // feather. The core stays opaque even with a sub-1 effective canvas DPR.
      linewidth: pixels + separator + 2,
      worldUnits: false,
      alphaToCoverage: false,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    material.uniforms.cadastralCore = { value: pixels / material.linewidth };
    material.uniforms.cadastralEdge = { value: (pixels + separator) / material.linewidth };
    material.uniforms.cadastralSeparation = {
      value: new THREE.Color(separator ? LOT_GRAPHICS.separation : color),
    };
    material.fragmentShader =
      `uniform float cadastralCore;\nuniform float cadastralEdge;\nuniform vec3 cadastralSeparation;\n${material.fragmentShader}`.replace(
        "gl_FragColor = vec4( diffuseColor.rgb, alpha );",
        `// Continuous coverage of the full rounded segment, including its sides.
         // MSAA alpha-to-coverage quantised the old thin core into visible dots
         // when the light profile rendered below one device pixel per CSS px.
         float cap = max(abs(vUv.y) - 1.0, 0.0);
         float inkDistance = length(vec2(vUv.x, cap));
         float feather = max(fwidth(inkDistance) * 0.55, 0.001);
         float core = 1.0 - smoothstep(cadastralCore - feather, cadastralCore + feather, inkDistance);
         float coverage = 1.0 - smoothstep(cadastralEdge - feather, cadastralEdge + feather, inkDistance);
         gl_FragColor = vec4(mix(cadastralSeparation, diffuseColor.rgb, core), opacity * coverage);`,
      );
    resources.push(geometry, material);
    const mesh = new LineSegments2(geometry, material);
    mesh.raycast = () => {};
    mesh.renderOrder = order;
    group.add(mesh);
    return mesh;
  }
  for (const perimeter of [false, true]) {
    const positions = boundaries
      .filter((edge) => (edge.owners.length === 1) === perimeter)
      .flatMap(({ a, b }) => [a[0], 0.095, a[1], b[0], 0.095, b[1]]);
    if (!positions.length) continue;
    const width = perimeter ? LOT_GRAPHICS.perimeterPixels : LOT_GRAPHICS.divisionPixels;
    line(
      positions,
      perimeter ? LOT_GRAPHICS.perimeter : LOT_GRAPHICS.division,
      width,
      2,
      LOT_GRAPHICS.separationPixels,
    );
  }
  const maxEdges = Math.max(...entities.map((entity) => entity.polygon.length));
  const selected = line(new Float32Array(maxEdges * 6), LOT_GRAPHICS.selected, 3.2, 6);
  const hover = line(new Float32Array(maxEdges * 6), LOT_GRAPHICS.hover, 2.25, 5);
  selected.visible = hover.visible = false;
  selected.frustumCulled = hover.frustumCulled = false;
  let selectedId: string | null = null,
    hoveredId: string | null = null;
  let hoveredEntity: MapEntity | undefined,
    hoverElevation = 0.15;
  function write(mesh: LineSegments2, entity: MapEntity | undefined, elevation: number) {
    mesh.visible = !!entity;
    if (!entity) return;
    const start = mesh.geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
    const end = mesh.geometry.getAttribute("instanceEnd") as THREE.InterleavedBufferAttribute;
    entity.polygon.forEach((a, i) => {
      const b = entity.polygon[(i + 1) % entity.polygon.length];
      start.setXYZ(i, a[0], elevation, a[1]);
      end.setXYZ(i, b[0], elevation, b[1]);
    });
    start.data.needsUpdate = true;
    mesh.geometry.instanceCount = entity.polygon.length;
  }
  return {
    group,
    resources,
    boundaries,
    select(entity: MapEntity | undefined, elevation: number) {
      selectedId = entity?.id ?? null;
      write(selected, entity, elevation);
      write(hover, hoveredId === selectedId ? undefined : hoveredEntity, hoverElevation);
    },
    hover(entity: MapEntity | undefined, elevation = 0.15) {
      const id = entity?.id ?? null;
      if (id === hoveredId) return false;
      hoveredId = id;
      hoveredEntity = entity;
      hoverElevation = elevation;
      write(hover, id === selectedId ? undefined : entity, elevation);
      return true;
    },
  };
}
