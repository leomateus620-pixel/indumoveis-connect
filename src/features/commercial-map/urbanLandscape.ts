import * as THREE from "three";
import type { Point } from "./data/territory";
import { pointInPolygon, polygonBounds } from "./geometry";

/** Static schematic garden detail inspired by reference52, not individual
 * photographed tree/property registration. No GPU resource or loop is owned. */
export type UrbanLandscapeBucket = { position: number[]; color: number[]; uv: number[] };
export type UrbanLandscapeBatches = {
  ground: UrbanLandscapeBucket;
  /** Trunks, branches, volumetric crowns and low shrubs: keep this batch visible
   * in every quality/LOD; native frustum culling is sufficient for the silhouette. */
  canopy: UrbanLandscapeBucket;
  detail: UrbanLandscapeBucket;
  water?: UrbanLandscapeBucket;
};
export type ResidentialLandscapeInput = {
  /** Parcel in the house's LOCAL coordinates, with its front toward -Z. */
  parcel: readonly Point[];
  width: number;
  depth: number;
  pool: boolean;
  frontageDistance: number;
  groundElevation?: number;
};
type Vertex = [number, number, number];
type Rect = { x: number; z: number; width: number; depth: number };
const LEAVES = ["#527347", "#66854e", "#79915c", "#5b7c4a"];
const SHRUBS = ["#70845a", "#84946a", "#617c51"];
const colors = new Map<string, Vertex>();
const rgb = (hex: string): Vertex => {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex).toArray() as Vertex);
  return colors.get(hex)!;
};
const sub = (a: Vertex, b: Vertex): Vertex => a.map((v, i) => v - b[i]) as Vertex;
const cross = (a: Vertex, b: Vertex): Vertex => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: Vertex): Vertex => {
  const length = Math.hypot(...v);
  return v.map((n) => n / length) as Vertex;
};
const mix = (a: Vertex, b: Vertex): Vertex => normalize(a.map((v, i) => (v + b[i]) / 2) as Vertex);
function triangle(
  bucket: UrbanLandscapeBucket,
  a: Vertex,
  b: Vertex,
  c: Vertex,
  hex: string,
  outward?: Vertex,
) {
  const n = cross(sub(b, a), sub(c, a));
  if (Math.hypot(...n) < 1e-10) return;
  if (outward && n.reduce((sum, value, i) => sum + value * outward[i], 0) < 0) [b, c] = [c, b];
  const magnitude = n.map(Math.abs),
    axis =
      magnitude[1] >= Math.max(magnitude[0], magnitude[2])
        ? 1
        : magnitude[0] > magnitude[2]
          ? 0
          : 2;
  for (const p of [a, b, c]) {
    bucket.position.push(...p);
    bucket.color.push(...rgb(hex));
    bucket.uv.push(axis === 0 ? p[2] : p[0], axis === 1 ? p[2] : p[1]);
  }
}
function ground(bucket: UrbanLandscapeBucket, polygon: readonly Point[], y: number, color: string) {
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
    polygon.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  ))
    triangle(
      bucket,
      [polygon[a][0], y, polygon[a][1]],
      [polygon[b][0], y, polygon[b][1]],
      [polygon[c][0], y, polygon[c][1]],
      color,
      [0, 1, 0],
    );
}
const rectangle = ({ x, z, width, depth }: Rect): Point[] => [
  [x - width / 2, z - depth / 2],
  [x + width / 2, z - depth / 2],
  [x + width / 2, z + depth / 2],
  [x - width / 2, z + depth / 2],
];
function oval(x: number, z: number, rx: number, rz: number): Point[] {
  return Array.from({ length: 10 }, (_, i): Point => [
    x + Math.cos((i * Math.PI) / 5) * rx,
    z + Math.sin((i * Math.PI) / 5) * rz,
  ]);
}

