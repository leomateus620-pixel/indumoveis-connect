import * as THREE from "three";
import type { Point } from "./data/territory";
import type { SurfaceFamily } from "./surfaceMaterials";

export type ParkVertex = [number, number, number];
type Quad = (
  family: SurfaceFamily,
  a: ParkVertex,
  b: ParkVertex,
  c: ParkVertex,
  d: ParkVertex,
  color: string,
) => void;
type Box = (
  family: SurfaceFamily,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  color: string,
) => void;

/** Keep the roof parallel to the long registered drawing edge. World-aligned
 * bounding boxes sliced off the feet and fascia of the slightly rotated Arena. */
export function registeredHallFrame(polygon: readonly Point[]) {
  let longest = 0,
    ux = 1,
    uz = 0;
  polygon.forEach((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length <= longest) return;
    longest = length;
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const sign = Math.sign(alongX ? dx : dz);
    ux = (sign * (alongX ? dx : dz)) / length;
    uz = (sign * (alongX ? dz : -dx)) / length;
  });
  const xs = polygon.map(([x, z]) => x * ux + z * uz);
  const zs = polygon.map(([x, z]) => z * ux - x * uz);
  const x0 = Math.min(...xs),
    z0 = Math.min(...zs);
  return {
    width: Math.max(...xs) - x0,
    depth: Math.max(...zs) - z0,
    world: ([x, y, z]: ParkVertex): ParkVertex => [
      (x + x0) * ux - (z + z0) * uz,
      y,
      (x + x0) * uz + (z + z0) * ux,
    ],
  };
}

/** Four-sided rectangular section for load-bearing members. Unlike a ribbon
 * the same member has a lit face and an underside from either open end. */
export function createParkMember(quad: Quad) {
  return (
    a: ParkVertex,
    b: ParkVertex,
    width: number,
    height: number,
    color: string,
    family: SurfaceFamily = "exposedMetal",
  ) => {
    const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const side = axis
      .clone()
      .cross(Math.abs(axis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1))
      .normalize();
    const up = side
      .clone()
      .cross(axis)
      .multiplyScalar(height / 2);
    side.multiplyScalar(width / 2);
    const ring = (p: ParkVertex) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(
        ([s, v]) =>
          new THREE.Vector3(...p)
            .addScaledVector(side, s)
            .addScaledVector(up, v)
            .toArray() as ParkVertex,
      );
    const start = ring(a),
      end = ring(b);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(family, start[i], end[i], end[j], start[j], color);
    }
    quad(family, start[0], start[1], start[2], start[3], color);
    quad(family, end[3], end[2], end[1], end[0], color);
  };
}
type Member = ReturnType<typeof createParkMember>;
export type ParkArchitectureKit = {
  box: Box;
  quad: Quad;
  tri: (family: SurfaceFamily, a: ParkVertex, b: ParkVertex, c: ParkVertex, color: string) => void;
  member: Member;
};

export function buildArenaHall(width: number, depth: number, box: Box, quad: Quad) {
  const spring = 1.15,
    rise = 5.5,
    middle = depth / 2,
    radius = middle - 0.83;
  const endInset = 0.18,
    far = width - endInset;
  // Front and rear are genuinely open. Follow the soffit with solid curved
  // ribs sharing nodes between segments, plus longitudinal purlins.
  const profile = (angle: number, offset = 0): [number, number] => [
    spring + (rise - offset) * Math.sin(angle),
    middle - (radius - offset) * Math.cos(angle),
  ];
  const at = (x: number, angle: number, offset = 0): ParkVertex => [x, ...profile(angle, offset)];
  const segments = 24;
  for (let i = 0; i < segments; i++) {
    const a = (Math.PI * i) / segments,
      b = (Math.PI * (i + 1)) / segments;
    quad("paintedSheet", at(endInset, a), at(endInset, b), at(far, b), at(far, a), "#d8dddd");
    quad(
      "paintedSheet",
      at(endInset, a, 0.095),
      at(far, a, 0.095),
      at(far, b, 0.095),
      at(endInset, b, 0.095),
      "#bec7c8",
    );
    for (let arch = 0; arch < 9; arch++) {
      const x = endInset + (arch * (far - endInset - 0.19)) / 8;
      const outer = 0.095,
        inner = arch === 0 || arch === 8 ? 0.51 : 0.34;
      quad(
        "exposedMetal",
        at(x, a, outer),
        at(x, a, inner),
        at(x, b, inner),
        at(x, b, outer),
        "#8d999b",
      );
      quad(
        "exposedMetal",
        at(x + 0.19, b, outer),
        at(x + 0.19, b, inner),
        at(x + 0.19, a, inner),
        at(x + 0.19, a, outer),
        "#a4adae",
      );
      quad(
        "exposedMetal",
        at(x, a, inner),
        at(x + 0.19, a, inner),
        at(x + 0.19, b, inner),
        at(x, b, inner),
        "#667578",
      );
    }
  }
  for (let arch = 0; arch < 9; arch++) {
    const x = endInset + (arch * (far - endInset - 0.19)) / 8;
    for (const z of [middle - radius + 0.15, middle + radius - 0.15]) {
      box("concrete", x - 0.05, 0.03, z - 0.22, x + 0.24, 0.28, z + 0.22, "#9c9e97");
      box("exposedMetal", x, 0.28, z - 0.16, x + 0.19, spring + 0.04, z + 0.16, "#7a898a");
    }
  }
  for (let i = 1; i < 8; i++) {
    const [y, z] = profile((i * Math.PI) / 8, 0.18);
    box(
      "exposedMetal",
      endInset + 0.21,
      y - 0.055,
      z - 0.048,
      far - 0.21,
      y + 0.055,
      z + 0.048,
      "#838f90",
    );
  }
  // The apron meets the existing Mirante plaza. The raised deck sits inside
  // the house and exposes its front fascia to the approach.
  box("concrete", 0.22, 0.03, 1.45, width * 0.56, 0.12, depth - 1.45, "#b7b9b2");
  box("concrete", width * 0.56, 0.03, 1.45, width - 0.62, 0.51, depth - 1.45, "#858b87");
  box(
    "paintedSheet",
    width * 0.56 - 0.012,
    0.39,
    1.45,
    width * 0.56 + 0.035,
    0.51,
    depth - 1.45,
    "#565f5f",
  );
}

