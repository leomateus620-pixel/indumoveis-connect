import type { PhotoBuilder } from "./photoArchitectureKit";

/** Photographs 3–7, 2026-11-03. The openings and construction types are
 * observed; their ratios are perspective-based estimates, not measured sizes.
 * Coordinates are facade-local: x runs left to right when facing the hall,
 * negative z projects towards its existing internal street. */
export function buildPhotoHallFacade(b: PhotoBuilder, pavilion: 8 | 13 | 12): void {
  if (pavilion === 12) buildP12(b);
  else if (pavilion === 13) buildP13(b);
  else buildP8(b);
}

const LIGHT = "#e6e5db";
const FRAME = "#4d5553";
const SHEET = "#929794";

/** White masonry and two large portals, with an upper louver/corrugated
 * closure. P13 has no high glazed ribbon like P8. The open Warren trusses
 * and lattice columns are solid members, never lines on a photograph. */
function buildP13(raw: PhotoBuilder): void {
  const b = paintedBrickBuilder(raw);
  const { w, h, rise } = b;
  const gateTop = h * 0.69;
  const doors = [
    [0.18, 0.46],
    [0.53, 0.82],
  ] as const;
  let cursor = 0;
  for (const [start, end] of doors) {
    b.wall(cursor * w, start * w, 0.06, h * 0.75, 0, LIGHT);
    b.gate(start * w, end * w, 0.08, gateTop, 0);
    b.wall(start * w, end * w, gateTop, h * 0.75, 0, LIGHT);
    cursor = end;
  }
  b.wall(cursor * w, w * 0.86, 0.06, h * 0.75, 0, LIGHT);
  b.wall(w * 0.935, w, 0.06, h * 0.75, 0, LIGHT);
  b.wall(w * 0.86, w * 0.935, 0.06, h * 0.43, 0, LIGHT);
  b.wall(w * 0.86, w * 0.935, h * 0.54, h * 0.75, 0, LIGHT);
  b.wall(0, w, h * 0.75, h, 0.035, "#b9b9b0", "paintedSheet");
  b.gablePanel(0, w, h, rise, 0.035, "#b9b9b0", "paintedSheet");

  // Horizontal louver groups alternate with vertical replacement sheets.
  // The upper rows taper with the photographed gable instead of protruding
  // through the roof slope. Their fine pitch is handled by the shared kit.
  for (let group = 0; group < 6; group++) {
    const x0 = w * (0.025 + (group / 6) * 0.95);
    const x1 = w * (0.025 + ((group + 1) / 6) * 0.95);
    const nearestSlope = Math.min(x0, w - x1) / (w * 0.5);
    const top = h + rise * Math.max(0, nearestSlope) - 0.035;
    if (group !== 2 && group !== 4) b.horizontalLouvers(x0, x1, h * 0.77, top, -0.018, "#c7c6b9");
    else {
      const count = Math.max(3, Math.round((x1 - x0) / 0.12));
      b.detail(() => {
        for (let i = 0; i <= count; i++) {
          const x = x0 + ((x1 - x0) * i) / count;
          b.box(
            "paintedSheet",
            x,
            (h * 0.77 + top) * 0.5,
            -0.025,
            0.025,
            top - h * 0.77,
            0.03,
            SHEET,
          );
        }
      });
    }
    b.box(
      "architecturalFrame",
      x0,
      (h * 0.75 + top) * 0.5,
      -0.035,
      0.045,
      top - h * 0.75,
      0.065,
      FRAME,
    );
  }
  b.box("architecturalFrame", w * 0.5, h * 0.745, -0.045, w, 0.12, 0.13, FRAME);
  for (const x of [0.02, 0.165, 0.485, 0.84, 0.985])
    b.box("architecturalFrame", w * x, h * 0.37, -0.055, 0.09, h * 0.74, 0.13, FRAME);

  b.pitchedCanopy(w * 0.13, w * 0.89, -1.12, 0.08, Math.max(2.22, h * 0.69), rise * 0.35);
  // Small exposed brick repair is directly visible beside the right portal.
  b.wall(w * 0.86, w * 0.935, h * 0.43, h * 0.54, 0, "#a96b55", "masonryBrick");
}

