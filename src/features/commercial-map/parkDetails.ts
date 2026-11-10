import * as THREE from "three";
import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { classifyRoad, isPedestrianRoad, pavementUnionCells } from "./pavement";
import { markRoadLanes } from "./roadGeometry";
import type { SurfaceMaterials } from "./surfaceMaterials";
import { getPavilionPresentation } from "./architectureOrientation";
import { PERMANENT_PARK_LANDMARKS } from "./permanentParkLayout";
import { derivePavilionGround, type PavilionGround } from "./pavilionGround";
import { subtractPolygons } from "./parkGeometry";

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

function geometry(polygons: Point[][], y: number, edgeBottom?: number) {
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
    if (edgeBottom !== undefined) {
      const clockwise = signedPolygonArea(polygon) > 0;
      polygon.forEach((a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        const p = clockwise ? a : b,
          q = clockwise ? b : a;
        for (const v of [
          [p[0], y, p[1]],
          [q[0], y, q[1]],
          [q[0], edgeBottom, q[1]],
          [p[0], y, p[1]],
          [q[0], edgeBottom, q[1]],
          [p[0], edgeBottom, p[1]],
        ]) {
          positions.push(...v);
          uv.push(v[0] / 2.8, v[2] / 2.8);
        }
      });
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

/** First curb on the authored facade normal, using the actual runtime road
 * rings (including their block holes). The old named street is a semantic
 * correspondence, not a second curb after the A2 registration. */
export function firstRoadDistance(origin: Point, normal: Point, roads: readonly MapEntity[]) {
  const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
  let nearest = Infinity;
  for (const road of roads) {
    const contains = (p: Point) =>
      pointInPolygon(p, road.polygon) &&
      !(road.holes ?? []).some((hole) => pointInPolygon(p, hole));
    if (contains(origin)) return 0;
    const hits: number[] = [];
    for (const ring of [road.polygon, ...(road.holes ?? [])])
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length],
          edge: Point = [b[0] - a[0], b[1] - a[1]],
          relative: Point = [a[0] - origin[0], a[1] - origin[1]],
          denominator = cross(normal, edge);
        if (Math.abs(denominator) < 1e-10) return;
        const t = cross(relative, edge) / denominator,
          u = cross(relative, normal) / denominator;
        if (t >= 0 && u >= -1e-8 && u <= 1 + 1e-8) hits.push(t);
      });
    hits.sort((a, b) => a - b);
    for (const t of hits)
      if (contains([origin[0] + normal[0] * (t + 1e-5), origin[1] + normal[1] * (t + 1e-5)])) {
        nearest = Math.min(nearest, t);
        break;
      }
  }
  return Number.isFinite(nearest) ? nearest : null;
}

/** Actual front edge, preferring a substantial face with a clear short entry.
 * Annex recesses must not force a path through the building itself. The point
 * remains an estimated doorway within a verified physical front, not cadastro. */
