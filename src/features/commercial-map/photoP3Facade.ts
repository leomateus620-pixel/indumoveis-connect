import type { PhotoBuilder, PhotoVertex } from "./photoArchitectureKit";

/** Photos 1–2: one continuous P3 facade, including the Brigada at observer-left
 * (world +X, towards Administration). No separate building or commercial lot.
 * Bay ratios, ramp levels and rear roof pitch remain illustrative. */
export function buildPhotoP3Facade(b: PhotoBuilder) {
  const { w, h, rise } = b;
  const base = h * 0.15,
    head = h * 0.78;
  const windows = [
    [0.018, 0.285],
    [0.392, 0.548],
    [0.895, 0.98],
  ];
  const gates = [
    [0.575, 0.715],
    [0.738, 0.875],
  ];
  const pedestrian = [0.305, 0.368];
  const openings = [
    ...windows.map(([a, c]) => ({ a, c, type: "window" })),
    ...gates.map(([a, c]) => ({ a, c, type: "gate" })),
    { a: pedestrian[0], c: pedestrian[1], type: "pedestrian" },
  ].sort((a, c) => a.a - c.a);
  let cursor = 0;
  for (const opening of openings) {
    b.wall(cursor * w, opening.a * w, 0.06, h, 0, "#e8e7de");
    b.wall(cursor * w, opening.a * w, 0.06, base, -0.015, "#666c6d", "concrete");
    const sill = opening.type === "window" ? base * 1.35 : base * 0.5;
    if (opening.type === "window") {
      b.wall(opening.a * w, opening.c * w, 0.06, sill, 0, "#646a6a", "concrete");
      b.window(opening.a * w, opening.c * w, sill, head, 0, opening.a < 0.1 ? 6 : 4, 3);
    } else if (opening.type === "gate") b.gate(opening.a * w, opening.c * w, sill, head, 0);
    else {
      // Recessed doorway to the integrated service module, with solid reveals.
      b.wall(opening.a * w, opening.c * w, sill, head, 0.24, "#aaa99d");
      b.box(
        "concrete",
        ((opening.a + opening.c) * w) / 2,
        sill / 2,
        0.04,
        (opening.c - opening.a) * w,
        sill,
        0.3,
        "#a09f94",
      );
    }
    b.wall(opening.a * w, opening.c * w, head, h, 0, "#e8e7de");
    cursor = opening.c;
  }
  b.wall(cursor * w, w, 0.06, h, 0, "#e8e7de");
  b.wall(cursor * w, w, 0.06, base, -0.015, "#666c6d", "concrete");
  // Deep projecting roof with real folded underside and front corrugated fascia.
  // Main roof uses the same three shallow peaks, not three tall generic gables.
  const projection = 1.0;
  const peaks = [0, 1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6, 1];
  const high = (x: number) => h + rise * (Math.round(x * 6) % 2);
  for (let i = 0; i < peaks.length - 1; i++) {
    const x0 = peaks[i] * w,
      x1 = peaks[i + 1] * w,
      y0 = high(peaks[i]),
      y1 = high(peaks[i + 1]);
    const a: PhotoVertex = [x0, y0, -projection],
      c: PhotoVertex = [x1, y1, -projection],
      d: PhotoVertex = [x1, y1, 0.015],
      e: PhotoVertex = [x0, y0, 0.015];
    b.quad("paintedSheet", e, d, c, a, "#aeb1a9");
    b.quad(
      "paintedSheet",
      [a[0], a[1] - 0.12, a[2]],
      [c[0], c[1] - 0.12, c[2]],
      [d[0], d[1] - 0.12, d[2]],
      [e[0], e[1] - 0.12, e[2]],
      "#555e5d",
    );
    b.quad("paintedSheet", a, c, [c[0], c[1] - 0.35, c[2]], [a[0], a[1] - 0.35, a[2]], "#aeb1a9");
    b.beam("paintedSheet", a, c, 0.045, "#787f7b");
    b.detail(() => {
      const count = Math.ceil((x1 - x0) / 0.12);
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count,
          x = x0 + (x1 - x0) * t,
          y = y0 + (y1 - y0) * t;
        b.box("paintedSheet", x, y - 0.175, -projection - 0.012, 0.026, 0.35, 0.03, "#959e97");
      }
    });
  }
  for (const x of [0.005, 0.385, 0.56, 0.89, 0.995]) {
    const xx = x * w;
    b.box("architecturalFrame", xx, h * 0.52, -0.065, 0.15, h * 1.04, 0.2, "#545d5d");
    b.beam(
      "architecturalFrame",
      [xx, h - 0.14, -0.05],
      [xx, h - 0.14, -projection + 0.02],
      0.06,
      "#525d5b",
    );
  }
  // Continuous raised threshold, stairs and an actual sloped central ramp.
  b.box("concrete", w * 0.62, base * 0.25, -0.2, w * 0.76, base * 0.5, 0.4, "#9c9d94");
  const x0 = w * 0.565,
    x1 = w * 0.745,
    z0 = -0.72,
    z1 = -0.24,
    low = 0.035,
    highRamp = base * 0.5;
  b.quad(
    "concrete",
    [x0, low, z0],
    [x0, highRamp, z1],
    [x1, highRamp, z1],
    [x1, low, z0],
    "#a5a69d",
  );
  for (const x of [x0, x1]) {
    b.quad("concrete", [x, low, z0], [x, low, z1], [x, highRamp, z1], [x, low, z0], "#8d928c");
    b.beam("exposedMetal", [x, low + 0.52, z0], [x, highRamp + 0.52, z1], 0.026, "#8d9795");
    b.beam("exposedMetal", [x, low + 0.3, z0], [x, highRamp + 0.3, z1], 0.022, "#8d9795");
    for (const t of [0, 0.5, 1])
      b.beam(
        "exposedMetal",
        [x, low + (highRamp - low) * t, z0 + (z1 - z0) * t],
        [x, low + (highRamp - low) * t + 0.52, z0 + (z1 - z0) * t],
        0.025,
        "#8d9795",
      );
  }
  const doorX = (w * (pedestrian[0] + pedestrian[1])) / 2,
    doorWidth = w * (pedestrian[1] - pedestrian[0]);
  for (let i = 0; i < 3; i++)
    b.box(
      "concrete",
      doorX,
      (highRamp * (i + 1)) / 6,
      -0.18 - (3 - i) * 0.13,
      doorWidth,
      (highRamp * (i + 1)) / 3,
      0.16,
      "#a1a398",
    );
  // The permanent identification belongs to this module. The renderer supplies
  // a small locally generated sign, without copying campaign photographs/logos.
  b.box("whitePaint", w * 0.15, h * 0.615, -0.055, w * 0.238, 0.27, 0.045, "#eeeee6");
}
