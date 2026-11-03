import * as THREE from "three";
import type { MapEntity, Point } from "./data/territory";
import { getPavilionPresentation, isPavilionFrontEdge } from "./architectureOrientation";
import { signedPolygonArea } from "./geometry";
import {
  createSurfaceMaterials,
  type SurfaceMaterials,
  type SurfaceFamily,
} from "./surfaceMaterials";

/** Presentation only: no value in this module is a metre or a surveyed elevation. */
export type RoofProfile =
  | "broad-gable"
  | "twin-offset-gables"
  | "northlight-sawtooth"
  | "p8-gable"
  | "p13-gable"
  | "triple-gable"
  | "event-center-gable"
  | "support-gable"
  | "support-shed";

const PAVILION_PROFILES: Record<string, RoofProfile> = {
  "indumoveis:pavilion:1": "broad-gable",
  "indumoveis:pavilion:14": "twin-offset-gables",
  "indumoveis:pavilion:12": "northlight-sawtooth",
  "indumoveis:pavilion:8": "p8-gable",
  "indumoveis:pavilion:13": "p13-gable",
  "indumoveis:pavilion:3": "triple-gable",
};
const SUPPORT_PROFILES: Record<string, RoofProfile> = {
  "indumoveis:support:b7": "support-gable",
  "indumoveis:support:b7-annex-a": "support-shed",
  "indumoveis:support:b7-annex-b": "support-shed",
  "indumoveis:support:cafe": "support-gable",
  "indumoveis:support:bar": "support-gable",
  "indumoveis:support:restaurant": "support-gable",
  "indumoveis:support:events": "event-center-gable",
};
const FOOD_HALL_IDS = new Set([
  "indumoveis:support:cafe",
  "indumoveis:support:bar",
  "indumoveis:support:restaurant",
]);

type Vertex = [number, number, number];
type RoofSegment = { start: number; end: number; from: number; to: number };
type Frame = {
  origin: Point;
  ux: Point;
  uz: Point;
  polygon: Point[];
  width: number;
  depth: number;
};
type Bucket = { positions: number[]; colors: number[]; uvs: number[]; roofAxis?: 0 | 1 };

export interface ArchitectureDefinition {
  profile: RoofProfile;
  estimated: true;
  eaveHeight: number;
  roofRise: number;
  roofThickness: number;
  wallThickness: number;
  height: number;
}
export interface ArchitectureBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  roofProfile: RoofProfile;
}
export interface MapArchitecture {
  group: THREE.Group;
  /** Only roofs disappear in inspection; floors, recessed entries and structure remain. */
  roofs: Map<string, THREE.Group>;
  pickables: THREE.Mesh[];
  visualBounds: Map<string, ArchitectureBounds>;
  textureBytes: number;
  dispose(): void;
}

function localFrame(entity: MapEntity): Frame {
  // A notch, reversed winding or a different first vertex cannot rotate the
  // construction frame. Use the longest predominantly horizontal source edge,
  // oriented towards drawing +X, then normalize the projected minima.
  const sheet =
    signedPolygonArea(entity.polygon) > 0 ? entity.polygon : [...entity.polygon].reverse();
  const edges = sheet.map((p, i) => {
    const q = sheet[(i + 1) % sheet.length],
      dx = q[0] - p[0],
      dz = q[1] - p[1],
      length = Math.hypot(dx, dz);
    return {
      dx,
      dz,
      length,
      score: (Math.abs(dx) / Math.max(length, 1e-9)) * 1000 + length * 0.001,
    };
  });
  const edge = edges.reduce((a, b) => (a.score > b.score ? a : b)),
    sign = edge.dx < 0 ? -1 : 1;
  const ux: Point = [(edge.dx / edge.length) * sign, (edge.dz / edge.length) * sign];
  const uz: Point = [-ux[1], ux[0]];
  const minX = Math.min(...sheet.map((p) => p[0] * ux[0] + p[1] * ux[1])),
    minZ = Math.min(...sheet.map((p) => p[0] * uz[0] + p[1] * uz[1]));
  const origin: Point = [minX * ux[0] + minZ * uz[0], minX * ux[1] + minZ * uz[1]];
  const polygon = sheet.map((p): Point => [
    (p[0] - origin[0]) * ux[0] + (p[1] - origin[1]) * ux[1],
    (p[0] - origin[0]) * uz[0] + (p[1] - origin[1]) * uz[1],
  ]);
  return {
    origin,
    ux,
    uz,
    polygon,
    width: Math.max(...polygon.map((p) => p[0])) - Math.min(...polygon.map((p) => p[0])),
    depth: Math.max(...polygon.map((p) => p[1])) - Math.min(...polygon.map((p) => p[1])),
  };
}

