import * as THREE from "three";
import type { MapEntity, Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";

/** Drawing proportions only. The source coordinate system is not measured in metres. */
export const PAVEMENT = {
  asphaltElevation: -0.025,
  walkElevation: -0.018,
  paintElevation: -0.012,
  junctionTolerance: 0.025,
  grainTile: 0.75,
  textureSize: 64,
} as const;

const EPSILON = 1e-7;
type Edge = { a: Point; b: Point };
export type PavementEdge = Edge & {
  sourceId: string;
  inward: Point;
  width: number;
};
export type PavementTopology = {
  /** Nonoverlapping trapezoids of the rendered union, not replacement source polygons. */
  asphaltCells: Point[][];
  walkCells: Point[][];
  lateralEdges: PavementEdge[];
  connectorCount: number;
};

const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const interpolate = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const polygonEdges = (polygon: readonly Point[]): Edge[] =>
  polygon.map((a, i) => ({ a, b: polygon[(i + 1) % polygon.length] }));

export function isPedestrianRoad(entity: MapEntity): boolean {
  return (
    entity.id === "indumoveis:road:arvoredo" ||
    entity.id === "indumoveis:road:east-walk-upper" ||
    entity.id === "indumoveis:road:east-walk-lower"
  );
}

/** Intersections include the ends of collinear overlaps; no geographic rounding. */
function splitParameters(edge: Edge, other: Edge): number[] {
  const r = subtract(edge.b, edge.a);
  const s = subtract(other.b, other.a);
  const delta = subtract(other.a, edge.a);
  const denominator = cross(r, s);
  if (Math.abs(denominator) < EPSILON) {
    if (Math.abs(cross(delta, r)) > EPSILON) return [];
    const squared = dot(r, r);
    return [dot(delta, r) / squared, dot(subtract(other.b, edge.a), r) / squared].filter(
      (t) => t >= -EPSILON && t <= 1 + EPSILON,
    );
  }
  const t = cross(delta, s) / denominator;
  const u = cross(delta, r) / denominator;
  return t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON
    ? [Math.max(0, Math.min(1, t))]
    : [];
}

const uniqueSorted = (values: number[]) =>
  values
    .sort((a, b) => a - b)
    .filter((value, index, all) => !index || value - all[index - 1] > EPSILON);

/** Close only subpixel drafting gaps at facing road boundaries. A connector never
 * extends a road past a source edge; commercial polygons remain untouched. */
function junctionConnectors(polygons: readonly Point[][]): Point[][] {
  const directed = polygons.flatMap((polygon, polygonIndex) => {
    const sign = Math.sign(signedPolygonArea(polygon));
    return polygonEdges(polygon).map((edge) => {
      const dx = edge.b[0] - edge.a[0],
        dy = edge.b[1] - edge.a[1];
      const length = Math.hypot(dx, dy);
      return {
        ...edge,
        polygonIndex,
        length,
        direction: [dx / length, dy / length] as Point,
        inward: [(-dy / length) * sign, (dx / length) * sign] as Point,
      };
    });
  });
  const connectors: Point[][] = [];
  for (let i = 0; i < directed.length; i++) {
    const a = directed[i];
    for (let j = i + 1; j < directed.length; j++) {
      const b = directed[j];
      if (
        a.polygonIndex === b.polygonIndex ||
        Math.abs(cross(a.direction, b.direction)) > 1e-5 ||
        dot(a.inward, b.inward) > -0.9999
      )
        continue;
      const separation = dot(subtract(b.a, a.a), a.inward);
      if (separation >= -EPSILON || separation < -PAVEMENT.junctionTolerance) continue;
      const ta = dot(subtract(b.a, a.a), a.direction);
      const tb = dot(subtract(b.b, a.a), a.direction);
      const start = Math.max(0, Math.min(ta, tb));
      const end = Math.min(a.length, Math.max(ta, tb));
      if (end - start < PAVEMENT.junctionTolerance) continue;
      const p = interpolate(a.a, a.b, start / a.length);
      const q = interpolate(a.a, a.b, end / a.length);
      connectors.push([
        p,
        q,
        [q[0] + a.inward[0] * separation, q[1] + a.inward[1] * separation],
        [p[0] + a.inward[0] * separation, p[1] + a.inward[1] * separation],
      ]);
    }
  }
  return connectors;
}

/** Vertical decomposition of a polygon union. Slabs split at every crossing, so
 * each band has linear sides and can be triangulated once without coplanar
 * overlapping meshes, holes at junctions, or an additional clipping dependency. */
export function pavementUnionCells(polygons: readonly Point[][]): Point[][] {
  const edges = polygons.flatMap(polygonEdges);
  const xs = edges.flatMap(({ a }) => [a[0]]);
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++)
      for (const t of splitParameters(edges[i], edges[j]))
        xs.push(interpolate(edges[i].a, edges[i].b, t)[0]);
  const ordered = uniqueSorted(xs);
  const cells: Point[][] = [];
  const ordinate = (edge: Edge, x: number) =>
    edge.a[1] + ((x - edge.a[0]) * (edge.b[1] - edge.a[1])) / (edge.b[0] - edge.a[0]);
  for (let i = 1; i < ordered.length; i++) {
    const x0 = ordered[i - 1],
      x1 = ordered[i],
      middle = (x0 + x1) / 2;
    const intervals: { low: Edge; high: Edge; lowY: number; highY: number }[] = [];
    for (const polygon of polygons) {
      const crossings = polygonEdges(polygon)
        .filter(({ a, b }) => middle > Math.min(a[0], b[0]) && middle < Math.max(a[0], b[0]))
        .sort((a, b) => ordinate(a, middle) - ordinate(b, middle));
      for (let j = 0; j + 1 < crossings.length; j += 2)
        intervals.push({
          low: crossings[j],
          high: crossings[j + 1],
          lowY: ordinate(crossings[j], middle),
          highY: ordinate(crossings[j + 1], middle),
        });
    }
    intervals.sort((a, b) => a.lowY - b.lowY);
    const merged: typeof intervals = [];
    for (const interval of intervals) {
      const previous = merged[merged.length - 1];
      if (!previous || interval.lowY > previous.highY + EPSILON) merged.push({ ...interval });
      else if (interval.highY > previous.highY) {
        previous.high = interval.high;
        previous.highY = interval.highY;
      }
    }
    for (const { low, high } of merged) {
      const cell: Point[] = [
        [x0, ordinate(low, x0)],
        [x1, ordinate(low, x1)],
        [x1, ordinate(high, x1)],
        [x0, ordinate(high, x0)],
      ];
      if (Math.abs(signedPolygonArea(cell)) > EPSILON) cells.push(cell);
    }
  }
  return cells;
}

