import * as THREE from "three";
import { SURFACE_PALETTE, type SurfaceFamily } from "./surfaceMaterials";

/** Photo-derived civic models for the Centro Administrativo and the Centro de
 * Eventos. Coordinates are the building's local drawing frame (x across the
 * registered footprint, z along it, y up), in drawing units: every height is a
 * visual estimate from photographs, never a surveyed elevation.
 *
 * This module only emits triangles into the buckets the architecture batcher
 * already owns. It creates no mesh, material or render-loop work. */
export type CivicVertex = [number, number, number];
export type CivicBucketName =
  | "floor"
  | "walls"
  | "brick"
  | "frames"
  | "structure"
  | "glass"
  | "metal"
  | "accent"
  | "roof"
  | "roofWalls"
  | "roofGlass"
  | "picking";
export type CivicKit<B> = {
  buckets: Record<CivicBucketName, B>;
  quad(
    target: B,
    a: CivicVertex,
    b: CivicVertex,
    c: CivicVertex,
    d: CivicVertex,
    color: string,
    normal?: CivicVertex,
  ): void;
  triangle(
    target: B,
    a: CivicVertex,
    b: CivicVertex,
    c: CivicVertex,
    color: string,
    normal?: CivicVertex,
  ): void;
  width: number;
  depth: number;
  eave: number;
  rise: number;
};
/** A textured rectangle in local coordinates: bottom-left, bottom-right,
 * top-right, top-left as seen by its viewer, with its atlas UV window. */
export type CivicDecal = {
  corners: [CivicVertex, CivicVertex, CivicVertex, CivicVertex];
  uv: [number, number, number, number];
};
export type CivicPlanting = {
  kind: "tree" | "palm" | "shrub";
  /** Local [x, z] in the building frame. */
  point: [number, number];
  scale: number;
};

export const ADMINISTRATIVE_CENTRE_ID = "indumoveis:support:b7";
export const EVENT_CENTRE_ID = "indumoveis:support:events";
export const ADMINISTRATIVE_ANNEX_IDS: ReadonlySet<string> = new Set([
  "indumoveis:support:b7-annex-a",
  "indumoveis:support:b7-annex-b",
]);
/** Proportions shared with the roof definition so bounds, picking and the
 * visible silhouette cannot drift apart. */
export const CIVIC_PROPORTIONS = {
  administrativeRise: 0.13,
  eventRise: 0.17,
  lanternBase: 0.74,
  lanternWall: 0.88,
} as const;
export const ADMINISTRATIVE_ARTWORK = { width: 512, height: 320, muralHeight: 256 } as const;

const tints = new Map<string, string>();
/** Vertex colour that reproduces `target` on a family whose material already
 * carries its own base colour (both multiply in linear space). */
function tint(family: SurfaceFamily, target: string) {
  const key = `${family}:${target}`;
  let value = tints.get(key);
  if (!value) {
    const wanted = new THREE.Color(target),
      base = new THREE.Color(SURFACE_PALETTE[family]);
    value = `#${new THREE.Color(
      Math.min(1, wanted.r / base.r),
      Math.min(1, wanted.g / base.g),
      Math.min(1, wanted.b / base.b),
    ).getHexString()}`;
    tints.set(key, value);
  }
  return value;
}

function tools<B>(kit: CivicKit<B>) {
  const { quad, triangle } = kit;
  /** Closed prism; `bottom` is skipped for volumes that stand on the ground. */
  const box = (
    target: B,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color: string,
    bottom = false,
  ) => {
    quad(target, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], color, [0, 0, -1]);
    quad(target, [x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], color, [0, 0, 1]);
    quad(target, [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], color, [-1, 0, 0]);
    quad(target, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], color, [1, 0, 0]);
    quad(target, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], color, [0, 1, 0]);
    if (bottom)
      quad(target, [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], color, [0, -1, 0]);
  };
  /** Thin two-sided plate (rails, sheets): both windings, explicit normals. */
  const plate = (
    target: B,
    a: CivicVertex,
    b: CivicVertex,
    c: CivicVertex,
    d: CivicVertex,
    color: string,
    normal: CivicVertex,
  ) => {
    quad(target, a, b, c, d, color, normal);
    quad(target, a, b, c, d, color, normal.map((v) => -v) as CivicVertex);
  };
  return { quad, triangle, box, plate };
}

