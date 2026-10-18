import * as THREE from "three";
import type { MapEntity, Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { isPedestrianRoad } from "./pavement";
import { markRoadLanes } from "./roadGeometry";
import type { SurfaceMaterials } from "./surfaceMaterials";

const rect = (x0: number, z0: number, x1: number, z1: number): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

/** Subtract convex blockers once, preserving the exact slanted source edges.
 * Each outside fragment is emitted when it leaves a clipping half plane, so
 * fragments never overlap. Concave blockers are triangulated by the caller. */
export function subtractGround(subject: Point[], blocker: Point[]): Point[][] {
  const orientation = Math.sign(signedPolygonArea(blocker));
  let inside = subject;
  const result: Point[][] = [];
  for (let i = 0; i < blocker.length && inside.length; i++) {
    const a = blocker[i],
      b = blocker[(i + 1) % blocker.length];
    const distance = (p: Point) =>
      orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const positive: Point[] = [],
      negative: Point[] = [];
    for (let j = 0; j < inside.length; j++) {
      const p = inside[j],
        q = inside[(j + 1) % inside.length];
      const dp = distance(p),
        dq = distance(q);
      if (dp >= 0) positive.push(p);
      if (dp <= 0) negative.push(p);
      if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
        const t = dp / (dp - dq);
        const crossing: Point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        positive.push(crossing);
        negative.push(crossing);
      }
    }
    if (negative.length >= 3 && Math.abs(signedPolygonArea(negative)) > 1e-7) result.push(negative);
    inside = positive;
  }
  return result;
}

function geometry(polygons: Point[][], y: number) {
  const positions: number[] = [],
    uv: number[] = [];
  for (const polygon of polygons) {
    const triangles = THREE.ShapeUtils.triangulateShape(
      polygon.map(([x, z]) => new THREE.Vector2(x, z)),
      [],
    );
    for (const triangle of triangles) {
      const vertices = triangle.map((i) => polygon[i]);
      if (signedPolygonArea(vertices) > 0) vertices.reverse();
      for (const [x, z] of vertices) {
        positions.push(x, y, z);
        uv.push(x / 2.8, z / 2.8);
      }
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3),
  );
  result.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  result.computeVertexNormals();
  result.computeBoundingSphere();
  return result;
}

function properCrossing(a: Point, b: Point, c: Point, d: Point) {
  const side = (p: Point, q: Point, r: Point) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return side(a, b, c) * side(a, b, d) < -1e-12 && side(c, d, a) * side(c, d, b) < -1e-12;
}

function edgesCross(a: Point[], b: Point[]) {
  return a.some((p, i) =>
    b.some((q, j) => properCrossing(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])),
  );
}

/** Source-only medial cross sections retain skewed La Paz and Brasília's bend. */
function roadMedialPath(polygon: Point[]) {
  const bounds = polygonBounds(polygon),
    axis = bounds.maxX - bounds.minX > bounds.maxY - bounds.minY ? 0 : 1;
  const other = 1 - axis,
    sorted = [...new Set(polygon.map((p) => p[axis]))].sort((a, b) => a - b);
  const levels = sorted.flatMap((v, i) => (i ? [(sorted[i - 1] + v) / 2, v] : [v]));
  const start = sorted[0],
    end = sorted[sorted.length - 1],
    inset = Math.min(0.02, (end - start) / 100);
  levels[0] = start + inset;
  levels[levels.length - 1] = end - inset;
  const sections = levels.flatMap((level) => {
    const hits = polygon
      .flatMap((p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        if ((p[axis] <= level && q[axis] > level) || (q[axis] <= level && p[axis] > level))
          return [p[other] + ((q[other] - p[other]) * (level - p[axis])) / (q[axis] - p[axis])];
        return [];
      })
      .sort((a, b) => a - b);
    let interval: [number, number] | undefined;
    for (let i = 0; i + 1 < hits.length; i += 2)
      if (!interval || hits[i + 1] - hits[i] > interval[1] - interval[0])
        interval = [hits[i], hits[i + 1]];
    if (!interval) return [];
    const point: Point =
      axis === 0
        ? [level, (interval[0] + interval[1]) / 2]
        : [(interval[0] + interval[1]) / 2, level];
    return [{ point, width: interval[1] - interval[0] }];
  });
  const widths = sections.map((s) => s.width).sort((a, b) => a - b);
  return { path: sections.map((s) => s.point), width: widths[Math.floor(widths.length / 2)] ?? 0 };
}