export function getArchitectureDefinition(entity: MapEntity): ArchitectureDefinition | null {
  const profile = PAVILION_PROFILES[entity.id] ?? SUPPORT_PROFILES[entity.id];
  if (!profile) return null;
  const frame = localFrame(entity);
  const span = Math.min(frame.width, frame.depth);
  const eaveHeight = entity.height ?? 2.2;
  // P1's roof sits low behind the photographed facade; P8 and P13 have
  // moderate gables. All pitches remain estimates in drawing units.
  const roofRise =
    (FOOD_HALL_IDS.has(entity.id) ? frame.width : span) *
    (entity.id === "indumoveis:pavilion:1" ? 0.055 : entity.kind === "pavilion" ? 0.11 : 0.085);
  const roofThickness = span * 0.013;
  return {
    profile,
    estimated: true,
    eaveHeight,
    roofRise,
    roofThickness,
    wallThickness: span * 0.014,
    height: eaveHeight + roofRise + (entity.kind === "pavilion" ? roofThickness * 0.12 : 0),
  };
}

export function architectureVisualHeight(entity: MapEntity): number {
  return getArchitectureDefinition(entity)?.height ?? entity.height ?? 0;
}

/** Clip in local drawing coordinates. No rectangle replaces an approved footprint. */
export function clipArchitecturePolygon(
  polygon: readonly Point[],
  axis: 0 | 1,
  bound: number,
  keepAbove: boolean,
): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const aIn = keepAbove ? a[axis] >= bound - 1e-9 : a[axis] <= bound + 1e-9;
    const bIn = keepAbove ? b[axis] >= bound - 1e-9 : b[axis] <= bound + 1e-9;
    if (aIn) result.push([...a]);
    if (aIn !== bIn) {
      const t = (bound - a[axis]) / (b[axis] - a[axis]);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - result[i - 1][0], p[1] - result[i - 1][1]) > 1e-8,
  );
}

function roofSegments(profile: RoofProfile): RoofSegment[] {
  let points: Point[];
  switch (profile) {
    case "twin-offset-gables":
      points = [
        [0, 0],
        [0.24, 1],
        [0.5, 0],
        [0.77, 0.78],
        [1, 0],
      ];
      break;
    case "northlight-sawtooth":
      return [0, 1, 2].map((i) => ({ start: i / 3, end: (i + 1) / 3, from: 0, to: 1 }));
    case "p8-gable":
    case "p13-gable":
      // The 2026 photographic reference supports a gable for each, while
      // the rear pitches and their exact dimensions remain unmeasured.
      points = [
        [0, 0],
        [0.5, 1],
        [1, 0],
      ];
      break;
    case "triple-gable":
      points = [
        [0, 0],
        [1 / 6, 1],
        [1 / 3, 0],
        [0.5, 1],
        [2 / 3, 0],
        [5 / 6, 1],
        [1, 0],
      ];
      break;
    case "support-shed":
      points = [
        [0, 1],
        [1, 0],
      ];
      break;
    default:
      points = [
        [0, 0],
        [0.5, 1],
        [1, 0],
      ];
  }
  return points
    .slice(0, -1)
    .map((p, i) => ({ start: p[0], end: points[i + 1][0], from: p[1], to: points[i + 1][1] }));
}