export function buildLivestockHall(
  width: number,
  depth: number,
  box: Box,
  quad: Quad,
  member: Member,
) {
  // B9 is continuously occupied in A2. The local reference identifies three
  // roof sections, 5/6/5 bays, translucent inserts and low open-sided walls.
  const limits = [0, 0.305, 0.695, 1],
    bays = [5, 6, 5];
  const eave = 2.3,
    rise = 0.85,
    middle = depth / 2;
  for (let module = 0; module < 3; module++) {
    const left = width * limits[module],
      right = width * limits[module + 1];
    const tint = ["#bbc0bb", "#aeb6b4", "#c2c5bd"][module];
    for (const sign of [-1, 1]) {
      const outer = middle + (sign * depth) / 2;
      const z = outer - sign * 0.22;
      const sheet = (
        x0: number,
        x1: number,
        s0: number,
        s1: number,
        lift: number,
        color: string,
        family: SurfaceFamily,
      ) => {
        const p = (x: number, s: number): ParkVertex => [
          x,
          eave + rise * (1 - s) + lift,
          middle + sign * depth * 0.5 * s,
        ];
        if (sign < 0) quad(family, p(x0, s1), p(x0, s0), p(x1, s0), p(x1, s1), color);
        else quad(family, p(x0, s0), p(x0, s1), p(x1, s1), p(x1, s0), color);
      };
      sheet(left, right, 0, 1, 0, tint, "paintedSheet");
      for (const center of [0.25, 0.75]) {
        const x = left + (right - left) * center,
          half = (right - left) * 0.063;
        sheet(x - half, x + half, 0.33, 0.62, 0.025, "#c7d0c8", "glass");
      }
      box("concrete", left + 0.15, 0.03, z - 0.07, right - 0.15, 0.57, z + 0.07, "#b0a998");
      box(
        "exposedMetal",
        left + 0.14,
        eave - 0.12,
        z - 0.07,
        right - 0.14,
        eave,
        z + 0.07,
        "#7e8279",
      );
      for (const level of [0.82, 1.1])
        box(
          "exposedMetal",
          left + 0.22,
          level,
          z - 0.036,
          right - 0.22,
          level + 0.048,
          z + 0.036,
          "#818a81",
        );
      for (let bay = 0; bay <= bays[module]; bay++) {
        const x = left + 0.16 + (bay * (right - left - 0.32)) / bays[module];
        box("exposedMetal", x - 0.07, 0.03, z - 0.07, x + 0.07, eave, z + 0.07, "#687570");
        member([x, eave - 0.09, z], [x, eave + rise - 0.08, middle], 0.12, 0.14, "#69716e");
      }
    }
    // A folded ridge and transverse end frames mark each run without cutting
    // a passage between it and P7/P5 or dividing the registered floor.
    box(
      "paintedSheet",
      left,
      eave + rise - 0.027,
      middle - 0.085,
      right,
      eave + rise + 0.035,
      middle + 0.085,
      "#dadbd2",
    );
    for (const x of [left + 0.16, right - 0.16]) {
      member([x, eave - 0.14, 0.22], [x, eave - 0.14, depth - 0.22], 0.11, 0.12, "#768079");
      member(
        [x, eave - 0.14, depth * 0.26],
        [x, eave + rise - 0.14, middle],
        0.08,
        0.08,
        "#737971",
      );
      member(
        [x, eave + rise - 0.14, middle],
        [x, eave - 0.14, depth * 0.74],
        0.08,
        0.08,
        "#737971",
      );
    }
  }
}