/** Centro Administrativo Adelcki Camilo Beltrame, read from IMG_0865 and the
 * registered orthophoto: two storeys under a low longitudinal gable, grey-green
 * facades over an earth-coloured plinth, window bands on both long sides, a
 * mural on the gable facing Rua Argentina, the covered access with its metal
 * stair, and the garden hedge. Local z = 0 is the Rua Argentina gable. */
export function buildAdministrativeCentre<B>(kit: CivicKit<B>) {
  const { quad, triangle, box, plate } = tools(kit);
  const b = kit.buckets;
  const W = kit.width,
    D = kit.depth,
    E = kit.eave,
    ridge = E + kit.rise,
    mid = W / 2;
  const wall = tint("paintedWall", "#99a79b"),
    wallShade = tint("paintedWall", "#8e9d91"),
    mural = tint("paintedWall", "#8caedb"),
    gable = tint("paintedWall", "#86947f"),
    plinth = tint("warmAccent", "#8a6a55"),
    sheet = tint("paintedSheet", "#b4b3a8"),
    fascia = tint("paintedSheet", "#7f8c78"),
    steel = tint("exposedMetal", "#3c4341"),
    canopySheet = tint("paintedWall", "#e4e5df"),
    slab = tint("concrete", "#c3c5bd"),
    paving = tint("concrete", "#a3978a"),
    frame = tint("architecturalFrame", "#39453f");
  const plinthTop = 0.38,
    floorLine = E * 0.5;
  // Long facades: one continuous window band per storey between solid ends.
  const bands: [number, number][] = [
    [E * 0.3, E * 0.47],
    [E * 0.68, E * 0.86],
  ];
  const bandStart = 0.7,
    bandEnd = D - 0.7,
    recess = 0.07;
  for (const side of [0, 1] as const) {
    const x = side ? W : 0,
      n: CivicVertex = [side ? 1 : -1, 0, 0],
      inward = side ? -recess : recess,
      proud = side ? 0.025 : -0.025;
    quad(b.accent, [x, 0, 0], [x, 0, D], [x, plinthTop, D], [x, plinthTop, 0], plinth, n);
    let low = plinthTop;
    for (const [sill, head] of bands) {
      quad(b.walls, [x, low, 0], [x, low, D], [x, sill, D], [x, sill, 0], wall, n);
      for (const [z0, z1] of [
        [0, bandStart],
        [bandEnd, D],
      ])
        quad(b.walls, [x, sill, z0], [x, sill, z1], [x, head, z1], [x, head, z0], wall, n);
      const gx = x + inward;
      quad(
        b.glass,
        [gx, sill, bandStart],
        [gx, sill, bandEnd],
        [gx, head, bandEnd],
        [gx, head, bandStart],
        "#ffffff",
        n,
      );
      // Reveals close the recess so the band reads as depth, not a decal.
      quad(
        b.walls,
        [x, sill, bandStart],
        [x, sill, bandEnd],
        [gx, sill, bandEnd],
        [gx, sill, bandStart],
        wallShade,
        [0, 1, 0],
      );
      quad(
        b.walls,
        [x, head, bandStart],
        [x, head, bandEnd],
        [gx, head, bandEnd],
        [gx, head, bandStart],
        wallShade,
        [0, -1, 0],
      );
      for (const z of [bandStart, bandEnd])
        quad(b.walls, [x, sill, z], [x, head, z], [gx, head, z], [gx, sill, z], wallShade, [
          0,
          0,
          z === bandStart ? 1 : -1,
        ]);
      const bays = Math.max(2, Math.round((bandEnd - bandStart) / 0.82));
      for (let i = 0; i <= bays; i++) {
        const z = bandStart + ((bandEnd - bandStart) * i) / bays;
        box(
          b.frames,
          Math.min(gx, x + proud),
          sill,
          z - 0.028,
          Math.max(gx, x + proud),
          head,
          z + 0.028,
          frame,
        );
      }
      low = head;
    }
    quad(b.walls, [x, low, 0], [x, low, D], [x, E, D], [x, E, 0], wall, n);
    // Slab edge between the two storeys.
    box(
      b.structure,
      Math.min(x, x + proud * 1.6),
      floorLine - 0.045,
      0,
      Math.max(x, x + proud * 1.6),
      floorLine + 0.045,
      D,
      slab,
    );
    quad(b.picking, [x, 0.08, 0], [x, 0.08, D], [x, E, D], [x, E, 0], "#ffffff");
  }
  // Gable walls. The Rua Argentina side carries the mural; the avenue side
  // has the plain service elevation with one door and paired windows.
  for (const south of [0, 1] as const) {
    const z = south ? D : 0,
      n: CivicVertex = [0, 0, south ? 1 : -1];
    quad(b.accent, [0, 0, z], [W, 0, z], [W, plinthTop, z], [0, plinthTop, z], plinth, n);
    quad(
      b.walls,
      [0, plinthTop, z],
      [W, plinthTop, z],
      [W, E, z],
      [0, E, z],
      south ? wall : mural,
      n,
    );
    triangle(b.roofWalls, [0, E, z], [W, E, z], [mid, ridge, z], gable, n);
    quad(b.picking, [0, 0.08, z], [W, 0.08, z], [W, E, z], [0, E, z], "#ffffff");
    triangle(b.picking, [0, E, z], [W, E, z], [mid, ridge, z], "#ffffff");
    if (!south) continue;
    const face = z + 0.02;
    for (const [x0, x1, y0, y1, glazed] of [
      [W * 0.14, W * 0.36, bands[0][0], bands[0][1], true],
      [W * 0.64, W * 0.86, bands[0][0], bands[0][1], true],
      [W * 0.14, W * 0.36, bands[1][0], bands[1][1], true],
      [W * 0.64, W * 0.86, bands[1][0], bands[1][1], true],
      [mid - 0.36, mid + 0.36, 0.02, E * 0.4, false],
    ] as [number, number, number, number, boolean][]) {
      box(b.frames, x0 - 0.04, y0 - 0.04, z, x1 + 0.04, y1 + 0.04, face, frame);
      quad(
        glazed ? b.glass : b.metal,
        [x0, y0, face + 0.004],
        [x1, y0, face + 0.004],
        [x1, y1, face + 0.004],
        [x0, y1, face + 0.004],
        glazed ? "#ffffff" : steel,
        n,
      );
    }
  }
  // Roof: two sheets on a longitudinal ridge, with a small overhang.
  const over = 0.16,
    drop = (kit.rise / mid) * over;
  const eaveY = E - drop;
  for (const side of [0, 1] as const) {
    const x = side ? W + over : -over;
    const a: CivicVertex = [x, eaveY, -over],
      c: CivicVertex = [x, eaveY, D + over],
      r0: CivicVertex = [mid, ridge, -over],
      r1: CivicVertex = [mid, ridge, D + over];
    quad(b.roof, a, c, r1, r0, sheet, [0, 1, 0]);
    quad(b.roof, a, c, r1, r0, fascia, [0, -1, 0]);
    quad(b.picking, a, c, r1, r0, "#ffffff", [0, 1, 0]);
    // Eave and rake fascias give the sheet a visible edge from the ground.
    quad(b.roof, [x, eaveY - 0.1, -over], [x, eaveY - 0.1, D + over], c, a, fascia, [
      side ? 1 : -1,
      0,
      0,
    ]);
    for (const z of [-over, D + over])
      quad(
        b.roof,
        [x, eaveY - 0.1, z],
        [mid, ridge - 0.1, z],
        [mid, ridge, z],
        [x, eaveY, z],
        fascia,
        [0, 0, z < 0 ? -1 : 1],
      );
  }
  box(b.roof, mid - 0.07, ridge - 0.01, -over, mid + 0.07, ridge + 0.035, D + over, sheet);

  // Covered access from Rua Argentina, on the right of the mural as seen
  // from the street, with the metal stair to the upper floor behind it.
  const pathX0 = 0.28,
    pathX1 = 1.9,
    canopyNorth = -6.3,
    canopySouth = -1.08,
    canopyY = E * 0.5,
    ground = -0.08;
  box(b.floor, pathX0, ground, -8.45, pathX1, -0.03, 0, paving);
  box(b.floor, pathX0 - 0.35, ground, -1.08, pathX1 + 1.2, -0.035, 0, paving);
  const canopyX0 = pathX0 - 0.14,
    canopyX1 = pathX1 + 0.14,
    canopyMid = (canopyX0 + canopyX1) / 2,
    crown = canopyY + 0.13;
  for (const [x0, x1] of [
    [canopyX0, canopyMid],
    [canopyMid, canopyX1],
  ]) {
    const y0 = x0 === canopyX0 ? canopyY : crown,
      y1 = x1 === canopyX1 ? canopyY : crown;
    plate(
      b.walls,
      [x0, y0, canopyNorth],
      [x1, y1, canopyNorth],
      [x1, y1, canopySouth],
      [x0, y0, canopySouth],
      canopySheet,
      [0, 1, 0],
    );
  }
  for (const x of [canopyX0, canopyX1]) {
    box(
      b.metal,
      x - 0.035,
      canopyY - 0.09,
      canopyNorth,
      x + 0.035,
      canopyY,
      canopySouth,
      steel,
      true,
    );
    for (let i = 0; i < 4; i++) {
      const z = canopyNorth + 0.12 + ((canopySouth - canopyNorth - 0.24) * i) / 3;
      box(b.metal, x - 0.04, ground, z - 0.04, x + 0.04, canopyY - 0.09, z + 0.04, steel);
    }
  }
  for (let i = 0; i < 4; i++) {
    const z = canopyNorth + 0.12 + ((canopySouth - canopyNorth - 0.24) * i) / 3;
    plate(
      b.metal,
      [canopyX0, canopyY - 0.07, z],
      [canopyMid, crown - 0.07, z],
      [canopyMid, crown - 0.01, z],
      [canopyX0, canopyY - 0.01, z],
      steel,
      [0, 0, -1],
    );
    plate(
      b.metal,
      [canopyMid, crown - 0.07, z],
      [canopyX1, canopyY - 0.07, z],
      [canopyX1, canopyY - 0.01, z],
      [canopyMid, crown - 0.01, z],
      steel,
      [0, 0, -1],
    );
  }
  // Name board on the street end of the canopy.
  const signY0 = canopyY - 0.02,
    signY1 = canopyY + 0.3,
    signX0 = canopyX0 - 0.22,
    signX1 = canopyX1 + 0.22,
    signZ = canopyNorth - 0.05;
  box(
    b.structure,
    signX0,
    signY0,
    signZ,
    signX1,
    signY1,
    signZ + 0.05,
    tint("concrete", "#eeeee8"),
    true,
  );

  const stairX0 = 0.2,
    stairX1 = 1.72,
    stairZ0 = -0.92,
    stairZ1 = -0.2,
    landingX1 = 2.42,
    landingY = floorLine,
    steps = 9;
  for (let i = 0; i < steps; i++) {
    const x0 = stairX0 + ((stairX1 - stairX0) * i) / steps,
      x1 = stairX0 + ((stairX1 - stairX0) * (i + 1)) / steps,
      y = (landingY * (i + 1)) / steps;
    box(b.metal, x0, y - 0.035, stairZ0, x1 + 0.02, y, stairZ1, steel, true);
  }
  box(b.metal, stairX1, landingY - 0.05, stairZ0, landingX1, landingY, stairZ1, steel, true);
  for (const x of [stairX1 + 0.05, landingX1 - 0.05])
    box(
      b.metal,
      x - 0.03,
      ground,
      stairZ0 + 0.03,
      x + 0.03,
      landingY - 0.05,
      stairZ0 + 0.09,
      steel,
    );
  for (const z of [stairZ0, stairZ1]) {
    const n: CivicVertex = [0, 0, -1];
    // Stringer under the treads, then handrail and mid rail above them.
    plate(
      b.metal,
      [stairX0, -0.04, z],
      [stairX1, landingY - 0.04, z],
      [stairX1, landingY - 0.16, z],
      [stairX0, -0.16, z],
      steel,
      n,
    );
    for (const height of [0.24, 0.45])
      plate(
        b.metal,
        [stairX0, height - 0.022, z],
        [stairX1, landingY + height - 0.022, z],
        [stairX1, landingY + height, z],
        [stairX0, height, z],
        steel,
        n,
      );
    for (let i = 0; i <= 3; i++) {
      const t = i / 3,
        x = stairX0 + (stairX1 - stairX0) * t,
        y = landingY * t;
      plate(
        b.metal,
        [x - 0.015, y, z],
        [x + 0.015, y, z],
        [x + 0.015, y + 0.45, z],
        [x - 0.015, y + 0.45, z],
        steel,
        n,
      );
    }
  }
  for (const height of [0.24, 0.45]) {
    plate(
      b.metal,
      [stairX1, landingY + height - 0.022, stairZ0],
      [landingX1, landingY + height - 0.022, stairZ0],
      [landingX1, landingY + height, stairZ0],
      [stairX1, landingY + height, stairZ0],
      steel,
      [0, 0, -1],
    );
    plate(
      b.metal,
      [landingX1, landingY + height - 0.022, stairZ0],
      [landingX1, landingY + height - 0.022, stairZ1],
      [landingX1, landingY + height, stairZ1],
      [landingX1, landingY + height, stairZ0],
      steel,
      [1, 0, 0],
    );
  }
  // Upper door at the landing, ground door under the stair, and the small
  // dark window the photograph shows beside the mural.
  const north: CivicVertex = [0, 0, -1];
  for (const [x0, x1, y0, y1, glazed] of [
    [stairX1 + 0.1, landingX1 - 0.1, landingY, landingY + 0.92, false],
    [0.5, 1.2, 0.02, E * 0.36, false],
    [W * 0.06, W * 0.17, E * 0.7, E * 0.82, true],
  ] as [number, number, number, number, boolean][]) {
    box(b.frames, x0 - 0.035, y0 - 0.03, -0.05, x1 + 0.035, y1 + 0.035, 0, frame);
    quad(
      glazed ? b.glass : b.metal,
      [x0, y0, -0.054],
      [x1, y0, -0.054],
      [x1, y1, -0.054],
      [x0, y1, -0.054],
      glazed ? "#ffffff" : steel,
      north,
    );
  }
  // Condenser unit high on the gable, as photographed.
  box(
    b.structure,
    W * 0.72,
    E + 0.08,
    -0.14,
    W * 0.72 + 0.3,
    E + 0.3,
    0,
    tint("concrete", "#e6e6df"),
    true,
  );

  const planting: CivicPlanting[] = [
    // The mature tree beside the access and the palms on the lawn side.
    { kind: "tree", point: [-1.4, -6.7], scale: 1.9 },
    { kind: "tree", point: [-3, -7.7], scale: 1.45 },
    { kind: "palm", point: [9.1, -2.9], scale: 1.05 },
    { kind: "palm", point: [10.4, -7.2], scale: 1.3 },
  ];
  // Clipped hedge of round shrubs following the access, then the gable foot.
  for (let z = -8.1; z < -1.3; z += 0.52)
    planting.push({ kind: "shrub", point: [pathX1 + 0.42, z], scale: 0.62 });
  for (let x = 3.4; x < W - 0.1; x += 0.58)
    planting.push({ kind: "shrub", point: [x, -0.55], scale: 0.48 });
  const muralTop = ADMINISTRATIVE_ARTWORK.muralHeight / ADMINISTRATIVE_ARTWORK.height;
  const decals: CivicDecal[] = [
    {
      // Seen from Rua Argentina the viewer's left is local +x.
      corners: [
        [W, plinthTop, -0.016],
        [stairX1 - 0.05, plinthTop, -0.016],
        [stairX1 - 0.05, E, -0.016],
        [W, E, -0.016],
      ],
      uv: [0, 1 - muralTop, 1 - (stairX1 - 0.05) / W, 1],
    },
    {
      corners: [
        [signX1, signY0 + 0.02, signZ - 0.006],
        [signX0, signY0 + 0.02, signZ - 0.006],
        [signX0, signY1 - 0.02, signZ - 0.006],
        [signX1, signY1 - 0.02, signZ - 0.006],
      ],
      uv: [0, 0, 1, 1 - muralTop],
    },
  ];
  return {
    decals,
    planting,
    extent: { minX: -4.9, maxX: 11.6, minZ: -9.7, maxZ: D + over, maxY: ridge + 0.04 },
  };
}

