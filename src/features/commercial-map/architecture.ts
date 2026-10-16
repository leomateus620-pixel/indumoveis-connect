import * as THREE from "three";
import type { MapEntity, Point } from "./data/territory";

/** Presentation only: no value in this module is a metre or a surveyed elevation. */
export type RoofProfile =
  | "broad-gable"
  | "twin-offset-gables"
  | "northlight-sawtooth"
  | "raised-monitor"
  | "asymmetric-shed"
  | "triple-gable"
  | "support-gable"
  | "support-shed";

const PAVILION_PROFILES: Record<string, RoofProfile> = {
  "indumoveis:pavilion:1": "broad-gable",
  "indumoveis:pavilion:14": "twin-offset-gables",
  "indumoveis:pavilion:12": "northlight-sawtooth",
  "indumoveis:pavilion:8": "raised-monitor",
  "indumoveis:pavilion:13": "asymmetric-shed",
  "indumoveis:pavilion:3": "triple-gable",
};
const SUPPORT_PROFILES: Record<string, RoofProfile> = {
  "indumoveis:support:b7": "support-gable",
  "indumoveis:support:b7-annex-a": "support-shed",
  "indumoveis:support:b7-annex-b": "support-shed",
  "indumoveis:support:cafe": "support-shed",
  "indumoveis:support:bar": "support-gable",
  "indumoveis:support:restaurant": "support-gable",
};

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
type Bucket = { positions: number[]; colors: number[] };

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
  dispose(): void;
}

