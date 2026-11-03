import * as THREE from "three";
import type { MapEntity, Point } from "./data/territory";
import { getPavilionPresentation } from "./architectureOrientation";
import { SURFACE_PALETTE, type SurfaceFamily } from "./surfaceMaterials";

export type PhotoVertex = [number, number, number];
export type PhotoBucket = { positions: number[]; colors: number[]; uvs: number[] };
export interface PhotoBuilder {
  w: number;
  h: number;
  depth: number;
  rise: number;
  box(
    f: SurfaceFamily,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color?: string,
  ): void;
  beam(f: SurfaceFamily, a: PhotoVertex, b: PhotoVertex, thickness: number, color?: string): void;
  quad(
    f: SurfaceFamily,
    a: PhotoVertex,
    b: PhotoVertex,
    c: PhotoVertex,
    d: PhotoVertex,
    color?: string,
  ): void;
  window(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z?: number,
    mullions?: number,
    rows?: number,
  ): void;
  gate(x0: number, x1: number, y0: number, y1: number, z?: number): void;
  wall(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z?: number,
    color?: string,
    family?: SurfaceFamily,
  ): void;
  truss(a: PhotoVertex, b: PhotoVertex, height: number, thickness: number, color?: string): void;
  pitchedCanopy(
    x0: number,
    x1: number,
    zFront: number,
    zBack: number,
    eave: number,
    rise: number,
  ): void;
  horizontalLouvers(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z: number,
    color?: string,
  ): void;
  gablePanel(
    x0: number,
    x1: number,
    eave: number,
    rise: number,
    z: number,
    color?: string,
    family?: SurfaceFamily,
  ): void;
  /** Only sub-pixel ribs use this batch. Silhouette and structure are always present. */
  detail(build: () => void): void;
}

/** Editable native geometry. U is the observer's right, V is inward from the
 * documented facade. Coordinates are registered drawing units, never metres.
 * Material colours are compensated in linear space against the shared palette;
 * this avoids tinting the photographed grey structure green a second time. */