/** One atlas for the gable mural and the canopy name board. The mural is an
 * abstract recomposition of the photographed painting's colours and masses
 * (shell, faces, musician, warm panels on a blue field), not a reproduction. */
export function paintAdministrativeArtwork(context: CanvasRenderingContext2D) {
  const { width, height, muralHeight } = ADMINISTRATIVE_ARTWORK;
  const sky = context.createLinearGradient(0, 0, 0, muralHeight);
  sky.addColorStop(0, "#8fb2de");
  sky.addColorStop(1, "#a9c4e6");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, muralHeight);
  const blob = (color: string, points: [number, number][]) => {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(...points[0]);
    for (let i = 1; i < points.length; i += 3)
      context.bezierCurveTo(...points[i], ...points[i + 1], ...points[i + 2]);
    context.closePath();
    context.fill();
  };
  // Pink and violet currents crossing the field.
  blob("#c98aae", [
    [0, 92],
    [70, 60],
    [150, 96],
    [236, 104],
    [300, 110],
    [330, 150],
    [250, 160],
    [150, 168],
    [80, 150],
    [0, 176],
  ]);
  blob("#b79ad0", [
    [0, 176],
    [90, 150],
    [150, 200],
    [120, 256],
    [80, 256],
    [40, 256],
    [0, 256],
  ]);
  // Scallop shell, upper left.
  context.save();
  context.translate(96, 96);
  context.fillStyle = "#b98660";
  context.beginPath();
  context.moveTo(0, 0);
  context.arc(0, 0, 62, Math.PI * 1.08, Math.PI * 1.92);
  context.closePath();
  context.fill();
  context.strokeStyle = "#8c5f43";
  context.lineWidth = 2.5;
  for (let i = 0; i <= 8; i++) {
    const angle = Math.PI * (1.08 + (0.84 * i) / 8);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(angle) * 62, Math.sin(angle) * 62);
    context.stroke();
  }
  context.restore();
  // Musician with a string instrument, lower left.
  blob("#d9a58f", [
    [30, 250],
    [20, 190],
    [60, 150],
    [100, 170],
    [128, 186],
    [120, 236],
    [96, 256],
  ]);
  context.fillStyle = "#a8643f";
  context.beginPath();
  context.ellipse(92, 214, 26, 18, -0.5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#5d3a2a";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(104, 204);
  context.lineTo(150, 156);
  context.stroke();
  // Pale face inside a halo, top centre.
  context.fillStyle = "#d9c98a";
  context.beginPath();
  context.ellipse(250, 70, 30, 36, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#efe6c4";
  context.beginPath();
  context.ellipse(250, 74, 19, 25, 0, 0, Math.PI * 2);
  context.fill();
  // Bearded elder under a striped crown, centre.
  context.fillStyle = "#e3c9a0";
  context.beginPath();
  context.ellipse(188, 188, 34, 30, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#c98f66";
  context.beginPath();
  context.ellipse(188, 204, 20, 22, 0, 0, Math.PI * 2);
  context.fill();
  blob("#efe9dc", [
    [168, 214],
    [176, 250],
    [200, 250],
    [208, 214],
    [200, 228],
    [176, 228],
    [168, 214],
  ]);
  context.fillStyle = "#3f7fb5";
  context.beginPath();
  context.ellipse(206, 150, 20, 16, 0, 0, Math.PI * 2);
  context.fill();
  // Warm panels and green bands on the right half.
  blob("#e2a14e", [
    [236, 176],
    [270, 150],
    [330, 150],
    [350, 172],
    [330, 200],
    [262, 204],
    [236, 176],
  ]);
  blob("#4f9a72", [
    [236, 140],
    [270, 124],
    [320, 128],
    [336, 142],
    [300, 152],
    [262, 152],
    [236, 140],
  ]);
  blob("#ecd27a", [
    [310, 96],
    [340, 78],
    [392, 84],
    [404, 108],
    [380, 126],
    [330, 122],
    [310, 96],
  ]);
  for (const [x, y, radius, color] of [
    [296, 92, 9, "#e8873c"],
    [322, 98, 7, "#d7b24a"],
    [392, 100, 10, "#f0e3b0"],
    [418, 86, 6, "#e9c6a2"],
  ] as [number, number, number, string][]) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  blob("#6f9fd8", [
    [370, 150],
    [420, 130],
    [512, 150],
    [512, 256],
    [470, 256],
    [400, 256],
    [370, 256],
  ]);

  // Name board.
  context.fillStyle = "#f4f3ee";
  context.fillRect(0, muralHeight, width, height - muralHeight);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#c2552d";
  context.font = "bold 24px Arial, sans-serif";
  context.fillText("CENTRO ADMINISTRATIVO", width / 2, muralHeight + 22, width - 36);
  context.fillStyle = "#2b3130";
  context.font = "bold 20px Arial, sans-serif";
  context.fillText("ADELCKI CAMILO BELTRAME", width / 2, muralHeight + 47, width - 36);
}

/** Centro de Eventos, read from the registered orthophoto: a four-water roof
 * whose hips meet at a raised glazed lantern, and a transverse entrance gable
 * with a glazed end on the Rua Brasília front. Everything stays inside the
 * registered footprint; walls remain with the shared facade recipe. */
export function buildEventCentreRoof<B>(kit: CivicKit<B>) {
  const { quad, triangle, box } = tools(kit);
  const b = kit.buckets;
  const W = kit.width,
    D = kit.depth,
    E = kit.eave,
    R = kit.rise;
  const cx = W / 2,
    cz = D / 2,
    lx = W * 0.085,
    lz = D * 0.09;
  const baseY = E + R * CIVIC_PROPORTIONS.lanternBase,
    lanternY = E + R * CIVIC_PROPORTIONS.lanternWall,
    apex = E + R;
  const sheet = tint("paintedSheet", "#9c9a91"),
    sheetAlt = tint("paintedSheet", "#a5a39a"),
    hip = tint("paintedSheet", "#c9c6ba"),
    soffit = tint("paintedSheet", "#74766f"),
    frame = tint("architecturalFrame", "#3f4b46");
  const corners: CivicVertex[] = [
    [0, E, 0],
    [W, E, 0],
    [W, E, D],
    [0, E, D],
  ];
  const lantern: CivicVertex[] = [
    [cx - lx, baseY, cz - lz],
    [cx + lx, baseY, cz - lz],
    [cx + lx, baseY, cz + lz],
    [cx - lx, baseY, cz + lz],
  ];
  const up: CivicVertex = [0, 1, 0];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(b.roof, corners[i], corners[j], lantern[j], lantern[i], i % 2 ? sheetAlt : sheet, up);
    quad(b.picking, corners[i], corners[j], lantern[j], lantern[i], "#ffffff", up);
    // Folded hip cap, the light line that reads from above.
    const a = corners[i],
      c = lantern[i],
      length = Math.hypot(c[0] - a[0], c[2] - a[2]),
      nx = (-(c[2] - a[2]) / length) * 0.11,
      nz = ((c[0] - a[0]) / length) * 0.11;
    quad(
      b.roof,
      [a[0] + nx, a[1] + 0.035, a[2] + nz],
      [c[0] + nx, c[1] + 0.035, c[2] + nz],
      [c[0] - nx, c[1] + 0.035, c[2] - nz],
      [a[0] - nx, a[1] + 0.035, a[2] - nz],
      hip,
      up,
    );
    // Eave edge and the wall proxy used for selection.
    const outward: CivicVertex = [corners[j][2] - corners[i][2], 0, corners[i][0] - corners[j][0]];
    quad(
      b.roof,
      [corners[i][0], E - 0.16, corners[i][2]],
      [corners[j][0], E - 0.16, corners[j][2]],
      corners[j],
      corners[i],
      soffit,
      outward,
    );
    quad(
      b.picking,
      [corners[i][0], 0.08, corners[i][2]],
      [corners[j][0], 0.08, corners[j][2]],
      corners[j],
      corners[i],
      "#ffffff",
    );
    // Lantern: glazed band, corner posts and its own four-water cap.
    const top = (p: CivicVertex): CivicVertex => [p[0], lanternY, p[2]];
    quad(b.roofGlass, lantern[i], lantern[j], top(lantern[j]), top(lantern[i]), "#ffffff", outward);
    quad(b.picking, lantern[i], lantern[j], top(lantern[j]), top(lantern[i]), "#ffffff");
    const grow = (p: CivicVertex): CivicVertex => [
      cx + (p[0] - cx) * 1.16,
      lanternY,
      cz + (p[2] - cz) * 1.16,
    ];
    triangle(b.roof, grow(lantern[i]), grow(lantern[j]), [cx, apex, cz], hip, up);
    triangle(b.roof, grow(lantern[i]), grow(lantern[j]), [cx, lanternY, cz], soffit, [0, -1, 0]);
    triangle(b.picking, grow(lantern[i]), grow(lantern[j]), [cx, apex, cz], "#ffffff", up);
    box(
      b.frames,
      lantern[i][0] - 0.07,
      baseY,
      lantern[i][2] - 0.07,
      lantern[i][0] + 0.07,
      lanternY,
      lantern[i][2] + 0.07,
      frame,
    );
  }
  // Transverse entrance gable on the Rua Brasília front (local x = 0). Its
  // ridge dies into the main west water; both valleys start at the eave.
  const half = D * 0.2,
    gableRidge = E + R * 0.52,
    reach = ((gableRidge - E) / (baseY - E)) * (cx - lx);
  const left: CivicVertex = [0, E, cz - half],
    right: CivicVertex = [0, E, cz + half],
    crest: CivicVertex = [0, gableRidge, cz],
    meet: CivicVertex = [reach, gableRidge, cz];
  for (const foot of [left, right]) {
    triangle(b.roof, foot, meet, crest, sheetAlt, up);
    triangle(b.picking, foot, meet, crest, "#ffffff", up);
  }
  const west: CivicVertex = [-1, 0, 0];
  const inset = 0.05;
  triangle(
    b.roofGlass,
    [inset, E, left[2] + 0.1],
    [inset, E, right[2] - 0.1],
    [inset, gableRidge - 0.12, cz],
    "#ffffff",
    west,
  );
  triangle(b.picking, left, right, crest, "#ffffff", west);
  // Rake boards, sill and mullions in front of the glazed gable end.
  for (const foot of [left, right]) {
    const sign = foot === left ? 1 : -1;
    quad(
      b.frames,
      [0, E, foot[2]],
      [0, gableRidge, cz],
      [0, gableRidge - 0.2, cz],
      [0, E, foot[2] + sign * 0.3],
      frame,
      west,
    );
  }
  quad(
    b.frames,
    [0, E - 0.02, left[2]],
    [0, E - 0.02, right[2]],
    [0, E + 0.12, right[2]],
    [0, E + 0.12, left[2]],
    frame,
    west,
  );
  for (const t of [-0.5, 0, 0.5]) {
    const z = cz + half * t,
      top = E + (gableRidge - E) * (1 - Math.abs(t)) - 0.12;
    box(b.frames, 0, E, z - 0.045, inset, top, z + 0.045, frame);
  }
  // Entrance under the gable: a glazed portal set just ahead of the wall
  // panels, without leaving the registered footprint.
  const doorHalf = half * 0.48,
    doorTop = E * 0.66;
  for (const z of [cz - doorHalf, cz - doorHalf / 3, cz + doorHalf / 3, cz + doorHalf])
    box(b.frames, 0, 0, z - 0.06, 0.02, doorTop, z + 0.06, frame);
  box(
    b.frames,
    0,
    doorTop,
    cz - doorHalf - 0.06,
    0.02,
    doorTop + 0.14,
    cz + doorHalf + 0.06,
    frame,
  );
  quad(
    b.glass,
    [0.012, 0.05, cz - doorHalf],
    [0.012, 0.05, cz + doorHalf],
    [0.012, doorTop, cz + doorHalf],
    [0.012, doorTop, cz - doorHalf],
    "#ffffff",
    west,
  );
  return { apex };
}