function bucket(roofAxis?: 0 | 1): Bucket {
  return { positions: [], colors: [], uvs: [], roofAxis };
}
function triangle(target: Bucket, a: Vertex, b: Vertex, c: Vertex, color: string, normal?: Vertex) {
  if (normal) {
    const ab = b.map((n, i) => n - a[i]);
    const ac = c.map((n, i) => n - a[i]);
    const dot =
      (ab[1] * ac[2] - ab[2] * ac[1]) * normal[0] +
      (ab[2] * ac[0] - ab[0] * ac[2]) * normal[1] +
      (ab[0] * ac[1] - ab[1] * ac[0]) * normal[2];
    if (dot < 0) [b, c] = [c, b];
  }
  target.positions.push(...a, ...b, ...c);
  // Coordinates stay in the building's local frame before placement. Roof U
  // follows the ridge and V the short span: all pitches share sheet direction.
  // Wall projection uses the dominant local face, at the same tile scale.
  const ab = b.map((n, i) => n - a[i]);
  const ac = c.map((n, i) => n - a[i]);
  const nx = ab[1] * ac[2] - ab[2] * ac[1];
  const ny = ab[2] * ac[0] - ab[0] * ac[2];
  const nz = ab[0] * ac[1] - ab[1] * ac[0];
  for (const p of [a, b, c]) {
    if (target.roofAxis !== undefined && Math.abs(ny) > 1e-8) {
      const axis = target.roofAxis;
      const slope = -(axis === 0 ? nx : nz) / ny;
      const across = (p[axis === 0 ? 0 : 2] + slope * p[1]) / Math.sqrt(1 + slope * slope);
      target.uvs.push(p[axis === 0 ? 2 : 0] / 1.4, across / 1.4);
    } else if (Math.abs(ny) >= Math.max(Math.abs(nx), Math.abs(nz)))
      target.uvs.push(p[0] / 2.8, p[2] / 2.8);
    else if (Math.abs(nx) > Math.abs(nz)) target.uvs.push(p[2] / 2.8, p[1] / 2.8);
    else target.uvs.push(p[0] / 2.8, p[1] / 2.8);
  }
  const shade = new THREE.Color(color);
  for (let i = 0; i < 3; i++) target.colors.push(shade.r, shade.g, shade.b);
}
function quad(
  target: Bucket,
  a: Vertex,
  b: Vertex,
  c: Vertex,
  d: Vertex,
  color: string,
  normal?: Vertex,
) {
  triangle(target, a, b, c, color, normal);
  triangle(target, a, c, d, color, normal);
}
function polygonSurface(
  target: Bucket,
  polygon: Point[],
  height: (p: Point) => number,
  color: string,
  up = true,
) {
  for (const indices of THREE.ShapeUtils.triangulateShape(
    polygon.map((p) => new THREE.Vector2(...p)),
    [],
  )) {
    const vertices = indices.map((i): Vertex => [polygon[i][0], height(polygon[i]), polygon[i][1]]);
    triangle(target, vertices[0], vertices[1], vertices[2], color, [0, up ? 1 : -1, 0]);
  }
}
function interpolate(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Convex offset intersections retain the small skew of P12 and stay inside it. */
function insetPolygon(polygon: Point[], distance: number): Point[] {
  const orientation = Math.sign(signedPolygonArea(polygon));
  const lines = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    return {
      p: [
        a[0] - (dz / length) * distance * orientation,
        a[1] + (dx / length) * distance * orientation,
      ] as Point,
      d: [dx, dz] as Point,
    };
  });
  return lines.map((current, i): Point => {
    const previous = lines[(i + lines.length - 1) % lines.length];
    const cross = previous.d[0] * current.d[1] - previous.d[1] * current.d[0];
    if (Math.abs(cross) < 1e-9) return current.p;
    const dx = current.p[0] - previous.p[0],
      dz = current.p[1] - previous.p[1];
    const t = (dx * current.d[1] - dz * current.d[0]) / cross;
    return [previous.p[0] + previous.d[0] * t, previous.p[1] + previous.d[1] * t];
  });
}

/** A wall interval has real side reveals and an inner surface, not painted doors. */
function wallPrism(
  target: Bucket,
  a: Point,
  b: Point,
  ia: Point,
  ib: Point,
  bottom: number,
  top: number,
  color: string,
) {
  const outward: Vertex = [b[1] - a[1], 0, a[0] - b[0]];
  quad(
    target,
    [a[0], bottom, a[1]],
    [b[0], bottom, b[1]],
    [b[0], top, b[1]],
    [a[0], top, a[1]],
    color,
    outward,
  );
  quad(
    target,
    [ia[0], bottom, ia[1]],
    [ia[0], top, ia[1]],
    [ib[0], top, ib[1]],
    [ib[0], bottom, ib[1]],
    color,
    outward.map((v) => -v) as Vertex,
  );
  quad(
    target,
    [a[0], top, a[1]],
    [b[0], top, b[1]],
    [ib[0], top, ib[1]],
    [ia[0], top, ia[1]],
    color,
    [0, 1, 0],
  );
  quad(
    target,
    [a[0], bottom, a[1]],
    [a[0], top, a[1]],
    [ia[0], top, ia[1]],
    [ia[0], bottom, ia[1]],
    color,
    [a[0] - b[0], 0, a[1] - b[1]],
  );
  quad(
    target,
    [b[0], bottom, b[1]],
    [ib[0], bottom, ib[1]],
    [ib[0], top, ib[1]],
    [b[0], top, b[1]],
    color,
    [b[0] - a[0], 0, b[1] - a[1]],
  );
}

