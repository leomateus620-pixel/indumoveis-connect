import * as THREE from "three";
import type { SurfaceFamily, SurfaceMaterials, SurfaceQuality } from "./surfaceMaterials";
import {
  EXPORURAL_ROADS,
  EXPORURAL_EDGE_TREES,
  ARENA_APPROACH,
  PERMANENT_PARK_LANDMARKS,
  type PermanentParkLandmark,
} from "./permanentParkLayout";
import { createPermanentParkLabels } from "./permanentParkLabels";
import { pavementUnionCells } from "./pavement";

type Vertex = [number, number, number];
type Bucket = { positions: number[]; colors: number[]; uvs: number[] };
const bucket = (): Bucket => ({ positions: [], colors: [], uvs: [] });

/** Lightweight, static presentation geometry; one batch per surface family. */
export function createPermanentPark(surfaces: SurfaceMaterials) {
  const buckets = new Map<SurfaceFamily, Bucket>();
  const owned: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  group.name = "indumoveis-permanent-park-context";
  let disposed = false;
  const get = (family: SurfaceFamily) => {
    let b = buckets.get(family);
    if (!b) buckets.set(family, (b = bucket()));
    return b;
  };
  const tri = (family: SurfaceFamily, a: Vertex, b: Vertex, c: Vertex, color: string) => {
    const target = get(family);
    const rgb = new THREE.Color(color);
    const ab = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const ac = new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const normal = new THREE.Vector3().crossVectors(ab, ac);
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
    tri("paintedWall", [x0, y, z1], [x0, y + rise, ridge], [x0, y, z0], "#f0eee8");
    tri("paintedWall", [x1, y, z0], [x1, y + rise, ridge], [x1, y, z1], "#f0eee8");
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
  const floor = (x0: number, z0: number, x1: number, z1: number) =>
    box("concrete", x0, -0.15, z0, x1, 0.03, z1, "#e4e3dc");
  const narrow = (x: number, z: number, y0: number, y1: number) =>
    box("exposedMetal", x - 0.08, y0, z - 0.08, x + 0.08, y1, z + 0.08, "#666f6c");
  const dimensions = (id: PermanentParkLandmark["id"]) =>
    PERMANENT_PARK_LANDMARKS.find((item) => item.id === id)!.bounds;
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
    EXPORURAL_EDGE_TREES.forEach(([x, z], i) => {
      const radius = 1.0 + (i % 3) * 0.08,
        top = 3.15 + (i % 3) * 0.18,
        y = 1.8;
      box("warmAccent", x - 0.12, -0.15, z - 0.12, x + 0.12, 1.85, z + 0.12, "#77674f");
      const apex: Vertex = [x, top, z],
        bottom: Vertex = [x, 0.85, z];
      const rim: Vertex[] = [
        [x - radius, y, z],
        [x, y, z + radius],
        [x + radius, y, z],
        [x, y, z - radius],
      ];
      for (let side = 0; side < 4; side++) {
        const a = rim[side],
          b = rim[(side + 1) % 4];
        tri("grass", a, b, apex, side % 2 ? "#557b50" : "#719264");
        tri("grass", a, bottom, b, "#526f4c");
      }
    });
    // Union shared road intersections before emitting pavement; no coplanar
    // asphalt overlaps are drawn at crossings.
    for (const cell of pavementUnionCells(EXPORURAL_ROADS.map((road) => road.polygon))) {
      const [a, b, c, d] = cell;
      quad(
        "asphalt",
        [a[0], -0.11, a[1]],
        [d[0], -0.11, d[1]],
        [c[0], -0.11, c[1]],
        [b[0], -0.11, b[1]],
        "#ffffff",
      );
    }
    // Source B9 groups P6/P10/P11. Their three clear volumes are treated as
    // a single context group rather than new separately selectable spaces.
    for (const id of ["pavilhao-9", "pavilhao-7", "pavilhoes-6-10-11", "pavilhao-5"] as const) {
      const [x0, z0, x1, z1] = dimensions(id);
      floor(x0, z0, x1, z1);
      const count = id === "pavilhoes-6-10-11" ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const a = x0 + 0.2 + ((x1 - x0) * i) / count,
          b = x0 + ((x1 - x0) * (i + 1)) / count - 0.2;
        const wall = id === "pavilhao-9" ? 2.85 : 2.4;
        box("paintedWall", a, 0.03, z0 + 0.22, b, wall, z1 - 0.22, "#e9e9e1");
        if (id === "pavilhao-9") {
          // Low-pitch gable with ridge along the long axis, following P9.
          const middle = (a + b) / 2;
          quad(
            "paintedSheet",
            [a, wall, z0 + 0.15],
            [a, wall, z1 - 0.15],
            [middle, wall + 0.8, z1 - 0.15],
            [middle, wall + 0.8, z0 + 0.15],
            "#e0e4e1",
          );
          quad(
            "paintedSheet",
            [middle, wall + 0.8, z0 + 0.15],
            [middle, wall + 0.8, z1 - 0.15],
            [b, wall, z1 - 0.15],
            [b, wall, z0 + 0.15],
            "#e0e4e1",
          );
          for (let bay = 0; bay < 9; bay++)
            for (const x of [a, b]) narrow(x, z0 + 0.7 + (bay * (z1 - z0 - 1.4)) / 8, 0.03, wall);
        } else {
          roof(a, z0 + 0.15, b, z1 - 0.15, wall, id === "pavilhao-5" ? 0.9 : 0.65, "#d7ddda");
          for (let bay = 0; bay < 4; bay++)
            narrow(a + 0.5 + (bay * (b - a - 1)) / 3, z1 - 0.3, 0.03, wall);
        }
      }
    }
    // D1: a long open dining pavilion, with a legible column rhythm. Its
    // footprint is interpretive and does not replace any protected source item.
    {
      const [x0, z0, x1, z1] = dimensions("alameda");
      floor(x0, z0, x1, z1);
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
    }
    // D3: elevated terrace, canopy and rails, kept separate from the Arena.
    {
      const [x0, z0, x1, z1] = dimensions("mirante");
      floor(x0, z0, x1, z1);
      box("concrete", x0 + 0.2, 0.03, z0 + 0.25, x1 - 0.2, 0.32, z1 - 0.25, "#e1e1db");
      for (const x of [x0 + 0.55, x1 - 0.55])
        for (const z of [z0 + 0.7, (z0 + z1) / 2, z1 - 0.7]) narrow(x, z, 0.32, 3.15);
      roof(x0 + 0.25, z0 + 0.35, x1 - 0.25, z1 - 0.35, 3.15, 0.72, "#e4e8e8");
      for (const x of [x0 + 0.32, x1 - 0.32])
        box("exposedMetal", x - 0.035, 1.05, z0 + 0.4, x + 0.035, 1.12, z1 - 0.4, "#929b99");
    }
    // The source's terrace-to-plaza approach joins the two existing context
    // volumes; the 18 risers are a schematic presentation, not surveyed levels.
    {
      const [x0, z0, x1, z1] = ARENA_APPROACH.stairs;
      const [px0, pz0, px1, pz1] = ARENA_APPROACH.plaza;
      const [lx0, lz0, lx1, lz1] = ARENA_APPROACH.landing;
      const [cx0, cz0, cx1, cz1] = ARENA_APPROACH.canopy;
      floor(px0, pz0, px1, pz1);
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
          [a[0], 0.03, a[1]],
          [d[0], 0.03, d[1]],
          [c[0], 0.03, c[1]],
          [b[0], 0.03, b[1]],
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
          [a[0], 0.03, a[1]],
          [b[0], 0.03, b[1]],
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
              [x - 0.05, 0.03, z],
              [x - 0.05, roofHeight, tip],
              [x + 0.05, roofHeight, tip],
              [x + 0.05, 0.03, z],
              "#6f7875",
            );
            quad(
              "exposedMetal",
              [x + 0.05, 0.03, z],
              [x + 0.05, roofHeight, tip],
              [x - 0.05, roofHeight, tip],
              [x - 0.05, 0.03, z],
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
      const [x0, z0, x1, z1] = dimensions("arena");
      floor(x0, z0, x1, z1);
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
    }
    // B12 Sede: front volume, two pitches and a lower side annex. Identity is
    // architectural, not a sign or invented claim about the commercial area.
    {
      const [x0, z0, x1, z1] = dimensions("sede");
      floor(x0, z0, x1, z1);
      box("paintedWall", x0 + 0.3, 0.03, z0 + 0.5, x1 - 1.7, 2.8, z1 - 0.5, "#ebe8df");
      roof(x0 + 0.2, z0 + 0.35, x1 - 1.6, z1 - 0.35, 2.8, 1.65, "#b0b4ad");
      box("paintedWall", x1 - 1.7, 0.03, z0 + 2.8, x1 - 0.3, 1.75, z1 - 0.5, "#e3dfd5");
      roof(x1 - 1.75, z0 + 2.7, x1 - 0.2, z1 - 0.4, 1.75, 0.42, "#c7cbc3");
      for (let i = 0; i < 3; i++)
        box(
          "glass",
          x0 + 0.28,
          0.6,
          z0 + 1.0 + i * 1.7,
          x0 + 0.31,
          2.25,
          z0 + 2.0 + i * 1.7,
          "#b9cfce",
        );
    }
    // C5-C8: four recognisably different cultural houses. These are context
    // structures only; no signage, flags, tenants or source commercial data.
    const cultural = ["etnia-polonesa", "etnia-italiana", "etnia-alema", "etnia-afro"] as const;
    cultural.forEach((id, index) => {
      const [x0, z0, x1, z1] = dimensions(id);
      const y = index === 1 ? 2.8 : 2.25;
      floor(x0, z0, x1, z1);
      box(
        "paintedWall",
        x0 + 0.4,
        index === 1 ? 0.55 : 0.03,
        z0 + 0.5,
        x1 - 0.5,
        y,
        z1 - 0.5,
        index === 0 ? "#bca98d" : index === 3 ? "#e7d9c2" : "#efede4",
      );
      if (index === 1 || index === 3) {
        if (index === 1)
          box("concrete", x0 + 0.4, 0.03, z0 + 0.5, x1 - 0.5, 0.55, z1 - 0.5, "#d0c7b7");
        hipRoof(
          x0 + 0.22,
          z0 + 0.32,
          x1 - 0.3,
          z1 - 0.32,
          y,
          0.85,
          index === 1 ? "#b9907e" : "#a99d91",
        );
      } else {
        roof(
          x0 + 0.22,
          z0 + 0.32,
          x1 - 0.3,
          z1 - 0.32,
          y,
          index === 0 ? 1.65 : 1.35,
          index === 0 ? "#8b8176" : "#a99d91",
        );
      }
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
    });
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
  const labels = createPermanentParkLabels();
  if (labels) group.add(labels.mesh);
  return {
    group,
    metadata: {
      sourceRevision: "a09a4c68052a7c5fb2a1966d6e1e67980264e8fd",
      schematic: true,
      landmarks: PERMANENT_PARK_LANDMARKS.map(({ id }) => id),
      drawBatches: group.children.length,
      labelCount: labels?.labels ?? 0,
      textureBytes: labels?.textureBytes ?? 0,
    },
    // All landmarks and architectural silhouettes are essential at every tier.
    setQuality(_quality: SurfaceQuality) {},
    dispose() {
      if (disposed) return;
      disposed = true;
      labels?.dispose();
      for (const geometry of owned) geometry.dispose();
      group.clear();
    },
  };
}
