import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { ENTITIES, type Point } from "./data/territory";
import { polygonBounds, type Bounds } from "./geometry";
import type { SurfaceMaterials, SurfaceQuality } from "./surfaceMaterials";
import { appendHouseArchitecture } from "./urbanArchitecture";
import { subtractGround } from "./parkDetails";
import { URBAN_REFERENCE, REFERENCE_WAYS } from "./urbanReference";
import { deriveRoadRibbon, markRoadLanes } from "./roadGeometry";
import { deriveProtectedGround } from "./terrain";
import { DAYLIGHT } from "./daylight";
import { deriveUrbanContact } from "./urbanContact";
import {
  appendBoundaryTrees,
  appendResidentialLandscape,
  appendRoundaboutLandscape,
} from "./urbanLandscape";
import {
  URBAN_CONTEXT,
  deriveUrbanHouses,
  deriveUrbanRoads,
  deriveResidentialBuffer,
  type UrbanHouse,
} from "./urbanLayout";
export {
  URBAN_CONTEXT,
  urbanPolygonAllowed,
  deriveUrbanHouses,
  deriveUrbanRoads,
  deriveResidentialBuffer,
} from "./urbanLayout";
export type { UrbanHouse } from "./urbanLayout";

const AVENUE = ENTITIES.find((e) => e.id === "indumoveis:road:benvenuto")!;
const AVENUE_BOUNDS = polygonBounds(AVENUE.polygon);
const AVENUE_SOUTH = URBAN_REFERENCE.avenueSouth;
const ROUNDABOUT = URBAN_REFERENCE.roundabout.center;
const PROTECTED_GROUND = deriveProtectedGround(ENTITIES);

type Vertex = [number, number, number];
type Bucket = { position: number[]; color: number[]; uv: number[] };
type Category = "garden" | "walls" | "roof" | "detail" | "glass" | "foliage" | "ornament";
const rectangle = (x: number, z: number, width: number, depth: number): Point[] => [
  [x - width / 2, z - depth / 2],
  [x + width / 2, z - depth / 2],
  [x + width / 2, z + depth / 2],
  [x - width / 2, z + depth / 2],
];
const overlap = (a: Bounds, b: Bounds) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

