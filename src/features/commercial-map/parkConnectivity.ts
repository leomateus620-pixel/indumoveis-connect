import { ShapeUtils, Vector2 } from "three";
import type { Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { derivePavement } from "./pavement";
import {
  deriveParkDetails,
  equipmentEntry,
  firstRoadDistance,
  subtractGround,
} from "./parkDetails";
import { getPavilionPresentation } from "./architectureOrientation";
import { deriveUrbanRoads } from "./urbanLayout";
import { URBAN_REFERENCE } from "./urbanReference";
import { deriveRoadRibbon } from "./roadGeometry";
import { buildSurfaceConnectivityGrid } from "./surfaceConnectivityGrid";
import {
  PARK_CORE_ENTITIES,
  PARK_GATES,
  PARK_PHYSICAL_BLOCKS,
  PARK_RENDER_ENTITIES,
  PERMANENT_PARK_LANDMARKS,
  ARENA_APPROACH_POLYGONS,
} from "./permanentParkLayout";

/** Drawing-unit validation, not surveyed clearance or an end-user routing API.
 * A portal must have positive usable length; touching bounds or one corner is
 * insufficient. Exact boundary intervals cover the centreline and both sides
 * of the route, including gaps smaller than a former fixed sample step. */
export const PARK_CONNECTIVITY_CRITERIA = {
  minimumPortalWidth: 0.12,
  /** Historical sampling resolution, retained as diagnostic provenance only.
   * Current coverage is analytic and never depends on this spacing. */
  sampleStep: 0.08,
  routeHalfWidth: 0.035,
  facadeProbe: 0.04,
  coverageCheck:
    "Analytic boundary intervals on centre and both lateral paths; no fixed sampling step may skip a floor gap.",
} as const;

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const centre = (polygon: readonly Point[]): Point => [
  polygon.reduce((s, p) => s + p[0], 0) / polygon.length,
  polygon.reduce((s, p) => s + p[1], 0) / polygon.length,
];

function excludeVolumes(polygons: readonly Point[][], blockers: readonly Point[][]) {
  const convex = (polygon: readonly Point[]) => {
    let sign = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        c = polygon[(i + 2) % polygon.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-9) continue;
      if (sign && sign !== Math.sign(cross)) return false;
      sign = Math.sign(cross);
    }
    return true;
  };
  let cells = polygons.flatMap((polygon) =>
    convex(polygon)
      ? [polygon]
      : ShapeUtils.triangulateShape(
          polygon.map((p) => new Vector2(...p)),
          [],
        ).map((triangle) => triangle.map((i) => polygon[i])),
  );
  for (const blocker of blockers) {
    for (const triangle of ShapeUtils.triangulateShape(
      blocker.map((p) => new Vector2(...p)),
      [],
    )) {
      const convex = triangle.map((i) => blocker[i]);
      const b = polygonBounds(convex);
      cells = cells.flatMap((cell) => {
        const c = polygonBounds(cell);
        return c.maxX <= b.minX || c.minX >= b.maxX || c.maxY <= b.minY || c.minY >= b.maxY
          ? [cell]
          : subtractGround(cell, convex);
      });
    }
  }
  return cells;
}