function roadDimensions(road: MapEntity) {
  const bounds = polygonBounds(road.polygon);
  const width = bounds.maxX - bounds.minX,
    depth = bounds.maxY - bounds.minY;
  return {
    axis: (width > depth ? [1, 0] : [0, 1]) as Point,
    breadth: Math.min(
      width,
      depth,
      ...polygonEdges(road.polygon).map(({ a, b }) => Math.hypot(b[0] - a[0], b[1] - a[1])),
    ),
  };
}

/** White is paint inside exposed lateral asphalt edges. Short transverse ends
 * stay open. The union test removes shared boundaries at T/cross junctions;
 * source accesses and the existing gate make openings in the remaining sides. */
export function derivePavement(entities: readonly MapEntity[]): PavementTopology {
  const roads = entities.filter((entity) => entity.kind === "road");
  const asphalt = roads.filter((entity) => !isPedestrianRoad(entity));
  const polygons = asphalt.map((entity) => entity.polygon);
  const connectors = junctionConnectors(polygons);
  const network = [...polygons, ...connectors];
  const networkEdges = network.flatMap(polygonEdges);
  const inside = (point: Point) => network.some((polygon) => pointInPolygon(point, polygon));
  const portals = entities.flatMap((entity) => [
    ...(entity.accesses ?? []),
    ...(entity.id === "indumoveis:support:gate-03" ? [entity.anchor] : []),
  ]);
  const lateralEdges: PavementEdge[] = [];
  for (const road of asphalt) {
    const sign = Math.sign(signedPolygonArea(road.polygon));
    const { axis, breadth } = roadDimensions(road);
    for (const edge of polygonEdges(road.polygon)) {
      const direction = subtract(edge.b, edge.a);
      const length = Math.hypot(...direction);
      const tangent: Point = [direction[0] / length, direction[1] / length];
      if (Math.abs(dot(tangent, axis)) < 0.65) continue;
      const inward: Point = [-tangent[1] * sign, tangent[0] * sign];
      const cuts = uniqueSorted([
        0,
        1,
        ...networkEdges.flatMap((other) => splitParameters(edge, other)),
      ]);
      const openings = portals.flatMap((portal) => {
        // An access outside this side must not punch an additional hole in the
        // opposite side of the same narrow street.
        if (dot(subtract(portal, edge.a), inward) > EPSILON) return [];
        const t = dot(subtract(portal, edge.a), direction) / (length * length);
        if (t < 0 || t > 1) return [];
        const projected = interpolate(edge.a, edge.b, t);
        if (Math.hypot(...subtract(portal, projected)) > breadth * 1.35) return [];
        const half = Math.min(1.1, breadth * 0.32) / length;
        return [[Math.max(0, t - half), Math.min(1, t + half)]];
      });
      const divided = uniqueSorted([...cuts, ...openings.flat()]);
      for (let i = 1; i < divided.length; i++) {
        const start = divided[i - 1],
          end = divided[i],
          t = (start + end) / 2;
        if (openings.some(([a, b]) => t > a && t < b)) continue;
        const midpoint = interpolate(edge.a, edge.b, t);
        const probe = 1e-5;
        if (
          !inside([midpoint[0] + inward[0] * probe, midpoint[1] + inward[1] * probe]) ||
          inside([midpoint[0] - inward[0] * probe, midpoint[1] - inward[1] * probe])
        )
          continue;
        lateralEdges.push({
          a: interpolate(edge.a, edge.b, start),
          b: interpolate(edge.a, edge.b, end),
          inward,
          sourceId: road.id,
          width: Math.max(0.05, Math.min(0.09, breadth * 0.024)),
        });
      }
    }
  }
  return {
    asphaltCells: pavementUnionCells(network),
    walkCells: pavementUnionCells(roads.filter(isPedestrianRoad).map((entity) => entity.polygon)),
    lateralEdges,
    connectorCount: connectors.length,
  };
}

