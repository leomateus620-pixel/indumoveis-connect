import * as THREE from "three";
import type { SurfaceFamily, SurfaceMaterials, SurfaceQuality } from "./surfaceMaterials";
import {
  PARK_CONTEXT_BLOCKS,
  PARK_RENDER_ENTITIES,
  PARK_GATES,
  MAIN_GATE_PORTAL,
  ARENA_APPROACH,
  ARENA_APPROACH_POLYGONS,
  PERMANENT_PARK_LANDMARKS,
  type PermanentParkLandmark,
} from "./permanentParkLayout";
import { pavementUnionCells, derivePavement, type PavementTopology } from "./pavement";
import { subtractPolygons } from "./parkGeometry";
import { PARK_REFERENCE_REVISION, PARK_REFERENCE_BUILDINGS } from "./parkReference";
import { PARK_REGISTRATION, registerParkPoint } from "./parkRegistration";
import { registerA2Polygon } from "./parkRegistration";
import { PARK_A2_BUILDING_FOOTPRINTS } from "./parkA2Reference";
import { footprintClipper } from "./architectureClip";

type Vertex = [number, number, number];
type Bucket = { positions: number[]; colors: number[]; uvs: number[] };
const bucket = (): Bucket => ({ positions: [], colors: [], uvs: [] });