const bucket = (): Bucket => ({ position: [], color: [], uv: [] });
function triangle(target: Bucket, a: Vertex, b: Vertex, c: Vertex, hex: string) {
  const color = new THREE.Color(hex);
  const abx = b[0] - a[0],
    aby = b[1] - a[1],
    abz = b[2] - a[2];
  const acx = c[0] - a[0],
    acy = c[1] - a[1],
    acz = c[2] - a[2];
  const nx = Math.abs(aby * acz - abz * acy),
    ny = Math.abs(abz * acx - abx * acz),
    nz = Math.abs(abx * acy - aby * acx);
  const dominant = ny >= Math.max(nx, nz) ? 1 : nx > nz ? 0 : 2;
  for (const p of [a, b, c]) {
    target.position.push(...p);
    target.color.push(color.r, color.g, color.b);
    // Local dominant-face world units prevent vertical wall UV collapse and
    // keep mineral/normal/roof maps at one scale on every modular house.
    target.uv.push(dominant === 0 ? p[2] : p[0], dominant === 1 ? p[2] : p[1]);
  }
}
function quad(target: Bucket, a: Vertex, b: Vertex, c: Vertex, d: Vertex, color: string) {
  triangle(target, a, b, c, color);
  triangle(target, a, c, d, color);
}
function floor(
  target: Bucket,
  polygon: readonly Point[],
  y: number,
  color: string,
  sharedAvenuePaint = false,
) {
  if (polygon.some(([, z]) => z < URBAN_CONTEXT.minimumZ)) return;
  let cells = [[...polygon]];
  // A corner of Brasilia meets the avenue's south edge. Cut that exact source
  // footprint out of the added band instead of dropping the entire widening.
  const blockers = sharedAvenuePaint
    ? ENTITIES.filter(
        (e) => !["indumoveis:road:benvenuto", "indumoveis:road:imigrantes"].includes(e.id),
      ).map((e) => e.polygon)
    : PROTECTED_GROUND;
  for (const polygon of blockers) {
    const bounds = polygonBounds(polygon);
    if (!cells.some((cell) => overlap(polygonBounds(cell), bounds))) continue;
    const triangles = THREE.ShapeUtils.triangulateShape(
      polygon.map(([x, z]) => new THREE.Vector2(x, z)),
      [],
    );
    for (const tri of triangles)
      cells = cells.flatMap((cell) =>
        overlap(polygonBounds(cell), bounds)
          ? subtractGround(
              cell,
              tri.map((i) => polygon[i]),
            )
          : [cell],
      );
  }
  for (const cell of cells) {
    const points = cell.map(([x, z]) => new THREE.Vector2(x, z));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(points, [])) {
      const p = [cell[a], cell[b], cell[c]];
      if ((p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) < 0)
        [p[1], p[2]] = [p[2], p[1]];
      triangle(target, [p[0][0], y, p[0][1]], [p[1][0], y, p[1][1]], [p[2][0], y, p[2][1]], color);
    }
  }
}
function box(
  target: Bucket,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
) {
  const x0 = x - w / 2,
    x1 = x + w / 2,
    z0 = z - d / 2,
    z1 = z + d / 2,
    y1 = y + h;
  quad(target, [x0, y, z0], [x0, y1, z0], [x1, y1, z0], [x1, y, z0], color);
  quad(target, [x1, y, z1], [x1, y1, z1], [x0, y1, z1], [x0, y, z1], color);
  quad(target, [x0, y, z1], [x0, y1, z1], [x0, y1, z0], [x0, y, z0], color);
  quad(target, [x1, y, z0], [x1, y1, z0], [x1, y1, z1], [x1, y, z1], color);
  quad(target, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color);
}
function road(target: Bucket, path: readonly Point[], width: number, color: string, y = -0.11) {
  const ribbon = deriveRoadRibbon(path, width);
  if (ribbon.length >= 3) floor(target, ribbon, y, color);
}