export function createPhotoBuilder(entity: MapEntity, h: number, rise: number) {
  const presentation = getPavilionPresentation(entity)!;
  const [p, q] = presentation.frontEdge;
  const n = presentation.frontNormal;
  const right: Point = [n[1], -n[0]];
  const forward = (q[0] - p[0]) * right[0] + (q[1] - p[1]) * right[1] > 0;
  const origin = forward ? p : q,
    end = forward ? q : p;
  const w = Math.hypot(end[0] - origin[0], end[1] - origin[1]);
  const u: Point = [(end[0] - origin[0]) / w, (end[1] - origin[1]) / w];
  const v: Point = [u[1], -u[0]];
  const depth = Math.max(
    ...entity.polygon.map((point) => (point[0] - origin[0]) * v[0] + (point[1] - origin[1]) * v[1]),
  );
  const main = new Map<SurfaceFamily, PhotoBucket>();
  const fine = new Map<SurfaceFamily, PhotoBucket>();
  let fineMode = false;
  const min: PhotoVertex = [Infinity, Infinity, Infinity],
    max: PhotoVertex = [-Infinity, -Infinity, -Infinity];
  const world = ([x, y, z]: PhotoVertex): PhotoVertex => [
    origin[0] + u[0] * x + v[0] * z,
    y,
    origin[1] + u[1] * x + v[1] * z,
  ];
  const colorCache = new Map<string, number[]>();
  function triangle(
    f: SurfaceFamily,
    a: PhotoVertex,
    b: PhotoVertex,
    c: PhotoVertex,
    color = "#ffffff",
  ) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    if (
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ) < 1e-11
    )
      return;
    const collection = fineMode ? fine : main;
    let target = collection.get(f);
    if (!target) {
      target = { positions: [], colors: [], uvs: [] };
      collection.set(f, target);
    }
    const key = `${f}:${color}`;
    let tint = colorCache.get(key);
    if (!tint) {
      const value = new THREE.Color(color),
        base = new THREE.Color(SURFACE_PALETTE[f]);
      tint = [value.r / base.r, value.g / base.g, value.b / base.b];
      colorCache.set(key, tint);
    }
    // The observer-right/inward basis is mirrored relative to world X/Z.
    // Reverse winding once here so every roof, reveal and underside is lit correctly.
    const normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]),
    );
    const plane =
      Math.abs(normal.y) > Math.max(Math.abs(normal.x), Math.abs(normal.z))
        ? "ground"
        : Math.abs(normal.x) > Math.abs(normal.z)
          ? "side"
          : "front";
    for (const p of [a, c, b]) {
      const wp = world(p);
      target.positions.push(...wp);
      target.colors.push(...tint);
      // Physical drawing-unit UVs on vertical faces; roofs use their plan span.
      target.uvs.push(plane === "side" ? p[2] : p[0], plane === "ground" ? p[2] : p[1]);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], wp[k]);
        max[k] = Math.max(max[k], wp[k]);
      }
    }
  }
  const quad: PhotoBuilder["quad"] = (f, a, b, c, d, color) => {
    triangle(f, a, b, c, color);
    triangle(f, a, c, d, color);
  };
  const box: PhotoBuilder["box"] = (f, x, y, z, sx, sy, sz, color) => {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    const a = x - sx / 2,
      b = x + sx / 2,
      lo = y - sy / 2,
      hi = y + sy / 2,
      front = z - sz / 2,
      back = z + sz / 2;
    quad(f, [a, lo, front], [a, hi, front], [b, hi, front], [b, lo, front], color);
    quad(f, [a, lo, back], [b, lo, back], [b, hi, back], [a, hi, back], color);
    quad(f, [a, hi, front], [a, hi, back], [b, hi, back], [b, hi, front], color);
    quad(f, [a, lo, front], [b, lo, front], [b, lo, back], [a, lo, back], color);
    quad(f, [a, lo, front], [a, lo, back], [a, hi, back], [a, hi, front], color);
    quad(f, [b, lo, front], [b, hi, front], [b, hi, back], [b, lo, back], color);
  };
  const beam: PhotoBuilder["beam"] = (f, a, b, thickness, color) => {
    const start = new THREE.Vector3(...a),
      finish = new THREE.Vector3(...b);
    const axis = finish.clone().sub(start).normalize();
    const side = new THREE.Vector3()
      .crossVectors(
        axis,
        Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
      )
      .normalize()
      .multiplyScalar(thickness / 2);
    const up = new THREE.Vector3()
      .crossVectors(axis, side)
      .normalize()
      .multiplyScalar(thickness / 2);
    const corners = (p: THREE.Vector3) =>
      [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ].map(
        ([s, t]) =>
          p.clone().addScaledVector(side, s).addScaledVector(up, t).toArray() as PhotoVertex,
      );
    const left = corners(start),
      right = corners(finish);
    // Closed square hollow-section representation, shared batch rather than objects.
    quad(f, left[3], left[2], left[1], left[0], color);
    quad(f, right[0], right[1], right[2], right[3], color);
    for (let i = 0; i < 4; i++)
      quad(f, left[i], left[(i + 1) % 4], right[(i + 1) % 4], right[i], color);
  };
  const wall: PhotoBuilder["wall"] = (
    x0,
    x1,
    y0,
    y1,
    z = 0,
    color = "#e7e7de",
    family = "paintedWall",
  ) => box(family, (x0 + x1) / 2, (y0 + y1) / 2, z + 0.09, x1 - x0, y1 - y0, 0.18, color);
  const window: PhotoBuilder["window"] = (x0, x1, y0, y1, z = 0, mullions = 3, rows = 2) => {
    const t = Math.min(0.045, (x1 - x0) / 25);
    for (let column = 0; column < mullions; column++)
      for (let row = 0; row < rows; row++) {
        const left = x0 + ((x1 - x0) * column) / mullions,
          right = x0 + ((x1 - x0) * (column + 1)) / mullions;
        const bottom = y0 + ((y1 - y0) * row) / rows,
          top = y0 + ((y1 - y0) * (row + 1)) / rows;
        // Discrete deterministic glazing variation represents differently aged
        // panes. Reflections still come from the one shared park environment.
        const tint = ["#667773", "#73837b", "#7c8b82", "#61716f"][
          (column * 3 + row + Math.floor(x0 * 7)) % 4
        ];
        box(
          "glass",
          (left + right) / 2,
          (bottom + top) / 2,
          z + 0.105,
          right - left,
          top - bottom,
          0.025,
          tint,
        );
      }
    for (let i = 0; i <= mullions; i++)
      box(
        "architecturalFrame",
        x0 + ((x1 - x0) * i) / mullions,
        (y0 + y1) / 2,
        z + 0.055,
        t,
        y1 - y0 + 0.025,
        0.075,
        "#5a6061",
      );
    for (let i = 0; i <= rows; i++)
      box(
        "architecturalFrame",
        (x0 + x1) / 2,
        y0 + ((y1 - y0) * i) / rows,
        z + 0.05,
        x1 - x0,
        t,
        0.085,
        "#687071",
      );
    box("concrete", (x0 + x1) / 2, y0 - 0.025, z + 0.025, x1 - x0 + 0.06, 0.05, 0.2, "#b0ada3");
  };
  const detail: PhotoBuilder["detail"] = (build) => {
    const previous = fineMode;
    fineMode = true;
    try {
      build();
    } finally {
      fineMode = previous;
    }
  };
  const gate: PhotoBuilder["gate"] = (x0, x1, y0, y1, z = 0) => {
    box("paintedSheet", (x0 + x1) / 2, (y0 + y1) / 2, z + 0.16, x1 - x0, y1 - y0, 0.06, "#777d7e");
    for (const x of [x0, x1])
      box("architecturalFrame", x, (y0 + y1) / 2, z + 0.03, 0.06, y1 - y0 + 0.05, 0.19, "#616669");
    box("architecturalFrame", (x0 + x1) / 2, y1, z + 0.03, x1 - x0, 0.07, 0.19, "#65696b");
    box(
      "architecturalFrame",
      (x0 + x1) / 2,
      y0 + (y1 - y0) * 0.69,
      z + 0.11,
      x1 - x0,
      0.035,
      0.08,
      "#686d6d",
    );
    box("concrete", (x0 + x1) / 2, y0 - 0.035, z + 0.05, x1 - x0, 0.07, 0.28, "#9b9990");
    detail(() => {
      const count = Math.ceil((x1 - x0) / 0.11);
      for (let i = 1; i < count; i++)
        box(
          "paintedSheet",
          x0 + ((x1 - x0) * i) / count,
          (y0 + y1) / 2,
          z + 0.115,
          0.018,
          y1 - y0,
          0.025,
          "#9a9d9b",
        );
    });
  };
  const truss: PhotoBuilder["truss"] = (a, b, height, thickness, color = "#858c89") => {
    const topA: PhotoVertex = [a[0], a[1] + height, a[2]],
      topB: PhotoVertex = [b[0], b[1] + height, b[2]];
    beam("architecturalFrame", a, b, thickness, color);
    beam("architecturalFrame", topA, topB, thickness, color);
    const count = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.55));
    let previous = a;
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const next: PhotoVertex = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t + (i % 2 ? height : 0),
        a[2] + (b[2] - a[2]) * t,
      ];
      beam("architecturalFrame", previous, next, thickness * 0.75, color);
      previous = next;
    }
  };
  const pitchedCanopy: PhotoBuilder["pitchedCanopy"] = (
    x0,
    x1,
    zFront,
    zBack,
    eave,
    canopyRise,
  ) => {
    const mid = (x0 + x1) / 2;
    for (const [left, right, yl, yr] of [
      [x0, mid, eave, eave + canopyRise],
      [mid, x1, eave + canopyRise, eave],
    ]) {
      const a: PhotoVertex = [left, yl, zFront],
        b: PhotoVertex = [right, yr, zFront],
        c: PhotoVertex = [right, yr, zBack],
        d: PhotoVertex = [left, yl, zBack];
      quad("paintedSheet", d, c, b, a, "#919590");
      quad(
        "paintedSheet",
        [a[0], a[1] - 0.055, a[2]],
        [b[0], b[1] - 0.055, b[2]],
        [c[0], c[1] - 0.055, c[2]],
        [d[0], d[1] - 0.055, d[2]],
        "#69706e",
      );
      beam("paintedSheet", a, b, 0.065, "#6f7573");
      truss([left, yl - 0.26, zFront], [right, yr - 0.26, zFront], 0.2, 0.032);
    }
    truss([x0, eave - 0.26, zFront], [x1, eave - 0.26, zFront], 0.2, 0.035);
    for (const x of [x0 + 0.045, x1 - 0.045]) {
      const front = zFront + 0.11;
      beam("architecturalFrame", [x, 0.04, front], [x, eave - 0.08, front], 0.045, "#7e8785");
      for (const side of [-1, 1])
        beam(
          "architecturalFrame",
          [x + side * 0.055, 0.05, front],
          [x + side * 0.055, eave - 0.08, front],
          0.025,
          "#7e8785",
        );
      const steps = Math.ceil((eave - 0.12) / 0.38);
      for (let i = 0; i < steps; i++)
        beam(
          "architecturalFrame",
          [x + (i % 2 ? -0.055 : 0.055), 0.06 + ((eave - 0.16) * i) / steps, front],
          [x + (i % 2 ? 0.055 : -0.055), 0.06 + ((eave - 0.16) * (i + 1)) / steps, front],
          0.022,
          "#8d9691",
        );
      truss([x, eave - 0.26, front], [x, eave - 0.26, zBack], 0.2, 0.03);
      box("concrete", x, 0.065, front, 0.18, 0.13, 0.18, "#a09f97");
    }
  };
  const horizontalLouvers: PhotoBuilder["horizontalLouvers"] = (
    x0,
    x1,
    y0,
    y1,
    z,
    color = "#a8aaa4",
  ) => {
    wall(x0, x1, y0, y1, z + 0.035, color, "paintedSheet");
    detail(() => {
      const count = Math.max(2, Math.ceil((y1 - y0) / 0.09));
      for (let i = 0; i < count; i++)
        box(
          "paintedSheet",
          (x0 + x1) / 2,
          y0 + ((y1 - y0) * (i + 0.5)) / count,
          z - 0.015,
          x1 - x0,
          0.027,
          0.06,
          "#969c97",
        );
    });
  };
  const gablePanel: PhotoBuilder["gablePanel"] = (
    x0,
    x1,
    eave,
    panelRise,
    z,
    color = "#e2dfd2",
    family = "paintedWall",
  ) => {
    const mid = (x0 + x1) / 2;
    triangle(family, [x0, eave, z], [mid, eave + panelRise, z], [x1, eave, z], color);
    triangle(
      family,
      [x1, eave, z + 0.1],
      [mid, eave + panelRise, z + 0.1],
      [x0, eave, z + 0.1],
      color,
    );
    beam(
      "architecturalFrame",
      [x0, eave, z - 0.025],
      [mid, eave + panelRise, z - 0.025],
      0.07,
      "#5e6865",
    );
    beam(
      "architecturalFrame",
      [mid, eave + panelRise, z - 0.025],
      [x1, eave, z - 0.025],
      0.07,
      "#5e6865",
    );
  };
  const builder: PhotoBuilder = {
    w,
    h,
    depth,
    rise,
    box,
    beam,
    quad,
    window,
    gate,
    wall,
    truss,
    pitchedCanopy,
    horizontalLouvers,
    gablePanel,
    detail,
  };
  return { builder, main, fine, min, max, world };
}
