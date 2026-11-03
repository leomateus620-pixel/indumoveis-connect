import type { PhotoBuilder } from "./photoArchitectureKit";

/**
 * Photograph 9: the low roof is hidden by an exposed concrete/steel frame and
 * pale infill, rather than a triangular warehouse front. The repeated side
 * bays and high louvres are visible; heights and hidden rear details are not a
 * measured survey. Coordinates are local to the public front, not the lots.
 */
function buildP1(b: PhotoBuilder) {
  const { w, h, depth } = b;
  const frame = "#525658";
  const infill = "#e7e6df";
  const column = Math.max(0.105, w * 0.019);
  const beam = Math.max(0.1, h * 0.046);
  const doors = [
    { left: 0.205, right: 0.425, height: 0.275 },
    { left: 0.495, right: 0.725, height: 0.435 },
    // The partly screened right-hand bay is conservative, not an interior.
    { left: 0.84, right: 0.945, height: 0.275 },
  ];

  b.box("concrete", w / 2, 0.055, 0.065, w, 0.11, 0.14, "#a1a19a");
  let from = 0;
  for (const door of doors) {
    b.wall(from * w, door.left * w, 0.11, h * 0.47, 0.035, infill);
    b.wall(door.left * w, door.right * w, door.height * h, h * 0.47, 0.035, infill);
    b.gate(door.left * w, door.right * w, 0.11, door.height * h, 0.055);
    from = door.right;
  }
  b.wall(from * w, w, 0.11, h * 0.47, 0.035, infill);

  // Raised structural beams frame two genuinely recessed upper panel courses.
  const bays = [0, 0.25, 0.5, 0.75, 1];
  for (let i = 0; i < bays.length - 1; i++) {
    const left = bays[i] * w + column * 0.52;
    const right = bays[i + 1] * w - column * 0.52;
    b.wall(left, right, h * 0.49, h * 0.81, 0.065, infill);
    b.wall(left, right, h * 0.84, h * 1.005, 0.065, "#e1e2dc");
  }
  for (const at of bays) {
    b.box("architecturalFrame", at * w, h * 0.53, -0.012, column, h * 1.06, 0.2, frame);
  }
  for (const level of [0.47, 0.825, 1.025]) {
    b.box("architecturalFrame", w / 2, h * level, -0.024, w + column, beam, 0.23, frame);
  }
  // The cantilever has a real underside and edge thickness, without a new slab.
  b.box("paintedSheet", w / 2, h * 0.465, -0.16, w + 0.12, 0.085, 0.38, "#747977");
  b.box("architecturalFrame", w / 2, h * 0.447, -0.32, w + 0.12, 0.065, 0.06, frame);

  // Photograph 9 documents the entire near lateral rhythm. The opposite side
  // repeats this structural family but remains an estimated continuation.
  const count = Math.max(5, Math.min(12, Math.round(depth / (w * 0.23))));
  for (const side of [0, w]) {
    const outward = side === 0 ? -1 : 1;
    const faceX = side + outward * 0.012;
    const panelX = side - outward * 0.065;
    for (let bay = 0; bay < count; bay++) {
      const z0 = (bay / count) * depth;
      const z1 = ((bay + 1) / count) * depth;
      const zMid = (z0 + z1) / 2;
      const clear = z1 - z0 - column;
      b.box("paintedWall", panelX, h * 0.285, zMid, 0.12, h * 0.54, clear, infill);
      b.box("paintedWall", panelX, h * 0.765, zMid, 0.12, h * 0.11, clear, infill);
      b.box("paintedWall", panelX, h * 0.94, zMid, 0.12, h * 0.13, clear, "#ddddda");

      // Recessed shadow backing and separate louvre slats, not a painted band.
      b.box(
        "architecturalFrame",
        panelX - outward * 0.035,
        h * 0.63,
        zMid,
        0.06,
        h * 0.15,
        clear,
        "#303838",
      );
      for (let row = 0; row < 3; row++) {
        const y = h * (0.57 + row * 0.055);
        b.beam(
          "paintedSheet",
          [faceX, y, z0 + column / 2],
          [faceX, y, z1 - column / 2],
          0.035,
          "#9a9b94",
        );
      }
      b.box("architecturalFrame", faceX, h * 0.515, z0, column, h * 1.03, column, frame);
    }
    b.box("architecturalFrame", faceX, h * 0.515, depth, column, h * 1.03, column, frame);
    for (const level of [0.535, 0.72, 0.825, 1.025]) {
      b.box("architecturalFrame", faceX, h * level, depth / 2, 0.2, beam, depth, frame);
    }
  }

  // No photograph documents the rear portals. Continue only the supported
  // construction family, with a closed pale infill and dark structural grid.
  // This is an estimated back, not a mirrored copy of the photographed doors.
  b.wall(0, w, 0.11, h * 1.005, depth - 0.18, infill);
  b.box("concrete", w / 2, 0.055, depth - 0.035, w, 0.11, 0.13, "#a1a19a");
  for (const at of bays) {
    b.box("architecturalFrame", at * w, h * 0.53, depth - 0.015, column, h * 1.06, 0.2, frame);
  }
  for (const level of [0.47, 0.825, 1.025]) {
    b.box("architecturalFrame", w / 2, h * level, depth - 0.015, w + column, beam, 0.2, frame);
  }
}