function localFrame(entity: MapEntity): Frame {
  const origin = entity.polygon[0];
  const next = entity.polygon[1];
  const length = Math.hypot(next[0] - origin[0], next[1] - origin[1]);
  const ux: Point = [(next[0] - origin[0]) / length, (next[1] - origin[1]) / length];
  const uz: Point = [-ux[1], ux[0]];
  const polygon = entity.polygon.map((p): Point => {
    const dx = p[0] - origin[0],
      dz = p[1] - origin[1];
    return [dx * ux[0] + dz * ux[1], dx * uz[0] + dz * uz[1]];
  });
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
  const roofRise =
    span * (profile === "raised-monitor" ? 0.16 : entity.kind === "pavilion" ? 0.11 : 0.085);
  const roofThickness = span * 0.013;
  return {
    profile,
    estimated: true,
    eaveHeight,
    roofRise,
    roofThickness,
    wallThickness: span * 0.014,
    height: eaveHeight + roofRise,
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
    case "raised-monitor":
      return [
        { start: 0, end: 0.36, from: 0, to: 0.12 },
        { start: 0.36, end: 0.5, from: 0.74, to: 1 },
        { start: 0.5, end: 0.64, from: 1, to: 0.74 },
        { start: 0.64, end: 1, from: 0.12, to: 0 },
      ];
    case "asymmetric-shed":
      points = [
        [0, 0.2],
        [0.27, 1],
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

function bucket(): Bucket {
  return { positions: [], colors: [] };
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
  const lines = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    return {
      p: [a[0] - (dz / length) * distance, a[1] + (dx / length) * distance] as Point,
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
  geometry.dispose();
}

/** Static construction, called once per renderer revision. No geometry work in gestures. */
export function buildArchitecture(entities: readonly MapEntity[]): MapArchitecture {
  const group = new THREE.Group();
  group.name = "indumoveis-presentation-architecture";
  const roofs = new Map<string, THREE.Group>();
  const pickables: THREE.Mesh[] = [];
  const visualBounds = new Map<string, ArchitectureBounds>();
  const geometries = new Set<THREE.BufferGeometry>();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const pickMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const floors = bucket(),
    walls = bucket(),
    structure = bucket();
  function mesh(data: Bucket, frame?: Frame) {
    const geometry = geometryFrom(data, frame);
    geometries.add(geometry);
    return new THREE.Mesh(geometry, material);
  }
  for (const entity of entities) {
    const definition = getArchitectureDefinition(entity);
    if (!definition) continue;
    const frame = localFrame(entity);
    const localFloor = bucket(),
      localWalls = bucket(),
      localStructure = bucket(),
      roof = bucket(),
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
    const axis: 0 | 1 = frame.width <= frame.depth ? 0 : 1;
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
    polygonSurface(localFloor, polygon, () => 0.085, "#8a8077");
    polygonSurface(localFloor, inner, () => foundationTop, "#ded6c9");
    const localAccesses = (entity.accesses ?? []).map((access) => {
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
      return nearest;
    });
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const ia = inner[i],
        ib = inner[(i + 1) % polygon.length];
      const panelA = panelOuter[i],
        panelB = panelOuter[(i + 1) % polygon.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
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
          wallPrism(
            localWalls,
            interpolate(panelA, panelB, from),
            interpolate(panelA, panelB, to),
            ip,
            iq,
            foundationTop,
            wallTop,
            bay % 2 ? "#e6e0d7" : "#f0ebe2",
          );
          wallPrism(localStructure, p, q, ip, iq, 0.09, foundationTop, "#87706e");
          const trimWidth = Math.min(definition.wallThickness / length, (to - from) * 0.18);
          wallPrism(
            localStructure,
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
            "#b1a39b",
          );
        }
      }
      for (const [start, end] of doors) {
        const p = interpolate(a, b, start),
          q = interpolate(a, b, end);
        const ip = interpolate(ia, ib, start),
          iq = interpolate(ia, ib, end);
        wallPrism(
          localWalls,
          interpolate(panelA, panelB, start),
          interpolate(panelA, panelB, end),
          ip,
          iq,
          openingTop,
          wallTop,
          "#e6e0d7",
        );
        // Dark back at a real recess, with jambs and lintel revealing wall thickness.
        const rp = interpolate(
          structuralInner[i],
          structuralInner[(i + 1) % polygon.length],
          start,
        );
        const rq = interpolate(structuralInner[i], structuralInner[(i + 1) % polygon.length], end);
        quad(
          localStructure,
          [rp[0], foundationTop, rp[1]],
          [rq[0], foundationTop, rq[1]],
          [rq[0], openingTop, rq[1]],
          [rp[0], openingTop, rp[1]],
          "#493e48",
          [b[1] - a[1], 0, a[0] - b[0]],
        );
        quad(
          localStructure,
          [p[0], foundationTop, p[1]],
          [q[0], foundationTop, q[1]],
          [rq[0], foundationTop, rq[1]],
          [rp[0], foundationTop, rp[1]],
          "#705164",
          [0, 1, 0],
        );
        quad(
          localWalls,
          [p[0], foundationTop, p[1]],
          [rp[0], foundationTop, rp[1]],
          [rp[0], openingTop, rp[1]],
          [p[0], openingTop, p[1]],
          "#b1a39b",
          [b[0] - a[0], 0, b[1] - a[1]],
        );
        quad(
          localWalls,
          [q[0], foundationTop, q[1]],
          [q[0], openingTop, q[1]],
          [rq[0], openingTop, rq[1]],
          [rq[0], foundationTop, rq[1]],
          "#b1a39b",
          [a[0] - b[0], 0, a[1] - b[1]],
        );
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
      polygonSurface(roof, clipped, height, index % 2 ? "#bcb9b0" : "#d1cdc3");
      polygonSurface(roof, clipped, (p) => height(p) - definition.roofThickness, "#918d86", false);
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
            "#797b77",
          );
          quad(
            roof,
            [a[0], definition.eaveHeight - definition.roofThickness, a[1]],
            [b[0], definition.eaveHeight - definition.roofThickness, b[1]],
            [b[0], height(b) - definition.roofThickness, b[1]],
            [a[0], height(a) - definition.roofThickness, a[1]],
            "#c8c0b5",
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
            roof,
            [a[0], low, a[1]],
            [b[0], low, b[1]],
            [b[0], high, b[1]],
            [a[0], high, a[1]],
            "#6c7777",
          );
          quad(
            roof,
            [a[0], low, a[1]],
            [a[0], high, a[1]],
            [b[0], high, b[1]],
            [b[0], low, b[1]],
            "#6c7777",
          );
        }
      }
    }
    const pickGeometry = geometryFrom(picking, frame);
    geometries.add(pickGeometry);
    const pick = new THREE.Mesh(pickGeometry, pickMaterial);
    pick.userData.entityId = entity.id;
    pick.updateMatrixWorld();
    pickables.push(pick);
    appendGeometry(floors, geometryFrom(localFloor, frame));
    appendGeometry(walls, geometryFrom(localWalls, frame));
    appendGeometry(structure, geometryFrom(localStructure, frame));
    const roofGroup = new THREE.Group();
    roofGroup.name = `${entity.id}:roof:${definition.profile}:estimated`;
    roofGroup.add(mesh(roof, frame));
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
  for (const [name, data] of [
    ["floors-contact", floors],
    ["walls", walls],
    ["structure-recesses", structure],
  ] as const) {
    if (!data.positions.length) continue;
    const layer = mesh(data);
    layer.name = name;
    group.add(layer);
  }
  return {
    group,
    roofs,
    pickables,
    visualBounds,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
      pickMaterial.dispose();
      group.clear();
    },
  };
}