function surfaceGeometry(polygons: readonly Point[][], elevation: number, textured = false) {
  const positions: number[] = [],
    uvs: number[] = [];
  for (const polygon of polygons) {
    const indices = THREE.ShapeUtils.triangulateShape(
      polygon.map(([x, y]) => new THREE.Vector2(x, y)),
      [],
    );
    for (const [a, b, c] of indices) {
      const points = [polygon[a], polygon[b], polygon[c]];
      const crossY = -cross(subtract(points[1], points[0]), subtract(points[2], points[0]));
      if (crossY < 0) [points[1], points[2]] = [points[2], points[1]];
      for (const [x, y] of points) {
        positions.push(x, elevation, y);
        if (textured) uvs.push(x / PAVEMENT.grainTile, y / PAVEMENT.grainTile);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (textured) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Deterministic small aggregate atlas: low contrast, mipmapped, shared by the
 * complete asphalt network, no shader hooks or runtime canvas texture churn. */
function aggregateTexture() {
  const size = PAVEMENT.textureSize;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 725913;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 240 + ((seed >>> 24) % 13);
    pixels.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  texture.needsUpdate = true;
  return texture;
}

/** Exactly three visible batches. Source-road selection/picking remains with the
 * renderer and its original entities; these derived meshes never own an ID. */
export function createPavement(entities: readonly MapEntity[]) {
  const topology = derivePavement(entities);
  const group = new THREE.Group();
  group.name = "indumoveis-derived-pavement";
  const resources: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  const texture = aggregateTexture();
  resources.push(texture);
  const paint = topology.lateralEdges.map(({ a, b, inward, width }): Point[] => [
    a,
    b,
    [b[0] + inward[0] * width, b[1] + inward[1] * width],
    [a[0] + inward[0] * width, a[1] + inward[1] * width],
  ]);
  const batches = [
    {
      polygons: topology.asphaltCells,
      elevation: PAVEMENT.asphaltElevation,
      material: new THREE.MeshLambertMaterial({ color: "#62676a", map: texture }),
      textured: true,
    },
    {
      polygons: topology.walkCells,
      elevation: PAVEMENT.walkElevation,
      material: new THREE.MeshLambertMaterial({ color: "#d5cec1" }),
    },
    {
      polygons: paint,
      elevation: PAVEMENT.paintElevation,
      material: new THREE.MeshLambertMaterial({ color: "#f2f0e9" }),
    },
  ];
  for (const { polygons, elevation, material, textured } of batches) {
    const geometry = surfaceGeometry(polygons, elevation, textured);
    resources.push(geometry, material);
    group.add(new THREE.Mesh(geometry, material));
  }
  return {
    group,
    resources,
    topology,
    textureBytes: Math.ceil((PAVEMENT.textureSize ** 2 * 4 * 4) / 3),
  };
}