/**
 * Photograph 8: matte, vertically ribbed metal, low roof, low concrete base,
 * three unequal portals. Rib pitch and concealed rear are illustrative; no
 * photographed sky, cables, trees, signage or lighting enter the material.
 */
function buildP14(b: PhotoBuilder) {
  const { w, h, depth, rise } = b;
  const metal = "#c4c5c0";
  const seam = "#acafab";
  const doors = [
    { left: 0.08, right: 0.155, height: 0.285 },
    { left: 0.33, right: 0.455, height: 0.335 },
    { left: 0.665, right: 0.785, height: 0.325 },
  ];
  const plinth = h * 0.045;
  b.box("concrete", w / 2, plinth / 2, 0.06, w, plinth, 0.15, "#aaa99f");
  let from = 0;
  for (const door of doors) {
    b.wall(from * w, door.left * w, plinth, h, 0.025, metal, "paintedSheet");
    b.wall(door.left * w, door.right * w, door.height * h, h, 0.025, metal, "paintedSheet");
    b.gate(door.left * w, door.right * w, plinth, door.height * h, 0.045);
    from = door.right;
  }
  b.wall(from * w, w, plinth, h, 0.025, metal, "paintedSheet");
  b.gablePanel(0, w, h, rise, 0.025, metal, "paintedSheet");

  // Large ribs carry silhouette/shadow in medium views; fine sheet relief is
  // the existing filtered material. These are batched by the kit, not objects.
  const ribs = Math.max(40, Math.min(120, Math.ceil(w / 0.12)));
  for (let i = 0; i <= ribs; i++) {
    const fraction = i / ribs;
    const x = fraction * w;
    const door = doors.find((candidate) => fraction > candidate.left && fraction < candidate.right);
    const bottom = door ? door.height * h + 0.015 : plinth;
    const top = h + rise * (1 - Math.abs(fraction * 2 - 1));
    if (top <= bottom) continue;
    const rib = () =>
      b.box(
        "paintedSheet",
        x,
        (bottom + top) / 2,
        -0.006,
        0.018,
        top - bottom,
        0.034,
        i % 7 ? metal : seam,
      );
    // Retain a coarse vertical cadence in every tier. Only the interleaved
    // narrow ribs disappear at distance, so P14 remains a metal-clad hall.
    if (i % 3) b.detail(rib);
    else rib();
  }
  b.beam("paintedSheet", [0, h, -0.02], [w / 2, h + rise, -0.02], 0.055, "#929893");
  b.beam("paintedSheet", [w / 2, h + rise, -0.02], [w, h, -0.02], 0.055, "#929893");

  // End trims and metal side skins sit ahead of the underlying structural
  // wall. Undocumented side windows are deliberately not invented.
  for (const side of [0, w]) {
    const outward = side === 0 ? -1 : 1;
    b.box(
      "paintedSheet",
      side + outward * 0.025,
      (h + plinth) / 2,
      depth / 2,
      0.05,
      h - plinth,
      depth,
      metal,
    );
    const sideRibs = Math.max(40, Math.min(120, Math.ceil(depth / 0.15)));
    for (let i = 0; i <= sideRibs; i++) {
      const rib = () =>
        b.box(
          "paintedSheet",
          side + outward * 0.056,
          (h + plinth) / 2,
          (i / sideRibs) * depth,
          0.022,
          h - plinth,
          0.018,
          i % 9 ? metal : seam,
        );
      if (i % 3) b.detail(rib);
      else rib();
    }
    b.box("concrete", side, plinth / 2, depth / 2, 0.14, plinth, depth, "#aaa99f");
    b.box("paintedSheet", side + outward * 0.035, h, depth / 2, 0.085, 0.075, depth, "#929893");
  }

  // The unseen rear retains the photographed metal envelope and roof shape.
  // No door, window, campaign sign or service layout is invented here.
  b.wall(0, w, plinth, h, depth - 0.18, metal, "paintedSheet");
  b.gablePanel(0, w, h, rise, depth - 0.1, metal, "paintedSheet");
  b.box("concrete", w / 2, plinth / 2, depth - 0.035, w, plinth, 0.14, "#aaa99f");
  for (let i = 0; i <= ribs; i++) {
    const fraction = i / ribs;
    const top = h + rise * (1 - Math.abs(fraction * 2 - 1));
    const rib = () =>
      b.box(
        "paintedSheet",
        fraction * w,
        (plinth + top) / 2,
        depth + 0.006,
        0.018,
        top - plinth,
        0.034,
        i % 7 ? metal : seam,
      );
    if (i % 3) b.detail(rib);
    else rib();
  }
  b.beam("paintedSheet", [0, h, depth + 0.02], [w / 2, h + rise, depth + 0.02], 0.055, "#929893");
  b.beam("paintedSheet", [w / 2, h + rise, depth + 0.02], [w, h, depth + 0.02], 0.055, "#929893");
}

export function buildPhotoFrameFacade(b: PhotoBuilder, pavilion: 1 | 14): void {
  if (pavilion === 1) buildP1(b);
  else buildP14(b);
}