/** Paint only: the authored road and pavement union are never replaced or widened. */
export function deriveCommercialLanePaint(entities: readonly MapEntity[]) {
  const roads = entities.filter((e) => e.kind === "road" && !isPedestrianRoad(e));
  return roads
    .filter((e) => !["indumoveis:road:benvenuto", "indumoveis:road:imigrantes"].includes(e.id))
    .map((road) => {
      const medial = roadMedialPath(road.polygon);
      const markings = markRoadLanes(medial.path, medial.width, {
        edges: false,
        lineWidth: 0.045,
        dashLength: 1.35,
        dashGap: 1.15,
        arrowSpacing: 15,
        arrowLength: Math.min(2, medial.width * 0.74),
      });
      const valid = (paint: Point[]) =>
        paint.length >= 3 &&
        paint.every((p) => pointInPolygon(p, road.polygon)) &&
        !edgesCross(paint, road.polygon) &&
        !roads.some(
          (other) =>
            other !== road &&
            (paint.some((p) => pointInPolygon(p, other.polygon)) ||
              other.polygon.some((p) => pointInPolygon(p, paint)) ||
              edgesCross(paint, other.polygon)),
        );
      return {
        sourceId: road.id,
        path: medial.path,
        width: medial.width,
        laneWidth: markings.laneWidth,
        centerDashes: markings.centerDashes.filter(valid),
        directionArrows: markings.directionArrows.filter(valid),
      };
    });
}

/** Presentation aprons and white parking paint from the satellite's functional
 * arrangement, not a surveyed parking inventory. Never modifies source roads. */
export function deriveParkDetails(entities: readonly MapEntity[]) {
  const laneSources = deriveCommercialLanePaint(entities),
    lanePaint = laneSources.flatMap((s) => s.centerDashes),
    laneArrows = laneSources.flatMap((s) => s.directionArrows);
  const avenue = entities.find((e) => e.id === "indumoveis:road:benvenuto");
  if (!avenue)
    return {
      concrete: [] as Point[][],
      paint: [] as Point[][],
      joints: [] as Point[][],
      lanePaint,
      laneArrows,
      laneSources,
    };
  const av = polygonBounds(avenue.polygon);
  const candidates: Point[][] = [rect(av.minX + 0.05, av.minY - 1.7, av.maxX - 0.3, av.minY - 0.1)];
  const argentina = entities.find((e) => e.id === "indumoveis:road:argentina");
  const street = argentina ? polygonBounds(argentina.polygon) : undefined;
  for (const building of entities.filter((e) => e.kind === "pavilion")) {
    const b = polygonBounds(building.polygon);
    if (b.minY < 67) continue;
    const front = street && b.maxX > street.minX ? street.maxY + 0.04 : b.minY - 1.15;
    if (b.minY - front > 0.08)
      candidates.push(rect(b.minX + 0.03, front, b.maxX - 0.03, b.minY - 0.03));
    candidates.push(rect(b.minX - 0.55, b.minY, b.minX - 0.03, b.maxY));
    candidates.push(rect(b.maxX + 0.03, b.minY, b.maxX + 0.55, b.maxY));
  }
  let concrete = candidates;
  for (const entity of entities) {
    const b = polygonBounds(entity.polygon);
    const triangles = THREE.ShapeUtils.triangulateShape(
      entity.polygon.map(([x, z]) => new THREE.Vector2(x, z)),
      [],
    );
    for (const triangle of triangles) {
      const blocker = triangle.map((i) => entity.polygon[i]);
      concrete = concrete.flatMap((cell) => {
        const c = polygonBounds(cell);
        return c.maxX <= b.minX || c.minX >= b.maxX || c.maxY <= b.minY || c.minY >= b.maxY
          ? [cell]
          : subtractGround(cell, blocker);
      });
    }
  }
  const portals = entities.flatMap((e) => e.accesses ?? []).map((p) => p[0]);
  const paint: Point[][] = [];
  for (let x = av.minX + 0.7; x < av.maxX - 1; x += 1.45) {
    if (portals.some((p) => Math.abs(p - x) < 1.1)) continue;
    const bay: Point[] = [
      [x, av.minY + 0.1],
      [x + 0.045, av.minY + 0.1],
      [x + 0.52, av.minY + 0.86],
      [x + 0.475, av.minY + 0.86],
    ];
    if (bay.every((p) => pointInPolygon(p, avenue.polygon))) paint.push(bay);
  }
  const joints: Point[][] = [];
  for (let x = av.minX + 3; x < av.maxX - 1; x += 3.6) {
    const joint = rect(x, av.minY - 1.66, x + 0.014, av.minY - 0.14);
    if (joint.every((p) => concrete.some((c) => pointInPolygon(p, c)))) joints.push(joint);
  }
  return { concrete, paint, joints, lanePaint, laneArrows, laneSources };
}