export function sampleSurfacePath(
  path: readonly Point[],
  surfaces: readonly Point[][],
  options: {
    step?: number;
    halfWidth?: number;
    contains?: (point: Point) => boolean;
    boundaryCandidates?: (a: Point, b: Point) => readonly Point[][];
  } = {},
): { supported: boolean; firstGap?: Point } {
  const half = options.halfWidth ?? PARK_CONNECTIVITY_CRITERIA.routeHalfWidth;
  const bounds = options.contains ? [] : surfaces.map(polygonBounds);
  const contains =
    options.contains ??
    ((p: Point) =>
      surfaces.some((surface, index) => {
        const b = bounds[index];
        return (
          p[0] >= b.minX - 1e-8 &&
          p[0] <= b.maxX + 1e-8 &&
          p[1] >= b.minY - 1e-8 &&
          p[1] <= b.maxY + 1e-8 &&
          pointInPolygon(p, surface)
        );
      }));
  const uncovered = path.find((point) => !contains(point));
  if (uncovered) return { supported: false, firstGap: uncovered };
  const boundaryBounds = options.boundaryCandidates ? [] : surfaces.map(polygonBounds);
  const candidates =
    options.boundaryCandidates ??
    ((a: Point, b: Point) =>
      surfaces.filter((_, i) => {
        const c = boundaryBounds[i];
        return (
          Math.max(a[0], b[0]) >= c.minX - 1e-8 &&
          Math.min(a[0], b[0]) <= c.maxX + 1e-8 &&
          Math.max(a[1], b[1]) >= c.minY - 1e-8 &&
          Math.min(a[1], b[1]) <= c.maxY + 1e-8
        );
      }));
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = distance(a, b);
    if (length < 1e-9) continue;
    const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    for (const offset of [-half, 0, half]) {
      const start: Point = [a[0] + normal[0] * offset, a[1] + normal[1] * offset],
        end: Point = [b[0] + normal[0] * offset, b[1] + normal[1] * offset];
      if (!contains(start)) return { supported: false, firstGap: start };
      if (!contains(end)) return { supported: false, firstGap: end };
      const dx = end[0] - start[0],
        dz = end[1] - start[1],
        cuts = [0, 1];
      for (const polygon of candidates(start, end))
        polygon.forEach((p, j) => {
          const q = polygon[(j + 1) % polygon.length],
            ex = q[0] - p[0],
            ez = q[1] - p[1],
            rx = p[0] - start[0],
            rz = p[1] - start[1],
            denominator = dx * ez - dz * ex;
          if (Math.abs(denominator) > 1e-12) {
            const t = (rx * ez - rz * ex) / denominator,
              u = (rx * dz - rz * dx) / denominator;
            if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) cuts.push(t);
          } else if (Math.abs(rx * dz - rz * dx) < 1e-9) {
            for (const v of [p, q]) {
              const t = ((v[0] - start[0]) * dx + (v[1] - start[1]) * dz) / (length * length);
              if (t > 0 && t < 1) cuts.push(t);
            }
          }
        });
      cuts.sort((a, b) => a - b);
      // Classification is constant between consecutive boundary crossings.
      // Testing each open interval catches gaps smaller than a sample step,
      // including the subcell gaps that a raster/grid alone cannot certify.
      for (let j = 1; j < cuts.length; j++) {
        if (cuts[j] - cuts[j - 1] < 1e-10) continue;
        const t = (cuts[j] + cuts[j - 1]) / 2,
          p: Point = [start[0] + dx * t, start[1] + dz * t];
        if (!contains(p)) return { supported: false, firstGap: p };
      }
    }
  }
  return { supported: true };
}

