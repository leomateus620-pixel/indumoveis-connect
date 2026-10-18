import * as THREE from "three";

export type HouseForm = "courtyard" | "split" | "villa" | "compact" | "two-storey" | "gable";
export type HouseStructuralInput = {
  center: readonly [number, number];
  width: number;
  depth: number;
  height: number;
  roof: "hip" | "gable" | "flat";
  facing: -1 | 1;
  form: HouseForm;
};
export type HouseArchitectureBucket = { position: number[]; color: number[]; uv: number[] };
export type HouseArchitectureBatches = Record<
  "walls" | "roof" | "detail" | "glass",
  HouseArchitectureBucket
>;
type V = [number, number, number];
type Volume = {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  base: number;
  height: number;
  role: "main" | "wing" | "garage" | "upper";
  roof: "hip" | "gable" | "flat" | "lean";
  axis: "x" | "z";
};
type Opening = {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  kind: "window" | "door" | "garage";
};

const WALLS = ["#d4cfc0", "#e1dccf", "#c5c4b9", "#d9c9ad", "#c9c4b4"];
const ROOFS = ["#986952", "#a9775b", "#65716f", "#8f8d7e", "#b6b8ad", "#765748"];
const GROUND_Y = -0.1;

/** Batched architecture only. No mesh, material, texture, camera, source entity
 * or cadastral transform is owned here. Local front is -Z; facing mirrors the
 * complete structure, including apertures, verandas and attached garages. */