/** Lightweight, static presentation geometry; one batch per surface family. */
export function createPermanentPark(
  surfaces: SurfaceMaterials,
  preparedPavement?: PavementTopology,
) {
  const buckets = new Map<SurfaceFamily, Bucket>();
  const owned: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  group.name = "indumoveis-permanent-park-context";
  let disposed = false;
  let mirrorX: number | undefined;
  let modelTransform: ((p: Vertex) => Vertex) | undefined;
  let clip: ReturnType<typeof footprintClipper> | undefined;
  const setFootprintClip = (id: string) => {
    clip = footprintClipper(PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!.polygon);
  };
  const get = (family: SurfaceFamily) => {
    let b = buckets.get(family);
    if (!b) buckets.set(family, (b = bucket()));
    return b;
  };
  const emitTriangle = (family: SurfaceFamily, a: Vertex, b: Vertex, c: Vertex, color: string) => {
    const target = get(family);
    const rgb = new THREE.Color(color);
    const ab = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const ac = new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    if (normal.lengthSq() < 1e-16) return;
    const axis =
      Math.abs(normal.y) >= Math.max(Math.abs(normal.x), Math.abs(normal.z))
        ? 1
        : Math.abs(normal.x) > Math.abs(normal.z)
          ? 0
          : 2;
    for (const p of [a, b, c]) {
      target.positions.push(...p);
      target.colors.push(rgb.r, rgb.g, rgb.b);
      target.uvs.push((axis === 0 ? p[2] : p[0]) / 2.8, (axis === 1 ? p[2] : p[1]) / 2.8);
    }
  };
  const tri = (family: SurfaceFamily, a: Vertex, b: Vertex, c: Vertex, color: string) => {
    if (modelTransform) [a, b, c] = [modelTransform(a), modelTransform(b), modelTransform(c)];
    if (mirrorX !== undefined) {
      const mirror = (p: Vertex): Vertex => [mirrorX! - p[0], p[1], p[2]];
      [a, b, c] = [mirror(a), mirror(c), mirror(b)];
    }
    if (clip) for (const [pa, pb, pc] of clip([a, b, c])) emitTriangle(family, pa, pb, pc, color);
    else emitTriangle(family, a, b, c, color);
  };
  const quad = (
    family: SurfaceFamily,
    a: Vertex,
    b: Vertex,
    c: Vertex,
    d: Vertex,
    color: string,
  ) => {
    tri(family, a, b, c, color);
    tri(family, a, c, d, color);
  };
  const box = (
    family: SurfaceFamily,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color = "#ffffff",
  ) => {
    quad(family, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], color);
    quad(family, [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], color);
    quad(family, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], color);
    quad(family, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], color);
    quad(family, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color);
  };
  const roof = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    rise: number,
    color = "#ffffff",
    closedEnds = true,
  ) => {
    const ridge = (z0 + z1) / 2;
    quad(
      "paintedSheet",
      [x0, y, z0],
      [x0, y + rise, ridge],
      [x1, y + rise, ridge],
      [x1, y, z0],
      color,
    );
    quad(
      "paintedSheet",
      [x0, y + rise, ridge],
      [x0, y, z1],
      [x1, y, z1],
      [x1, y + rise, ridge],
      color,
    );
    if (closedEnds) {
      tri("paintedWall", [x0, y, z1], [x0, y + rise, ridge], [x0, y, z0], "#f0eee8");
      tri("paintedWall", [x1, y, z0], [x1, y + rise, ridge], [x1, y, z1], "#f0eee8");
    }
  };
  const hipRoof = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    rise: number,
    color: string,
  ) => {
    const center = (x0 + x1) / 2,
      inset = Math.min((x1 - x0) / 2, (z1 - z0) * 0.42);
    const a: Vertex = [center, y + rise, z0 + inset],
      b: Vertex = [center, y + rise, z1 - inset];
    quad("paintedSheet", [x0, y, z0], [x0, y, z1], b, a, color);
    quad("paintedSheet", a, b, [x1, y, z1], [x1, y, z0], color);
    tri("paintedSheet", [x1, y, z0], [x0, y, z0], a, color);
    tri("paintedSheet", [x0, y, z1], [x1, y, z1], b, color);
  };
  const narrow = (x: number, z: number, y0: number, y1: number) =>
    box("exposedMetal", x - 0.08, y0, z - 0.08, x + 0.08, y1, z + 0.08, "#666f6c");
  const dimensions = (id: PermanentParkLandmark["id"]) =>
    PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!.bounds;
  const flat = (
    polygon: readonly [number, number][],
    y: number,
    family: SurfaceFamily,
    color: string,
  ) => {
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
      polygon.map((p) => new THREE.Vector2(...p)),
      [],
    )) {
      const v = (i: number): Vertex => [polygon[i][0], y, polygon[i][1]];
      const pa = v(a),
        pb = v(b),
        pc = v(c);
      const crossY = (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]);
      tri(family, pa, crossY >= 0 ? pb : pc, crossY >= 0 ? pc : pb, color);
    }
  };
  const perimeter = (
    id: string,
    bottom: number,
    top: number,
    family: SurfaceFamily,
    color: string,
    publicFront?: [number, number],
  ) => {
    const polygon = PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!.polygon;
    let publicEdge = -1,
      best = -Infinity;
    if (publicFront)
      polygon.forEach((a, i) => {
        const b = polygon[(i + 1) % polygon.length],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          alignment = ((b[1] - a[1]) * publicFront[0] - (b[0] - a[0]) * publicFront[1]) / length,
          score = alignment > 0.94 ? 1000 + length : alignment;
        if (score > best) {
          best = score;
          publicEdge = i;
        }
      });
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      if (i === publicEdge) {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          nx = (b[1] - a[1]) / length,
          nz = -(b[0] - a[0]) / length;
        const point = (t: number, recess = 0): [number, number] => [
          a[0] + (b[0] - a[0]) * t - nx * recess,
          a[1] + (b[1] - a[1]) * t - nz * recess,
        ];
        const wall = (from: number, to: number, low: number, high: number) => {
          const p = point(from),
            q = point(to);
          quad(
            family,
            [p[0], low, p[1]],
            [p[0], high, p[1]],
            [q[0], high, q[1]],
            [q[0], low, q[1]],
            color,
          );
        };
        const openings = [
          [0.17, 0.31, bottom + (top - bottom) * 0.3, bottom + (top - bottom) * 0.75],
          [0.44, 0.58, bottom, top * 0.8],
          [0.71, 0.85, bottom + (top - bottom) * 0.3, bottom + (top - bottom) * 0.75],
        ];
        let cursor = 0;
        for (const [from, to, sill, head] of openings) {
          wall(cursor, from, bottom, top);
          wall(from, to, bottom, sill);
          wall(from, to, head, top);
          const p = point(from),
            q = point(to),
            ip = point(from, 0.075),
            iq = point(to, 0.075);
          quad(
            "glass",
            [ip[0], sill, ip[1]],
            [ip[0], head, ip[1]],
            [iq[0], head, iq[1]],
            [iq[0], sill, iq[1]],
            "#b3c7c0",
          );
          quad(
            "paintedWall",
            [p[0], sill, p[1]],
            [p[0], head, p[1]],
            [ip[0], head, ip[1]],
            [ip[0], sill, ip[1]],
            color,
          );
          quad(
            "paintedWall",
            [q[0], sill, q[1]],
            [iq[0], sill, iq[1]],
            [iq[0], head, iq[1]],
            [q[0], head, q[1]],
            color,
          );
          quad(
            "concrete",
            [p[0], sill, p[1]],
            [ip[0], sill, ip[1]],
            [iq[0], sill, iq[1]],
            [q[0], sill, q[1]],
            "#c3c6bc",
          );
          quad(
            "paintedWall",
            [p[0], head, p[1]],
            [q[0], head, q[1]],
            [iq[0], head, iq[1]],
            [ip[0], head, ip[1]],
            color,
          );
          cursor = to;
        }
        wall(cursor, 1, bottom, top);
        continue;
      }
      quad(
        family,
        [a[0], bottom, a[1]],
        [a[0], top, a[1]],
        [b[0], top, b[1]],
        [b[0], bottom, b[1]],
        color,
      );
    }
  };
  /** End closures follow every source notch. Clipping an enclosing box alone
   * would remove the wall at re-entrant edges, leaving a floating roof. */
  const closeGables = (id: string, eave: number, rise: number, axis: 0 | 1, modules = 1) => {
    const item = PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!;
    const low = axis === 0 ? item.bounds[0] : item.bounds[1],
      high = axis === 0 ? item.bounds[2] : item.bounds[3],
      span = (high - low) / modules;
    const cuts = Array.from({ length: modules * 2 + 1 }, (_, i) => low + (span * i) / 2);
    const height = (p: readonly [number, number]) => {
      const t = (p[axis] - low) / span,
        phase = t - Math.floor(t);
      return eave + rise * (1 - Math.abs(phase * 2 - 1));
    };
    for (let i = 0; i < item.polygon.length; i++) {
      const a = item.polygon[i],
        b = item.polygon[(i + 1) % item.polygon.length],
        delta = b[axis] - a[axis];
      const ts = [
        0,
        1,
        ...cuts.flatMap((c) => (Math.abs(delta) > 1e-8 ? [(c - a[axis]) / delta] : [])),
      ]
        .filter((t) => t >= 0 && t <= 1)
        .sort((a, b) => a - b);
      for (let j = 1; j < ts.length; j++) {
        const p: [number, number] = [
            a[0] + (b[0] - a[0]) * ts[j - 1],
            a[1] + (b[1] - a[1]) * ts[j - 1],
          ],
          q: [number, number] = [a[0] + (b[0] - a[0]) * ts[j], a[1] + (b[1] - a[1]) * ts[j]];
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7) continue;
        quad(
          "paintedWall",
          [p[0], eave, p[1]],
          [p[0], height(p), p[1]],
          [q[0], height(q), q[1]],
          [q[0], eave, q[1]],
          "#eceee7",
        );
      }
    }
  };
  const closeHipCuts = (id: string, eave: number, rise: number) => {
    const item = PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!,
      [x0, z0, x1, z1] = item.bounds;
    const half = (x1 - x0) / 2,
      inset = Math.min(half, (z1 - z0) * 0.42);
    const planes = ([x, z]: readonly [number, number]) => [
      (x - x0) / half,
      (x1 - x) / half,
      (z - z0) / inset,
      (z1 - z) / inset,
      1,
    ];
    for (let i = 0; i < item.polygon.length; i++) {
      const a = item.polygon[i],
        b = item.polygon[(i + 1) % item.polygon.length],
        pa = planes(a),
        pb = planes(b),
        ts = [0, 1];
      for (let j = 0; j < pa.length; j++)
        for (let k = j + 1; k < pa.length; k++) {
          const start = pa[j] - pa[k],
            end = pb[j] - pb[k];
          if (Math.abs(end - start) > 1e-8) {
            const t = -start / (end - start);
            if (t > 0 && t < 1) ts.push(t);
          }
        }
      ts.sort((a, b) => a - b);
      for (let j = 1; j < ts.length; j++) {
        const p: [number, number] = [
            a[0] + (b[0] - a[0]) * ts[j - 1],
            a[1] + (b[1] - a[1]) * ts[j - 1],
          ],
          q: [number, number] = [a[0] + (b[0] - a[0]) * ts[j], a[1] + (b[1] - a[1]) * ts[j]];
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7) continue;
        const hp = eave + rise * Math.max(0, Math.min(...planes(p))),
          hq = eave + rise * Math.max(0, Math.min(...planes(q)));
        quad(
          "paintedWall",
          [p[0], eave, p[1]],
          [p[0], hp, p[1]],
          [q[0], hq, q[1]],
          [q[0], eave, q[1]],
          "#e8e6db",
        );
      }
    }
  };
  try {
    // The Exporural sector is a single landscaped ground with the source's
    // physical circulation, without its commercial parcels or status lines.
    const boundsOf = (polygon: readonly [number, number][]) => ({
      x0: Math.min(...polygon.map((p) => p[0])),
      z0: Math.min(...polygon.map((p) => p[1])),
      x1: Math.max(...polygon.map((p) => p[0])),
      z1: Math.max(...polygon.map((p) => p[1])),
    });
    // Keep the shared textured terrain continuous. Small trees sit only on
    // the rural perimeter; no rectangular lawn is layered over the terrain.
    // Roads have ONE owner: createPavement(PARK_RENDER_ENTITIES). Context
    // islands are clipped by actual road/lot/building polygons, never bounds.
    const pavement = preparedPavement ?? derivePavement(PARK_RENDER_ENTITIES);
    const roadCells = [...pavement.asphaltCells, ...pavement.walkCells];
    const obstacleTriangles = [
      ...PARK_RENDER_ENTITIES.filter(
        (e) => e.kind === "lot" || e.kind === "pavilion" || e.kind === "support",
      ).map((e) => e.polygon),
      ...PERMANENT_PARK_LANDMARKS.map((e) => e.polygon),
    ].flatMap((p) =>
      THREE.ShapeUtils.triangulateShape(
        p.map((q) => new THREE.Vector2(...q)),
        [],
      ).map((t) => t.map((i) => p[i])),
    );
    for (const block of PARK_CONTEXT_BLOCKS) {
      const triangles = block.referencePieces.flatMap((piece) =>
        THREE.ShapeUtils.triangulateShape(
          piece.map((p) => new THREE.Vector2(...p)),
          [],
        ).map((t) => t.map((i) => piece[i])),
      );
      for (const fragment of subtractPolygons(triangles, [...roadCells, ...obstacleTriangles]))
        flat(fragment, -0.07, "grass", "#ffffff");
    }
    // Source B9 groups P6/P10/P11. Their three clear volumes are treated as
    // a single context group rather than new separately selectable spaces.
    for (const id of ["pavilhao-9", "pavilhao-7", "pavilhoes-6-10-11", "pavilhao-5"] as const) {
      setFootprintClip(id);
      const [x0, z0, x1, z1] = dimensions(id);
      const footprint = PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!.polygon;
      flat(footprint, 0.03, "concrete", "#e4e3dc");
      perimeter(id, -0.15, 0.03, "concrete", "#cdd2c8");
      const wall = id === "pavilhao-9" ? 2.85 : 2.4;
      perimeter(id, 0.03, wall, "paintedWall", "#e9e9e1");
      const count = id === "pavilhoes-6-10-11" ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const a = x0 + ((x1 - x0) * i) / count,
          b = x0 + ((x1 - x0) * (i + 1)) / count;
        if (id === "pavilhao-9") {
          // Low-pitch gable with ridge along the long axis, following P9.
          const middle = (a + b) / 2;
          quad(
            "paintedSheet",
            [a, wall, z0],
            [a, wall, z1],
            [middle, wall + 0.8, z1],
            [middle, wall + 0.8, z0],
            "#e0e4e1",
          );
          quad(
            "paintedSheet",
            [middle, wall + 0.8, z0],
            [middle, wall + 0.8, z1],
            [b, wall, z1],
            [b, wall, z0],
            "#e0e4e1",
          );
          for (let bay = 0; bay < 9; bay++)
            for (const x of [a, b]) narrow(x, z0 + 0.7 + (bay * (z1 - z0 - 1.4)) / 8, 0.03, wall);
        } else {
          roof(a, z0, b, z1, wall, id === "pavilhao-5" ? 0.9 : 0.65, "#d7ddda", false);
          for (let bay = 0; bay < 4; bay++)
            narrow(a + 0.5 + (bay * (b - a - 1)) / 3, z1 - 0.3, 0.03, wall);
        }
      }
      closeGables(
        id,
        wall,
        id === "pavilhao-9" ? 0.8 : id === "pavilhao-5" ? 0.9 : 0.65,
        id === "pavilhao-9" ? 0 : 1,
      );
      clip = undefined;
    }
    // D1: a long open dining pavilion, with a legible column rhythm. Its
    // footprint is interpretive and does not replace any protected source item.
    {
      setFootprintClip("alameda");
      const [x0, z0, x1, z1] = dimensions("alameda");
      flat(
        PERMANENT_PARK_LANDMARKS.find((item) => item.id === "alameda")!.polygon,
        0.03,
        "concrete",
        "#e4e3dc",
      );
      perimeter("alameda", -0.15, 0.03, "concrete", "#cbd0c6");
      box("paintedWall", x0 + 0.25, 0.03, z1 - 0.8, x1 - 0.25, 2.4, z1 - 0.25, "#e9e4d8");
      for (let i = 0; i < 5; i++)
        for (const x of [x0 + 0.4, x1 - 0.4])
          narrow(x, z0 + 0.5 + (i * (z1 - z0 - 1)) / 4, 0.03, 2.5);
      const middle = (x0 + x1) / 2;
      quad(
        "paintedSheet",
        [x0 + 0.12, 2.45, z0 + 0.15],
        [x0 + 0.12, 2.45, z1 - 0.15],
        [middle, 2.9, z1 - 0.15],
        [middle, 2.9, z0 + 0.15],
        "#eff1ed",
      );
      quad(
        "paintedSheet",
        [middle, 2.9, z0 + 0.15],
        [middle, 2.9, z1 - 0.15],
        [x1 - 0.12, 2.45, z1 - 0.15],
        [x1 - 0.12, 2.45, z0 + 0.15],
        "#eff1ed",
      );
      clip = undefined;
    }
    // D3: elevated terrace, canopy and rails, kept separate from the Arena.
    {
      setFootprintClip("mirante");
      const [x0, z0, x1, z1] = dimensions("mirante");
      flat(
        PERMANENT_PARK_LANDMARKS.find((item) => item.id === "mirante")!.polygon,
        0.03,
        "concrete",
        "#e4e3dc",
      );
      perimeter("mirante", -0.15, 0.03, "concrete", "#cbd0c6");
      box("concrete", x0 + 0.2, 0.03, z0 + 0.25, x1 - 0.2, 0.32, z1 - 0.25, "#e1e1db");
      for (const x of [x0 + 0.55, x1 - 0.55])
        for (const z of [z0 + 0.7, (z0 + z1) / 2, z1 - 0.7]) narrow(x, z, 0.32, 3.15);
      roof(x0 + 0.25, z0 + 0.35, x1 - 0.25, z1 - 0.35, 3.15, 0.72, "#e4e8e8");
      for (const x of [x0 + 0.32, x1 - 0.32])
        box("exposedMetal", x - 0.035, 1.05, z0 + 0.4, x + 0.035, 1.12, z1 - 0.4, "#929b99");
      clip = undefined;
    }
    // The source's terrace-to-plaza approach joins the two existing context
    // volumes; the 18 risers are a schematic presentation, not surveyed levels.
    {
      const [x0, z0, x1, z1] = ARENA_APPROACH.stairs;
      const [lx0, lz0, lx1, lz1] = ARENA_APPROACH.landing;
      const [cx0, cz0, cx1, cz1] = ARENA_APPROACH.canopy;
      const landingLevel = (x: number) =>
        0.03 + 0.29 * THREE.MathUtils.clamp((x - lx0) / Math.max(cx0 - lx0, 1e-8), 0, 1);
      flat(ARENA_APPROACH_POLYGONS.plaza, 0.03, "concrete", "#e4e3dc");
      // Join overlapping landing/canopy polygons before drawing one surface.
      for (const cell of pavementUnionCells([
        [
          [lx0, lz0],
          [lx1, lz0],
          [lx1, lz1],
          [lx0, lz1],
        ],
        [
          [cx0, cz0],
          [cx1, cz0],
          [cx1, cz1],
          [cx0, cz1],
        ],
      ])) {
        const [a, b, c, d] = cell;
        quad(
          "concrete",
          [a[0], landingLevel(a[0]), a[1]],
          [d[0], landingLevel(d[0]), d[1]],
          [c[0], landingLevel(c[0]), c[1]],
          [b[0], landingLevel(b[0]), b[1]],
          "#e4e3dc",
        );
      }
      // Exposed apron edges meet the terrain; shared boundaries at D1,
      // Mirante and the staircase deliberately have no duplicate faces.
      for (const [a, b] of [
        [
          [lx0, lz0],
          [cx0, lz0],
        ],
        [
          [lx0, lz1],
          [cx0, lz1],
        ],
        [
          [cx0, cz0],
          [cx0, lz0],
        ],
        [
          [cx0, lz1],
          [cx0, cz1],
        ],
        [
          [cx0, cz1],
          [cx1, cz1],
        ],
        [
          [cx1, lz1],
          [cx1, cz1],
        ],
      ] as [[number, number], [number, number]][]) {
        quad(
          "concrete",
          [a[0], -0.15, a[1]],
          [a[0], landingLevel(a[0]), a[1]],
          [b[0], landingLevel(b[0]), b[1]],
          [b[0], -0.15, b[1]],
          "#cbd0ca",
        );
      }
      // Five bays of V supports, referencing the independent covered access.
      const roofHeight = 2.45;
      box(
        "paintedSheet",
        cx0 + 0.03,
        roofHeight,
        cz0 + 0.03,
        cx1 - 0.03,
        roofHeight + 0.12,
        cz1 - 0.03,
        "#e5e8e3",
      );
      for (let i = 0; i <= 5; i++) {
        const z = cz0 + 0.32 + (i * (cz1 - cz0 - 0.64)) / 5;
        for (const x of [cx0 + 0.22, cx1 - 0.22])
          for (const direction of [-1, 1]) {
            const tip = z + direction * 0.27;
            quad(
              "exposedMetal",
              [x - 0.05, 0.32, z],
              [x - 0.05, roofHeight, tip],
              [x + 0.05, roofHeight, tip],
              [x + 0.05, 0.32, z],
              "#6f7875",
            );
            quad(
              "exposedMetal",
              [x + 0.05, 0.32, z],
              [x + 0.05, roofHeight, tip],
              [x - 0.05, roofHeight, tip],
              [x - 0.05, 0.32, z],
              "#6f7875",
            );
          }
      }
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const a = x0 + ((x1 - x0) * i) / steps,
          b = x0 + ((x1 - x0) * (i + 1)) / steps;
        const y = 0.32 - (0.29 * i) / steps,
          next = 0.32 - (0.29 * (i + 1)) / steps;
        quad("concrete", [a, y, z0], [a, y, z1], [b, y, z1], [b, y, z0], "#deded7");
        quad("concrete", [b, next, z0], [b, y, z0], [b, y, z1], [b, next, z1], "#c8cec7");
      }
      // Two guardrails make the three-bank staircase legible without a new floor.
      for (const z of [z0 + (z1 - z0) / 3, z0 + (2 * (z1 - z0)) / 3]) {
        quad(
          "exposedMetal",
          [x0, 1.12, z - 0.035],
          [x0, 1.12, z + 0.035],
          [x1, 0.83, z + 0.035],
          [x1, 0.83, z - 0.035],
          "#8b9691",
        );
        for (let i = 0; i <= 6; i++) {
          const x = x0 + ((x1 - x0) * i) / 6,
            y = 0.32 - (0.29 * i) / 6;
          narrow(x, z, y, y + 0.8);
        }
      }
    }
    // F: neutral barrel roof and a visibly open stage; no sponsor text, mesh,
    // texture, or branded colours are brought from the source project.
    {
      setFootprintClip("arena");
      const [x0, z0, x1, z1] = dimensions("arena");
      flat(
        PERMANENT_PARK_LANDMARKS.find((item) => item.id === "arena")!.polygon,
        0.03,
        "concrete",
        "#e4e3dc",
      );
      perimeter("arena", -0.15, 0.03, "concrete", "#cbd0c6");
      const middle = (z0 + z1) / 2,
        radius = (z1 - z0) / 2 - 0.45,
        spring = 1.15,
        rise = 5.5;
      box("concrete", x0 + 1, 0.03, z0 + 1, x1 - 0.8, 0.5, z1 - 1, "#b2b8b2");
      for (let i = 0; i < 20; i++) {
        const a = (i * Math.PI) / 20,
          b = ((i + 1) * Math.PI) / 20;
        const za = middle - Math.cos(a) * radius,
          zb = middle - Math.cos(b) * radius;
        const ya = spring + Math.sin(a) * rise,
          yb = spring + Math.sin(b) * rise;
        quad(
          "paintedSheet",
          [x0 + 0.35, ya, za],
          [x0 + 0.35, yb, zb],
          [x1 - 0.25, yb, zb],
          [x1 - 0.25, ya, za],
          "#f0f2ed",
        );
        // A separate underside and nine structural arches remain visible when
        // approaching either open end; none contains a graphic or logo.
        quad(
          "paintedSheet",
          [x0 + 0.35, ya - 0.07, za],
          [x1 - 0.25, ya - 0.07, za],
          [x1 - 0.25, yb - 0.07, zb],
          [x0 + 0.35, yb - 0.07, zb],
          "#d7dbd7",
        );
        for (let arch = 0; arch < 9; arch++) {
          const x = x0 + 0.6 + (arch * (x1 - x0 - 1.2)) / 8;
          quad(
            "exposedMetal",
            [x - 0.06, ya - 0.13, za],
            [x + 0.06, ya - 0.13, za],
            [x + 0.06, yb - 0.13, zb],
            [x - 0.06, yb - 0.13, zb],
            "#909996",
          );
        }
        // Darker fascia is geometry, with no texture or branding.
        quad(
          "exposedMetal",
          [x0 + 0.22, ya - 0.12, za],
          [x0 + 0.22, yb - 0.12, zb],
          [x0 + 0.42, yb - 0.12, zb],
          [x0 + 0.42, ya - 0.12, za],
          "#909996",
        );
      }
      for (const x of [x0 + 0.5, x1 - 0.5])
        for (const z of [z0 + 0.5, z1 - 0.5]) narrow(x, z, 0.03, spring + 0.1);
      // Small landing at the open side, intentionally kept off all roads.
      box("concrete", x0 + 0.1, 0.04, z0 + 2.0, x0 + 1.1, 0.18, z1 - 2.0, "#d4d7d1");
      clip = undefined;
    }
    // B12/B13 use the five-volume headquarters and independent stage recipe
    // from fenasojaComplexReconstruction. The common registration also maps
    // their local source-metre frame; no independent sector offset is applied.
    {
      const k = (20.2 * 222) / 658;
      const localModel = (sourceId: string, firstLocal: [number, number]) => {
        const source = PARK_REFERENCE_BUILDINGS.find((e) => e.id === sourceId)!;
        const first = source.sourcePolygon[0];
        const origin: [number, number] = [
          first[0] + firstLocal[1] * k,
          first[1] - firstLocal[0] * k,
        ];
        const original = boundsOf(source.sourcePolygon.map(registerParkPoint));
        const target = PERMANENT_PARK_LANDMARKS.find((item) => item.sourceId === sourceId)!;
        const [x0, z0, x1, z1] = target.bounds;
        // Recipe adaptation within the verified building outline only. This
        // never moves its footprint, a sector, or any commercial entity.
        modelTransform = ([x, y, z]) => {
          const p = registerParkPoint([origin[0] - z * k, origin[1] + x * k]);
          return [
            x0 + ((p[0] - original.x0) / (original.x1 - original.x0)) * (x1 - x0),
            0.03 + y * k * PARK_REGISTRATION.scale,
            z0 + ((p[1] - original.z0) / (original.z1 - original.z0)) * (z1 - z0),
          ];
        };
        setFootprintClip(target.id);
      };
      localModel("B12", [-4.5, -4.85]);
      const volumes = [
        [-3.25, -2.35, 3.25, 4.55, 4.6, 8.2],
        [-4.5, -4.85, 0.7, -1.55, 2.85, 4.05],
        [1.025, -6.525, 4.475, -1.875, 2.85, 4.4],
        [3.225, -3.2, 6.275, -0.3, 2.7, 3.3],
        [-4.5, 4.325, -2.46, 7.575, 2.5, 3.15],
      ];
      for (const [a, c, b, d, eave, ridge] of volumes) {
        box("paintedWall", a, 0, c, b, eave, d, "#e9e5da");
        if (eave === 4.6) {
          const middle = (a + b) / 2;
          quad(
            "paintedSheet",
            [a - 0.36, eave, c - 0.36],
            [a - 0.36, eave, d + 0.36],
            [middle, ridge, d + 0.36],
            [middle, ridge, c - 0.36],
            "#b4bab3",
          );
          quad(
            "paintedSheet",
            [middle, ridge, c - 0.36],
            [middle, ridge, d + 0.36],
            [b + 0.36, eave, d + 0.36],
            [b + 0.36, eave, c - 0.36],
            "#c1c5bd",
          );
          tri("paintedWall", [a, eave, d], [b, eave, d], [middle, ridge, d], "#ece8df");
          tri(
            "glass",
            [-2.025, 5.38, d + 0.012],
            [2.025, 5.38, d + 0.012],
            [0, 7.73, d + 0.012],
            "#a5c0bd",
          );
          box("glass", -2.025, 4.12, d + 0.008, 2.025, 5.0, d + 0.025, "#afc6c3");
          for (const x of [-2.2, 0, 2.2])
            box("glass", x - 0.72, 0.25, d + 0.01, x + 0.72, 2.5, d + 0.026, "#b3c9c6");
          box("exposedMetal", -3.25, 3.15, d + 0.03, 3.25, 3.32, d + 0.18, "#566d62");
        } else hipRoof(a - 0.12, c - 0.12, b + 0.12, d + 0.12, eave, ridge - eave, "#b9b7aa");
      }
      modelTransform = undefined;
      clip = undefined;
      localModel("B13", [-8.55, -9.2]);
      box("concrete", -8.55, -0.12, -9.2, 8.55, 0.45, 9.2, "#d5d1c5");
      box("paintedWall", -8.3, 0.45, -9, 8.3, 4.8, -8.6, "#e3dfd4");
      for (const x of [-8.25, 8.25]) for (const z of [-8.8, -2.5, 4, 8.8]) narrow(x, z, 0.45, 4.8);
      // Symmetric pitched canopy, open to the audience at local +Z / world -X.
      for (const sign of [-1, 1]) {
        const a: Vertex = [sign * 8.91, 4.8, -9.55],
          b: Vertex = [sign * 8.91, 4.8, 9.55],
          c: Vertex = [0, 6.65, 9.55],
          d: Vertex = [0, 6.65, -9.55];
        // Mirroring the eave changes winding. Both water planes face the sky
        // so the positive-X half is not culled from the overhead/reverse view.
        if (sign < 0) quad("paintedSheet", a, b, c, d, "#d7dcd5");
        else quad("paintedSheet", d, c, b, a, "#d7dcd5");
      }
      for (const z of [-8.8, -3, 3, 8.8])
        box("exposedMetal", -8.4, 4.56, z - 0.06, 8.4, 4.72, z + 0.06, "#708177");
      modelTransform = undefined;
      clip = undefined;
    }
    // C5-C8: four recognisably different cultural houses. These are context
    // structures only; no signage, flags, tenants or source commercial data.
    const cultural = ["etnia-polonesa", "etnia-italiana", "etnia-alema", "etnia-afro"] as const;
    cultural.forEach((id, index) => {
      setFootprintClip(id);
      const [x0, z0, x1, z1] = dimensions(id);
      const y = index === 1 ? 2.8 : 2.25;
      const footprint = PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!.polygon;
      flat(footprint, index === 1 ? 0.55 : 0.03, "concrete", "#d9d8cd");
      perimeter(id, -0.15, index === 1 ? 0.55 : 0.03, "concrete", "#d0c7b7");
      perimeter(
        id,
        index === 1 ? 0.55 : 0.03,
        y,
        "paintedWall",
        index === 0 ? "#bca98d" : index === 3 ? "#e7d9c2" : "#efede4",
        PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!.front,
      );
      if (index === 1 || index === 3) {
        hipRoof(x0, z0, x1, z1, y, 0.85, index === 1 ? "#b9907e" : "#a99d91");
        closeHipCuts(id, y, 0.85);
      } else {
        roof(
          x0,
          z0,
          x1,
          z1,
          y,
          index === 0 ? 1.65 : 1.35,
          index === 0 ? "#8b8176" : "#a99d91",
          false,
        );
        closeGables(id, y, index === 0 ? 1.65 : 1.35, 1);
      }
      mirrorX =
        PERMANENT_PARK_LANDMARKS.find((l) => l.id === id)!.front[0] > 0 ? x0 + x1 : undefined;
      if (index === 3) {
        box("paintedWall", x1 - 1.5, 0.03, z1 - 2.6, x1 - 0.25, 1.4, z1 - 0.25, "#ded2be");
        hipRoof(x1 - 1.55, z1 - 2.65, x1 - 0.2, z1 - 0.2, 1.4, 0.35, "#a99d91");
      }
      for (const z of [z0 + 1.1, z1 - 1.1]) narrow(x0 + 0.22, z, 0.03, 1.9);
      box("paintedSheet", x0 + 0.1, 1.85, z0 + 0.8, x0 + 0.9, 1.96, z1 - 0.8, "#b5b8af");
      for (const z of [z0 + 1.6, z1 - 2.0])
        box("glass", x0 + 0.39, 0.65, z, x0 + 0.42, 1.65, z + 0.65, "#b5c8c6");
      if (index === 2) {
        // Timber rhythm suggests the German house without reproducing marks.
        for (const z of [z0 + 1.4, (z0 + z1) / 2, z1 - 1.4])
          box("exposedMetal", x0 + 0.36, 0.3, z - 0.045, x0 + 0.43, 2.1, z + 0.045, "#715c4d");
        for (const [za, zb] of [
          [z0 + 1.4, (z0 + z1) / 2],
          [(z0 + z1) / 2, z1 - 1.4],
        ])
          quad(
            "exposedMetal",
            [x0 + 0.35, 0.4, za],
            [x0 + 0.35, 0.5, za],
            [x0 + 0.35, 2.0, zb],
            [x0 + 0.35, 1.9, zb],
            "#715c4d",
          );
      }
      mirrorX = undefined;
      clip = undefined;
    });
    // Additional permanent equipment retains its own outline/function. Open
    // areas and sporting grounds are never turned into commercial parcels.
    for (const id of [
      "cozinha-soja",
      "churrascaria-rural",
      "cooperativismo",
      "terceira-idade",
      "casa-rotaria",
      "via-expressa",
    ]) {
      const item = PERMANENT_PARK_LANDMARKS.find((l) => l.id === id);
      if (!item) continue;
      setFootprintClip(id);
      const [x0, z0, x1, z1] = item.bounds;
      flat(item.polygon, 0.03, "concrete", "#e4e3dc");
      perimeter(id, -0.15, 0.03, "concrete", "#cbd0c6");
      const eave = id === "terceira-idade" ? 3.3 : id === "via-expressa" ? 2.4 : 2.25;
      perimeter(id, 0.03, eave, "paintedWall", "#e4e4d9");
      roof(x0, z0, x1, z1, eave, id === "terceira-idade" ? 1.25 : 0.65, "#bfc8c0", false);
      closeGables(id, eave, id === "terceira-idade" ? 1.25 : 0.65, 1);
      for (let i = 0; i < 4; i++) {
        const x = x0 + 0.5 + ((i + 0.5) * (x1 - x0 - 1)) / 4;
        box("glass", x - 0.35, 0.5, z1 - 0.115, x + 0.35, 1.7, z1 - 0.09, "#b8ceca");
      }
      clip = undefined;
    }
    // Secondary openings keep low flank posts: there is no evidence for a
    // portal, canopy or gatehouse at them.
    for (const gate of PARK_GATES) {
      if (gate.id === "A3") continue;
      const [x, z] = gate.point,
        [dx, dz] = gate.axis;
      for (const sign of [-1, 1]) {
        const px = x - dz * gate.width * 0.65 * sign,
          pz = z + dx * gate.width * 0.65 * sign;
        box("concrete", px - 0.12, -0.15, pz - 0.12, px + 0.12, 1.1, pz + 0.12, "#dadbd0");
      }
    }
    // Main gate (A3 / Portão 03): the orthophoto shows one roofed portal across
    // the whole carriageway where the public avenue ends. Piers, beam and a
    // shallow roof give it real thickness; no name, number or ornament is
    // invented. Heights are presentation estimates in drawing units.
    {
      const portal = MAIN_GATE_PORTAL,
        [x0, x1] = portal.x,
        [z0, z1] = portal.z;
      for (const [pz0, pz1] of portal.piers) {
        box("masonryBrick", x0 + 0.35, -0.15, pz0, x1 - 0.35, 0.5, pz1, "#ffffff");
        box("paintedWall", x0 + 0.4, 0.5, pz0 + 0.05, x1 - 0.4, portal.beam, pz1 - 0.05, "#e2ded2");
      }
      box("concrete", x0 + 0.12, portal.beam, z0 + 0.1, x1 - 0.12, portal.eave, z1 - 0.1, "#d2d0c5");
      const overhang = 0.4,
        ridgeX = (x0 + x1) / 2,
        top = portal.eave + portal.rise;
      quad(
        "paintedSheet",
        [x0 - overhang, portal.eave, z0 - overhang],
        [x0 - overhang, portal.eave, z1 + overhang],
        [ridgeX, top, z1 + overhang],
        [ridgeX, top, z0 - overhang],
        "#7f8a8c",
      );
      quad(
        "paintedSheet",
        [ridgeX, top, z0 - overhang],
        [ridgeX, top, z1 + overhang],
        [x1 + overhang, portal.eave, z1 + overhang],
        [x1 + overhang, portal.eave, z0 - overhang],
        "#899496",
      );
      for (const z of [z0 - overhang, z1 + overhang]) {
        const a: Vertex = [x0 - overhang, portal.eave, z],
          b: Vertex = [x1 + overhang, portal.eave, z],
          c: Vertex = [ridgeX, top, z];
        if (z < z0) tri("paintedWall", a, c, b, "#d9d6ca");
        else tri("paintedWall", a, b, c, "#d9d6ca");
      }
      box(
        "exposedMetal",
        x0 - overhang,
        portal.eave - 0.08,
        z0 - overhang,
        x1 + overhang,
        portal.eave,
        z1 + overhang,
        "#5d6866",
      );
      // Open leaves folded back along the internal street: thin metal frames.
      for (const z of [portal.piers[0][1] + 0.06, portal.piers[2][0] - 0.12]) {
        box("exposedMetal", x1 - 0.3, 0.05, z, x1 + 1.5, 0.11, z + 0.06, "#4f5a58");
        box("exposedMetal", x1 - 0.3, 1.25, z, x1 + 1.5, 1.31, z + 0.06, "#4f5a58");
        for (let x = x1 - 0.3; x <= x1 + 1.47; x += 0.3)
          box("exposedMetal", x, 0.05, z, x + 0.04, 1.31, z + 0.06, "#4f5a58");
      }
    }
    const pista = PARK_REFERENCE_BUILDINGS.find((e) => e.id === "PISTA-CAMPEIRA")!;
    const pistaPolygon = PARK_A2_BUILDING_FOOTPRINTS[pista.id]
      ? registerA2Polygon(PARK_A2_BUILDING_FOOTPRINTS[pista.id])
      : pista.sourcePolygon.map(registerParkPoint);
    flat(pistaPolygon, -0.06, "warmAccent", "#b19477");
    const pb = boundsOf(pistaPolygon);
    for (const z of [pb.z0, pb.z1]) {
      box("exposedMetal", pb.x0, 0.42, z - 0.025, pb.x1, 0.47, z + 0.025, "#7c7968");
      for (let x = pb.x0; x < pb.x1; x += 2.6) narrow(x, z, -0.1, 0.8);
    }
    for (const [family, data] of buckets) {
      const geometry = new THREE.BufferGeometry();
      owned.push(geometry);
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, surfaces.materials[family]);
      mesh.name = `permanent-park-${family}`;
      mesh.userData.commercialPickable = false;
      mesh.raycast = () => {};
      mesh.frustumCulled = true;
      group.add(mesh);
    }
  } catch (error) {
    for (const geometry of owned) geometry.dispose();
    throw error;
  }
  return {
    group,
    metadata: {
      sourceRevision: PARK_REFERENCE_REVISION,
      schematic: true,
      landmarks: PERMANENT_PARK_LANDMARKS.map(({ id }) => id),
      drawBatches: group.children.length,
      // Context names stay in search and the selected destination notice.
      // No above-building plates, atlas texture or label draw is allocated.
      labelCount: 0,
      textureBytes: 0,
    },
    // All landmarks and architectural silhouettes are essential at every tier.
    setQuality(_quality: SurfaceQuality) {},
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of owned) geometry.dispose();
      group.clear();
    },
  };
}