const phi = (1 + Math.sqrt(5)) / 2;
const ICOSA: Vertex[] = (
  [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ] as Vertex[]
).map(normalize);
const FACES = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
].map((face) => face.map((i) => ICOSA[i]) as [Vertex, Vertex, Vertex]);
const CROWN_FACES = FACES.flatMap(([a, b, c]): [Vertex, Vertex, Vertex][] => {
  const ab = mix(a, b),
    bc = mix(b, c),
    ca = mix(c, a);
  return [
    [a, ab, ca],
    [b, bc, ab],
    [c, ca, bc],
    [ab, bc, ca],
  ];
});
function lobe(
  bucket: UrbanLandscapeBucket,
  center: Vertex,
  scale: Vertex,
  seed: number,
  color: string,
  refined: boolean,
) {
  const transform = (p: Vertex): Vertex => {
    const rough =
      1 + Math.sin(p[0] * 7 + p[2] * 5 + seed) * 0.065 + Math.sin(p[1] * 9 + seed * 0.7) * 0.035;
    return p.map((n, i) => center[i] + n * scale[i] * rough) as Vertex;
  };
  for (const [i, face] of (refined ? CROWN_FACES : FACES).entries()) {
    const p = face.map(transform) as [Vertex, Vertex, Vertex];
    const outward = p[0].map(
      (v, axis) => (v + p[1][axis] + p[2][axis]) / 3 - center[axis],
    ) as Vertex;
    triangle(bucket, ...p, i % 11 === 0 ? LEAVES[(seed + i) % LEAVES.length] : color, outward);
  }
}
function branch(bucket: UrbanLandscapeBucket, a: Vertex, b: Vertex, lower: number, upper: number) {
  const direction = normalize(sub(b, a));
  const u = normalize(cross(direction, Math.abs(direction[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const v = cross(direction, u);
  const at = (center: Vertex, radius: number, angle: number): Vertex =>
    center.map((n, i) => n + radius * (u[i] * Math.cos(angle) + v[i] * Math.sin(angle))) as Vertex;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2,
      next = angle + Math.PI / 2;
    const p = at(a, lower, angle),
      q = at(a, lower, next),
      r = at(b, upper, angle),
      s = at(b, upper, next);
    const outward = sub(p, a);
    triangle(bucket, p, r, q, "#77674f", outward);
    triangle(bucket, q, r, s, "#77674f", outward);
  }
}
function tree(
  bucket: UrbanLandscapeBucket,
  center: Point,
  scale: number,
  groundY: number,
  seed: number,
) {
  // Restrained species-like proportions soften identical ball silhouettes;
  // the complete crown remains inside the declared 1.55×scale clearance.
  const shape = [
    [1.04, 0.96, 0.98],
    [0.96, 1.04, 1.03],
    [1.02, 0.98, 1.04],
  ][Math.abs(seed) % 3];
  const at = ([x, y, z]: Vertex): Vertex => [
    center[0] + x * scale * shape[0],
    groundY + y * scale * shape[1],
    center[1] + z * scale * shape[2],
  ];
  const root: Vertex = [0, -0.02, 0],
    elbow: Vertex = [0.04, 1.15, 0.02],
    fork: Vertex = [-0.06, 1.95, 0.03];
  branch(bucket, at(root), at(elbow), 0.12 * scale, 0.085 * scale);
  branch(bucket, at(elbow), at(fork), 0.085 * scale, 0.05 * scale);
  const crowns: { point: Vertex; size: Vertex }[] = [
    { point: [-0.38, 2.2, 0.08], size: [0.94, 0.88, 0.88] },
    { point: [0.39, 2.52, 0.15], size: [0.82, 0.88, 0.8] },
    { point: [0.08, 1.83, -0.42], size: [0.8, 0.82, 0.78] },
  ];
  crowns.forEach(({ point, size }, i) => {
    branch(bucket, at(elbow), at(point), 0.052 * scale, 0.017 * scale);
    lobe(
      bucket,
      at(point),
      size.map((n, axis) => n * scale * shape[axis]) as Vertex,
      seed + i,
      LEAVES[(seed + i) % LEAVES.length],
      true,
    );
  });
}

/** Curved grounded trunk, articulated midribs and five pairs of inexpensive
 * folded leaflets per frond. Seven/nine fronds cost 226/278 triangles total. */
function palm(
  bucket: UrbanLandscapeBucket,
  center: Point,
  scale: number,
  groundY: number,
  seed: number,
) {
  const at = ([x, y, z]: Vertex): Vertex => [
    center[0] + x * scale,
    groundY + y * scale,
    center[1] + z * scale,
  ];
  const joints: Vertex[] = [
    [0, -0.02, 0],
    [0.06, 0.82, 0.02],
    [0.13, 1.72, 0.05],
    [0.1, 2.7, 0.04],
  ];
  for (let i = 1; i < joints.length; i++)
    branch(
      bucket,
      at(joints[i - 1]),
      at(joints[i]),
      (0.12 - i * 0.016) * scale,
      (0.11 - i * 0.016) * scale,
    );
  lobe(bucket, at(joints[3]), [0.14 * scale, 0.18 * scale, 0.14 * scale], seed, "#70845a", false);
  const fronds = 7 + (seed % 3);
  for (let frond = 0; frond < fronds; frond++) {
    const angle = (frond * Math.PI * 2) / fronds + seed * 0.37;
    const radial: Point = [Math.cos(angle), Math.sin(angle)],
      side: Point = [-radial[1], radial[0]];
    const node = (reach: number, y: number): Vertex => [
      0.1 + radial[0] * reach,
      y,
      0.04 + radial[1] * reach,
    ];
    const nodes = [node(0, 2.7), node(0.4, 2.94), node(0.83, 2.82), node(1.27, 2.28)];
    const offset = (p: Vertex, across: number): Vertex => [
      p[0] + side[0] * across,
      p[1],
      p[2] + side[1] * across,
    ];
    for (let part = 1; part < nodes.length; part++) {
      const a = at(offset(nodes[part - 1], -0.013)),
        b = at(offset(nodes[part - 1], 0.013));
      const c = at(offset(nodes[part], -0.013)),
        d = at(offset(nodes[part], 0.013));
      triangle(bucket, a, b, c, "#788b51", [0, 1, 0]);
      triangle(bucket, b, d, c, "#788b51", [0, 1, 0]);
    }
    for (let pair = 0; pair < 5; pair++) {
      const t = 0.16 + pair * 0.16,
        segment = Math.min(2, Math.floor(t * 3)),
        progress = t * 3 - segment;
      const root = nodes[segment].map(
        (n, axis) => n + (nodes[segment + 1][axis] - n) * progress,
      ) as Vertex;
      for (const direction of [-1, 1]) {
        const spread = (0.2 + Math.sin(t * Math.PI) * 0.08) * direction;
        const leaf = (along: number, across: number, down: number): Vertex =>
          at([
            root[0] + radial[0] * along + side[0] * across,
            root[1] - down,
            root[2] + radial[1] * along + side[1] * across,
          ]);
        const a = leaf(0, 0, 0),
          b = leaf(-0.035, spread * 0.46, 0.035),
          c = leaf(0.1, spread, 0.18),
          d = leaf(0.065, spread * 0.46, 0.025);
        const color = (frond + pair) % 3 ? "#668449" : "#7e9656";
        triangle(bucket, a, b, c, color, [0, 1, 0]);
        triangle(bucket, a, c, d, color, [0, 1, 0]);
      }
    }
  }
  return fronds;
}

const rectDistance = ([x, z]: Point, r: Rect) =>
  Math.hypot(
    Math.max(Math.abs(x - r.x) - r.width / 2, 0),
    Math.max(Math.abs(z - r.z) - r.depth / 2, 0),
  );
const overlaps = (a: Rect, b: Rect, gap = 0) =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
  Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + gap;

/** Emits into the caller's existing garden/foliage/detail batches. Persistent
 * Trees cost at most 280 triangles, with broad crowns or articulated palm fronds.
 * Detail LOD may remove paving joints, never the complete garden silhouette. */
export function appendResidentialLandscape(
  house: ResidentialLandscapeInput,
  index: number,
  batches: UrbanLandscapeBatches,
) {
  const start = batches.canopy.position.length / 9;
  const { width, depth, parcel } = house;
  if (
    parcel.length < 3 ||
    ![width, depth, house.frontageDistance, ...parcel.flat()].every(Number.isFinite) ||
    width <= 0 ||
    depth <= 0
  )
    throw new Error("urban-landscape-invalid-input");
  const groundY = house.groundElevation ?? -0.145;
  const bounds = polygonBounds(parcel);
  const body: Rect = { x: 0, z: 0, width: width + 0.5, depth: depth + 0.5 };
  const access: Rect[] = [
    {
      x: width * 0.27,
      z: (-house.frontageDistance - depth / 2) / 2,
      width: 1.8,
      depth: Math.max(0, house.frontageDistance - depth / 2),
    },
    {
      x: -width * 0.2,
      z: (-house.frontageDistance - depth / 2) / 2,
      width: 0.85,
      depth: Math.max(0, house.frontageDistance - depth / 2),
    },
  ];
  const probes = (r: Rect) => [
    ...rectangle(r),
    [r.x, r.z] as Point,
    [r.x - r.width / 2, r.z] as Point,
    [r.x + r.width / 2, r.z] as Point,
    [r.x, r.z - r.depth / 2] as Point,
    [r.x, r.z + r.depth / 2] as Point,
  ];
  const freeRect = (r: Rect) =>
    probes(r).every((p) => pointInPolygon(p, parcel)) &&
    !overlaps(r, body, 0.15) &&
    !access.some((a) => overlaps(r, a, 0.12));
  const poolCandidates = [
    { x: bounds.maxX - 1.95, z: bounds.maxY - 2.65, width: 3.3, depth: 4.5 },
    { x: bounds.minX + 1.95, z: bounds.maxY - 2.65, width: 3.3, depth: 4.5 },
    { x: bounds.maxX - 1.95, z: bounds.minY + 2.65, width: 3.3, depth: 4.5 },
  ];
  const pool = house.pool ? poolCandidates.find(freeRect) : undefined;
  if (pool) {
    const inner = { ...pool, width: 1.9, depth: 3.1 };
    for (const r of [
      { x: pool.x, z: pool.z - 1.9, width: 3.3, depth: 0.7 },
      { x: pool.x, z: pool.z + 1.9, width: 3.3, depth: 0.7 },
      { x: pool.x - 1.3, z: pool.z, width: 0.7, depth: 3.1 },
      { x: pool.x + 1.3, z: pool.z, width: 0.7, depth: 3.1 },
    ])
      ground(batches.ground, rectangle(r), groundY + 0.025, index % 2 ? "#b2a78d" : "#a3a398");
    ground(batches.water ?? batches.ground, rectangle(inner), groundY + 0.02, "#6fa8ad");
  }
  const patio = !pool
    ? [
        ...poolCandidates.map((r) => ({ ...r, width: 2.6, depth: 2.2 })),
        { x: bounds.maxX - 1.6, z: bounds.maxY - 0.95, width: 2.6, depth: 1.4 },
      ].find(freeRect)
    : undefined;
  const occupiedGarden = pool ?? patio;
  const freeCircle = (point: Point, radius: number) =>
    oval(...point, radius, radius).every((p) => pointInPolygon(p, parcel)) &&
    rectDistance(point, body) > radius + 0.1 &&
    !access.some((a) => rectDistance(point, a) < radius + 0.1) &&
    (!occupiedGarden || rectDistance(point, occupiedGarden) > radius + 0.15);
  let plantedTree: {
    center: Point;
    scale: number;
    crownRadius: number;
    species: "broadleaf" | "palm";
    persistentTriangles: number;
    fronds?: number;
  } | null = null;
  for (const scale of [1, 0.8, 0.64, 0.48]) {
    const inset = 1.55 * scale + 0.18;
    const treeCandidates: Point[] = [
      [bounds.minX + inset, bounds.maxY - inset],
      [bounds.maxX - inset, bounds.maxY - inset],
      [bounds.minX + inset, bounds.minY + inset],
      [bounds.maxX - inset, bounds.minY + inset],
      [0, bounds.maxY - inset],
      [bounds.minX + inset, 0],
      [bounds.maxX - inset, 0],
    ];
    if (index % 2) treeCandidates.splice(0, 2, treeCandidates[1], treeCandidates[0]);
    const point = treeCandidates.find((point) => freeCircle(point, 1.55 * scale));
    if (!point) continue;
    ground(batches.ground, oval(...point, scale * 1.1, scale * 0.95), groundY + 0.008, "#829267");
    const beforeTree = batches.canopy.position.length / 9;
    const species = Math.abs(index) % 7 === 3 ? "palm" : "broadleaf";
    const fronds =
      species === "palm" ? palm(batches.canopy, point, scale, groundY, Math.abs(index)) : undefined;
    if (species === "broadleaf") tree(batches.canopy, point, scale, groundY, Math.abs(index));
    plantedTree = {
      center: [...point],
      scale,
      crownRadius: 1.55 * scale,
      species,
      persistentTriangles: batches.canopy.position.length / 9 - beforeTree,
      ...(fronds ? { fronds } : {}),
    };
    break;
  }
  let shrubs = 0;
  for (let edge = 0; edge < parcel.length && shrubs < 6; edge++) {
    const a = parcel[edge],
      b = parcel[(edge + 1) % parcel.length];
    // Preserve the open front/access: discontinuous rear/side clumps replace
    // an invented continuous hedge or an unbroken perimeter wall of vegetation.
    if ((a[1] + b[1]) / 2 < -depth * 0.35 || edge % 2 !== Math.abs(index) % 2) continue;
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 2) continue;
    for (const t of [0.24, 0.63]) {
      const boundary: Point = [a[0] + dx * t, a[1] + dz * t];
      const toCenter = Math.hypot(...boundary);
      const point: Point = [
        boundary[0] * (1 - 0.8 / Math.max(1, toCenter)),
        boundary[1] * (1 - 0.8 / Math.max(1, toCenter)),
      ];
      if (
        !freeCircle(point, 0.7) ||
        (plantedTree &&
          Math.hypot(point[0] - plantedTree.center[0], point[1] - plantedTree.center[1]) <
            plantedTree.crownRadius + 0.25)
      )
        continue;
      ground(batches.ground, oval(...point, 0.68, 0.52), groundY + 0.007, "#9a8d72");
      lobe(
        batches.canopy,
        [point[0], groundY + 0.35, point[1]],
        [0.58, 0.37, 0.48],
        Math.abs(index) + shrubs,
        SHRUBS[(Math.abs(index) + shrubs) % SHRUBS.length],
        false,
      );
      shrubs++;
    }
  }
  if (patio) {
    ground(batches.ground, rectangle(patio), groundY + 0.024, "#a5a398");
    for (const offset of [-0.65, 0, 0.65])
      ground(
        batches.detail,
        rectangle({ x: patio.x + offset, z: patio.z, width: 0.018, depth: patio.depth }),
        groundY + 0.027,
        "#777e70",
      );
  }
  return {
    approximate: true as const,
    trees: plantedTree ? 1 : 0,
    shrubs,
    tree: plantedTree,
    pool: pool
      ? {
          center: [pool.x, pool.z] as Point,
          width: 1.9,
          depth: 3.1,
          deckWidth: 3.3,
          deckDepth: 4.5,
        }
      : null,
    persistentTriangles: batches.canopy.position.length / 9 - start,
  };
}

/** radius is the usable planted ISLAND radius, never the carriageway radius. */
export function appendRoundaboutLandscape(
  input: { center: Point; radius: number; groundElevation: number },
  index: number,
  batches: UrbanLandscapeBatches,
) {
  if (
    ![...input.center, input.radius, input.groundElevation].every(Number.isFinite) ||
    input.radius <= 0
  )
    throw new Error("urban-landscape-invalid-island");
  const { center, radius, groundElevation } = input;
  const count = radius > 3.5 ? 7 : 4;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399 + index * 0.71;
    const reach = radius * (i % 2 ? 0.5 : 0.23);
    const point: Point = [center[0] + Math.cos(angle) * reach, center[1] + Math.sin(angle) * reach];
    const size = Math.min(0.64, radius * 0.19);
    ground(batches.ground, oval(...point, size * 1.2, size), groundElevation + 0.008, "#9c9476");
    lobe(
      batches.canopy,
      [point[0], groundElevation + size * 0.48, point[1]],
      [size, size * 0.58, size * 0.82],
      Math.abs(index) + i,
      SHRUBS[i % SHRUBS.length],
      false,
    );
  }
  return { approximate: true as const, shrubs: count, trees: 0, persistent: true as const };
}

/** Explicit world centres supplied by the caller for the photographed boundary
 * MASS between gardens and field. No road, property line or individual trunk
 * is inferred. The caller checks full crown clearance against its actual road,
 * parcel and commercial polygons before passing these finite centres. */
export function appendBoundaryTrees(
  points: readonly Point[],
  seed: number,
  batches: UrbanLandscapeBatches,
  options: { scale?: number; groundElevation?: number } = {},
) {
  const scale = options.scale ?? 1,
    groundElevation = options.groundElevation ?? -0.145;
  if (![scale, groundElevation, seed].every(Number.isFinite) || scale <= 0)
    throw new Error("urban-landscape-invalid-boundary");
  const initialTriangles = batches.canopy.position.length / 9;
  const seen = new Set<string>();
  const records: { id: string; world: Point; scale: number; origin: "satellite-mass" }[] = [];
  points.forEach((point, index) => {
    const key = point.join(":");
    if (!point.every(Number.isFinite) || seen.has(key)) return;
    seen.add(key);
    const world: Point = [...point];
    ground(
      batches.ground,
      oval(...world, scale * 1.1, scale * 0.95),
      groundElevation + 0.008,
      "#829267",
    );
    tree(batches.canopy, world, scale, groundElevation, Math.abs(Math.trunc(seed)) + index);
    records.push({
      id: `context-boundary-${Math.trunc(seed)}-${String(index + 1).padStart(2, "0")}`,
      world,
      scale,
      origin: "satellite-mass",
    });
  });
  return {
    approximate: true as const,
    persistent: true as const,
    trees: records.length,
    records,
    positions: records.map((record): Point => [...record.world]),
    crownRadius: 1.55 * scale,
    groundElevation,
    persistentTriangles: batches.canopy.position.length / 9 - initialTriangles,
  };
}