function geometryFrom(target: Bucket, frame?: Frame): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(target.colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(target.uvs, 2));
  if (frame)
    geometry.applyMatrix4(
      new THREE.Matrix4().set(
        frame.ux[0],
        0,
        frame.uz[0],
        frame.origin[0],
        0,
        1,
        0,
        0,
        frame.ux[1],
        0,
        frame.uz[1],
        frame.origin[1],
        0,
        0,
        0,
        1,
      ),
    );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function appendGeometry(target: Bucket, geometry: THREE.BufferGeometry) {
  target.positions.push(...geometry.getAttribute("position").array);
  target.colors.push(...geometry.getAttribute("color").array);
  target.uvs.push(...geometry.getAttribute("uv").array);
  geometry.dispose();
}

/** Static construction, called once per renderer revision. No geometry work in gestures. */
export function buildArchitecture(
  entities: readonly MapEntity[],
  sharedSurfaces?: SurfaceMaterials,
): MapArchitecture {
  const surfaces = sharedSurfaces ?? createSurfaceMaterials();
  const group = new THREE.Group();
  group.name = "indumoveis-presentation-architecture";
  const roofs = new Map<string, THREE.Group>();
  const pickables: THREE.Mesh[] = [];
  const visualBounds = new Map<string, ArchitectureBounds>();
  const geometries = new Set<THREE.BufferGeometry>();
  const pickMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const floors = bucket(),
    walls = bucket(),
    brick = bucket(),
    frames = bucket(),
    structure = bucket(),
    glazing = bucket(),
    metal = bucket(),
    accents = bucket();
  function mesh(data: Bucket, family: SurfaceFamily, frame?: Frame) {
    const geometry = geometryFrom(data, frame);
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, surfaces.materials[family]);
    result.receiveShadow = true;
    result.castShadow = true;
    return result;
  }
  for (const entity of entities) {
    const definition = getArchitectureDefinition(entity);
    if (!definition) continue;
    const frame = localFrame(entity);
    const presentation = getPavilionPresentation(entity);
    const localFloor = bucket(),
      localWalls = bucket(),
      localBrick = bucket(),
      localFrames = bucket(),
      localStructure = bucket(),
      localGlass = bucket(),
      localMetal = bucket(),
      localAccent = bucket(),
      roofWalls = bucket(),
      roofGlass = bucket(),
      picking = bucket();
    const { polygon } = frame;
    const span = Math.min(frame.width, frame.depth);
    const inner = insetPolygon(polygon, definition.wallThickness);
    // Keep panel faces behind the structural posts. Drawing both on the source
    // boundary produced coplanar facade flicker, especially at oblique angles.
    const panelOuter = insetPolygon(polygon, definition.wallThickness * 0.12);
    const structuralInner = insetPolygon(polygon, definition.wallThickness * 1.8);
    const foundationTop = definition.eaveHeight * 0.095;
    const openingTop = definition.eaveHeight * 0.72;
    // The roof fascia occupies this last thickness band. Walls end exactly at
    // its underside instead of competing with it on the same facade plane.
    const wallTop = definition.eaveHeight - definition.roofThickness;
    // These adjacent support footprints represent one elongated hall in the
    // reference. Give their separate selectable roofs the same longitudinal
    // ridge, without building over the small gaps in the approved drawing.
    const axis: 0 | 1 = presentation
      ? Math.abs(
          presentation.ridgeDirection[0] * frame.ux[0] +
            presentation.ridgeDirection[1] * frame.ux[1],
        ) >=
        Math.abs(
          presentation.ridgeDirection[0] * frame.uz[0] +
            presentation.ridgeDirection[1] * frame.uz[1],
        )
        ? 1
        : 0
      : FOOD_HALL_IDS.has(entity.id) || frame.width <= frame.depth
        ? 0
        : 1;
    const roof = bucket(axis);
    const min = Math.min(...polygon.map((p) => p[axis]));
    const extent = axis === 0 ? frame.width : frame.depth;
    const segments = roofSegments(definition.profile);
    const roofHeight = (segment: RoofSegment, p: Point) =>
      definition.eaveHeight +
      definition.roofRise *
        (segment.from +
          ((segment.to - segment.from) * ((p[axis] - min) / extent - segment.start)) /
            (segment.end - segment.start));

    // Contact, raised slab and perimeter plinth all remain inside the footprint.
    polygonSurface(localFloor, polygon, () => 0.005, "#8d9495");
    polygonSurface(localFloor, inner, () => foundationTop, "#ffffff");
    const displayAccesses = presentation
      ? [
          ...presentation.mainEntries.map((point) => ({ point, main: true })),
          ...presentation.serviceEntries.map((point) => ({ point, main: false })),
        ]
      : (entity.accesses ?? []).map((point) => ({ point, main: false }));
    const localAccesses = displayAccesses.map(({ point: access, main }) => {
      const delta: Point = [access[0] - frame.origin[0], access[1] - frame.origin[1]];
      const point: Point = [
        delta[0] * frame.ux[0] + delta[1] * frame.ux[1],
        delta[0] * frame.uz[0] + delta[1] * frame.uz[1],
      ];
      let nearest = { edge: -1, t: 0, distance: Infinity };
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)),
        );
        const projected = interpolate(a, b, t);
        const distance = Math.hypot(projected[0] - point[0], projected[1] - point[1]);
        if (distance < nearest.distance) nearest = { edge: i, t, distance };
      }
      return { ...nearest, main };
    });
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const ia = inner[i],
        ib = inner[(i + 1) % polygon.length];
      const panelA = panelOuter[i],
        panelB = panelOuter[(i + 1) % polygon.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const world = (p: Point): Point => [
        frame.origin[0] + p[0] * frame.ux[0] + p[1] * frame.uz[0],
        frame.origin[1] + p[0] * frame.ux[1] + p[1] * frame.uz[1],
      ];
      const front = isPavilionFrontEdge(
        { ...entity, polygon: polygon.map(world) },
        world(a),
        world(b),
      );
      const doorHalf = Math.min((span * 0.075) / length, 0.14);
      const entries = localAccesses
        .filter((access) => access.edge === i)
        .map(
          (access) =>
            [Math.max(0.025, access.t - doorHalf), Math.min(0.975, access.t + doorHalf)] as Point,
        )
        .sort((l, r) => l[0] - r[0]);
      const doors: Point[] = [];
      for (const entry of entries) {
        const previous = doors[doors.length - 1];
        if (previous && entry[0] <= previous[1]) previous[1] = Math.max(previous[1], entry[1]);
        else doors.push(entry);
      }
      const intervals: Point[] = [];
      let cursor = 0;
      for (const door of doors) {
        if (door[0] > cursor) intervals.push([cursor, door[0]]);
        cursor = door[1];
      }
      if (cursor < 1) intervals.push([cursor, 1]);
      for (const [start, end] of intervals) {
        const count = Math.max(1, Math.ceil(((end - start) * length) / (span * 0.36)));
        for (let bay = 0; bay < count; bay++) {
          const from = start + ((end - start) * bay) / count,
            to = start + ((end - start) * (bay + 1)) / count;
          const p = interpolate(a, b, from),
            q = interpolate(a, b, to);
          const ip = interpolate(ia, ib, from),
            iq = interpolate(ia, ib, to);
          const panelP = interpolate(panelA, panelB, from);
          const panelQ = interpolate(panelA, panelB, to);
          // On P8's documented front, a high window ribbon is recessed into
          // the existing bays. It does not invent an access or enlarge the
          // protected footprint. Other faces remain conservative estimates.
          const frontRibbon =
            ["indumoveis:pavilion:8", "indumoveis:pavilion:13"].includes(entity.id) && front;
          const eventFront = entity.id === "indumoveis:support:events" && i === 3;
          const foodFront = FOOD_HALL_IDS.has(entity.id) && i === 1;
          const p12Front = entity.id === "indumoveis:pavilion:12" && front;
          const p3Front = entity.id === "indumoveis:pavilion:3" && front;
          const p14Front = entity.id === "indumoveis:pavilion:14" && front;
          const worldA = world(a),
            worldB = world(b);
          const p1Side =
            entity.id === "indumoveis:pavilion:1" &&
            Math.abs(worldB[1] - worldA[1]) < Math.abs(worldB[0] - worldA[0]) * 0.1;
          const panel = p12Front ? localBrick : localWalls;
          const shade = bay % 2 ? "#f0f3f2" : "#ffffff";
          if (frontRibbon || eventFront || foodFront || p12Front || p3Front || p14Front || p1Side) {
            const sill =
              foundationTop +
              (wallTop - foundationTop) * (eventFront || foodFront || p3Front ? 0.24 : 0.64);
            const head =
              foundationTop +
              (wallTop - foundationTop) * (eventFront || foodFront || p3Front ? 0.78 : 0.82);
            wallPrism(panel, panelP, panelQ, ip, iq, foundationTop, sill, shade);
            wallPrism(panel, panelP, panelQ, ip, iq, head, wallTop, shade);
            const gp = interpolate(panelP, ip, 0.35),
              gq = interpolate(panelQ, iq, 0.35);
            quad(
              localGlass,
              [gp[0], sill, gp[1]],
              [gq[0], sill, gq[1]],
              [gq[0], head, gq[1]],
              [gp[0], head, gp[1]],
              "#ffffff",
              [b[1] - a[1], 0, a[0] - b[0]],
            );
            // Narrow recessed mullions and sills give the ribbon real depth.
            // Their outer face stays behind the structural frontage, so the
            // glass/paint never compete for the same plane at oblique angles.
            if (entity.kind === "pavilion") {
              const mid = (from + to) / 2,
                half = Math.min((definition.wallThickness * 0.14) / length, (to - from) * 0.03);
              wallPrism(
                localFrames,
                interpolate(panelA, panelB, mid - half),
                interpolate(panelA, panelB, mid + half),
                interpolate(ia, ib, mid - half),
                interpolate(ia, ib, mid + half),
                sill,
                head,
                "#d7ded9",
              );
              wallPrism(
                localFrames,
                panelP,
                panelQ,
                ip,
                iq,
                sill,
                sill + definition.wallThickness * 0.18,
                "#b6c1ba",
              );
            }
          } else {
            wallPrism(panel, panelP, panelQ, ip, iq, foundationTop, wallTop, shade);
          }
          wallPrism(localStructure, p, q, ip, iq, 0.09, foundationTop, "#a5abad");
          const trimWidth = Math.min(definition.wallThickness / length, (to - from) * 0.18);
          const framed = entity.kind === "pavilion";
          wallPrism(
            framed ? localFrames : localStructure,
            p,
            interpolate(a, b, from + trimWidth),
            interpolate(structuralInner[i], structuralInner[(i + 1) % polygon.length], from),
            interpolate(
              structuralInner[i],
              structuralInner[(i + 1) % polygon.length],
              from + trimWidth,
            ),
            foundationTop,
            wallTop,
            "#ffffff",
          );
          if (framed) {
            // Fascia sits at the structural face, ahead of recessed panels;
            // it adds depth without an external canopy or a new footprint.
            wallPrism(
              localFrames,
              p,
              q,
              ip,
              iq,
              wallTop - Math.min(definition.eaveHeight * 0.055, 0.2),
              wallTop,
              "#ffffff",
            );
          }
        }
      }
      for (const [start, end] of doors) {
        const p = interpolate(a, b, start),
          q = interpolate(a, b, end);
        const ip = interpolate(ia, ib, start),
          iq = interpolate(ia, ib, end);
        const mainEntry = localAccesses.some(
          (access) => access.main && access.edge === i && access.t >= start && access.t <= end,
        );
        wallPrism(
          localWalls,
          interpolate(panelA, panelB, start),
          interpolate(panelA, panelB, end),
          ip,
          iq,
          openingTop,
          wallTop,
          "#f0f3f2",
        );
        // Dark back at a real recess, with jambs and lintel revealing wall thickness.
        const rp = interpolate(
          structuralInner[i],
          structuralInner[(i + 1) % polygon.length],
          start,
        );
        const rq = interpolate(structuralInner[i], structuralInner[(i + 1) % polygon.length], end);
        quad(
          localGlass,
          [rp[0], foundationTop, rp[1]],
          [rq[0], foundationTop, rq[1]],
          [rq[0], openingTop, rq[1]],
          [rp[0], openingTop, rp[1]],
          "#ffffff",
          [b[1] - a[1], 0, a[0] - b[0]],
        );
        quad(
          localAccent,
          [p[0], 0.008, p[1]],
          [q[0], 0.008, q[1]],
          [iq[0], foundationTop, iq[1]],
          [ip[0], foundationTop, ip[1]],
          "#ffffff",
          [0, 1, 0],
        );
        quad(
          localWalls,
          [p[0], foundationTop, p[1]],
          [rp[0], foundationTop, rp[1]],
          [rp[0], openingTop, rp[1]],
          [p[0], openingTop, p[1]],
          "#dce2e2",
          [b[0] - a[0], 0, b[1] - a[1]],
        );
        quad(
          localWalls,
          [q[0], foundationTop, q[1]],
          [q[0], openingTop, q[1]],
          [rq[0], openingTop, rq[1]],
          [rq[0], foundationTop, rq[1]],
          "#dce2e2",
          [a[0] - b[0], 0, a[1] - b[1]],
        );
        // A small exposed-metal lintel belongs to the already modelled recess;
        // it sits behind the facade and creates no new opening or footprint.
        const mp = interpolate(rp, p, 0.04),
          mq = interpolate(rq, q, 0.04);
        quad(
          localMetal,
          [mp[0], openingTop - definition.wallThickness * 0.5, mp[1]],
          [mq[0], openingTop - definition.wallThickness * 0.5, mq[1]],
          [mq[0], openingTop, mq[1]],
          [mp[0], openingTop, mp[1]],
          "#ffffff",
          [b[1] - a[1], 0, a[0] - b[0]],
        );
        if (mainEntry) {
          // Recessed entrance soffit: it identifies the public side without
          // crossing a shared hall seam or expanding the picking footprint.
          quad(
            localMetal,
            [p[0], openingTop, p[1]],
            [q[0], openingTop, q[1]],
            [rq[0], openingTop, rq[1]],
            [rp[0], openingTop, rp[1]],
            "#ffffff",
            [0, -1, 0],
          );
        }
      }
    }
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const clipped = clipArchitecturePolygon(
        clipArchitecturePolygon(polygon, axis, min + segment.start * extent, true),
        axis,
        min + segment.end * extent,
        false,
      );
      if (clipped.length < 3) continue;
      const height = (p: Point) => roofHeight(segment, p);
      polygonSurface(roof, clipped, height, index % 2 ? "#edf2f5" : "#ffffff");
      polygonSurface(roof, clipped, (p) => height(p) - definition.roofThickness, "#aab2b9", false);
      if (entity.kind === "pavilion") {
        const halfWidth = Math.min(span * 0.012, definition.roofThickness * 0.8),
          lift = definition.roofThickness * 0.12;
        // Folded caps on real peaks only; sawtooth clerestories keep their
        // independent vertical closure. They share the existing roof batch.
        for (const peak of [
          ...(index > 0 &&
          segment.from >= segments[index - 1].to &&
          segment.from > segment.to &&
          segments[index - 1].from < segments[index - 1].to
            ? [segment.start]
            : []),
          ...(index < segments.length - 1 &&
          segment.to >= segments[index + 1].from &&
          segment.to > segment.from &&
          segments[index + 1].to < segments[index + 1].from
            ? [segment.end]
            : []),
        ]) {
          const cap = clipArchitecturePolygon(
            clipArchitecturePolygon(clipped, axis, min + peak * extent - halfWidth, true),
            axis,
            min + peak * extent + halfWidth,
            false,
          );
          if (cap.length >= 3) {
            polygonSurface(roof, cap, (p) => height(p) + lift, "#d4dbdc");
            polygonSurface(picking, cap, (p) => height(p) + lift, "#ffffff");
          }
        }
      }
      // A simple closed silhouette, without facade detail, follows the actual
      // pitches. A box capped at ridge height could select air above an eave.
      polygonSurface(picking, clipped, height, "#ffffff");
      for (let i = 0; i < clipped.length; i++) {
        const a = clipped[i],
          b = clipped[(i + 1) % clipped.length];
        const onBoundary = polygon.some((p, j) => {
          const q = polygon[(j + 1) % polygon.length];
          const crossA = (a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0]);
          const crossB = (b[0] - p[0]) * (q[1] - p[1]) - (b[1] - p[1]) * (q[0] - p[0]);
          return Math.abs(crossA) < 1e-5 && Math.abs(crossB) < 1e-5;
        });
        if (onBoundary) {
          quad(
            picking,
            [a[0], 0.08, a[1]],
            [b[0], 0.08, b[1]],
            [b[0], height(b), b[1]],
            [a[0], height(a), a[1]],
            "#ffffff",
          );
          // Close thickness only on the true outer perimeter. A separate dark
          // slab on each shared ridge/valley caused redundant internal stripes.
          quad(
            roof,
            [a[0], height(a), a[1]],
            [b[0], height(b), b[1]],
            [b[0], height(b) - definition.roofThickness, b[1]],
            [a[0], height(a) - definition.roofThickness, a[1]],
            "#a3adb6",
          );
          quad(
            roofWalls,
            [a[0], definition.eaveHeight - definition.roofThickness, a[1]],
            [b[0], definition.eaveHeight - definition.roofThickness, b[1]],
            [b[0], height(b) - definition.roofThickness, b[1]],
            [a[0], height(a) - definition.roofThickness, a[1]],
            "#f0f3f2",
            [b[1] - a[1], 0, a[0] - b[0]],
          );
        }
      }
      const next = segments[index + 1];
      if (next && Math.abs(next.from - segment.to) > 0.01) {
        const line = min + segment.end * extent;
        const boundary = clipped.filter((p) => Math.abs(p[axis] - line) < 1e-6);
        if (boundary.length >= 2) {
          const a = boundary[0],
            b = boundary[boundary.length - 1];
          const low = definition.eaveHeight + definition.roofRise * Math.min(segment.to, next.from);
          const high =
            definition.eaveHeight + definition.roofRise * Math.max(segment.to, next.from);
          quad(
            picking,
            [a[0], low, a[1]],
            [b[0], low, b[1]],
            [b[0], high, b[1]],
            [a[0], high, a[1]],
            "#ffffff",
          );
          quad(
            roofGlass,
            [a[0], low, a[1]],
            [b[0], low, b[1]],
            [b[0], high, b[1]],
            [a[0], high, a[1]],
            "#ffffff",
          );
          quad(
            roofGlass,
            [a[0], low, a[1]],
            [a[0], high, a[1]],
            [b[0], high, b[1]],
            [b[0], low, b[1]],
            "#ffffff",
          );
        }
      }
    }
    if (entity.id === "indumoveis:support:events") {
      // Interpreted transverse entrance gable, clipped to the authorised
      // existing support area. Its axis crosses the main hall; no origin
      // coordinates, brands, new accesses or commercial records are imported.
      const x0 = frame.width * 0.012,
        x1 = frame.width * 0.34;
      const z0 = frame.depth * 0.385,
        z1 = frame.depth * 0.615,
        zm = frame.depth * 0.5;
      const eave = definition.eaveHeight + definition.roofRise * 0.08;
      const ridge = definition.eaveHeight + definition.roofRise * 0.92;
      const a: Vertex = [x0, eave, z0],
        b: Vertex = [x1, eave, z0];
      const c: Vertex = [x1, ridge, zm],
        d: Vertex = [x0, ridge, zm];
      const e: Vertex = [x1, eave, z1],
        f: Vertex = [x0, eave, z1];
      for (const target of [roof, picking]) {
        quad(target, a, b, c, d, "#ffffff", [0, 1, 0]);
        quad(target, d, c, e, f, "#ffffff", [0, 1, 0]);
      }
      triangle(roofGlass, a, d, f, "#ffffff", [-1, 0, 0]);
      triangle(picking, a, d, f, "#ffffff", [-1, 0, 0]);
    }
    const pickGeometry = geometryFrom(picking, frame);
    geometries.add(pickGeometry);
    const pick = new THREE.Mesh(pickGeometry, pickMaterial);
    pick.userData.entityId = entity.id;
    pick.updateMatrixWorld();
    pickables.push(pick);
    appendGeometry(floors, geometryFrom(localFloor, frame));
    appendGeometry(walls, geometryFrom(localWalls, frame));
    appendGeometry(brick, geometryFrom(localBrick, frame));
    appendGeometry(frames, geometryFrom(localFrames, frame));
    appendGeometry(structure, geometryFrom(localStructure, frame));
    appendGeometry(glazing, geometryFrom(localGlass, frame));
    appendGeometry(metal, geometryFrom(localMetal, frame));
    appendGeometry(accents, geometryFrom(localAccent, frame));
    const roofGroup = new THREE.Group();
    roofGroup.name = `${entity.id}:roof:${definition.profile}:estimated`;
    roofGroup.add(mesh(roof, "paintedSheet", frame));
    if (roofWalls.positions.length) roofGroup.add(mesh(roofWalls, "paintedWall", frame));
    if (roofGlass.positions.length) roofGroup.add(mesh(roofGlass, "glass", frame));
    roofs.set(entity.id, roofGroup);
    group.add(roofGroup);
    visualBounds.set(entity.id, {
      minX: Math.min(...entity.polygon.map((p) => p[0])),
      maxX: Math.max(...entity.polygon.map((p) => p[0])),
      minZ: Math.min(...entity.polygon.map((p) => p[1])),
      maxZ: Math.max(...entity.polygon.map((p) => p[1])),
      height: definition.height,
      roofProfile: definition.profile,
    });
  }
  for (const [name, data, family] of [
    ["floors-contact", floors, "concrete"],
    ["walls", walls, "paintedWall"],
    ["brick-front", brick, "masonryBrick"],
    ["architectural-frames", frames, "architecturalFrame"],
    ["structure-recesses", structure, "concrete"],
    ["entry-glazing", glazing, "glass"],
    ["entry-lintels", metal, "exposedMetal"],
    ["entry-thresholds", accents, "warmAccent"],
  ] as const) {
    if (!data.positions.length) continue;
    const layer = mesh(data, family);
    layer.name = name;
    group.add(layer);
  }
  return {
    group,
    roofs,
    pickables,
    visualBounds,
    textureBytes: sharedSurfaces ? 0 : surfaces.textureBytes,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      if (!sharedSurfaces) surfaces.dispose();
      pickMaterial.dispose();
      group.clear();
    },
  };
}