function houseGeometry(house: UrbanHouse, index: number, batches: Record<Category, Bucket>) {
  const local = Object.fromEntries(Object.keys(batches).map((key) => [key, bucket()])) as Record<
    Category,
    Bucket
  >;
  const { width: w, depth: d } = house;
  const b = polygonBounds(house.parcel);
  const parcelDepth = house.heading ? b.maxX - b.minX : b.maxY - b.minY;
  const localHouse = { ...house, center: [0, 0] as Point };
  const architectural = appendHouseArchitecture(localHouse, index, local);
  // Parcel dimensions and access depend on the real orientation of this home.
  // Front homes open onto Benvenuto; rear homes open onto a cross street.
  const localFloor = (target: Bucket, polygon: Point[], y: number, color: string, lawn = false) => {
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
      polygon.map(([x, z]) => new THREE.Vector2(x, z)),
      [],
    )) {
      const p = [polygon[a], polygon[b], polygon[c]];
      const emit = (a: Point, b: Point, c: Point) => {
        const offset = target.color.length;
        triangle(target, [a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], color);
        if (lawn)
          for (const [i, [x, z]] of [a, b, c].entries()) {
            const wx = house.center[0] + x * Math.cos(house.heading) - z * Math.sin(house.heading);
            const wz = house.center[1] + x * Math.sin(house.heading) + z * Math.cos(house.heading);
            const tone =
              1 +
              Math.sin(wx * 0.42 + Math.sin(wz * 0.2)) * 0.028 +
              Math.sin(wz * 0.58 - wx * 0.15) * 0.016;
            for (let channel = 0; channel < 3; channel++)
              target.color[offset + i * 3 + channel] *= tone;
          }
      };
      if (!lawn) emit(p[0], p[2], p[1]);
      else {
        const n = Math.min(
          8,
          Math.ceil(
            Math.max(
              ...p.map((v, i) => Math.hypot(v[0] - p[(i + 1) % 3][0], v[1] - p[(i + 1) % 3][1])),
            ) / 4,
          ),
        );
        const at = (i: number, j: number): Point => [
          p[0][0] + ((p[1][0] - p[0][0]) * i) / n + ((p[2][0] - p[0][0]) * j) / n,
          p[0][1] + ((p[1][1] - p[0][1]) * i) / n + ((p[2][1] - p[0][1]) * j) / n,
        ];
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n - i; j++) {
            emit(at(i, j), at(i, j + 1), at(i + 1, j));
            if (i + j < n - 1) emit(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
          }
      }
    }
  };
  localFloor(
    local.garden,
    house.parcel.map(([x, z]): Point => {
      const dx = x - house.center[0],
        dz = z - house.center[1];
      return [
        dx * Math.cos(house.heading) + dz * Math.sin(house.heading),
        -dx * Math.sin(house.heading) + dz * Math.cos(house.heading),
      ];
    }),
    URBAN_CONTEXT.groundY,
    URBAN_CONTEXT.palette.garden[index % 4],
    true,
  );
  const front = -d / 2;
  localFloor(
    local.garden,
    rectangle(w * 0.27, (front - house.frontageDistance) / 2, 1.6, house.frontageDistance + front),
    -0.095,
    "#a9aaa1",
  );
  localFloor(
    local.garden,
    rectangle(-w * 0.2, (front - house.frontageDistance) / 2, 0.6, house.frontageDistance + front),
    -0.09,
    "#b7b6a9",
  );
  const localParcel = house.parcel.map(([x, z]): Point => {
    const dx = x - house.center[0],
      dz = z - house.center[1];
    return [
      dx * Math.cos(house.heading) + dz * Math.sin(house.heading),
      -dx * Math.sin(house.heading) + dz * Math.cos(house.heading),
    ];
  });
  for (let i = 0; i < localParcel.length; i++) {
    const a = localParcel[i],
      b = localParcel[(i + 1) % localParcel.length];
    if (a[1] < -parcelDepth * 0.3 && b[1] < -parcelDepth * 0.3) continue; // open frontage
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz),
      nx = (-dz / len) * 0.05,
      nz = (dx / len) * 0.05;
    quad(
      local.detail,
      [a[0] + nx, -0.08, a[1] + nz],
      [a[0] + nx, 0.38, a[1] + nz],
      [b[0] + nx, 0.38, b[1] + nz],
      [b[0] + nx, -0.08, b[1] + nz],
      "#a9aaa0",
    );
    quad(
      local.detail,
      [b[0] - nx, -0.08, b[1] - nz],
      [b[0] - nx, 0.38, b[1] - nz],
      [a[0] - nx, 0.38, a[1] - nz],
      [a[0] - nx, -0.08, a[1] - nz],
      "#a9aaa0",
    );
  }
  const landscape = appendResidentialLandscape(
    {
      parcel: localParcel,
      width: w,
      depth: d,
      pool: house.pool,
      frontageDistance: house.frontageDistance,
    },
    index,
    { ground: local.garden, canopy: local.foliage, detail: local.ornament, water: local.glass },
  );
  const cos = Math.cos(house.heading),
    sin = Math.sin(house.heading),
    [cx, cz] = house.center;
  for (const key of Object.keys(batches) as Category[]) {
    const from = local[key];
    for (let i = 0; i < from.position.length; i += 9) {
      const vertices = [0, 3, 6].map((j): Vertex => {
        const x = from.position[i + j],
          y = from.position[i + j + 1],
          z = from.position[i + j + 2];
        return [cx + x * cos - z * sin, y, cz + x * sin + z * cos];
      });
      const ax = vertices[1][0] - vertices[0][0],
        ay = vertices[1][1] - vertices[0][1],
        az = vertices[1][2] - vertices[0][2];
      const bx = vertices[2][0] - vertices[0][0],
        by = vertices[2][1] - vertices[0][1],
        bz = vertices[2][2] - vertices[0][2];
      const n = [
        Math.abs(ay * bz - az * by),
        Math.abs(az * bx - ax * bz),
        Math.abs(ax * by - ay * bx),
      ];
      const dominant = n[1] >= Math.max(n[0], n[2]) ? 1 : n[0] > n[2] ? 0 : 2;
      for (const [j, v] of vertices.entries()) {
        batches[key].position.push(...v);
        batches[key].color.push(...from.color.slice(i + j * 3, i + j * 3 + 3));
        batches[key].uv.push(dominant === 0 ? v[2] : v[0], dominant === 1 ? v[2] : v[1]);
      }
    }
  }
  return { ...architectural, landscape };
}