/** P8's pale horizontal fronton and high window band distinguish it from
 * P13. The two doors sit below the glazing, separated by a broad white bay. */
function buildP8(raw: PhotoBuilder): void {
  const b = paintedBrickBuilder(raw);
  const { w, h, rise } = b;
  const gateTop = h * 0.6;
  const ribbonSill = h * 0.66;
  const ribbonHead = h * 0.84;
  const doors = [
    [0.265, 0.46],
    [0.755, 0.895],
  ] as const;
  let cursor = 0;
  for (const [start, end] of doors) {
    b.wall(cursor * w, start * w, 0.06, ribbonSill, 0, LIGHT);
    b.gate(start * w, end * w, 0.08, gateTop, 0);
    b.wall(start * w, end * w, gateTop, ribbonSill, 0, LIGHT);
    cursor = end;
  }
  b.wall(cursor * w, w, 0.06, ribbonSill, 0, LIGHT);
  b.wall(0, w * 0.078, ribbonSill, ribbonHead, 0, LIGHT);
  b.wall(w * 0.655, w, ribbonSill, ribbonHead, 0, LIGHT);
  for (let panel = 0; panel < 3; panel++) {
    const x0 = w * (0.078 + panel * 0.193);
    const x1 = w * (0.078 + panel * 0.193 + 0.181);
    b.window(x0, x1, ribbonSill, ribbonHead, 0, 3, 2);
    if (panel < 2) b.wall(x1, w * (0.078 + (panel + 1) * 0.193), ribbonSill, ribbonHead, 0, LIGHT);
  }
  b.wall(w * 0.645, w * 0.655, ribbonSill, ribbonHead, 0, LIGHT);
  b.wall(0, w, ribbonHead, h, 0.015, "#d9d3c0", "paintedSheet");
  b.gablePanel(0, w, h, rise, 0.015, "#d9d3c0", "paintedSheet");

  const low = ribbonHead + 0.035;
  const step = 0.11;
  b.detail(() => {
    for (let y = low; y < h + rise - 0.025; y += step) {
      const inset = y <= h ? 0.018 * w : (w * 0.5 * (y - h)) / Math.max(rise, 0.001);
      if (inset * 2 >= w - 0.04) continue;
      b.box("paintedSheet", w * 0.5, y, -0.028, w - inset * 2, 0.025, 0.035, "#c7c1ae");
    }
  });
  b.box("architecturalFrame", w * 0.5, ribbonSill - 0.025, -0.045, w, 0.115, 0.13, FRAME);
  b.box("architecturalFrame", w * 0.5, ribbonHead + 0.025, -0.045, w, 0.13, 0.14, FRAME);
  for (const x of [0.02, 0.33, 0.64, 0.985]) {
    const top = h + rise * Math.min(x, 1 - x) * 2;
    b.box(
      "architecturalFrame",
      w * x,
      (ribbonHead + top) * 0.5,
      -0.045,
      0.085,
      top - ribbonHead,
      0.13,
      FRAME,
    );
  }
  for (const x of [0.025, 0.985])
    b.box("architecturalFrame", w * x, h * 0.425, -0.055, 0.13, h * 0.85, 0.16, FRAME);
  b.pitchedCanopy(w * 0.24, w * 0.94, -1.1, 0.07, Math.max(2.22, h * 0.66), rise * 0.35);

  // The left roof-edge gutter, elbow and exposed downpipe are observed in
  // photo 5. Their diameters and the hidden rear drain run are unmeasured.
  b.beam("whitePaint", [0.04, h * 0.98, 0], [0.04, h * 0.98, -0.2], 0.045);
  b.beam("whitePaint", [0.04, h * 0.98, -0.2], [0.08, h * 0.91, -0.23], 0.045);
  b.beam("whitePaint", [0.08, h * 0.91, -0.23], [0.08, 0.09, -0.23], 0.045);
}