export function createParkDetails(entities: readonly MapEntity[], surfaces: SurfaceMaterials) {
  const topology = deriveParkDetails(entities),
    group = new THREE.Group();
  group.name = "indumoveis-park-surface-details";
  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const jointMaterial = new THREE.MeshBasicMaterial({ color: "#929b94", depthWrite: false });
  const laneMaterial = new THREE.MeshStandardMaterial({
    color: "#c7b46c",
    roughness: 0.96,
    metalness: 0,
    depthWrite: false,
  });
  owned.push(jointMaterial, laneMaterial);
  for (const [polygons, y, material, name] of [
    [topology.concrete, -0.009, surfaces.materials.concrete, "indumoveis-pavilion-aprons"],
    [topology.paint, -0.008, surfaces.materials.whitePaint, "indumoveis-parking-paint"],
    [topology.joints, -0.006, jointMaterial, "indumoveis-concrete-joints"],
    [topology.lanePaint, -0.007, laneMaterial, "indumoveis-commercial-lane-paint"],
    [
      topology.laneArrows,
      -0.007,
      surfaces.materials.whitePaint,
      "indumoveis-commercial-direction-arrows",
    ],
  ] as const) {
    const shape = geometry(polygons as Point[][], y);
    owned.push(shape);
    const mesh = new THREE.Mesh(shape, material);
    mesh.name = name;
    mesh.raycast = () => {};
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  return {
    group,
    topology,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const item of owned) item.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}

/** Narrow status colour lives inside the authored lot; the centre stays green. */
export function lotStatusBands(polygon: Point[], width = 0.28): Point[][] {
  const sign = Math.sign(signedPolygonArea(polygon));
  return polygon.flatMap((a, i) => {
    const b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz);
    if (len < width * 3) return [];
    const nx = (-dz / len) * sign,
      nz = (dx / len) * sign,
      tx = dx / len,
      tz = dz / len;
    const band: Point[] = [
      [a[0] + tx * width + nx * 0.02, a[1] + tz * width + nz * 0.02],
      [b[0] - tx * width + nx * 0.02, b[1] - tz * width + nz * 0.02],
      [b[0] - tx * width + nx * width, b[1] - tz * width + nz * width],
      [a[0] + tx * width + nx * width, a[1] + tz * width + nz * width],
    ];
    return band.every((p) => pointInPolygon(p, polygon)) ? [band] : [];
  });
}