/** Static spatial batches; no house becomes selectable or a dynamic shadow
 * caster. Essential facade edges/crowns persist; LOD trims only ornaments.
 * The source park never participates in this context's LOD. */
export function createUrbanContext(
  options: { quality?: SurfaceQuality; sharedSurfaces?: SurfaceMaterials } = {},
) {
  const group = new THREE.Group();
  group.name = "indumoveis-approximate-residential-context";
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  const physicalClones: {
    source: THREE.MeshStandardMaterial;
    clone: THREE.MeshStandardMaterial;
  }[] = [];
  try {
    const material = (name: string) => {
      const value = new THREE.MeshLambertMaterial({ name, vertexColors: true });
      materials.push(value);
      return value;
    };
    const physical = (family: "paintedWall" | "paintedSheet" | "glass", name: string) => {
      const source = options.sharedSurfaces?.materials[family];
      if (!source) return material(name);
      // The scene constructs context after its atomic atlas/environment commit.
      // These owned materials share final textures without owning/discarding them.
      const clone = source.clone();
      clone.name = name;
      if (family !== "glass") clone.color.set("#ffffff");
      clone.onBeforeCompile = source.onBeforeCompile;
      clone.customProgramCacheKey = source.customProgramCacheKey;
      materials.push(clone);
      physicalClones.push({ source, clone });
      return clone;
    };
    const shared = {
      garden: material("urban-garden"),
      walls: physical("paintedWall", "urban-wall"),
      roof: physical("paintedSheet", "urban-roof"),
      detail: material("urban-facade"),
      glass: physical("glass", "urban-glass"),
      paint: material("urban-road-paint"),
      foliage: material("urban-foliage"),
      contact: new THREE.MeshBasicMaterial({
        color: "#26392e",
        transparent: true,
        opacity: 0.19,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      road: options.sharedSurfaces?.materials.asphalt ?? material("urban-road"),
      sidewalk: options.sharedSurfaces?.materials.concrete ?? material("urban-sidewalk"),
    };
    materials.push(shared.contact);
    shared.foliage.side = THREE.DoubleSide;
    const add = (parent: THREE.Group, data: Bucket, category: keyof typeof shared) => {
      if (!data.position.length) return null;
      let geometry = new THREE.BufferGeometry();
      geometries.push(geometry);
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.position, 3));
      if (category === "road" || category === "sidewalk" || category === "paint") {
        const p = geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          const t = THREE.MathUtils.clamp((p.getZ(i) - AVENUE_SOUTH) / 5, 0, 1);
          p.setY(
            i,
            THREE.MathUtils.lerp(-0.025, -0.11, t) -
              (category === "sidewalk" ? 0.015 : category === "paint" ? -0.008 : 0),
          );
        }
      }
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(data.color, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uv, 2));
      geometry.computeVertexNormals();
      if (category === "foliage") {
        // Round crown lobes; preserve the sharp planes of architecture.
        const p = geometry.getAttribute("position"),
          n = geometry.getAttribute("normal");
        const sums = new Map<string, THREE.Vector3>();
        const keyAt = (i: number) =>
          `${Math.round(p.getX(i) * 1e5)}:${Math.round(p.getY(i) * 1e5)}:${Math.round(p.getZ(i) * 1e5)}`;
        for (let i = 0; i < p.count; i++) {
          const key = keyAt(i),
            sum = sums.get(key) ?? new THREE.Vector3();
          sum.x += n.getX(i);
          sum.y += n.getY(i);
          sum.z += n.getZ(i);
          sums.set(key, sum);
        }
        for (const sum of sums.values()) sum.normalize();
        for (let i = 0; i < p.count; i++) {
          const sum = sums.get(keyAt(i))!;
          n.setXYZ(i, sum.x, sum.y, sum.z);
        }
      }
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      // Index once after every visual attribute is final. The utility hashes
      // positions AND normals/UVs/colours, preserving hard edges and UV seams.
      // Its index sequence retains the original triangle/LOD element order.
      const indexed = mergeVertices(geometry, 1e-6);
      geometries[geometries.length - 1] = indexed;
      geometry.dispose();
      geometry = indexed;
      const mesh = new THREE.Mesh(geometry, shared[category]);
      mesh.name = `urban-${category}`;
      mesh.raycast = () => {};
      mesh.castShadow = mesh.receiveShadow = false;
      mesh.userData.commercialPickable = false;
      mesh.frustumCulled = true;
      parent.add(mesh);
      return mesh;
    };
    const architectureMetadata: ReturnType<typeof houseGeometry>[] = [];
    const houses = deriveUrbanHouses(),
      clusters: {
        group: THREE.Group;
        detail: THREE.Mesh | null;
        foliage: THREE.Mesh | null;
        center: Point;
      }[] = [];
    for (let cluster = 0; cluster < URBAN_CONTEXT.clusters; cluster++) {
      const parent = new THREE.Group();
      parent.name = `urban-spatial-batch-${cluster}`;
      group.add(parent);
      const batches = {
        garden: bucket(),
        walls: bucket(),
        roof: bucket(),
        detail: bucket(),
        glass: bucket(),
        foliage: bucket(),
        ornament: bucket(),
      };
      const members = houses.filter((house) => house.cluster === cluster);
      for (const house of members)
        architectureMetadata.push(houseGeometry(house, houses.indexOf(house), batches));
      for (const key of ["garden", "walls", "roof", "glass"] as const)
        add(parent, batches[key], key);
      const persistentDetailIndices = batches.detail.position.length / 3;
      for (const key of ["position", "color", "uv"] as const)
        batches.detail[key].push(...batches.ornament[key]);
      const detail = add(parent, batches.detail, "detail");
      if (detail) detail.userData.persistentDetailIndices = persistentDetailIndices;
      clusters.push({
        group: parent,
        detail,
        foliage: add(parent, batches.foliage, "foliage"),
        center: [
          members.reduce((s, h) => s + h.center[0], 0) / members.length,
          members.reduce((s, h) => s + h.center[1], 0) / members.length,
        ],
      });
    }
    const roadColor = options.sharedSurfaces ? "#ffffff" : "#56605f";
    const roads = bucket(),
      walks = bucket(),
      island = bucket(),
      paint = bucket();
    const roadGraph = deriveUrbanRoads();
    // One contiguous widening of each original avenue segment, never a
    // parallel road or a green gap. Source polygons/picking stay untouched.
    floor(
      roads,
      [
        [AVENUE_BOUNDS.minX, AVENUE_BOUNDS.maxY],
        [AVENUE_BOUNDS.maxX, AVENUE_BOUNDS.maxY],
        [AVENUE_BOUNDS.maxX, AVENUE_SOUTH],
        [AVENUE_BOUNDS.minX, AVENUE_SOUTH],
      ],
      -0.025,
      roadColor,
    );
    const imigrantes = ENTITIES.find((e) => e.id === "indumoveis:road:imigrantes");
    const east = imigrantes ? polygonBounds(imigrantes.polygon) : AVENUE_BOUNDS;
    if (imigrantes)
      floor(
        roads,
        [
          [east.minX, east.maxY],
          [east.maxX, east.maxY],
          [east.maxX, AVENUE_SOUTH],
          [east.minX, AVENUE_SOUTH],
        ],
        -0.025,
        roadColor,
      );
    floor(
      walks,
      [
        [AVENUE_BOUNDS.minX, AVENUE_SOUTH],
        [east.maxX, AVENUE_SOUTH],
        [east.maxX, AVENUE_SOUTH + 1.05],
        [AVENUE_BOUNDS.minX, AVENUE_SOUTH + 1.05],
      ],
      -0.04,
      options.sharedSurfaces ? "#ffffff" : "#989f9b",
    );
    for (const segment of roadGraph) {
      road(
        walks,
        segment.path,
        segment.width + 1.05,
        options.sharedSurfaces ? "#ffffff" : "#989f9b",
        -0.13,
      );
      road(roads, segment.path, segment.width, roadColor);
    }
    const ring = (center: Point, radius: number, width: number) => {
      const at = (angle: number, r: number): Point => [
        center[0] + Math.cos(angle) * r,
        center[1] + Math.sin(angle) * r,
      ];
      for (let i = 0; i < 48; i++) {
        const a = (i * Math.PI) / 24,
          b = ((i + 1) * Math.PI) / 24;
        floor(
          walks,
          [
            at(a, radius - width / 2 - 0.6),
            at(a, radius + width / 2 + 0.6),
            at(b, radius + width / 2 + 0.6),
            at(b, radius - width / 2 - 0.6),
          ],
          -0.13,
          options.sharedSurfaces ? "#ffffff" : "#989f9b",
        );
        floor(
          roads,
          [
            at(a, radius - width / 2),
            at(a, radius + width / 2),
            at(b, radius + width / 2),
            at(b, radius - width / 2),
          ],
          -0.11,
          roadColor,
        );
      }
      floor(
        island,
        Array.from({ length: 32 }, (_, i) => at((i * Math.PI) / 16, radius - width / 2 - 0.25)),
        -0.02,
        "#829468",
      );
      appendRoundaboutLandscape(
        { center, radius: radius - width / 2 - 0.3, groundElevation: -0.01 },
        center === ROUNDABOUT ? 0 : 1,
        { ground: island, canopy: island, detail: island },
      );
    };
    for (const r of [URBAN_REFERENCE.roundabout, URBAN_REFERENCE.secondaryJunction])
      ring(r.center, r.centerlineRadius, r.roadWidth);
    const allRoads = [
      ...roadGraph,
      {
        id: "approved-avenue",
        path: [
          [AVENUE_BOUNDS.minX, URBAN_REFERENCE.avenueCenter],
          [east.maxX, URBAN_REFERENCE.avenueCenter],
        ] as Point[],
        width: AVENUE_SOUTH - AVENUE_BOUNDS.minY,
        sourceWayIds: [] as string[],
      },
    ];
    const segmentDistance = (p: Point, a: Point, b: Point) => {
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        t = THREE.MathUtils.clamp(
          ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz),
          0,
          1,
        );
      return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
    };
    for (const r of allRoads) {
      const oneWay = r.sourceWayIds.some((id) => REFERENCE_WAYS[id]?.tags.oneway === "yes");
      const marks = markRoadLanes(r.path, r.width, {
        dashLength: 1.35,
        dashGap: 1.9,
        lineWidth: 0.075,
        arrowSpacing: 24,
        edges: false,
      });
      const valid = (p: Point[]) =>
        !allRoads.some(
          (other) =>
            other !== r &&
            other.path
              .slice(1)
              .some((b, i) =>
                p.some((v) => segmentDistance(v, other.path[i], b) < other.width / 2 + 0.15),
              ),
        );
      if (!oneWay)
        for (const p of marks.centerDashes.filter(valid))
          floor(paint, p, -0.017, "#c7b46c", r.id === "approved-avenue");
      if (!oneWay)
        for (const p of marks.directionArrows.filter(valid))
          floor(paint, p, -0.017, "#e4e1d1", r.id === "approved-avenue");
    }
    // Secondary portal is an approximate representation of the access confirmed
    // by the user; OSM maps its approach and circle, not the gate hardware.
    const access = roadGraph.find((r) => r.id === "brasil-access")!.path;
    const gateCenter = access[1],
      gateDirection: Point = [access[2][0] - gateCenter[0], access[2][1] - gateCenter[1]],
      gateLength = Math.hypot(...gateDirection);
    const gateNormal: Point = [-gateDirection[1] / gateLength, gateDirection[0] / gateLength];
    const portal = bucket();
    for (const side of [-1, 1])
      box(
        portal,
        gateCenter[0] + gateNormal[0] * side * 2.55,
        -0.04,
        gateCenter[1] + gateNormal[1] * side * 2.55,
        0.32,
        2.9,
        0.32,
        "#a8ada6",
      );
    // Curbs and the open pair of posts delineate the access without a fictitious
    // building, gate name or commercial interaction.
    add(group, portal, "walls");
    add(group, walks, "sidewalk");
    add(group, roads, "road");
    const bufferPoints = deriveResidentialBuffer();
    const residentialBuffer = [1.3, 1.45].map((scale, variation) =>
      appendBoundaryTrees(
        bufferPoints.filter((_, i) => i % 2 === variation),
        73 + variation,
        { ground: island, canopy: island, detail: island },
        { scale, groundElevation: URBAN_CONTEXT.groundY },
      ),
    );
    add(group, island, "foliage");
    add(group, paint, "paint");
    const contactTopology = deriveUrbanContact(
      houses.map((house, index) => ({
        center: house.center,
        heading: house.heading,
        // Metadata is expressed in the canonical plan. Match the handedness
        // already applied to its visible architecture before world rotation.
        structuralVolumes: architectureMetadata[index].structuralVolumes.map((volume) =>
          architectureMetadata[index].handedness < 0
            ? { ...volume, x0: -volume.x1, x1: -volume.x0 }
            : volume,
        ),
      })),
      {
        sunDirection: DAYLIGHT.sunDirection,
        groundElevation: URBAN_CONTEXT.groundY,
        buildingBaseElevation: -0.1,
      },
    );
    const contacts = bucket();
    for (const polygon of contactTopology.cells) floor(contacts, polygon, -0.072, "#ffffff");
    add(group, contacts, "contact");
    let quality = options.quality ?? "balanced",
      lastDistance = 150,
      lastTarget: readonly [number, number] = [95.5, 55],
      disposed = false;
    function updateLod(distance: number, target: readonly [number, number] = lastTarget) {
      if (disposed) return;
      lastDistance = distance;
      lastTarget = target;
      // The scene updates its shared family's quality/detail first. Follow
      // those numeric uniforms without rebuilding materials or textures.
      for (const { source, clone } of physicalClones) {
        for (const property of [
          "normalMap",
          "bumpMap",
          "roughnessMap",
          "aoMap",
          "envMap",
        ] as const) {
          if (clone[property] !== source[property]) {
            clone[property] = source[property];
            clone.needsUpdate = true;
          }
        }
        clone.envMapIntensity = source.envMapIntensity;
        clone.normalScale.copy(source.normalScale);
        clone.bumpScale = source.bumpScale;
      }
      const detailLimit = quality === "light" ? 150 : quality === "balanced" ? 230 : 340;
      for (const cluster of clusters) {
        const reach = Math.hypot(
          distance,
          cluster.center[0] - target[0],
          cluster.center[1] - target[1],
        );
        if (cluster.detail) {
          cluster.detail.visible = true;
          cluster.detail.geometry.setDrawRange(
            0,
            reach < detailLimit ? Infinity : cluster.detail.userData.persistentDetailIndices,
          );
        }
        // Crown/branch silhouettes and essential architectural edges remain
        // visible in overview. Only tiny garden ornaments leave the draw range.
        if (cluster.foliage) cluster.foliage.visible = true;
      }
    }
    updateLod(lastDistance);
    return {
      group,
      houses,
      metadata: {
        approximate: true,
        avenue: {
          sourceId: AVENUE.id,
          shared: true,
          duplicate: false,
          sourceSouthEdge: AVENUE_BOUNDS.maxY,
          southEdge: AVENUE_SOUTH,
          width: AVENUE_SOUTH - AVENUE_BOUNDS.minY,
        },
        source: "Imagem do ChatGPT 17 de out. de 2026, 21_33_52.jpg",
        houseCount: houses.length,
        blockCount: 3,
        roadGraph,
        roundabout: {
          ...URBAN_REFERENCE.roundabout,
          outerRadius:
            URBAN_REFERENCE.roundabout.centerlineRadius + URBAN_REFERENCE.roundabout.roadWidth / 2,
        },
        secondaryJunction: URBAN_REFERENCE.secondaryJunction,
        secondaryGate: {
          approximate: true,
          position: gateCenter,
          source: "human-confirmed access; OSM approach only",
        },
        reference: {
          scale: URBAN_REFERENCE.referenceScale,
          unitsPerMetre: URBAN_REFERENCE.unitsPerMetre,
        },
        architecture: architectureMetadata,
        landscaping: {
          reference:
            "satellite-inspired garden composition; not surveyed plants or property limits",
          persistentCrowns: true,
          housesWithTrees: architectureMetadata.filter((a) => a.landscape.trees > 0).length,
          pools: architectureMetadata.filter((a) => a.landscape.pool).length,
          shrubs: architectureMetadata.reduce((sum, a) => sum + a.landscape.shrubs, 0),
          residentialBuffer,
        },
        staticContact: {
          sourceVolumes: contactTopology.sourceVolumeCount,
          cells: contactTopology.cells.length,
          sunlight: [...DAYLIGHT.sunDirection],
          dynamicPasses: 0,
        },
        spatialBatches: clusters.length,
        meshCount: geometries.length,
        bounds: geometries.reduce<Bounds>(
          (bounds, geometry) => ({
            minX: Math.min(bounds.minX, geometry.boundingBox!.min.x),
            minY: Math.min(bounds.minY, geometry.boundingBox!.min.z),
            maxX: Math.max(bounds.maxX, geometry.boundingBox!.max.x),
            maxY: Math.max(bounds.maxY, geometry.boundingBox!.max.z),
          }),
          { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
        ),
        textureBytes: 0,
        commercialInventory: false,
        minimumZ: URBAN_CONTEXT.minimumZ,
        triangleCount: geometries.reduce((sum, g) => sum + g.getIndex()!.count / 3, 0),
        vertexCount: geometries.reduce((sum, g) => sum + g.getAttribute("position").count, 0),
        indexCount: geometries.reduce((sum, g) => sum + g.getIndex()!.count, 0),
      },
      updateLod,
      setQuality(tier: SurfaceQuality) {
        quality = tier;
        updateLod(lastDistance, lastTarget);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const geometry of geometries) geometry.dispose();
        for (const value of materials) value.dispose();
        group.clear();
      },
    };
  } catch (error) {
    for (const geometry of geometries) geometry.dispose();
    for (const value of materials) value.dispose();
    group.clear();
    throw error;
  }
}