export function appendHouseArchitecture(
  house: HouseStructuralInput,
  index: number,
  batches: HouseArchitectureBatches,
) {
  if (
    ![...house.center, house.width, house.depth, house.height].every(Number.isFinite) ||
    house.width <= 0 ||
    house.depth <= 0 ||
    house.height <= 0
  )
    throw new Error("urban-architecture-invalid-dimensions");
  const { width: w, depth: d, height: h } = house;
  const wallColor = WALLS[Math.abs(index) % WALLS.length];
  const roofColor = ROOFS[Math.abs(index) % ROOFS.length];
  const mirror = -house.facing;
  // Repeated forms in the denser blocks alternate the entire attached plan,
  // not only roof colours: entry court, garage and cross-ridge swap together.
  const handedness = Math.floor(Math.abs(index) / 6) % 2 ? -1 : 1;
  let windows = 0,
    roofParts = 0,
    doors = 0,
    pillars = 0,
    peak = 0;
  const start = Object.values(batches).reduce((sum, batch) => sum + batch.position.length / 9, 0);
  const volumes: Volume[] = [];
  const world = ([x, y, z]: V): V => [
    house.center[0] + x * handedness,
    GROUND_Y + y,
    house.center[1] + z * mirror,
  ];
  function triangle(target: HouseArchitectureBucket, a: V, b: V, c: V, hex: string, outward?: V) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal: V = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    // Clipping can leave microscopic edges that collapse after the parent
    // rotates/translates a house and stores world positions/UVs as Float32.
    // The smallest intentional frame is .018 units, far above this threshold.
    const shortestEdge = Math.min(
      Math.hypot(...ab),
      Math.hypot(...ac),
      Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]),
    );
    if (Math.hypot(...normal) < 1e-8 || shortestEdge < 1e-4) return;
    if (outward && normal.reduce((sum, value, axis) => sum + value * outward[axis], 0) < 0)
      [b, c] = [c, b];
    if (mirror * handedness < 0) [b, c] = [c, b];
    const color = new THREE.Color(hex);
    const nx = Math.abs(normal[0]),
      ny = Math.abs(normal[1]),
      nz = Math.abs(normal[2]);
    const dominant = ny >= Math.max(nx, nz) ? 1 : nx > nz ? 0 : 2;
    for (const local of [a, b, c]) {
      const p = world(local);
      target.position.push(...p);
      target.color.push(color.r, color.g, color.b);
      // Same dominant-face world projection on roofs, reveals and vertical
      // walls; no zero-area facade UVs or camera-dependent texture movement.
      target.uv.push((dominant === 0 ? p[2] : p[0]) / 2.8, (dominant === 1 ? p[2] : p[1]) / 2.8);
      peak = Math.max(peak, local[1]);
    }
  }
  function quad(target: HouseArchitectureBucket, a: V, b: V, c: V, e: V, hex: string, outward?: V) {
    triangle(target, a, b, c, hex, outward);
    triangle(target, a, c, e, hex, outward);
  }
  function box(
    target: HouseArchitectureBucket,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color: string,
  ) {
    quad(target, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], color, [0, 0, -1]);
    quad(target, [x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], color, [0, 0, 1]);
    quad(target, [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], color, [-1, 0, 0]);
    quad(target, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], color, [1, 0, 0]);
    quad(target, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], color, [0, 1, 0]);
  }
  const volume = (
    cx: number,
    cz: number,
    width: number,
    depth: number,
    height: number,
    role: Volume["role"],
    roof: Volume["roof"],
    base = 0,
    axis: Volume["axis"] = "z",
  ) => {
    const result: Volume = {
      x0: cx - width / 2,
      x1: cx + width / 2,
      z0: cz - depth / 2,
      z1: cz + depth / 2,
      base,
      height,
      role,
      roof,
      axis,
    };
    volumes.push(result);
    return result;
  };
  // Roof volume must remain readable in the distant overhead view. A lower
  // eave reserves the existing total building height for real pitched roofs.
  const wallHeight = h * 0.67;
  let entry: Volume;
  switch (house.form) {
    case "courtyard":
      entry = volume(-w * 0.265, 0, w * 0.43, d * 0.92, wallHeight, "main", house.roof);
      volume(
        w * 0.205,
        d * 0.275,
        w * 0.51,
        d * 0.37,
        wallHeight,
        "wing",
        house.roof === "flat" ? "flat" : "hip",
        0,
        "x",
      );
      volume(w * 0.21, -d * 0.31, w * 0.52, d * 0.3, wallHeight * 0.78, "garage", "hip");
      break;
    case "split":
      entry = volume(
        -w * 0.24,
        d * 0.08,
        w * 0.5,
        d * 0.77,
        wallHeight,
        "main",
        house.roof === "flat" ? "flat" : "gable",
        0,
        "z",
      );
      volume(
        w * 0.245,
        -d * 0.17,
        w * 0.47,
        d * 0.58,
        wallHeight,
        "wing",
        house.roof === "flat" ? "flat" : "gable",
        0,
        "x",
      );
      volume(w * 0.32, d * 0.31, w * 0.28, d * 0.25, wallHeight * 0.77, "garage", "flat");
      break;
    case "villa":
      entry = volume(w * 0.07, d * 0.13, w * 0.82, d * 0.6, wallHeight, "main", house.roof, 0, "x");
      volume(-w * 0.3, -d * 0.32, w * 0.38, d * 0.3, wallHeight * 0.82, "garage", "hip");
      volume(w * 0.28, -d * 0.19, w * 0.32, d * 0.28, wallHeight * 0.93, "wing", "gable");
      break;
    case "compact":
      entry = volume(
        -w * 0.15,
        d * 0.07,
        w * 0.65,
        d * 0.77,
        wallHeight,
        "main",
        house.roof === "flat" ? "flat" : "hip",
      );
      volume(w * 0.325, -d * 0.17, w * 0.3, d * 0.57, wallHeight * 0.79, "garage", "flat");
      volume(w * 0.31, d * 0.31, w * 0.27, d * 0.23, wallHeight * 0.72, "wing", "lean");
      break;
    case "two-storey": {
      const lower = Math.min(1.85, h * 0.9);
      entry = volume(0, 0, w * 0.94, d * 0.84, lower, "main", "flat");
      volume(
        -w * 0.12,
        d * 0.13,
        w * 0.59,
        d * 0.55,
        3.8 - lower - 0.04 - (house.roof === "flat" ? 0.18 : 0.447),
        "upper",
        house.roof === "flat" ? "flat" : "hip",
        lower + 0.04,
      );
      volume(w * 0.29, -d * 0.345, w * 0.36, d * 0.25, lower * 0.79, "garage", "flat");
      break;
    }
    case "gable":
      entry = volume(-w * 0.15, d * 0.03, w * 0.65, d * 0.87, wallHeight, "main", "gable");
      volume(w * 0.325, -d * 0.14, w * 0.3, d * 0.58, wallHeight * 0.91, "garage", "gable", 0, "x");
      volume(w * 0.29, d * 0.345, w * 0.34, d * 0.24, wallHeight * 0.82, "wing", "hip", 0, "x");
      break;
  }

  function facade(v: Volume, side: number) {
    const normals: V[] = [
      [0, 0, -1],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ];
    const normal = normals[side];
    const origin: V =
      side === 0
        ? [v.x0, v.base, v.z0]
        : side === 1
          ? [v.x1, v.base, v.z0]
          : side === 2
            ? [v.x1, v.base, v.z1]
            : [v.x0, v.base, v.z1];
    const tangent: V =
      side === 0 ? [1, 0, 0] : side === 1 ? [0, 0, 1] : side === 2 ? [-1, 0, 0] : [0, 0, -1];
    const length = side % 2 ? v.z1 - v.z0 : v.x1 - v.x0;
    const at = (u: number, y: number, depth = 0): V => [
      origin[0] + tangent[0] * u + normal[0] * depth,
      origin[1] + y,
      origin[2] + tangent[2] * u + normal[2] * depth,
    ];
    const covered = (u: number, y: number) => {
      const p = at(u, y, 0.012);
      return volumes.some(
        (other) =>
          other !== v &&
          p[0] > other.x0 &&
          p[0] < other.x1 &&
          p[2] > other.z0 &&
          p[2] < other.z1 &&
          p[1] > other.base &&
          p[1] < other.base + other.height,
      );
    };
    const openings: Opening[] = [];
    const primaryDoor = (v === entry || v.role === "upper") && side === 0;
    if (v.role === "garage" && side === 0) {
      const width = Math.min(length * 0.76, 1.65);
      openings.push({
        u0: (length - width) / 2,
        u1: (length + width) / 2,
        y0: 0,
        y1: v.height * 0.78,
        kind: "garage",
      });
    } else if (v.role !== "garage") {
      const count = length > 3.2 ? 2 : 1;
      for (let slot = 0; slot < count; slot++) {
        const center = length * (count === 2 ? (slot ? 0.79 : 0.21) : primaryDoor ? 0.73 : 0.5);
        const width = Math.min(0.94, length * (count === 2 ? 0.25 : 0.3));
        if (!covered(center, v.height * 0.6))
          openings.push({
            u0: center - width / 2,
            u1: center + width / 2,
            y0: v.height * 0.38,
            y1: v.height * 0.76,
            kind: "window",
          });
      }
      if (primaryDoor) {
        const center = length * (count === 2 ? 0.5 : 0.25),
          width = Math.min(0.64, length * 0.25);
        openings.push({
          u0: center - width / 2,
          u1: center + width / 2,
          y0: 0,
          y1: v.height * 0.82,
          kind: "door",
        });
      }
    }
    const cuts = new Set([0, length, ...openings.flatMap((o) => [o.u0, o.u1])]);
    for (const other of volumes) {
      if (other === v) continue;
      const coordinates = [
        [other.x0, other.z0],
        [other.x1, other.z1],
      ].map(([x, z]) => (x - origin[0]) * tangent[0] + (z - origin[2]) * tangent[2]);
      coordinates.forEach((u) => {
        if (u > 0 && u < length) cuts.add(u);
      });
    }
    const ordered = [...cuts].sort((a, b) => a - b);
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1],
        b = ordered[i],
        mid = (a + b) / 2;
      const ranges = openings.filter((o) => mid > o.u0 && mid < o.u1).map((o) => [o.y0, o.y1]);
      const ys = [
        0,
        v.height,
        ...ranges.flat(),
        ...volumes.flatMap((o) => [o.base - v.base, o.base + o.height - v.base]),
      ]
        .filter((y) => y >= 0 && y <= v.height)
        .sort((a, b) => a - b);
      for (let j = 1; j < ys.length; j++) {
        const low = ys[j - 1],
          high = ys[j],
          middle = (low + high) / 2;
        if (
          high - low < 1e-6 ||
          ranges.some(([min, max]) => middle > min && middle < max) ||
          covered(mid, middle)
        )
          continue;
        quad(batches.walls, at(a, low), at(b, low), at(b, high), at(a, high), wallColor, normal);
      }
    }
    for (const o of openings) {
      if (covered((o.u0 + o.u1) / 2, (o.y0 + o.y1) / 2)) continue;
      const recess = -0.075;
      for (const [a, b] of [
        [at(o.u0, o.y0), at(o.u0, o.y1)],
        [at(o.u1, o.y1), at(o.u1, o.y0)],
        [at(o.u0, o.y1), at(o.u1, o.y1)],
        [at(o.u1, o.y0), at(o.u0, o.y0)],
      ] as [V, V][]) {
        const inside = (p: V): V => [p[0] + normal[0] * recess, p[1], p[2] + normal[2] * recess];
        quad(batches.detail, a, b, inside(b), inside(a), "#aaa79c");
      }
      if (o.kind === "window") {
        windows++;
        quad(
          batches.glass,
          at(o.u0 + 0.035, o.y0 + 0.035, recess),
          at(o.u1 - 0.035, o.y0 + 0.035, recess),
          at(o.u1 - 0.035, o.y1 - 0.035, recess),
          at(o.u0 + 0.035, o.y1 - 0.035, recess),
          "#dce9e9",
          normal,
        );
        const frame = 0.045;
        for (const [u0, u1, y0, y1] of [
          [o.u0, o.u1, o.y0, o.y0 + frame],
          [o.u0, o.u1, o.y1 - frame, o.y1],
          [o.u0, o.u0 + frame, o.y0, o.y1],
          [o.u1 - frame, o.u1, o.y0, o.y1],
          [(o.u0 + o.u1) / 2 - 0.018, (o.u0 + o.u1) / 2 + 0.018, o.y0, o.y1],
        ])
          quad(
            batches.detail,
            at(u0, y0, 0.012),
            at(u1, y0, 0.012),
            at(u1, y1, 0.012),
            at(u0, y1, 0.012),
            "#dddcd2",
            normal,
          );
        const a = at(o.u0 - 0.04, o.y0 - 0.055, -0.02),
          b = at(o.u1 + 0.04, o.y0, 0.11);
        box(
          batches.detail,
          Math.min(a[0], b[0]),
          a[1],
          Math.min(a[2], b[2]),
          Math.max(a[0], b[0]),
          b[1],
          Math.max(a[2], b[2]),
          "#bbbdb3",
        );
      } else {
        doors++;
        quad(
          batches.detail,
          at(o.u0, o.y0, recess),
          at(o.u1, o.y0, recess),
          at(o.u1, o.y1, recess),
          at(o.u0, o.y1, recess),
          o.kind === "garage" ? "#8f948c" : "#645e52",
          normal,
        );
        if (o.kind === "garage")
          for (let slat = 1; slat < 5; slat++) {
            const y = (o.y1 * slat) / 5;
            quad(
              batches.detail,
              at(o.u0, y, recess + 0.005),
              at(o.u1, y, recess + 0.005),
              at(o.u1, y + 0.018, recess + 0.005),
              at(o.u0, y + 0.018, recess + 0.005),
              "#757d76",
              normal,
            );
          }
      }
    }
  }

  type RoofFace = { volume: Volume; polygon: V[] };
  const eave = Math.min(0.2, Math.min(w, d) * 0.028);
  const riseFor = (v: Volume) =>
    v.roof === "flat"
      ? 0
      : v.role === "upper"
        ? 0.42
        : Math.min(h * 0.31, Math.min(v.x1 - v.x0, v.z1 - v.z0) * 0.3);
  const roofFaces: RoofFace[] = [];
  function roofFrame(v: Volume) {
    const x0 = v.x0 - eave,
      x1 = v.x1 + eave,
      z0 = v.z0 - eave,
      z1 = v.z1 + eave;
    const y = v.base + v.height,
      rise = riseFor(v),
      cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    const halfSpan = v.axis === "z" ? (x1 - x0) / 2 : (z1 - z0) / 2;
    // Four-water hips terminate where a 45-degree hip meets the main ridge.
    const inset =
      v.roof === "hip" ? Math.min(halfSpan, (v.axis === "z" ? z1 - z0 : x1 - x0) * 0.43) : 0;
    const north: V = v.axis === "z" ? [cx, y + rise, z0 + inset] : [x0 + inset, y + rise, cz];
    const south: V = v.axis === "z" ? [cx, y + rise, z1 - inset] : [x1 - inset, y + rise, cz];
    const corners: V[] =
      v.axis === "z"
        ? [
            [x0, y, z0],
            [x1, y, z0],
            [x1, y, z1],
            [x0, y, z1],
          ]
        : [
            [x0, y, z0],
            [x0, y, z1],
            [x1, y, z1],
            [x1, y, z0],
          ];
    return { x0, x1, z0, z1, y, rise, cx, cz, north, south, corners };
  }
  for (const v of volumes) {
    const f = roofFrame(v),
      [a, b, c, e] = f.corners;
    const addFace = (polygon: V[]) => roofFaces.push({ volume: v, polygon });
    if (v.roof === "flat")
      addFace([
        [f.x0, f.y + 0.085, f.z0],
        [f.x1, f.y + 0.085, f.z0],
        [f.x1, f.y + 0.085, f.z1],
        [f.x0, f.y + 0.085, f.z1],
      ]);
    else if (v.roof === "lean")
      addFace([
        [f.x0, f.y, f.z0],
        [f.x1, f.y + f.rise, f.z0],
        [f.x1, f.y + f.rise, f.z1],
        [f.x0, f.y, f.z1],
      ]);
    else {
      addFace([a, e, f.south, f.north]);
      addFace([f.north, f.south, c, b]);
      if (v.roof === "hip") {
        addFace([a, f.north, b]);
        addFace([c, f.south, e]);
      }
    }
  }
  const planeHeight = (face: RoofFace, p: V) => {
    const [a, b, c] = face.polygon;
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return a[1] - (nx * (p[0] - a[0]) + nz * (p[2] - a[2])) / ny;
  };
  const areaXZ = (polygon: V[]) =>
    polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      return sum + p[0] * q[2] - q[0] * p[2];
    }, 0) / 2;
  function splitFace(polygon: V[], distance: (p: V) => number) {
    const inside: V[] = [],
      outside: V[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = distance(a),
        db = distance(b);
      if (da >= 0) inside.push(a);
      if (da <= 0) outside.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const t = da / (da - db),
          p: V = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        inside.push(p);
        outside.push(p);
      }
    }
    return { inside, outside };
  }
  function visibleRoof(face: RoofFace) {
    let fragments = [face.polygon];
    for (const blocker of roofFaces) {
      if (blocker.volume === face.volume) continue;
      const sign = Math.sign(areaXZ(blocker.polygon));
      const planes = blocker.polygon.map((a, i) => {
        const b = blocker.polygon[(i + 1) % blocker.polygon.length];
        return (p: V) => sign * ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]));
      });
      // Highest intersecting roof wins. Coplanar ownership is deterministic, so
      // crossed/L wings meet at valleys without coincident overlapping tiles.
      const heightDifference = (p: V) => planeHeight(blocker, p) - p[1];
      const coplanar = face.polygon.every((p) => Math.abs(heightDifference(p)) < 1e-8);
      const tie = volumes.indexOf(blocker.volume) > volumes.indexOf(face.volume) ? 1 : -1;
      planes.push(
        coplanar
          ? () => tie
          : (p) => {
              const distance = heightDifference(p);
              return Math.abs(distance) < 1e-9 ? 0 : distance;
            },
      );
      fragments = fragments.flatMap((fragment) => {
        let pending = fragment;
        const result: V[][] = [];
        for (const plane of planes) {
          if (pending.length < 3) break;
          const { inside, outside } = splitFace(pending, plane);
          if (outside.length >= 3 && Math.abs(areaXZ(outside)) > 1e-8) result.push(outside);
          pending = inside;
        }
        return result;
      });
    }
    return fragments;
  }
  const roofSurfaceStart = batches.roof.position.length;
  for (const face of roofFaces)
    for (const polygon of visibleRoof(face))
      for (let i = 1; i < polygon.length - 1; i++) {
        triangle(batches.roof, polygon[0], polygon[i], polygon[i + 1], roofColor, [0, 1, 0]);
      }
  const roofSurfaceTriangles = (batches.roof.position.length - roofSurfaceStart) / 9;
  // Caps are actual slender prisms following the ridge/hip, not boxes that
  // conceal the roof's sloping silhouette. They survive the distant top view.
  function cap(a: V, b: V, width = 0.055) {
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (length < 1e-6) return;
    const nx = (-(b[2] - a[2]) / length) * width,
      nz = ((b[0] - a[0]) / length) * width;
    const p: V = [a[0] + nx, a[1] + 0.027, a[2] + nz],
      q: V = [b[0] + nx, b[1] + 0.027, b[2] + nz];
    const r: V = [b[0] - nx, b[1] + 0.027, b[2] - nz],
      t: V = [a[0] - nx, a[1] + 0.027, a[2] - nz];
    quad(batches.roof, p, q, r, t, roofColor, [0, 1, 0]);
  }
  function roof(v: Volume) {
    const f = roofFrame(v),
      { x0, x1, z0, z1, y, north, south } = f,
      [a, b, c, e] = f.corners;
    roofParts++;
    if (v.roof === "flat") {
      // Raised parapet and a contrasting inset roof keep flat homes legible,
      // while pitched neighbours retain their separate roof character.
      for (const [a, b, c, e] of [
        [x0, z0, x1, z0 + 0.09],
        [x0, z1 - 0.09, x1, z1],
        [x0, z0, x0 + 0.09, z1],
        [x1 - 0.09, z0, x1, z1],
      ])
        box(batches.detail, a, y, b, c, y + 0.18, e, "#cfcec3");
    } else if (v.roof === "lean") {
      triangle(
        batches.walls,
        [v.x0, y, v.z0],
        [v.x1, y, v.z0],
        [v.x1, y + f.rise, v.z0],
        wallColor,
        [0, 0, -1],
      );
      triangle(
        batches.walls,
        [v.x1, y, v.z1],
        [v.x0, y, v.z1],
        [v.x1, y + f.rise, v.z1],
        wallColor,
        [0, 0, 1],
      );
      quad(
        batches.walls,
        [v.x1, y, v.z0],
        [v.x1, y + f.rise, v.z0],
        [v.x1, y + f.rise, v.z1],
        [v.x1, y, v.z1],
        wallColor,
        [1, 0, 0],
      );
    } else {
      if (v.roof === "gable") {
        triangle(batches.walls, a, north, b, wallColor, v.axis === "z" ? [0, 0, -1] : [-1, 0, 0]);
        triangle(batches.walls, c, south, e, wallColor, v.axis === "z" ? [0, 0, 1] : [1, 0, 0]);
      } else {
        cap(a, north, 0.035);
        cap(b, north, 0.035);
        cap(c, south, 0.035);
        cap(e, south, 0.035);
      }
      cap(north, south);
    }
    // Eave fascia follows each roof corner height (including lean-to slope).
    const edge: V[] =
      v.roof === "lean"
        ? [
            [x0, y, z0],
            [x1, y + f.rise, z0],
            [x1, y + f.rise, z1],
            [x0, y, z1],
          ]
        : [
            [x0, y, z0],
            [x1, y, z0],
            [x1, y, z1],
            [x0, y, z1],
          ];
    for (let i = 0; i < 4; i++) {
      const p = edge[i],
        q = edge[(i + 1) % 4];
      quad(batches.detail, [p[0], p[1] - 0.09, p[2]], [q[0], q[1] - 0.09, q[2]], q, p, "#c4c2b5");
    }
  }
  for (const v of volumes) {
    for (let side = 0; side < 4; side++) facade(v, side);
    roof(v);
  }
  function veranda(x0: number, x1: number, z0: number, z1: number, y: number, posts: number) {
    box(batches.detail, x0, 0.015, z0, x1, 0.075, z1, "#b1b6ac");
    box(batches.roof, x0, y, z0, x1, y + 0.09, z1, roofColor);
    roofParts++;
    for (let p = 0; p < posts; p++) {
      const x = THREE.MathUtils.lerp(x0 + 0.09, x1 - 0.09, posts === 1 ? 0.5 : p / (posts - 1));
      box(batches.detail, x - 0.045, 0.075, z0 + 0.04, x + 0.045, y, z0 + 0.13, "#c6c5b8");
      pillars++;
    }
  }
  if (house.form === "villa")
    veranda(-w * 0.04, w * 0.47, -d * 0.41, entry.z0 + 0.12, wallHeight * 0.79, 3);
  else if (house.form === "courtyard")
    veranda(entry.x1 - 0.02, w * 0.19, d * 0.025, d * 0.12, wallHeight * 0.78, 2);
  else if (house.form === "two-storey") {
    const upper = volumes.find((v) => v.role === "upper")!;
    const z = upper.z0;
    veranda(upper.x0, upper.x1, z - d * 0.13, z + 0.08, upper.base, 2);
    // A real balcony edge with two horizontal rails and connected uprights.
    const front = z - d * 0.13;
    box(
      batches.detail,
      upper.x0,
      upper.base + 0.42,
      front,
      upper.x1,
      upper.base + 0.46,
      front + 0.035,
      "#969d96",
    );
    for (const x of [upper.x0, upper.x1, (upper.x0 + upper.x1) / 2])
      box(
        batches.detail,
        x - 0.018,
        upper.base + 0.09,
        front,
        x + 0.018,
        upper.base + 0.46,
        front + 0.035,
        "#969d96",
      );
  } else {
    const x = (entry.x0 + entry.x1) / 2;
    veranda(x - 0.56, x + 0.56, entry.z0 - 0.2, entry.z0 + 0.08, entry.height * 0.84, 2);
  }
  const triangles =
    Object.values(batches).reduce((sum, batch) => sum + batch.position.length / 9, 0) - start;
  return {
    form: house.form,
    handedness,
    volumes: volumes.length,
    windows,
    doors,
    roofParts,
    pillars,
    height: peak,
    triangles,
    roofSurfaceTriangles,
    roofPlanes: roofFaces.length,
    pitchedVolumes: volumes.filter((v) => v.roof !== "flat").length,
    structuralVolumes: volumes.map(({ x0, x1, z0, z1, base, height, role, roof, axis }) => ({
      x0,
      x1,
      z0,
      z1,
      base,
      height,
      role,
      roof,
      axis,
    })),
  };
}