function convexIntersection(subject: readonly Point[], clip: readonly Point[]): Point[] {
  const sign = Math.sign(signedPolygonArea(clip));
  let polygon = [...subject];
  for (let i = 0; i < clip.length && polygon.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length];
    const side = (p: Point) =>
      sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const next: Point[] = [];
    polygon.forEach((p, j) => {
      const q = polygon[(j + 1) % polygon.length],
        dp = side(p),
        dq = side(q);
      if (dp >= -1e-8) next.push(p);
      if ((dp > 1e-8 && dq < -1e-8) || (dp < -1e-8 && dq > 1e-8)) {
        const t = dp / (dp - dq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    polygon = next.filter((p, j) => !j || distance(p, next[j - 1]) > 1e-8);
  }
  return polygon;
}

/** Convex pieces represent exactly the rendered surface union, without
 * repeatedly decomposing the thousands of already derived pavement cells.
 * Only an actual intersection or shared boundary of useful length joins
 * pieces. Paths traverse shared portals inside those convex pieces; every final
 * path is also verified by exact boundary intervals on the complete union. */
export function buildSurfaceNetwork(
  input: readonly Point[][],
  options: {
    minimumPortalWidth?: number;
    blockers?: readonly Point[][];
    nonOverlappingInputCount?: number;
  } = {},
) {
  const partitionedInputCount = options.nonOverlappingInputCount ?? 0;
  const partitioned = excludeVolumes(input.slice(0, partitionedInputCount), options.blockers ?? []);
  const surfaces = [
    ...partitioned,
    ...excludeVolumes(input.slice(partitionedInputCount), options.blockers ?? []),
  ];
  const cells = surfaces;
  const bounds = cells.map(polygonBounds);
  const adjacency = cells.map(() => [] as { cell: number; portal: Point }[]);
  const minimum = options.minimumPortalWidth ?? PARK_CONNECTIVITY_CRITERIA.minimumPortalWidth;
  // Spatial buckets only select pairs to inspect. Connectivity still requires
  // polygon intersection; bucket/bounds adjacency never creates a graph edge.
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < cells.length; i++) {
    const box = bounds[i];
    for (let x = Math.floor((box.minX - 1e-8) / 8); x <= Math.floor((box.maxX + 1e-8) / 8); x++)
      for (let z = Math.floor((box.minY - 1e-8) / 8); z <= Math.floor((box.maxY + 1e-8) / 8); z++) {
        const key = `${x}:${z}`,
          bucket = buckets.get(key) ?? [];
        bucket.push(i);
        buckets.set(key, bucket);
      }
  }
  const locateAll = (p: Point) =>
    (buckets.get(`${Math.floor(p[0] / 8)}:${Math.floor(p[1] / 8)}`) ?? []).filter((i) => {
      const b = bounds[i];
      return (
        p[0] >= b.minX - 1e-8 &&
        p[0] <= b.maxX + 1e-8 &&
        p[1] >= b.minY - 1e-8 &&
        p[1] <= b.maxY + 1e-8 &&
        pointInPolygon(p, cells[i])
      );
    });
  const contains = (p: Point) => locateAll(p).length > 0;
  const clear = (p: Point) =>
    Array.from({ length: 16 }, (_, j): Point => [
      p[0] + Math.cos((j * Math.PI) / 8) * PARK_CONNECTIVITY_CRITERIA.routeHalfWidth,
      p[1] + Math.sin((j * Math.PI) / 8) * PARK_CONNECTIVITY_CRITERIA.routeHalfWidth,
    ]).every(contains);
  const candidates = new Map<number, Set<number>>();
  const pair = (a: number, b: number) => {
    const low = Math.min(a, b),
      high = Math.max(a, b),
      set = candidates.get(low) ?? new Set<number>();
    if (low !== high) set.add(high);
    candidates.set(low, set);
  };
  // Prepared pavement cells are a partition. Their neighbours share an actual
  // edge; testing every overlapping triangle AABB creates millions of false
  // candidates because Earcut triangles can be long and thin. Match edge-line
  // intervals first, then retain the same polygon intersection narrow phase.
  const lines = new Map<
    string,
    { direction: Point; segments: { cell: number; low: number; high: number }[] }
  >();
  for (let cell = 0; cell < partitioned.length; cell++)
    cells[cell].forEach((a, index) => {
      const b = cells[cell][(index + 1) % cells[cell].length],
        length = distance(a, b);
      if (length < 1e-8) return;
      let dx = (b[0] - a[0]) / length,
        dz = (b[1] - a[1]) / length;
      if (dx < -1e-8 || (Math.abs(dx) < 1e-8 && dz < 0)) {
        dx = -dx;
        dz = -dz;
      }
      const c = -dz * a[0] + dx * a[1],
        key = `${dx.toFixed(6)}:${dz.toFixed(6)}:${c.toFixed(5)}`;
      const line = lines.get(key) ?? { direction: [dx, dz] as Point, segments: [] };
      const p = a[0] * line.direction[0] + a[1] * line.direction[1],
        q = b[0] * line.direction[0] + b[1] * line.direction[1],
        low = Math.min(p, q),
        high = Math.max(p, q);
      for (const previous of line.segments)
        if (
          previous.cell !== cell &&
          Math.min(high, previous.high) - Math.max(low, previous.low) > 1e-8
        )
          pair(previous.cell, cell);
      line.segments.push({ cell, low, high });
      lines.set(key, line);
    });
  // Only additional overlapping owners (external approaches, stairs/plazas)
  // need a broad overlap query against the complete surface partition.
  for (let cell = partitioned.length; cell < cells.length; cell++) {
    const box = bounds[cell],
      seen = new Set<number>();
    for (let x = Math.floor((box.minX - 1e-8) / 8); x <= Math.floor((box.maxX + 1e-8) / 8); x++)
      for (let z = Math.floor((box.minY - 1e-8) / 8); z <= Math.floor((box.maxY + 1e-8) / 8); z++)
        for (const index of buckets.get(`${x}:${z}`) ?? []) if (index < cell) seen.add(index);
    for (const index of seen) pair(index, cell);
  }
  for (let a = 0; a < cells.length; a++) {
    const candidatesByCell = candidates.get(a) ?? [];
    for (const b of candidatesByCell) {
      const ba = bounds[a],
        bb = bounds[b];
      if (
        ba.maxX < bb.minX - 1e-8 ||
        ba.minX > bb.maxX + 1e-8 ||
        ba.maxY < bb.minY - 1e-8 ||
        ba.minY > bb.maxY + 1e-8
      )
        continue;
      const intersection = convexIntersection(cells[a], cells[b]);
      if (!intersection.length) continue;
      let extent = 0;
      let span: [Point, Point] = [intersection[0], intersection[0]];
      for (const p of intersection)
        for (const q of intersection)
          if (distance(p, q) > extent) {
            extent = distance(p, q);
            span = [p, q];
          }
      // Earcut subdivisions are not physical doorways. A short internal
      // triangulation edge can lie in the middle of a broad street. Keep the
      // edge only when the complete surface union supports useful clearance;
      // minimum opening width still applies between independent owners.
      const partitionNeighbour = a < partitioned.length && b < partitioned.length;
      if (extent < (partitionNeighbour ? 1e-8 : minimum)) continue;
      const middle =
        Math.abs(signedPolygonArea(intersection)) < 1e-8
          ? ([(span[0][0] + span[1][0]) / 2, (span[0][1] + span[1][1]) / 2] as Point)
          : centre(intersection);
      const candidates: Point[] = [middle];
      if (Math.abs(signedPolygonArea(intersection)) < 1e-8) {
        // A long common edge can border a building along only part of its
        // length. Its midpoint alone must not hide a useful opening elsewhere.
        for (let level = 2; level <= 32; level *= 2)
          for (let k = 1; k < level; k += 2) {
            const t = k / level;
            candidates.push([
              span[0][0] + (span[1][0] - span[0][0]) * t,
              span[0][1] + (span[1][1] - span[0][1]) * t,
            ]);
          }
      } else {
        for (const vertex of intersection)
          candidates.push([(middle[0] + vertex[0]) / 2, (middle[1] + vertex[1]) / 2]);
      }
      let portal: Point | undefined,
        bestClearance = -1;
      // Mesh-edge midpoints have no physical meaning. Prefer the candidate
      // deepest inside the complete union, so a broad bend is not rejected
      // because an Earcut diagonal happens to put its midpoint near the curb.
      for (const candidate of candidates.slice(0, 7)) {
        if (!clear(candidate)) continue;
        let clearance = 0;
        for (const radius of [0.14, 0.35, 0.7]) {
          if (
            !Array.from({ length: 8 }, (_, j): Point => [
              candidate[0] + Math.cos((j * Math.PI) / 4) * radius,
              candidate[1] + Math.sin((j * Math.PI) / 4) * radius,
            ]).every(contains)
          )
            break;
          clearance++;
        }
        if (clearance > bestClearance) {
          portal = candidate;
          bestClearance = clearance;
        }
        if (clearance === 3) break;
      }
      if (!portal) continue;
      adjacency[a].push({ cell: b, portal });
      adjacency[b].push({ cell: a, portal });
    }
  }
  const components = cells.map(() => -1);
  let componentCount = 0;
  for (let i = 0; i < cells.length; i++) {
    if (components[i] >= 0) continue;
    const queue = [i];
    components[i] = componentCount;
    for (let j = 0; j < queue.length; j++)
      for (const next of adjacency[queue[j]]) {
        if (components[next.cell] >= 0) continue;
        components[next.cell] = componentCount;
        queue.push(next.cell);
      }
    componentCount++;
  }
  const locate = (p: Point) => locateAll(p)[0] ?? -1;
  const edgeClearance = new Map<string, boolean>();
  const portalClearance = new Map<string, boolean>();
  const supported = (path: Point[]) => sampleSurfacePath(path, surfaces, { contains }).supported;
  const trace = (from: Point, to: Point, onGap?: (point: Point) => void): Point[] | null => {
    if (supported([from, to])) return [from, to];
    const starts = locateAll(from);
    const ends = new Set(locateAll(to));
    if (!starts.length || !ends.size) return null;
    const previous = new Map<string, string | null>();
    const states = new Map<string, { cell: number; fromCell: number; entry: Point }>();
    const queue = starts.map((cell) => `${cell}:-1`);
    for (const cell of starts) {
      const key = `${cell}:-1`;
      states.set(key, { cell, fromCell: -1, entry: from });
      previous.set(key, null);
    }
    let end: string | undefined;
    for (let i = 0; i < queue.length && end === undefined; i++) {
      const current = states.get(queue[i])!;
      if (ends.has(current.cell) && supported([current.entry, to])) {
        end = queue[i];
        break;
      }
      for (const next of adjacency[current.cell]) {
        if (next.cell === current.fromCell) continue;
        const stateKey = `${next.cell}:${current.cell}`;
        if (previous.has(stateKey)) continue;
        const portalKey = `${Math.min(current.cell, next.cell)}:${Math.max(current.cell, next.cell)}`;
        if (!portalClearance.has(portalKey)) {
          portalClearance.set(
            portalKey,
            Array.from({ length: 16 }, (_, j): Point => [
              next.portal[0] +
                Math.cos((j * Math.PI) / 8) * PARK_CONNECTIVITY_CRITERIA.routeHalfWidth,
              next.portal[1] +
                Math.sin((j * Math.PI) / 8) * PARK_CONNECTIVITY_CRITERIA.routeHalfWidth,
            ]).every(contains),
          );
        }
        if (!portalClearance.get(portalKey)) {
          if (onGap) {
            const gap = Array.from({ length: 16 }, (_, j): Point => [
              next.portal[0] +
                Math.cos((j * Math.PI) / 8) * PARK_CONNECTIVITY_CRITERIA.routeHalfWidth,
              next.portal[1] +
                Math.sin((j * Math.PI) / 8) * PARK_CONNECTIVITY_CRITERIA.routeHalfWidth,
            ]).find((point) => !contains(point));
            if (gap) onGap(gap);
          }
          continue;
        }
        const turnKey =
          current.fromCell < 0
            ? undefined
            : `${current.cell}:${Math.min(current.fromCell, next.cell)}:${Math.max(current.fromCell, next.cell)}`;
        if (turnKey && !edgeClearance.has(turnKey))
          edgeClearance.set(turnKey, supported([current.entry, next.portal]));
        if (turnKey ? !edgeClearance.get(turnKey) : !supported([current.entry, next.portal])) {
          if (onGap) {
            const gap = sampleSurfacePath([current.entry, next.portal], surfaces, {
              contains,
            }).firstGap;
            if (gap) onGap(gap);
          }
          continue;
        }
        previous.set(stateKey, queue[i]);
        states.set(stateKey, { cell: next.cell, fromCell: current.cell, entry: next.portal });
        queue.push(stateKey);
      }
    }
    if (end === undefined) return null;
    const reverse: Point[] = [to];
    let state: string | null = end;
    while (state !== null) {
      reverse.push(states.get(state)!.entry);
      state = previous.get(state)!;
    }
    return reverse.reverse();
  };
  return { cells, surfaces, components, componentCount, locate, trace, contains };
}

export type ParkConnectivityAnchor = {
  id: string;
  kind: "gate" | "pavilion" | "equipment" | "block";
  name: string;
  points: Point[];
  entranceEstimated?: boolean;
};

function facingMidpoint(polygon: readonly Point[], front: Point): Point {
  const sign = Math.sign(signedPolygonArea(polygon));
  let best = -Infinity,
    point = centre(polygon);
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length],
      length = distance(a, b);
    const alignment = (sign * ((b[1] - a[1]) * front[0] - (b[0] - a[0]) * front[1])) / length;
    const score = alignment > 0.94 ? 1000 + length : alignment;
    if (score > best) {
      best = score;
      point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
  });
  return point;
}