/** P12's longitudinal rhythm follows photos 6/7: red brick, tall recessed
 * glazing, a white portal bay and a deeply projecting braced eave. The rear
 * sheds are supplied by the previously registered roof, not inferred here. */
function buildP12(b: PhotoBuilder): void {
  const { w, h } = b;
  const sill = h * 0.4;
  const head = h * 0.83;
  const portalStart = w * 0.555;
  const portalEnd = w * 0.705;
  const gateStart = w * 0.577;
  const gateEnd = w * 0.683;
  b.wall(0, portalStart, 0.06, sill, 0, "#af6654", "masonryBrick");
  b.wall(portalEnd, w, 0.06, sill, 0, "#af6654", "masonryBrick");
  b.wall(portalStart, gateStart, 0.06, h * 0.9, 0, LIGHT);
  b.wall(gateEnd, portalEnd, 0.06, h * 0.9, 0, LIGHT);
  b.gate(gateStart, gateEnd, 0.08, h * 0.59, 0);
  b.wall(gateStart, gateEnd, h * 0.59, h * 0.9, 0, LIGHT);

  const windows = [
    [0.018, 0.112],
    [0.13, 0.225],
    [0.244, 0.337],
    [0.356, 0.447],
    [0.466, 0.542],
    [0.718, 0.802],
    [0.819, 0.897],
    [0.914, 0.985],
  ] as const;
  const ranges = [
    [0, 0.555],
    [0.705, 1],
  ] as const;
  for (const [rangeStart, rangeEnd] of ranges) {
    let cursor: number = rangeStart;
    for (const [start, end] of windows) {
      if (start < rangeStart || end > rangeEnd) continue;
      b.wall(cursor * w, start * w, sill, head, 0, "#af6654", "masonryBrick");
      b.window(start * w, end * w, sill, head, 0, 3, 1);
      // Slim top transom rather than a half-height division.
      b.box(
        "exposedMetal",
        ((start + end) * w) / 2,
        h * 0.78,
        0.035,
        (end - start) * w,
        0.025,
        0.025,
        "#a7aba9",
      );
      cursor = end;
    }
    b.wall(cursor * w, rangeEnd * w, sill, head, 0, "#af6654", "masonryBrick");
    b.wall(rangeStart * w, rangeEnd * w, head, h * 0.9, 0, "#af6654", "masonryBrick");
  }
  // Narrow ochre lintel visible between glazing and the shaded roof underside.
  b.wall(0, w, h * 0.9, h * 0.965, -0.015, "#c8a45b", "whitePaint");
  b.wall(0, w, h * 0.965, h, 0, "#9b9c8f", "paintedSheet");

  // Soffit thickness, front gutter and transverse rafters stay present at all
  // quality levels; only surface relief is subject to the renderer's LOD.
  b.box("paintedSheet", w * 0.5, h + 0.015, -0.43, w + 0.1, 0.09, 0.94, "#929b93");
  b.box("paintedSheet", w * 0.5, h + 0.035, -0.92, w + 0.12, 0.13, 0.09, "#b6bab1");
  for (const fraction of [0.008, 0.22, 0.43, 0.705, 0.99]) {
    const x = fraction * w;
    b.box("architecturalFrame", x, h * 0.5, -0.07, 0.145, h, 0.17, "#405348");
    b.beam("architecturalFrame", [x, h - 0.1, 0.02], [x, h - 0.1, -0.87], 0.05, FRAME);
    b.beam("architecturalFrame", [x, h - 0.75, -0.04], [x, h - 0.1, -0.84], 0.04, FRAME);
  }
}

function paintedBrickBuilder(raw: PhotoBuilder): PhotoBuilder {
  return {
    ...raw,
    wall(x0, x1, y0, y1, z, color, family) {
      raw.wall(x0, x1, y0, y1, z, color, family ?? "paintedMasonry");
    },
  };
}