export function equipmentEntry(
  polygon: readonly Point[],
  front: Point,
  roads: readonly MapEntity[],
) {
  const sign = Math.sign(signedPolygonArea(polygon));
  const candidates = polygon
    .map((a, i) => {
      const b = polygon[(i + 1) % polygon.length],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const normal: Point = [(sign * (b[1] - a[1])) / length, (-sign * (b[0] - a[0])) / length];
      const point: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return {
        a,
        b,
        length,
        normal,
        point,
        alignment: normal[0] * front[0] + normal[1] * front[1],
        gap: firstRoadDistance(point, normal, roads),
      };
    })
    .filter((edge) => edge.length > 0.6 && edge.alignment > 0.94);
  const clear = candidates.filter(
    (edge) =>
      edge.gap !== null &&
      edge.gap <= 4 &&
      Array.from({ length: Math.max(1, Math.ceil(edge.gap / 0.12)) }, (_, i) => {
        const step = ((i + 0.5) * edge.gap!) / Math.max(1, Math.ceil(edge.gap! / 0.12));
        return !pointInPolygon(
          [edge.point[0] + edge.normal[0] * step, edge.point[1] + edge.normal[1] * step],
          polygon,
        );
      }).every(Boolean),
  );
  return (
    clear.sort((a, b) => b.length - a.length)[0] ??
    candidates.sort((a, b) => b.length - a.length)[0]
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

/** Paint only: internal streets never receive arrows or centre dashes. Public
 * Benvenuto/Imigrantes paint has one owner in urbanContext, together with their
 * street approaches; it must not be duplicated on these source surfaces. */
export function deriveCommercialLanePaint(entities: readonly MapEntity[]) {
  const roads = entities.filter((e) => e.kind === "road" && !isPedestrianRoad(e));
  return roads
    .filter((road) => classifyRoad(road) === "public-external")
    .filter((e) => !["indumoveis:road:benvenuto", "indumoveis:road:imigrantes"].includes(e.id))
    .map((road) => {
      const medial = roadMedialPath(road.polygon);
      const markings = markRoadLanes(medial.path, medial.width, {
        roadClass: classifyRoad(road),
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
export function deriveParkDetails(entities: readonly MapEntity[], pavilionGround?: PavilionGround) {
  const laneSources = deriveCommercialLanePaint(entities),
    lanePaint = laneSources.flatMap((s) => s.centerDashes),
    laneArrows = laneSources.flatMap((s) => s.directionArrows);
  // Named source roads provide projection/parking references when the runtime
  // has one A2 surface owner instead of separately rendered street polygons.
  const namedRoad = (id: string) =>
    entities.find((e) => e.id === id) ?? ENTITIES.find((e) => e.id === id);
  const avenue = namedRoad("indumoveis:road:benvenuto");
  if (!avenue)
    return {
      concrete: [] as Point[][],
      paint: [] as Point[][],
      joints: [] as Point[][],
      lanePaint,
      laneArrows,
      laneSources,
      pavilionGround: undefined,
    };
  const av = polygonBounds(avenue.polygon);
  const candidates: Point[][] = [rect(av.minX + 0.05, av.minY - 1.7, av.maxX - 0.3, av.minY - 0.1)];
  const physicalRoads = entities.filter((entity) => entity.kind === "road");
  const registeredRoads = physicalRoads.some((entity) => entity.id.includes("a2-network"));
  const ground = registeredRoads ? (pavilionGround ?? derivePavilionGround(entities)) : undefined;
  for (const building of entities.filter((e) => e.kind === "pavilion")) {
    const b = polygonBounds(building.polygon);
    const presentation = getPavilionPresentation(building);
    const street = presentation ? namedRoad(presentation.frontStreetId) : undefined;
    if (presentation && registeredRoads) {
      const [a, c] = presentation.frontEdge,
        n = presentation.frontNormal;
      const length = Math.hypot(c[0] - a[0], c[1] - a[1]),
        count = Math.max(2, Math.ceil(length));
      const sections = Array.from({ length: count + 1 }, (_, i) => {
        const p: Point = [a[0] + ((c[0] - a[0]) * i) / count, a[1] + ((c[1] - a[1]) * i) / count];
        return { p, distance: firstRoadDistance(p, n, physicalRoads) };
      });
      for (let i = 1; i < sections.length; i++) {
        const previous = sections[i - 1],
          next = sections[i];
        // A front apron is limited to the adjacent street, not another sector
        // found farther along the same ray. Protected footprints still clip it.
        if (
          previous.distance === null ||
          next.distance === null ||
          Math.max(previous.distance, next.distance) > length
        )
          continue;
        const target = ({ p, distance }: typeof next): Point => [
          p[0] + n[0] * (distance! + 0.12),
          p[1] + n[1] * (distance! + 0.12),
        ];
        candidates.push([previous.p, next.p, target(next), target(previous)]);
      }
    } else if (presentation && street) {
      const n = presentation.frontNormal;
      const projection = ([x, z]: Point) => x * n[0] + z * n[1];
      const nearStreet = Math.min(...street.polygon.map(projection));
      const [a, c] = presentation.frontEdge;
      const project = (p: Point): Point => [
        p[0] + n[0] * (nearStreet - projection(p)),
        p[1] + n[1] * (nearStreet - projection(p)),
      ];
      if (nearStreet > Math.max(projection(a), projection(c)))
        candidates.push([a, c, project(c), project(a)]);
    }
    if (b.minY < 67) continue;
    candidates.push(rect(b.minX - 0.55, b.minY, b.minX - 0.03, b.maxY));
    candidates.push(rect(b.maxX + 0.03, b.minY, b.maxX + 0.55, b.maxY));
  }
  // P14's interior-facing entrance opens onto the existing gap beside P12.
  // Its return to Mercosul follows the clear band between P1 and P14; extending
  // a straight line through P12 would create a false connection. The band is
  // bounded by the actual source footprints, without an assumed metre width.
  const mostra = entities.find((e) => e.id === "indumoveis:pavilion:1");
  const hall14 = entities.find((e) => e.id === "indumoveis:pavilion:14");
  const mercosul = namedRoad("indumoveis:road:mercosul");
  if (mostra && hall14 && mercosul) {
    const upper = polygonBounds(mostra.polygon),
      lower = polygonBounds(hall14.polygon),
      road = polygonBounds(mercosul.polygon);
    if (upper.maxY < lower.minY)
      candidates.push(rect(Math.min(upper.maxX, lower.maxX), upper.maxY, road.minX, lower.minY));
    if (registeredRoads && upper.maxY < lower.minY) {
      // P14's public front is the eastern gallery, not an imagined street
      // through P12. Its short north return meets the documented P1/P14 gap.
      // Keep the gallery inside the clear interval bounded by the two halls.
      const hall12 = entities.find((e) => e.id === "indumoveis:pavilion:12");
      const limit = hall12 ? polygonBounds(hall12.polygon).minX : lower.maxX + 1.8;
      const galleryWidth = Math.min(1.8, (limit - lower.maxX) * 0.4);
      if (galleryWidth > 0.4)
        candidates.push(
          rect(lower.maxX - 0.2, lower.minY - 0.2, lower.maxX + galleryWidth, lower.maxY),
        );
    }
  }
  if (registeredRoads) {
    // These are short entry thresholds between a verified building front and
    // its immediately adjacent white corridor. They never join distant sector
    // centres or create paths through a quadra, building or commercial lot.
    for (const item of PERMANENT_PARK_LANDMARKS) {
      if (item.id === "arena") continue; // Canonical stair/plaza owns this approach.
      const edge = equipmentEntry(item.polygon, item.front, physicalRoads);
      if (!edge) continue;
      const { point: middle, normal, gap } = edge;
      if (gap === null || gap > 4 || gap < 1e-5) continue;
      const half = Math.min(0.9, edge.length * 0.2),
        tangent: Point = [
          (edge.b[0] - edge.a[0]) / edge.length,
          (edge.b[1] - edge.a[1]) / edge.length,
        ];
      const side = (along: number, out: number): Point => [
        middle[0] + tangent[0] * along + normal[0] * out,
        middle[1] + tangent[1] * along + normal[1] * out,
      ];
      candidates.push([
        side(-half, 0),
        side(half, 0),
        side(half, gap + 0.12),
        side(-half, gap + 0.12),
      ]);
    }
  }
  let concrete = pavementUnionCells([...candidates, ...(ground?.servicePaths ?? [])]);
  if (ground) concrete = subtractPolygons(concrete, ground.green);
  const permanentBlockers: { polygon: Point[]; holes?: Point[][] }[] = registeredRoads
    ? PERMANENT_PARK_LANDMARKS.map((item) => ({ polygon: item.polygon }))
    : [];
  // Legacy landscape envelopes are source context, not protected walls. On
  // the registered layout they cannot veto a verified equipment threshold.
  // The original legacy-only details path retains its previous exclusion.
  for (const entity of [
    ...entities.filter((e) => !registeredRoads || e.kind !== "landscape"),
    ...permanentBlockers,
  ]) {
    const rings = [entity.polygon, ...(entity.holes ?? [])].map((ring) =>
      ring.filter(
        (p, i) => i !== ring.length - 1 || Math.hypot(p[0] - ring[0][0], p[1] - ring[0][1]) > 1e-8,
      ),
    );
    const points = rings.flat();
    const triangles = THREE.ShapeUtils.triangulateShape(
      rings[0].map(([x, z]) => new THREE.Vector2(x, z)),
      rings.slice(1).map((ring) => ring.map(([x, z]) => new THREE.Vector2(x, z))),
    );
    for (const triangle of triangles) {
      const blocker = triangle.map((i) => points[i]);
      const b = polygonBounds(blocker);
      concrete = concrete.flatMap((cell) => {
        const c = polygonBounds(cell);
        return c.maxX <= b.minX || c.minX >= b.maxX || c.maxY <= b.minY || c.minY >= b.maxY
          ? [cell]
          : subtractGround(cell, blocker);
      });
    }
  }
  // Angled parking paint belongs to the avenue's single owner (urbanContext),
  // on the asphalt. Nothing is painted on the kerbside walk any more.
  const paint: Point[][] = [];
  const joints: Point[][] = [];
  for (let x = av.minX + 3; x < av.maxX - 1; x += 3.6) {
    const joint = rect(x, av.minY - 1.66, x + 0.014, av.minY - 0.14);
    if (joint.every((p) => concrete.some((c) => pointInPolygon(p, c)))) joints.push(joint);
  }
  return { concrete, paint, joints, lanePaint, laneArrows, laneSources, pavilionGround: ground };
}

export function createParkDetails(
  entities: readonly MapEntity[],
  surfaces: SurfaceMaterials,
  pavilionGround?: PavilionGround,
) {
  const topology = deriveParkDetails(entities, pavilionGround),
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
    [topology.concrete, 0.005, surfaces.materials.concrete, "indumoveis-pavilion-aprons"],
    [topology.paint, -0.008, surfaces.materials.whitePaint, "indumoveis-parking-paint"],
    [topology.joints, 0.008, jointMaterial, "indumoveis-concrete-joints"],
    [
      topology.pavilionGround?.green ?? [],
      -0.15,
      surfaces.materials.grass,
      "indumoveis-pavilion-back-lawns",
    ],
    [
      topology.pavilionGround?.curb ?? [],
      0.018,
      surfaces.materials.concrete,
      "indumoveis-avenue-curb",
    ],
    [topology.lanePaint, -0.007, laneMaterial, "indumoveis-commercial-lane-paint"],
    [
      topology.laneArrows,
      -0.007,
      surfaces.materials.whitePaint,
      "indumoveis-commercial-direction-arrows",
    ],
  ] as const) {
    const shape = geometry(
      polygons as Point[][],
      y,
      name === "indumoveis-avenue-curb" ? -0.025 : undefined,
    );
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
