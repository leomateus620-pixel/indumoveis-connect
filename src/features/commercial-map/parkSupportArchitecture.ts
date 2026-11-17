import type { ParkArchitectureKit } from "./parkHallArchitecture";

/** D2's open forecourt receives no shadow from the roof in any tier. */
export function viaExpressaRoof(width: number, depth: number) {
  return {
    left: 0.055 * width,
    right: 0.945 * width,
    near: 0.1 * depth,
    far: 0.65 * depth,
    eave: 1.9,
    peak: 2.72,
  };
}

/** Secondary landmarks, registered inside the A2 outline. Openings are only
 * placed on fronts described by the companion reconstruction; rear and service
 * elevations remain plain. Heights and frame sections are drawing estimates. */
export function buildParkSupport(
  id: string,
  w: number,
  d: number,
  { box, member, quad, tri }: ParkArchitectureKit,
) {
  // Longitudinal roof, ridge along Z. Eave soffits are real cross sections.
  const gable = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    eave: number,
    rise: number,
    color: string,
    closed = true,
  ) => {
    const mid = (x0 + x1) / 2;
    for (const [l, hL, r, hR] of [
      [x0, eave, mid, eave + rise],
      [mid, eave + rise, x1, eave],
    ]) {
      quad("paintedSheet", [l, hL, z0], [l, hL, z1], [r, hR, z1], [r, hR, z0], color);
      for (const z of [z0, z1])
        member([l, hL - 0.04, z], [r, hR - 0.04, z], 0.105, 0.1, "#a6aaa5", "paintedSheet");
    }
    if (closed) {
      tri("paintedWall", [x1, eave, z0], [x0, eave, z0], [mid, eave + rise, z0], "#d4d1c5");
      tri("paintedWall", [x0, eave, z1], [x1, eave, z1], [mid, eave + rise, z1], "#d4d1c5");
    }
  };
  if (id === "via-expressa") {
    const { left, right, near, far, eave, peak } = viaExpressaRoof(w, d);
    gable(left, near, right, far, eave, peak - eave, "#b7bdba", false);
    for (const z of [near + 0.14, (near + far) / 2, far - 0.14]) {
      for (const x of [left + 0.19, right - 0.19]) {
        for (const dx of [-0.09, 0.09])
          box(
            "exposedMetal",
            x + dx - 0.035,
            0.03,
            z - 0.075,
            x + dx + 0.035,
            eave,
            z + 0.075,
            "#514e47",
          );
        for (let i = 0; i < 3; i++)
          member(
            [x - 0.09, 0.06 + i * 0.6, z],
            [x + 0.09, 0.63 + i * 0.6, z],
            0.04,
            0.04,
            "#665e51",
          );
      }
      member([left + 0.13, eave - 0.08, z], [right - 0.13, eave - 0.08, z], 0.13, 0.15, "#494943");
      member([left + 0.13, eave - 0.05, z], [w / 2, peak - 0.07, z], 0.14, 0.16, "#66635a");
      member([w / 2, peak - 0.07, z], [right - 0.13, eave - 0.05, z], 0.14, 0.16, "#66635a");
    }
    return;
  }
  if (id === "casa-rotaria") {
    // Main house, lower front wing and small flat-roof entrance of B29.
    for (const [x0, z0, x1, z1, eave, rise] of [
      [0.09 * w, 0.05 * d, 0.91 * w, 0.65 * d, 2.2, 0.84],
      [0.035 * w, 0.59 * d, 0.42 * w, 0.94 * d, 1.8, 0.58],
    ]) {
      box("concrete", x0, 0.03, z0, x1, 0.19, z1, "#ada89d");
      box("paintedWall", x0, 0.19, z0, x1, eave, z1, "#e3dccb");
      gable(x0 - 0.08, z0 - 0.08, x1 + 0.08, z1 + 0.08, eave, rise, "#aaa99e");
    }
    box("paintedWall", w * 0.6, 0.03, d * 0.65, w * 0.87, 1.44, d * 0.79, "#d8d1c3");
    box("paintedSheet", w * 0.59, 1.44, d * 0.64, w * 0.88, 1.54, d * 0.8, "#9b9a92");
    return;
  }
  if (id === "cooperativismo") {
    const eave = 1.78,
      front = d * 0.84,
      left = w * 0.06,
      right = w - left;
    box("concrete", left - 0.12, 0.03, d * 0.1, right + 0.12, 0.23, front + 0.22, "#a9a297");
    box("paintedWall", left, 0.23, d * 0.12, right, eave, front - 0.26, "#e0dcd1");
    for (const [a, b] of [
      [left, w * 0.43],
      [w * 0.57, right],
    ])
      box("paintedWall", a, 0.23, front - 0.26, b, eave, front, "#e0dcd1");
    box(
      "paintedSheet",
      w * 0.43,
      0.25,
      front - 0.245,
      w * 0.57,
      eave * 0.77,
      front - 0.22,
      "#5f655f",
    );
    box("paintedWall", w * 0.43, eave * 0.77, front - 0.26, w * 0.57, eave, front, "#dfd9cd");
    gable(left - 0.16, d * 0.09, right + 0.16, front + 0.12, eave, 0.84, "#a9afad");
    return;
  }
  if (id === "cozinha-soja") {
    const front = d * 0.73,
      back = d * 0.055,
      left = w * 0.045,
      right = w - left,
      eave = 2.12;
    box("masonryBrick", left, 0.03, back, right, 0.52, front, "#905c47");
    box("paintedWall", left, 0.52, back, right, eave, front, "#d9d5c6");
    const mid = (front + back) / 2;
    quad(
      "paintedSheet",
      [left - 0.11, eave, back - 0.11],
      [left - 0.11, eave + 0.32, mid],
      [right + 0.11, eave + 0.32, mid],
      [right + 0.11, eave, back - 0.11],
      "#9ba4a0",
    );
    quad(
      "paintedSheet",
      [left - 0.11, eave + 0.32, mid],
      [left - 0.11, eave, front + 0.1],
      [right + 0.11, eave, front + 0.1],
      [right + 0.11, eave + 0.32, mid],
      "#9ba4a0",
    );
    for (const x of [left, right]) {
      const a: [number, number, number] = [x, eave, back],
        b: [number, number, number] = [x, eave + 0.32, mid],
        c: [number, number, number] = [x, eave, front];
      if (x === left) tri("paintedWall", c, b, a, "#d9d5c6");
      else tri("paintedWall", a, b, c, "#d9d5c6");
    }
    // The pergola provides shade over the photographed window openings. Its
    // timber uses the shared matte warm finish; grain is below map resolution.
    const outer = d * 0.95;
    for (const x of [w * 0.12, w * 0.5, w * 0.88])
      box("warmAccent", x - 0.07, 0.03, outer - 0.08, x + 0.07, 1.58, outer + 0.08, "#725340");
    box("warmAccent", w * 0.1, 1.48, outer - 0.06, w * 0.9, 1.61, outer + 0.06, "#70503b");
    for (let i = 0; i < 9; i++) {
      const x = w * (0.1 + i * 0.1);
      box("warmAccent", x - 0.052, 1.61, front - 0.02, x + 0.052, 1.72, outer + 0.09, "#87684d");
    }
    for (const x of [0.25, 0.5, 0.75].map((f) => f * w)) {
      box("paintedWall", x - 0.48, 0.81, front, x + 0.48, 1.45, front + 0.095, "#89887d");
      box("glass", x - 0.41, 0.88, front + 0.095, x + 0.41, 1.38, front + 0.105, "#626e6b");
      box(
        "exposedMetal",
        x - 0.028,
        0.88,
        front + 0.105,
        x + 0.028,
        1.38,
        front + 0.145,
        "#72736a",
      );
    }
    return;
  }
  if (id === "churrascaria-rural") {
    const left = w * 0.1,
      right = w * 0.94,
      front = d * 0.065,
      back = d * 0.94,
      mid = (back + front) / 2;
    box("concrete", left, 0.03, front, right, 0.15, back, "#87857c");
    box("paintedWall", left, 0.15, front + 0.14, right, 2.21, back, "#414647");
    for (const [a, b] of [
      [left, w * 0.34],
      [w * 0.65, right],
    ])
      box("paintedWall", a, 0.15, front, b, 2.21, front + 0.14, "#414647");
    box("glass", w * 0.34, 0.15, front + 0.112, w * 0.65, 1.72, front + 0.14, "#697d7e");
    box("paintedWall", w * 0.34, 1.72, front, w * 0.65, 2.21, front + 0.14, "#444749");
    box("paintedWall", left, 1.77, front - 0.055, right, 1.99, front, "#a84a40");
    quad(
      "paintedSheet",
      [left - 0.11, 2.21, front - 0.1],
      [left - 0.11, 3.0, mid],
      [right + 0.11, 3.0, mid],
      [right + 0.11, 2.21, front - 0.1],
      "#555e60",
    );
    quad(
      "paintedSheet",
      [left - 0.11, 3.0, mid],
      [left - 0.11, 2.21, back + 0.1],
      [right + 0.11, 2.21, back + 0.1],
      [right + 0.11, 3.0, mid],
      "#555e60",
    );
    for (const x of [left, right]) {
      const a: [number, number, number] = [x, 2.21, front],
        b: [number, number, number] = [x, 3, mid],
        c: [number, number, number] = [x, 2.21, back];
      if (x === left) tri("paintedWall", c, b, a, "#444749");
      else tri("paintedWall", a, b, c, "#444749");
    }
  }
}