export function deriveParkConnectivityAnchors(): ParkConnectivityAnchor[] {
  const gates: ParkConnectivityAnchor[] = PARK_GATES.map((gate) => ({
    id: gate.id,
    kind: "gate",
    name: gate.name,
    points: [gate.point],
  }));
  const pavilions: ParkConnectivityAnchor[] = PARK_CORE_ENTITIES.filter(
    (entity) => entity.kind === "pavilion",
  ).map((entity) => {
    const front = getPavilionPresentation(entity)!;
    return {
      id: entity.id,
      kind: "pavilion",
      name: entity.label,
      points: front.mainEntries.map((p): Point => [
        p[0] + front.frontNormal[0] * PARK_CONNECTIVITY_CRITERIA.facadeProbe,
        p[1] + front.frontNormal[1] * PARK_CONNECTIVITY_CRITERIA.facadeProbe,
      ]),
      entranceEstimated: front.estimatedEntries,
    };
  });
  const equipment: ParkConnectivityAnchor[] = PERMANENT_PARK_LANDMARKS.map((item) => {
    const entry = equipmentEntry(
      item.polygon,
      item.front,
      PARK_RENDER_ENTITIES.filter((e) => e.kind === "road"),
    );
    const p = entry?.point ?? facingMidpoint(item.polygon, item.front),
      front = entry?.normal ?? item.front;
    return {
      id: item.id,
      kind: "equipment",
      name: item.name,
      points: [
        [
          p[0] + front[0] * PARK_CONNECTIVITY_CRITERIA.facadeProbe,
          p[1] + front[1] * PARK_CONNECTIVITY_CRITERIA.facadeProbe,
        ],
      ],
      entranceEstimated: true,
    };
  });
  const blocks: ParkConnectivityAnchor[] = PARK_PHYSICAL_BLOCKS.flatMap((block) =>
    block.referencePieces.map((polygon, piece) => ({
      id: `block:${block.id}${piece ? `:piece:${piece + 1}` : ""}`,
      kind: "block",
      name: `${block.name}${block.referencePieces.length > 1 ? ` · peça física ${piece + 1}` : ""}`,
      // A physical quadra is served at its curb. Internal lot boundaries are
      // not service roads; use the physical outside pieces and the first actual
      // adjacent corridor. The 1.2-unit cap is the registration review tolerance.
      points: polygon
        .map((a, i) => ({ a, i, length: distance(a, polygon[(i + 1) % polygon.length]) }))
        .filter((edge) => edge.length > 0.6)
        .sort((a, b) => b.length - a.length)
        .slice(0, 12)
        .flatMap(({ a, i }) => {
          const b = polygon[(i + 1) % polygon.length],
            length = distance(a, b),
            sign = Math.sign(signedPolygonArea(polygon));
          const normal: Point = [(sign * (b[1] - a[1])) / length, (-sign * (b[0] - a[0])) / length];
          return [0.2, 0.5, 0.8].flatMap((t) => {
            const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const gap = firstRoadDistance(
              p,
              normal,
              PARK_RENDER_ENTITIES.filter((e) => e.kind === "road"),
            );
            return gap !== null && gap <= 1.2
              ? [[p[0] + normal[0] * (gap + 0.12), p[1] + normal[1] * (gap + 0.12)] as Point]
              : [];
          });
        }),
    })),
  );
  return [...gates, ...pavilions, ...equipment, ...blocks];
}

export function auditParkConnectivity() {
  const started = performance.now();
  const pavement = derivePavement(PARK_RENDER_ENTITIES);
  const asphalt = pavement.asphaltCells,
    walks = pavement.walkCells;
  // These are the same external street ribbons and shared avenue band owned by
  // urbanContext. Their inclusion closes a real gate interface, not a shortcut.
  const external = deriveUrbanRoads().map((road) => deriveRoadRibbon(road.path, road.width));
  const avenue = polygonBounds(
    PARK_CORE_ENTITIES.find((entity) => entity.id === "indumoveis:road:benvenuto")!.polygon,
  );
  const imigrantes = polygonBounds(
    PARK_CORE_ENTITIES.find((entity) => entity.id === "indumoveis:road:imigrantes")!.polygon,
  );
  external.push([
    [avenue.minX, avenue.minY],
    [imigrantes.maxX, avenue.minY],
    [imigrantes.maxX, URBAN_REFERENCE.avenueSouth],
    [avenue.minX, URBAN_REFERENCE.avenueSouth],
  ]);
  for (const ring of [URBAN_REFERENCE.roundabout, URBAN_REFERENCE.secondaryJunction]) {
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16,
        b = ((i + 1) * Math.PI) / 16;
      const at = (angle: number, radius: number): Point => [
        ring.center[0] + Math.cos(angle) * radius,
        ring.center[1] + Math.sin(angle) * radius,
      ];
      external.push([
        at(a, ring.centerlineRadius - ring.roadWidth / 2),
        at(a, ring.centerlineRadius + ring.roadWidth / 2),
        at(b, ring.centerlineRadius + ring.roadWidth / 2),
        at(b, ring.centerlineRadius - ring.roadWidth / 2),
      ]);
    }
  }
  const aprons = deriveParkDetails(PARK_RENDER_ENTITIES).concrete;
  const blockers = [
    ...PARK_CORE_ENTITIES.filter(
      (entity) =>
        entity.kind === "lot" ||
        entity.kind === "pavilion" ||
        (entity.kind === "support" && entity.id !== "indumoveis:support:gate-03"),
    ).map((entity) => entity.polygon),
    ...PERMANENT_PARK_LANDMARKS.map((item) => item.polygon),
  ];
  const approaches = Object.values(ARENA_APPROACH_POLYGONS);
  const root = PARK_CORE_ENTITIES.find(
    (entity) => entity.id === "indumoveis:road:argentina",
  )!.anchor;
  const physicalNetwork = (surfaces: Point[][]) => {
    const makeIndex = (polygons: readonly Point[][]) => {
      const bounds = polygons.map(polygonBounds),
        buckets = new Map<string, number[]>();
      bounds.forEach((b, i) => {
        for (let x = Math.floor(b.minX / 8); x <= Math.floor(b.maxX / 8); x++)
          for (let z = Math.floor(b.minY / 8); z <= Math.floor(b.maxY / 8); z++) {
            const key = `${x}:${z}`,
              bucket = buckets.get(key) ?? [];
            bucket.push(i);
            buckets.set(key, bucket);
          }
      });
      return (p: Point) =>
        (buckets.get(`${Math.floor(p[0] / 8)}:${Math.floor(p[1] / 8)}`) ?? []).some((i) => {
          const b = bounds[i];
          return (
            p[0] >= b.minX - 1e-8 &&
            p[0] <= b.maxX + 1e-8 &&
            p[1] >= b.minY - 1e-8 &&
            p[1] <= b.maxY + 1e-8 &&
            pointInPolygon(p, polygons[i])
          );
        });
    };
    const onFloor = makeIndex(surfaces),
      inBuilding = makeIndex(blockers),
      contains = (p: Point) => onFloor(p) && !inBuilding(p);
    const rings = [...surfaces, ...blockers].map((polygon) => ({
      polygon,
      bounds: polygonBounds(polygon),
    }));
    const boundaryCandidates = (a: Point, b: Point) =>
      rings
        .filter(
          ({ bounds: c }) =>
            Math.max(a[0], b[0]) >= c.minX - 1e-8 &&
            Math.min(a[0], b[0]) <= c.maxX + 1e-8 &&
            Math.max(a[1], b[1]) >= c.minY - 1e-8 &&
            Math.min(a[1], b[1]) <= c.maxY + 1e-8,
        )
        .map((ring) => ring.polygon);
    const supported = (path: Point[]) =>
      sampleSurfacePath(path, surfaces, { contains, boundaryCandidates }).supported;
    const park = polygonBounds(
      PARK_RENDER_ENTITIES.filter((e) => e.kind !== "landscape").flatMap((e) => e.polygon),
    );
    // Distant residential no-exit branches are not part of this park access
    // audit. Keep a 12-unit surrounding approach band, containing every gate
    // and the public avenue; clipping the QA extent cannot invent a route.
    const extent = {
      minX: park.minX - 12,
      minY: park.minY - 12,
      maxX: park.maxX + 12,
      maxY: park.maxY + 12,
    };
    const grid = buildSurfaceConnectivityGrid(surfaces, blockers, root, supported, 0.125, extent);
    return {
      surfaces,
      contains,
      boundaryCandidates,
      grid,
      trace: (from: Point, to: Point) => (distance(from, root) < 1e-8 ? grid.trace(to) : null),
    };
  };
  const vehicles = physicalNetwork([...asphalt, ...external]);
  const pedestrians = physicalNetwork([
    ...asphalt,
    ...walks,
    ...aprons,
    ...external,
    ...approaches,
  ]);
  const anchors = deriveParkConnectivityAnchors();
  const results = anchors.map((anchor) => {
    const network = pedestrians;
    const located = anchor.points.filter(network.contains);
    const allEntriesRequired = anchor.kind === "pavilion";
    const paths: Point[][] = [];
    for (const point of located) {
      const route = network.trace(root, point);
      if (route) paths.push(route);
      // A block/equipment needs a real serving access, not repeated tracing
      // to every perimeter sample. Pavilions still validate every main entry.
      if (route && !allEntriesRequired) break;
    }
    const verified =
      !allEntriesRequired || paths.length === anchor.points.length
        ? paths.find(
            (path) =>
              sampleSurfacePath(path, network.surfaces, {
                contains: network.contains,
                boundaryCandidates: network.boundaryCandidates,
              }).supported,
          )
        : undefined;
    const rootComponents = new Set(network.grid.componentAt(root));
    const sameComponent = located.some((point) =>
      network.grid.componentAt(point).some((component) => rootComponents.has(component)),
    );
    const firstUnusable = paths[0]
      ? sampleSurfacePath(paths[0], network.surfaces, {
          contains: network.contains,
          boundaryCandidates: network.boundaryCandidates,
        }).firstGap
      : undefined;
    return {
      ...anchor,
      status: verified
        ? ("connected" as const)
        : !located.length
          ? ("off-surface" as const)
          : !sameComponent
            ? ("separate-component" as const)
            : ("route-clearance-unverified" as const),
      route: verified ?? null,
      firstGap:
        firstUnusable ??
        (!located.length ? anchor.points[0] : !verified ? anchor.points[0] : undefined),
      vehicleConnected:
        anchor.kind === "gate" ? Boolean(vehicles.trace(root, anchor.points[0])) : undefined,
    };
  });
  return {
    preparationMs: performance.now() - started,
    criteria: PARK_CONNECTIVITY_CRITERIA,
    root,
    vehicleComponents: vehicles.grid.componentCount,
    pedestrianComponents: pedestrians.grid.componentCount,
    method:
      "Conservative scanline union grid, eroded one cell, four neighbours; every emitted path analytically partitioned at exact floor/obstacle edge intersections on its centre and both lateral clearance paths. No rendered geometry is generated by the audit.",
    grid: {
      step: pedestrians.grid.step,
      width: pedestrians.grid.width,
      height: pedestrians.grid.height,
      surfaceCells: pedestrians.grid.surfaceCells,
      safeCells: pedestrians.grid.safeCells,
    },
    anchors: results,
    pending: results.filter((anchor) => anchor.status !== "connected"),
    verified: results.filter((anchor) => anchor.status === "connected").length,
  };
}
