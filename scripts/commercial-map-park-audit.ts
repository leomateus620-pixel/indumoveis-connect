import {
  ENTITIES,
  type MapEntity,
  type Point,
} from "../src/features/commercial-map/data/territory";
import {
  pointInPolygon,
  polygonBounds,
  signedPolygonArea,
} from "../src/features/commercial-map/geometry";
import { ShapeUtils, Vector2 } from "three";
import { getPavilionPresentation } from "../src/features/commercial-map/architectureOrientation";
import { deriveParkDetails } from "../src/features/commercial-map/parkDetails";
import * as layout from "../src/features/commercial-map/permanentParkLayout";
import {
  PARK_REGISTRATION,
  PARK_REGISTRATION_RESIDUALS,
  PARK_BLOCK_CORRESPONDENCE,
  registerParkPoint,
  registerParkPolygon,
  registerA2Polygon,
  registerA2Point,
  PARK_A2_REGISTRATION,
  PARK_CODE_TO_A2_REGISTRATION,
} from "../src/features/commercial-map/parkRegistration";
import {
  PARK_A2_BLOCK_PIECES,
  PARK_A2_BUILDING_FOOTPRINTS,
  PARK_A2_ROAD_SURFACES,
  PARK_A2_SOURCE_CONDITION,
} from "../src/features/commercial-map/parkA2Reference";
import {
  ROAD_CONTOUR_REVIEW,
  simplifyRoadContour,
} from "../src/features/commercial-map/roadContour";
import { PARK_PLANTING_AUDIT } from "../src/features/commercial-map/parkPlanting";
import { auditParkConnectivity } from "../src/features/commercial-map/parkConnectivity";
import {
  PARK_REFERENCE_BLOCKS,
  PARK_REFERENCE_BUILDINGS,
  PARK_REFERENCE_REVISION,
  PARK_REFERENCE_ROADS,
  PARK_REFERENCE_ACCESS_PATHS,
} from "../src/features/commercial-map/parkReference";

type Block = {
  id: string;
  referencePolygon: Point[];
  referencePieces?: Point[][];
  polygons: Point[][];
  commercialIds: string[];
};
type Landmark = {
  id: string;
  name: string;
  source: string;
  bounds: readonly [number, number, number, number];
  polygon?: Point[];
  front?: Point;
  existingOwner?: string;
};
type Gate = {
  id: string;
  name: string;
  point: Point;
  axis: Point | "x" | "z";
  width: number;
  source?: string;
};
type Layout = {
  PARK_PHYSICAL_BLOCKS: readonly Block[];
  PARK_CONTEXT_ROADS: readonly MapEntity[];
  PARK_CONTEXT_WALKS: readonly MapEntity[];
  PARK_RENDER_ENTITIES: readonly MapEntity[];
  PERMANENT_PARK_LANDMARKS: readonly Landmark[];
  PARK_GATES: readonly Gate[];
  ARENA_APPROACH?: Record<string, readonly [number, number, number, number]>;
  ARENA_APPROACH_POLYGONS?: Record<string, Point[]>;
  ARENA_APPROACH_CONDITION?: {
    source: string;
    levels: string;
    stairPlazaRatio: number[];
    sourceMiranteDepth: number;
  };
};
type Raster = {
  href: string;
  matrix?: number[];
  width: number;
  height: number;
  frame?: "a2-normalized";
};
export function a2RasterMatrix(width: number, height: number): number[] {
  const sx = 1684 / width,
    sz = 1191 / height,
    { a, b, tx, tz } = PARK_A2_REGISTRATION;
  return [a * sx, b * sx, -b * sz, a * sz, tx, tz];
}
const round = (value: number) => Number(value.toFixed(4));
const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const points = (polygon: readonly Point[]) => polygon.map((p) => p.map(round).join(",")).join(" ");
const surfacePath = (polygon: readonly Point[], holes: readonly Point[][] = []) =>
  [polygon, ...holes]
    .map((ring) => `M${ring.map((p) => p.map(round).join(",")).join("L")}Z`)
    .join("");
const svgSurface = (
  polygon: readonly Point[],
  holes: readonly Point[][],
  fill: string,
  stroke = "none",
  strokeWidth = 0.12,
) =>
  `<path d="${surfacePath(polygon, holes)}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
const center = (polygon: readonly Point[]): Point => {
  const bounds = polygonBounds(polygon);
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
};
const rect = ([x0, z0, x1, z1]: readonly [number, number, number, number]): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
function dimensions(polygon: readonly Point[]) {
  const bounds = polygonBounds(polygon);
  return { x: round(bounds.maxX - bounds.minX), z: round(bounds.maxY - bounds.minY) };
}
function polygonMetrics(polygon: readonly Point[]) {
  const edges = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    return {
      a,
      b,
      length: round(length),
      direction: length ? [round(dx / length), round(dz / length)] : [0, 0],
    };
  });
  return {
    area: round(Math.abs(signedPolygonArea(polygon))),
    perimeter: round(edges.reduce((sum, edge) => sum + edge.length, 0)),
    longestEdges: [...edges].sort((a, b) => b.length - a.length).slice(0, 6),
    condition:
      "Measured edges of the actual polygon, including concavities; drawing units and squared drawing units, never official cadastral or surveyed dimensions.",
  };
}
function roadContourPrecision() {
  let rawVertices = 0,
    displayVertices = 0,
    measuredMaximumPdfPoints = 0;
  for (const surface of PARK_A2_ROAD_SURFACES)
    for (const ring of [surface.polygon, ...surface.holes]) {
      const display = simplifyRoadContour(ring);
      rawVertices += ring.length;
      displayVertices += display.length;
      for (const p of ring) {
        const nearest = Math.min(
          ...display.map((a, i) => {
            const b = display[(i + 1) % display.length],
              dx = b[0] - a[0],
              dz = b[1] - a[1];
            const t = Math.max(
              0,
              Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
            );
            return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
          }),
        );
        measuredMaximumPdfPoints = Math.max(measuredMaximumPdfPoints, nearest);
      }
    }
  return {
    ...ROAD_CONTOUR_REVIEW,
    rawVertices,
    displayVertices,
    maximumAllowedDrawingUnits: ROAD_CONTOUR_REVIEW.tolerancePdfPoints * PARK_A2_REGISTRATION.scale,
    measuredMaximumPdfPoints,
    measuredMaximumDrawingUnits: measuredMaximumPdfPoints * PARK_A2_REGISTRATION.scale,
    condition:
      "Display RDP on raster-derived road rings only, measured against every raw evidence vertex BEFORE protected-footprint clipping; original A2 evidence, physical block/building contours, lots and registration stay unchanged. Hole count/winding retained; unsafe local self-crossing shortcuts restored. This error is relative to the extracted trace, not to surveyed terrain; separate commercial border residuals remain explicit.",
  };
}
/** Exact planar triangle clipping; bounds are never used as overlap proof. */
function intersectionArea(a: readonly Point[], b: readonly Point[]) {
  const triangles = (polygon: readonly Point[]) =>
    ShapeUtils.triangulateShape(
      polygon.map((p) => new Vector2(...p)),
      [],
    ).map((t) => t.map((i) => polygon[i]));
  let area = 0;
  for (const subject of triangles(a))
    for (const clip of triangles(b)) {
      let inside = [...subject];
      const sign = Math.sign(signedPolygonArea(clip));
      for (let i = 0; i < clip.length && inside.length; i++) {
        const p = clip[i],
          q = clip[(i + 1) % clip.length],
          side = (r: Point) =>
            sign * ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])),
          next: Point[] = [];
        inside.forEach((r, j) => {
          const s = inside[(j + 1) % inside.length],
            dr = side(r),
            ds = side(s);
          if (dr >= -1e-9) next.push(r);
          if ((dr > 1e-9 && ds < -1e-9) || (dr < -1e-9 && ds > 1e-9)) {
            const t = dr / (dr - ds);
            next.push([r[0] + t * (s[0] - r[0]), r[1] + t * (s[1] - r[1])]);
          }
        });
        inside = next;
      }
      if (inside.length >= 3) area += Math.abs(signedPolygonArea(inside));
    }
  return area;
}
function majorAxis(polygon: readonly Point[]) {
  const bounds = polygonBounds(polygon);
  const horizontal = bounds.maxX - bounds.minX > bounds.maxY - bounds.minY;
  const axis = horizontal ? 0 : 1;
  const levels = [...new Set(polygon.map((p) => p[axis]))].sort((a, b) => a - b);
  const inset = Math.min(0.02, (levels[levels.length - 1] - levels[0]) / 100);
  const sections = levels.flatMap((level, i) => {
    const crossSection = (position: number) => {
      const other = 1 - axis;
      const hits = polygon
        .flatMap((a, j) => {
          const b = polygon[(j + 1) % polygon.length];
          if (
            (a[axis] <= position && b[axis] > position) ||
            (b[axis] <= position && a[axis] > position)
          )
            return [
              a[other] + ((b[other] - a[other]) * (position - a[axis])) / (b[axis] - a[axis]),
            ];
          return [];
        })
        .sort((a, b) => a - b);
      let widest: [number, number] | undefined;
      for (let j = 0; j + 1 < hits.length; j += 2)
        if (!widest || hits[j + 1] - hits[j] > widest[1] - widest[0])
          widest = [hits[j], hits[j + 1]];
      if (!widest) return [];
      const midpoint = (widest[0] + widest[1]) / 2;
      return [
        {
          point: (horizontal ? [position, midpoint] : [midpoint, position]) as Point,
          width: widest[1] - widest[0],
        },
      ];
    };
    const at = i === 0 ? level + inset : i === levels.length - 1 ? level - inset : level;
    return [...(i ? crossSection((levels[i - 1] + level) / 2) : []), ...crossSection(at)];
  });
  const widths = sections.map((s) => s.width).sort((a, b) => a - b);
  return {
    axis: sections.map((s) => s.point),
    width: round(widths[Math.floor(widths.length / 2)] ?? 0),
    minimumWidth: round(widths[0] ?? 0),
  };
}
function label(point: Point, text: string, size = 1.25, color = "#25333f", extra = "") {
  return `<text x="${round(point[0])}" y="${round(point[1])}" fill="${color}" font-size="${size}" ${extra}>${escape(text)}</text>`;
}
const conciseBuildingName = (building: { id: string; name: string }) => {
  const pavilion = /^indumoveis:pavilion:(\d+)$/.exec(building.id);
  return pavilion
    ? `P${pavilion[1]}${pavilion[1] === "1" ? " · Mostra" : ""}`
    : building.name
        .replace("Casa da Etnia ", "Etnia ")
        .replace("Pavilhões 6, 10 e 11 · Pecuária", "P6 / P10 / P11")
        .replace("Pavilhão 7 · Agricultura Familiar", "P7 · Agricultura Familiar");
};
function arrow(origin: Point, direction: Point, color: string, length = 4) {
  const norm = Math.hypot(...direction) || 1;
  const end = [
    origin[0] + (direction[0] / norm) * length,
    origin[1] + (direction[1] / norm) * length,
  ];
  return `<line x1="${round(origin[0])}" y1="${round(origin[1])}" x2="${round(end[0])}" y2="${round(end[1])}" stroke="${color}" stroke-width=".36" marker-end="url(#front-arrow)"/>`;
}

/** Clip diagnostic axes to the surfaces that really exist. A road centreline
 * must not visually bridge a gap merely because the reference axis is whole. */
function clipAxis(axis: Point[], polygons: Point[][]): [Point, Point][] {
  return axis.slice(1).flatMap((b, i) => {
    const a = axis[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const cuts = [0, 1];
    for (const polygon of polygons)
      for (let j = 0; j < polygon.length; j++) {
        const p = polygon[j],
          q = polygon[(j + 1) % polygon.length];
        const ex = q[0] - p[0],
          ez = q[1] - p[1],
          cross = dx * ez - dz * ex;
        if (Math.abs(cross) < 1e-10) continue;
        const ux = p[0] - a[0],
          uz = p[1] - a[1];
        const t = (ux * ez - uz * ex) / cross,
          u = (ux * dz - uz * dx) / cross;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      }
    cuts.sort((l, r) => l - r);
    const at = (t: number): Point => [a[0] + dx * t, a[1] + dz * t];
    return cuts.slice(1).flatMap((t, j): [Point, Point][] => {
      const previous = cuts[j];
      if (
        t - previous < 1e-8 ||
        !polygons.some((polygon) => pointInPolygon(at((t + previous) / 2), polygon))
      )
        return [];
      return [[at(previous), at(t)]];
    });
  });
}

function roadLabel(parts: [Point, Point][], text: string) {
  const longest = [...parts].sort(
    ([a, b], [c, d]) => Math.hypot(b[0] - a[0], b[1] - a[1]) - Math.hypot(d[0] - c[0], d[1] - c[1]),
  )[0];
  if (!longest) return "";
  const [a, b] = longest,
    p: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return label(
    p,
    text,
    0.92,
    "#3e4c54",
    `text-anchor="middle" class="road-label" transform="rotate(${angle} ${p.join(" ")})"`,
  );
}

type PhysicalSurface = { polygon: Point[]; holes: Point[][] };
const containsSurface = (point: Point, surface: PhysicalSurface) =>
  pointInPolygon(point, surface.polygon) &&
  !surface.holes.some((hole) => pointInPolygon(point, hole));
function clipPhysicalAxis(axis: Point[], surfaces: PhysicalSurface[]): [Point, Point][] {
  return axis.slice(1).flatMap((b, i) => {
    const a = axis[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      cuts = [0, 1];
    for (const surface of surfaces)
      for (const ring of [surface.polygon, ...surface.holes])
        for (let j = 0; j < ring.length; j++) {
          const p = ring[j],
            q = ring[(j + 1) % ring.length],
            ex = q[0] - p[0],
            ez = q[1] - p[1],
            cross = dx * ez - dz * ex;
          if (Math.abs(cross) < 1e-10) continue;
          const ux = p[0] - a[0],
            uz = p[1] - a[1],
            t = (ux * ez - uz * ex) / cross,
            u = (ux * dz - uz * dx) / cross;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
        }
    cuts.sort((x, y) => x - y);
    const at = (t: number): Point => [a[0] + dx * t, a[1] + dz * t];
    return cuts
      .slice(1)
      .flatMap((t, j): [Point, Point][] =>
        t - cuts[j] > 1e-7 && surfaces.some((s) => containsSurface(at((t + cuts[j]) / 2), s))
          ? [[at(cuts[j]), at(t)]]
          : [],
      );
  });
}
function sectionWidth(point: Point, direction: Point, surfaces: PhysicalSurface[]): number | null {
  if (!surfaces.some((s) => containsSurface(point, s))) return null;
  const norm = Math.hypot(...direction) || 1,
    n: Point = [-direction[1] / norm, direction[0] / norm],
    hits: number[] = [];
  for (const surface of surfaces)
    for (const ring of [surface.polygon, ...surface.holes])
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          ex = b[0] - a[0],
          ez = b[1] - a[1],
          cross = n[0] * ez - n[1] * ex;
        if (Math.abs(cross) < 1e-9) continue;
        const ux = a[0] - point[0],
          uz = a[1] - point[1],
          t = (ux * ez - uz * ex) / cross,
          u = (ux * n[1] - uz * n[0]) / cross;
        if (u >= 0 && u <= 1) hits.push(t);
      }
  const negative = hits.filter((t) => t < -0.00001),
    positive = hits.filter((t) => t > 0.00001);
  if (!negative.length || !positive.length) return null;
  const width = Math.min(...positive) - Math.max(...negative);
  return width > 0.15 && width < 25 ? width : null;
}
/** Names come from the verified reference registry. Axes follow the A2 white
 * corridors between the corresponding physical blocks, not code-frame bboxes.
 * These are technical trace aids; never runtime lane paint or routing edges. */
const namedA2Axes: readonly { id: string; name: string; points: Point[]; neighbors: string[] }[] = [
  {
    id: "RUA-BRUNO-SCHWARTZ",
    name: "Rua Bruno Schwartz",
    points: [
      [1069, 214],
      [1580, 214],
    ],
    neighbors: ["S"],
  },
  {
    id: "RUA-JOHAN-MULLER",
    name: "Rua Johan Muller",
    points: [
      [1057, 278],
      [1580, 278],
    ],
    neighbors: ["S", "R"],
  },
  {
    id: "RUA-GUSTAVO-BESSEL",
    name: "Rua Gustavo Bessel",
    points: [
      [879, 362],
      [1576, 360],
    ],
    neighbors: ["R", "PISTA-CAMPEIRA"],
  },
  {
    id: "RUA-EMANUEL-BRACHMANN",
    name: "Rua Emanuel Brachmann",
    points: [
      [1384, 437],
      [1563, 438],
    ],
    neighbors: ["R", "C4"],
  },
  {
    id: "RUA-15-NOVEMBRO",
    name: "Rua 15 de Novembro",
    points: [
      [1384, 154],
      [1384, 437],
    ],
    neighbors: ["S", "R"],
  },
  {
    id: "RUA-PASTOR-ALBERT-LEHENBAUER",
    name: "Rua Pastor Albert Lehenbauer",
    points: [
      [1060, 155],
      [1060, 461],
    ],
    neighbors: ["R", "S", "PISTA-CAMPEIRA"],
  },
  {
    id: "RUA-UBIRETAMA",
    name: "Rua Ubiretama",
    points: [
      [1580, 151],
      [1580, 278],
      [1592, 332],
      [1520, 575],
      [1498, 625],
      [1458, 750],
    ],
    neighbors: ["R", "S", "F"],
  },
  {
    id: "RUA-BUENOS-AIRES",
    name: "Rua Buenos Aires",
    points: [
      [453, 277],
      [452, 450],
      [452, 644],
    ],
    neighbors: ["PAVILHAO-09", "V", "U", "T"],
  },
  {
    id: "RUA-PARAGUAI",
    name: "Rua Paraguai",
    points: [
      [455, 458],
      [1056, 462],
    ],
    neighbors: ["V", "Q", "N", "B9"],
  },
  {
    id: "RUA-BOLIVIA",
    name: "Rua Bolívia",
    points: [
      [457, 504],
      [1055, 505],
    ],
    neighbors: ["V", "Q", "N", "U", "P", "M", "G"],
  },
  {
    id: "RUA-CHILE",
    name: "Rua Chile",
    points: [
      [457, 573],
      [1054, 574],
    ],
    neighbors: ["U", "P", "M", "G", "T", "O", "L", "F"],
  },
  {
    id: "RUA-BRASIL",
    name: "Rua Brasil",
    points: [
      [235, 644],
      [450, 644],
      [750, 644],
      [1055, 646],
      [1195, 652],
      [1260, 702],
      [1320, 734],
      [1410, 754],
      [1577, 782],
    ],
    neighbors: ["T", "O", "L", "F", "J", "E", "C"],
  },
  {
    id: "RUA-URUGUAI",
    name: "Rua Uruguai",
    points: [
      [751, 730],
      [1058, 731],
    ],
    neighbors: ["J", "E", "I", "D"],
  },
  {
    id: "RUA-ARGENTINA",
    name: "Rua Argentina",
    points: [
      [716, 808],
      [923, 807],
      [1058, 809],
    ],
    neighbors: ["I", "D", "B3", "B4", "B5", "B6"],
  },
  {
    id: "RUA-MONTEVIDEU",
    name: "Rua Montevidéu",
    points: [
      [927, 468],
      [927, 510],
      [927, 579],
      [927, 650],
      [924, 807],
    ],
    neighbors: ["N", "M", "L", "J", "I", "G", "F", "E", "D"],
  },
  {
    id: "ALAMEDA-MERCOSUL",
    name: "Alameda Mercosul",
    points: [
      [754, 468],
      [754, 508],
      [754, 580],
      [751, 644],
      [749, 732],
      [748, 812],
    ],
    neighbors: ["Q", "P", "O", "N", "M", "L", "J", "I"],
  },
  {
    id: "RUA-BRASILIA",
    name: "Rua Brasília",
    points: [
      [1060, 461],
      [1059, 648],
      [1063, 807],
      [1064, 912],
    ],
    neighbors: ["F", "G", "E", "D", "B", "C", "D3"],
  },
];
function measureNamedCorridors(surfaces: PhysicalSurface[]) {
  return namedA2Axes.map((trace) => {
    const axis = trace.points.map(registerA2Point),
      samples: number[] = [];
    for (let i = 1; i < axis.length; i++) {
      const a = axis[i - 1],
        b = axis[i],
        d: Point = [b[0] - a[0], b[1] - a[1]],
        count = Math.max(2, Math.ceil(Math.hypot(...d) / 2));
      for (let j = 1; j < count; j++) {
        const t = j / count,
          w = sectionWidth([a[0] + d[0] * t, a[1] + d[1] * t], d, surfaces);
        if (w !== null) samples.push(w);
      }
    }
    samples.sort((a, b) => a - b);
    return {
      ...trace,
      axis,
      axisParts: clipPhysicalAxis(axis, surfaces),
      width: round(samples[Math.floor(samples.length / 2)] ?? 0),
      minimumWidth: round(samples[0] ?? 0),
      maximumWidth: round(samples.at(-1) ?? 0),
      sampleCount: samples.length,
      source:
        "A2 calibrated white corridor trace; names and neighboring-block identities from officialReference2026.ts at 6d284e9",
      measurement:
        "Median/min/max perpendicular surface sections excluding green holes; drawing units, not metres. Intersection widening and raster-boundary condition remain in samples; axis fragments never bridge a missing surface.",
    };
  });
}

/** Pure build-time export. No backend, commercial occupants or reference
 * subdivision is read. Physical source codes occur only in this audit. */
export function createParkTechnicalAudit(options: {
  generatedAt: string;
  raster?: Raster;
  connectivity?: boolean;
}) {
  const raster = options.raster
    ? {
        ...options.raster,
        matrix:
          options.raster.matrix ?? a2RasterMatrix(options.raster.width, options.raster.height),
      }
    : undefined;
  const current = layout as unknown as Layout;
  const connectivity = options.connectivity ? auditParkConnectivity() : null;
  for (const name of [
    "PARK_PHYSICAL_BLOCKS",
    "PARK_CONTEXT_ROADS",
    "PARK_CONTEXT_WALKS",
    "PARK_RENDER_ENTITIES",
    "PARK_GATES",
  ] as const)
    if (!Array.isArray(current[name]))
      throw new Error(`Technical export requires permanentParkLayout.${name}.`);
  const lots = ENTITIES.filter((e) => e.kind === "lot");
  const blocks = current.PARK_PHYSICAL_BLOCKS.map((block) => {
    const source = PARK_REFERENCE_BLOCKS.find((entry) => entry.id === block.id);
    if (!source) throw new Error(`Unknown physical reference block ${block.id}.`);
    const commercial = lots.filter((lot) => block.commercialIds.includes(lot.id));
    const a2Pieces = PARK_A2_BLOCK_PIECES[block.id];
    const referencePieces =
      block.referencePieces ??
      (a2Pieces ? a2Pieces.map(registerA2Polygon) : [block.referencePolygon]);
    const referenceDimensions = dimensions(
      a2Pieces ? a2Pieces.flat() : (source.sourcePolygon as Point[]),
    );
    const registeredDimensions = dimensions(referencePieces.flat());
    const targetDimensions = commercial.length
      ? dimensions(commercial.flatMap((lot) => lot.polygon))
      : null;
    return {
      id: block.id,
      referenceRevision: PARK_REFERENCE_REVISION,
      referencePolygon: source.sourcePolygon,
      referenceFrame: a2Pieces ? "a2-normalized" : "reference-code-converted-to-a2",
      directA2Pieces: a2Pieces ?? null,
      registeredReferencePolygon: block.referencePolygon,
      registeredReferencePieces: referencePieces,
      presentationPolygons: block.polygons,
      commercialIds: commercial.map((lot) => lot.id),
      indumoveisNumbers: commercial.flatMap((lot) => lot.numbers ?? []),
      coverage: source.coverage,
      commercialCoverage: commercial.map((lot) => {
        const area = Math.abs(signedPolygonArea(lot.polygon)),
          inside = referencePieces.reduce(
            (sum, piece) => sum + intersectionArea(lot.polygon, piece),
            0,
          );
        return {
          id: lot.id,
          numbers: lot.numbers,
          lotDrawingArea: round(area),
          intersectionDrawingArea: round(inside),
          fraction: Number((inside / area).toFixed(8)),
          unmatchedDrawingArea: round(Math.max(0, area - inside)),
          condition:
            "Common-frame polygon intersection. A border residual is retained; no individual lot transform or false whole-block equivalence.",
        };
      }),
      boundaryRoads: source.neighborRoads,
      dimensions: {
        referenceDrawingPoints: referenceDimensions,
        registeredDrawingUnits: registeredDimensions,
        commercialSubsetDrawingUnits: targetDimensions,
        commercialToRegisteredRatio: targetDimensions
          ? {
              x: round(targetDimensions.x / registeredDimensions.x),
              z: round(targetDimensions.z / registeredDimensions.z),
            }
          : null,
        criterion:
          "Axis-aligned extents for comparison only; exported polygons retain concavities and cut-outs. Partial commercial subsets must not match the whole physical envelope.",
      },
      physicalPieceMetrics: referencePieces.map(polygonMetrics),
      commercialMemberMetrics: commercial.map((lot) => ({
        id: lot.id,
        numbers: lot.numbers,
        ...polygonMetrics(lot.polygon),
      })),
      landmarks: PARK_REFERENCE_BUILDINGS.filter((building) => {
        const a = polygonBounds(
            PARK_A2_BUILDING_FOOTPRINTS[building.id]
              ? registerA2Polygon(PARK_A2_BUILDING_FOOTPRINTS[building.id])
              : registerParkPolygon(building.sourcePolygon),
          ),
          b = polygonBounds(referencePieces.flat());
        return (
          a.maxX >= b.minX - 10 &&
          a.minX <= b.maxX + 10 &&
          a.maxY >= b.minY - 10 &&
          a.minY <= b.maxY + 10
        );
      }).map((building) => ({
        id: building.id,
        name: building.name,
        condition: "nearby reference landmark; verify actual polygon relation",
      })),
      note: source.note,
    };
  });
  const walkIds = new Set(current.PARK_CONTEXT_WALKS.map((e) => e.id));
  const roadGroups = new Map<string, MapEntity[]>();
  for (const road of current.PARK_RENDER_ENTITIES.filter((e) => e.kind === "road")) {
    const id = road.id.startsWith("indumoveis:context:") ? road.id.replace(/:\d+$/, "") : road.id;
    roadGroups.set(id, [...(roadGroups.get(id) ?? []), road]);
  }
  const roads = [...roadGroups].map(([id, parts]) => {
    const road = parts[0],
      polygons = parts.map((part) => part.polygon);
    const sourceRoad = PARK_REFERENCE_ROADS.find((entry) => id.endsWith(`:${entry.id}`));
    const sourcePath = PARK_REFERENCE_ACCESS_PATHS.find((entry) => id.endsWith(`:${entry.id}`));
    const medial = road.id.includes("a2-network")
      ? { axis: [] as Point[], width: 0, minimumWidth: 0 }
      : sourcePath
        ? {
            axis: sourcePath.sourcePath.map(registerParkPoint),
            width: round(sourcePath.widthSource * PARK_REGISTRATION.scale),
            minimumWidth: round(sourcePath.widthSource * PARK_REGISTRATION.scale),
          }
        : majorAxis(sourceRoad ? registerParkPolygon(sourceRoad.sourcePolygon) : road.polygon);
    const axisParts = clipAxis(medial.axis, polygons);
    return {
      id,
      name: road.label,
      polygons,
      surfaceParts: parts.map((part) => ({ polygon: part.polygon, holes: part.holes ?? [] })),
      source: sourceRoad?.source ?? sourcePath?.source ?? road.source,
      class: walkIds.has(road.id) || /walk|arvoredo/.test(road.id) ? "pedestrian" : "vehicle",
      ...medial,
      isNetworkComponent: road.id.includes("a2-network"),
      axisParts,
      measurement:
        "Drawing units; reference corridor width before clipping, not surveyed metres. Axis is clipped to actual surface fragments; gaps are never bridged by the audit. Surface band includes source-dependent finishing allowances.",
    };
  });
  const physicalSurfaces = current.PARK_CONTEXT_ROADS.map((road) => ({
    polygon: road.polygon,
    holes: road.holes ?? [],
  }));
  const namedRoadCorridors = measureNamedCorridors(physicalSurfaces);
  const architecture = current.PARK_RENDER_ENTITIES.filter(
    (e) =>
      (e.kind === "pavilion" || e.kind === "support") &&
      (e.height ?? 0) > 1.2 &&
      !/mao-na-massa/.test(e.id),
  ).map((building) => {
    const presentation = getPavilionPresentation(building);
    return {
      id: building.id,
      name: building.label,
      polygon: building.polygon,
      source: building.source,
      owner: "existing Indumóveis entity",
      front: presentation?.frontNormal,
      ridgeDirection: presentation?.ridgeDirection,
      frontRoad: presentation?.frontStreetId,
      mainEntries: presentation?.mainEntries ?? building.accesses ?? [],
      serviceEntries: presentation?.serviceEntries ?? [],
      estimatedEntries: presentation?.estimatedEntries,
      approachPoints: [] as Point[],
      approachCondition:
        "Presentation entrances above follow the building's explicit front or the existing support access registry.",
    };
  });
  const landmarks = current.PERMANENT_PARK_LANDMARKS.map((building) => ({
    id: building.id,
    name: building.name,
    polygon: building.polygon ?? rect(building.bounds),
    front: building.front,
    source: building.source,
    owner: building.existingOwner
      ? `single model for ${building.existingOwner}`
      : "permanent context",
    mainEntries: [] as Point[],
    serviceEntries: [] as Point[],
    approachPoints:
      connectivity?.anchors.find((anchor) => anchor.id === building.id)?.points ?? ([] as Point[]),
    approachCondition:
      "Estimated public approach at the physical front. It is a surface-check anchor, not a surveyed door position or evidence of an opening in every rendered context wall.",
  }));
  const inventory = [...architecture, ...landmarks];
  const openAreas = PARK_REFERENCE_BUILDINGS.filter((entry) => entry.id === "PISTA-CAMPEIRA").map(
    (entry) => ({
      id: entry.id,
      name: entry.name,
      polygon: PARK_A2_BUILDING_FOOTPRINTS[entry.id]
        ? registerA2Polygon(PARK_A2_BUILDING_FOOTPRINTS[entry.id])
        : registerParkPolygon(entry.sourcePolygon),
      source: entry.source,
      function: "open rural ground; no building volume or commercial parcels",
    }),
  );
  const publicSurfaces = [
    ...deriveParkDetails(current.PARK_RENDER_ENTITIES).concrete.map((polygon, i) => ({
      id: `commercial-apron:${i}`,
      polygon,
      source: "parkDetails.ts / registered public-front aprons, clipped against entities",
      function: "pavilion/public approach",
    })),
    ...Object.entries(current.ARENA_APPROACH ?? {}).map(([id, bounds]) => ({
      id: `arena-approach:${id}`,
      polygon: current.ARENA_APPROACH_POLYGONS?.[id] ?? rect(bounds),
      source:
        current.ARENA_APPROACH_CONDITION?.source ??
        "arenaCanonicalLayout.ts / common drawing registration",
      function: id === "stairs" ? "stairs with level transition" : "pedestrian platform",
    })),
  ];
  const mappedCommercialIds = new Set(blocks.flatMap((block) => block.commercialIds));
  const unmatchedCommercial = lots
    .filter((lot) => !mappedCommercialIds.has(lot.id))
    .map((lot) => ({
      id: lot.id,
      numbers: lot.numbers,
      polygon: lot.polygon,
      condition:
        "Protected commercial lot retained; no whole physical reference block correspondence assigned. Do not fabricate an envelope match.",
    }));
  const residuals = PARK_REGISTRATION_RESIDUALS.map((entry) => ({
    ...entry,
    residual: round(entry.residual),
  }));
  const unresolvedResiduals = residuals.filter((entry) => !entry.withinTolerance);
  const commercialBorderResiduals = blocks.flatMap((block) =>
    block.commercialCoverage
      .filter((coverage) => coverage.fraction < 0.999)
      .map((coverage) => ({
        blockId: block.id,
        ...coverage,
        resolution:
          "Keep the approved commercial polygon unchanged. Physical context floors and roads are clipped against the protected footprint; the measured source border residual remains explicit.",
      })),
  );
  const independentResiduals = residuals.filter((entry) => entry.role === "holdout");
  const independentChecks = {
    count: independentResiduals.length,
    rms: round(
      Math.sqrt(
        independentResiduals.reduce((sum, entry) => sum + entry.residual ** 2, 0) /
          Math.max(1, independentResiduals.length),
      ),
    ),
    maximum: round(Math.max(0, ...independentResiduals.map((entry) => entry.residual))),
    outsideTolerance: independentResiduals.filter((entry) => !entry.withinTolerance).length,
  };
  const data = {
    generatedAt: options.generatedAt,
    referenceRevision: PARK_REFERENCE_REVISION,
    frame: {
      ...PARK_REGISTRATION,
      notation:
        "world (x,z); +x right, +z down in the Indumóveis sheet; arrows show building fronts, never geographic north",
    },
    units: "Indumóveis PDF/10 drawing units. No topographic or accessibility certification.",
    a2PhysicalSource: PARK_A2_SOURCE_CONDITION,
    primarySimilarity: PARK_A2_REGISTRATION,
    referenceCodeGraphicConversion: PARK_CODE_TO_A2_REGISTRATION,
    woodland: PARK_PLANTING_AUDIT,
    rasterOverlay: raster
      ? {
          localOnly: true,
          matrix: raster.matrix,
          condition:
            "Private unembedded local A2 raster; page rotation normalized and primary A2 similarity applied to actual image dimensions. Never publish this source-numbered variant.",
        }
      : null,
    correspondence: blocks,
    referenceCorrespondence: PARK_BLOCK_CORRESPONDENCE,
    roads,
    namedRoadCorridors,
    physicalCirculation: {
      surfaceComponents: physicalSurfaces.length,
      primaryA2Components: current.PARK_CONTEXT_ROADS.filter((road) =>
        road.id.includes(":a2-network:"),
      ).length,
      annotationRepairs: current.PARK_CONTEXT_ROADS.filter((road) =>
        road.id.includes("annotation-clearance"),
      ).map((road) => ({
        id: road.id,
        polygon: road.polygon,
        source: road.source,
        condition: road.notes,
      })),
      holes: physicalSurfaces.reduce((sum, s) => sum + s.holes.length, 0),
      sourceCondition: PARK_A2_SOURCE_CONDITION.roadExtraction,
      presentationContour: roadContourPrecision(),
      exteriorAvenueOwner:
        "urbanReference; A2 physical boundary excludes exterior Benvenuto surface",
    },
    publicSurfaces,
    arenaApproachCondition: current.ARENA_APPROACH_CONDITION ?? null,
    openAreas,
    inventory,
    unmatchedCommercial,
    gates: current.PARK_GATES,
    residuals,
    independentChecks,
    commercialBorderResiduals,
    connectivity,
    divergences: [
      ...unresolvedResiduals.map((entry) => ({
        id: entry.id,
        issue: "Registration residual exceeds edge review tolerance",
        measured: entry.residual,
        tolerance: PARK_REGISTRATION.edgeReviewTolerance,
        status: "review explicitly; do not translate a sector to hide residual",
      })),
      ...commercialBorderResiduals.map((coverage) => ({
        id: coverage.id,
        issue: "Protected commercial border differs from registered physical reference outline",
        measured: coverage.unmatchedDrawingArea,
        fractionContained: coverage.fraction,
        status: coverage.resolution,
      })),
    ],
    resolvedStructuralDivergences: [
      {
        id: "sector-offsets",
        before:
          "Rural, Arena and cultural structures independently displaced away from commercial core",
        after:
          "One physical A2 frame registered by shared blocks; direct physical footprints replace peripheral code rectangles",
      },
      {
        id: "facade-orientation",
        before: "Main presentation fronts of the commercial pavilion group faced exterior avenue",
        after:
          "Explicit world-space facade and ridge directions; front aprons follow internal circulation without rotating lots",
      },
      {
        id: "white-circulation",
        before: "White plan bands represented as gaps or omitted links",
        after:
          "A2 white-network surfaces with preserved holes and polygon clipping; short annotation occlusions repaired only along documented openings",
      },
      {
        id: "commercial-subdivision",
        before: "Reference event numbers could be mistaken for physical matching keys",
        after:
          "Correspondence by envelopes, relative position and boundary streets; all 70 Indumóveis numbers retain their approved commercial owners",
      },
    ],
    knownOpenConditions: [
      ...unmatchedCommercial.map((lot) => ({
        id: lot.id,
        numbers: lot.numbers,
        condition:
          "Preserved commercial geometry; physical block correspondence remains unassigned. No fabricated matching or individual lot movement.",
      })),
      {
        id: "C2-C3",
        condition:
          "Reference A2 combines restaurant/pizzeria footprint. Existing Indumóveis Café, Bar and Restaurante owners remain in their approved positions; individual physical correspondence is pending. No combined duplicate building is created.",
      },
      {
        id: "peripheral-graphic-conversion",
        condition:
          "Central code-to-A2 calibration has independent peripheral discrepancies. Direct A2 footprints and road pieces control implementation where extracted; code supplies adapted architectural details, not independently offset sectors.",
      },
      {
        id: "pedestrian-and-vehicle-functions",
        condition:
          "The A2 white network proves physical pavement. It does not by itself prove permitted vehicle movement, gates operating hours, accessible slopes or fencing levels. These require source-specific review; the technical diagram is not a routing certificate.",
      },
    ],
  };
  const allPoints = [
    ...blocks.flatMap((b) => [...b.registeredReferencePieces, ...b.presentationPolygons]),
    ...lots.map((e) => e.polygon),
    ...roads.flatMap((e) => e.polygons),
    ...inventory.map((e) => e.polygon),
    ...publicSurfaces.map((e) => e.polygon),
    ...openAreas.map((e) => e.polygon),
    current.PARK_GATES.map((e) => e.point),
  ].flat();
  const bounds = polygonBounds(allPoints);
  const margin = 12,
    titleBand = 19,
    legendBand = 18;
  const minX = bounds.minX - margin,
    minZ = bounds.minY - margin - titleBand;
  const width = bounds.maxX - bounds.minX + margin * 2,
    height = bounds.maxY - bounds.minY + margin * 2 + titleBand + legendBand;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="3200" height="${Math.round((3200 * height) / width)}" viewBox="${[minX, minZ, width, height].map(round).join(" ")}">
<defs><marker id="front-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#ad4a20"/></marker></defs>
<style>text{font-family:Arial,sans-serif;paint-order:stroke;stroke:#fffdf8;stroke-width:.16;stroke-linejoin:round} polygon{stroke-linejoin:round} .road-label{font-size:1.15px}</style>
<rect x="${minX}" y="${minZ}" width="${width}" height="${height}" fill="#fffdf8"/>
${label([minX + 5, minZ + 5], "INDUMÓVEIS — CONFERÊNCIA TÉCNICA DO PARQUE", 3.2)}
${label([minX + 5, minZ + 9], `Registro único pelas quadras · RMS ${PARK_REGISTRATION.fitRms.toFixed(3)} u.d. · máximo ajuste ${PARK_REGISTRATION.fitMaximum.toFixed(3)} u.d.`, 1.65)}
${label([minX + 5, minZ + 12.5], "Coordenadas de desenho; as setas indicam frentes arquitetônicas. Sem afirmação de norte, metragem ou precisão topográfica.", 1.35)}
${raster ? `<g id="local-raster-reference" opacity=".33"><image xlink:href="${escape(raster.href)}" width="${raster.width}" height="${raster.height}" transform="matrix(${raster.matrix.join(" ")})"/></g>` : ""}
<g id="context-physical-blocks">${blocks.flatMap((b) => b.presentationPolygons.map((p) => `<polygon points="${points(p)}" fill="#dde8cf" stroke="#7f916f" stroke-width=".15"/>`)).join("")}</g>
<g id="documented-woodland-masses">${PARK_PLANTING_AUDIT.map((m) => `<polygon points="${points(m.polygon)}" fill="#c9dfbd80" stroke="#6d9463" stroke-width=".14" stroke-dasharray=".7 .5"><title>${escape(m.id)}: limite aproximado de massa arbórea, ${m.count} árvores de apresentação; não inventário de troncos.</title></polygon>`).join("")}</g>
<g id="open-rural-areas">${openAreas.map((area) => `<polygon points="${points(area.polygon)}" fill="#e4cfbb" stroke="#ad8867" stroke-width=".18" stroke-dasharray=".9 .7"/>${label(center(area.polygon), area.name, 1.8, "#79543d", 'text-anchor="middle"')}`).join("")}</g>
<g id="vehicle-road-surfaces">${roads
    .filter((r) => r.class === "vehicle")
    .flatMap((r) =>
      r.surfaceParts.map((part) =>
        svgSurface(part.polygon, part.holes, raster ? "#b8bec080" : "#b8bec0", "#727c82", 0.11),
      ),
    )
    .join("")}</g>
<g id="pedestrian-surfaces">${roads
    .filter((r) => r.class === "pedestrian")
    .flatMap((r) =>
      r.surfaceParts.map((part) =>
        svgSurface(part.polygon, part.holes, "#e7d7b8", "#ad9a7b", 0.11),
      ),
    )
    .join("")}</g>
<g id="public-approach-surfaces">${publicSurfaces.map((surface) => `<polygon points="${points(surface.polygon)}" fill="#e7d7b8" stroke="#ad9a7b" stroke-width=".08"><title>${escape(surface.id)} — ${escape(surface.function)}</title></polygon>`).join("")}</g>
<g id="protected-indumoveis-lots">${lots.map((lot) => `<polygon points="${points(lot.polygon)}" fill="#ede2f0" stroke="#763a87" stroke-width=".16"/>${label(lot.anchor, (lot.numbers ?? []).join("/"), 1.45, "#652e73", 'text-anchor="middle" dominant-baseline="central"')}`).join("")}</g>
<g id="reference-physical-envelopes">${blocks.map((block) => `${block.registeredReferencePieces.map((piece) => `<polygon points="${points(piece)}" fill="none" stroke="#008caa" stroke-width=".25" stroke-dasharray="1.1 .8"/>`).join("")}${label(center(block.registeredReferencePieces.flat()), `Q ${block.id}`, 2, "#00798e", 'text-anchor="middle"')}`).join("")}</g>
<g id="building-footprints-and-fronts">${inventory.map((b) => `<polygon points="${points(b.polygon)}" fill="#f3e6d9" stroke="#965f43" stroke-width=".2"/>${label(center(b.polygon), conciseBuildingName(b), conciseBuildingName(b).length > 24 ? 1.4 : 1.6, "#72482f", 'text-anchor="middle"')}${b.front ? arrow(center(b.polygon), b.front, "#ad4a20") : ""}${b.mainEntries.map(([x, z]) => `<circle cx="${x}" cy="${z}" r=".35" fill="#ad4a20"/>`).join("")}`).join("")}</g>
<g id="road-axes-and-measured-widths">${namedRoadCorridors.map((r) => `${r.axisParts.map((part) => `<polyline points="${points(part)}" fill="none" stroke="#647079" stroke-width=".10" stroke-dasharray=".5 .55"/>`).join("")}${roadLabel(r.axisParts, `${r.name} · ${r.width.toFixed(2)} u.d.`)}`).join("")}</g>
<g id="gate-openings">${current.PARK_GATES.map((gate) => {
    const axis: Point =
      typeof gate.axis === "string" ? (gate.axis === "x" ? [1, 0] : [0, 1]) : gate.axis;
    const norm = Math.hypot(...axis) || 1,
      dx = ((-axis[1] / norm) * gate.width) / 2,
      dz = ((axis[0] / norm) * gate.width) / 2;
    return `<line x1="${gate.point[0] - dx}" y1="${gate.point[1] - dz}" x2="${gate.point[0] + dx}" y2="${gate.point[1] + dz}" stroke="#075c82" stroke-width=".6"/>${label([gate.point[0] + 1.2, gate.point[1] - 1.4], gate.name, 1.7, "#075c82")}`;
  }).join("")}</g>
<g id="registration-residuals">${residuals.map((r) => `<line x1="${r.registered[0]}" y1="${r.registered[1]}" x2="${r.target[0]}" y2="${r.target[1]}" stroke="${r.withinTolerance ? "#147a63" : "#ca441c"}" stroke-width=".2"/><circle cx="${r.target[0]}" cy="${r.target[1]}" r=".28" fill="${r.withinTolerance ? "#147a63" : "#ca441c"}"/>${label([r.target[0] + 0.45, r.target[1] - 0.45], `${r.id} ${r.residual.toFixed(2)}`, 0.85, r.withinTolerance ? "#147a63" : "#ca441c")}`).join("")}</g>
${
  connectivity
    ? `<g id="verified-surface-routes" fill="none" stroke="#3459bd" stroke-width=".28" opacity=".85">${connectivity.anchors
        .filter((a) => a.route && (a.kind === "gate" || a.kind === "equipment"))
        .map(
          (a) =>
            `<polyline points="${points(a.route!)}"><title>${escape(a.name)}: percurso verificado sobre a superfície; entrada${a.entranceEstimated ? " estimada" : " documentada"}; não certifica permissão ou acessibilidade em campo.</title></polyline>`,
        )
        .join("")}</g><g id="surface-review-points">${connectivity.pending
        .filter((a) => a.firstGap)
        .map(
          (a) =>
            `<circle cx="${a.firstGap![0]}" cy="${a.firstGap![1]}" r=".65" fill="none" stroke="#cc3f38" stroke-width=".25"><title>${escape(a.name)}: ${escape(a.status)}. Primeiro ponto a conferir; não foi criada ligação através de lote, edifício ou área verde para ocultar a pendência.</title></circle>`,
        )
        .join("")}</g>`
    : ""
}
${label([minX + 5, minZ + height - 12], "LEGENDA: ciano tracejado = envelope de referência; roxo = lotes Indumóveis preservados; verde = quadras físicas de contexto; cinza = circulação; areia = passeios.", 1.3)}
${label([minX + 5, minZ + height - 8.5], "Marrom = construções e suas frentes; azul = vão dos portões; verde/vermelho = resíduos de registro. Larguras indicadas em unidades de desenho (u.d.).", 1.3)}
${label([minX + 5, minZ + height - 5], connectivity ? `Azul fino = percursos apoiados em superfície; círculos vermelhos = pontos pendentes. ${connectivity.verified}/${connectivity.anchors.length} âncoras verificadas. Referência comercial excluída.` : `Tolerância de revisão ${PARK_REGISTRATION.edgeReviewTolerance} u.d. · ${unresolvedResiduals.length} pontos fora da tolerância · fonte física ${PARK_REFERENCE_REVISION.slice(0, 12)} · lotes comerciais da referência excluídos.`, 1.3)}
</svg>`;
  const f = (d: { x: number; z: number } | null) =>
    d ? `${d.x.toFixed(2)} × ${d.z.toFixed(2)}` : "—";
  const verifiedRoutesMarkdown = connectivity
    ? `\n### Percursos efetivamente verificados\n\nOs comprimentos abaixo pertencem à polilinha de validação sobre o piso em unidades de desenho. Não representam distância de campo, caminho ótimo ou permissão operacional. A contagem de componentes do grafo inclui fragmentos após recorte e exigência de portal útil; ela não é uma contagem de setores comerciais.\n\n| Destino desde Argentina | Função | Comprimento da polilinha u.d. | Entrada/aproximação |\n| --- | --- | --- | --- |\n${connectivity.anchors
        .filter((anchor) => anchor.route)
        .map((anchor) => {
          const route = anchor.route!,
            length = route
              .slice(1)
              .reduce((sum, p, i) => sum + Math.hypot(p[0] - route[i][0], p[1] - route[i][1]), 0);
          return `| ${anchor.name} (${anchor.id}) | ${anchor.kind} | ${length.toFixed(2)} | ${anchor.entranceEstimated ? "estimada para apresentação" : "posição de referência"} |`;
        })
        .join("\n")}\n`
    : "";
  const markdown = `# Conferência territorial do parque — referência física A2

O referencial físico principal é a página A2 normalizada em **1684 × 1191 pontos**, após aplicar a rotação de página **270°**. O ajuste único A2 → Indumóveis usa escala **${PARK_A2_REGISTRATION.scale.toFixed(9)}**, rotação gráfica **${PARK_A2_REGISTRATION.rotationDegrees.toFixed(6)}°** e 16 cantos das quadras físicas I/D/J/E. Não representa norte geográfico, metragem de campo ou levantamento topográfico.

RMS do ajuste: **${PARK_REGISTRATION.fitRms.toFixed(4)} u.d.**; máximo: **${PARK_REGISTRATION.fitMaximum.toFixed(4)} u.d.**. Controles independentes L/F: RMS **${independentChecks.rms.toFixed(4)} u.d.**, máximo **${independentChecks.maximum.toFixed(4)} u.d.**, **${independentChecks.outsideTolerance}** fora da tolerância gráfica de **${PARK_REGISTRATION.edgeReviewTolerance} u.d.**. O critério corresponde a aproximadamente meia largura da faixa Argentina no desenho aprovado; não certifica acessibilidade ou precisão topográfica.

A transformação comum do desenho de referência FENASOJA para a página A2 é uma conversão gráfica separada. Seus retângulos aproximados apresentavam diferenças periféricas: o ajuste central não certifica esses objetos. Footprints, quadras e ruas A2 extraídos diretamente governam a apresentação; o código fornece detalhes arquitetônicos adaptados ao footprint correspondente. Não se aplicam deslocamentos independentes por setor.

## Correspondência verificável das quadras

As extensões abaixo são medidas nos eixos do desenho. O JSON registra também área gráfica, perímetro e as seis maiores arestas de cada peça física e de cada membro comercial; não se somam perímetros de lotes para fingir um envelope unido. Os polígonos e todas as peças estão no SVG/JSON: V/U/T preservam o corredor entre suas duas partes; R/S preservam recortes e peças separadas pelas ruas. L/F contêm apenas subconjuntos comerciais Indumóveis e não devem coincidir com o envelope completo. Não há parcelamento ou numeração comercial FENASOJA no artefato público.

| Quadra física | Lotes Indumóveis | Vias limítrofes | Extensão fonte A2, quando disponível | Envelope registrado | Subconjunto comercial | Razão comercial/ref. x,z | Marcos de conferência |
| --- | --- | --- | --- | --- | --- | --- | --- |
${blocks.map((b) => `| ${b.id} (${b.coverage}) | ${b.indumoveisNumbers.join(", ") || "contexto físico"} | ${b.boundaryRoads.join(", ")} | ${f(b.dimensions.referenceDrawingPoints)} (${b.referenceFrame}) | ${f(b.dimensions.registeredDrawingUnits)} | ${f(b.dimensions.commercialSubsetDrawingUnits)} | ${b.dimensions.commercialToRegisteredRatio ? f(b.dimensions.commercialToRegisteredRatio) : "—"} | ${b.landmarks.map((l) => l.name).join(", ") || "—"} |`).join("\n")}

## Resíduos do registro principal

Todas as 70 identificações comerciais têm uma correspondência física por conjunto ou subconjunto. Os lotes 57 e 70 pertencem a subconjuntos de O e A, respectivamente; 69 pertence à faixa de equipamentos junto a P3/B11, identificada tecnicamente como APOIOS-P3. Essa faixa tem parede compartilhada a oeste, sem rua inventada. As interseções abaixo medem o encaixe real do polígono aprovado, em vez de concluir igualdade pelo número ou pelo bounds.

| Subconjunto conferido | Componente físico | Área aprovada u.d.² | Interseção u.d.² | Fração contida | Resíduo de borda u.d.² |
| --- | --- | --- | --- | --- | --- |
${blocks.flatMap((block) => block.commercialCoverage.filter((c) => c.numbers?.some((n) => [57, 69, 70].includes(n))).map((c) => `| ${c.numbers?.join(" / ")} | ${block.id} | ${c.lotDrawingArea.toFixed(4)} | ${c.intersectionDrawingArea.toFixed(4)} | ${(100 * c.fraction).toFixed(3)}% | ${c.unmatchedDrawingArea.toFixed(4)} |`)).join("\n")}

Não se redimensiona ou translada um lote para eliminar esses resíduos. O JSON conserva também as interseções dos demais subconjuntos comerciais.

| Controle | Função | Resíduo u.d. | Critério |
| --- | --- | --- | --- |
${residuals.map((r) => `| ${r.id} | ${r.role} | ${r.residual.toFixed(4)} | ${r.withinTolerance ? "dentro da tolerância gráfica" : "revisar fonte e correspondência; não afastar setor"} |`).join("\n")}

## Ruas, eixos e larguras de desenho

A rede física A2 tem **${data.physicalCirculation.primaryA2Components} componentes principais** e **${physicalSurfaces.reduce((sum, s) => sum + s.holes.length, 0)} furos** preservados, além de **${data.physicalCirculation.annotationRepairs.length} reparos curtos de oclusão por símbolos**, documentados no JSON. O branco das ruas foi extraído da planta híbrida com máscara de limite vetorial original, curva 5308; o raster foi normalizado a um pixel por ponto PDF. Os bolsões e as ruas de vagas do estacionamento posterior foram excluídos, preservando o acesso curvo A6 e a infraestrutura de contorno. Áreas verdes e quadras permanecem furos reais na circulação.

Antes do recorte de proteção dos lotes e edifícios, o contorno de apresentação das ruas rasterizadas usa RDP com limite de **${data.physicalCirculation.presentationContour.tolerancePdfPoints} ponto A2**, abaixo de um pixel da extração. São **${data.physicalCirculation.presentationContour.rawVertices} vértices brutos → ${data.physicalCirculation.presentationContour.displayVertices} vértices de apresentação**. A conferência de todos os vértices brutos mediu desvio máximo de **${data.physicalCirculation.presentationContour.measuredMaximumPdfPoints.toFixed(6)} ponto A2 / ${data.physicalCirculation.presentationContour.measuredMaximumDrawingUnits.toFixed(6)} u.d.**, contra limite de **${data.physicalCirculation.presentationContour.maximumAllowedDrawingUnits.toFixed(6)} u.d.**. O dado bruto, os furos, os lotes, os contornos vetoriais de quadras/edifícios e o registro permanecem separados dessa simplificação visual. Os resíduos das bordas comerciais são registrados à parte. Esse critério de traçado é distinto da tolerância de registro de ${PARK_REGISTRATION.edgeReviewTolerance} u.d.; não é uma alegação de precisão de campo.

As larguras são seções perpendiculares da superfície, respeitando os furos, em **unidades de desenho**, sem conversão inventada para metros. Máximos incluem alargamentos de encontros. Os nomes foram conferidos no registro oficial da revisão ${PARK_REFERENCE_REVISION.slice(0, 12)} e associados às quadras vizinhas; os eixos A2 são auxiliares técnicos e são cortados onde não existe piso. Não são pintura viária nem um grafo de rotas de produção.

| Via | Quadras/marcos limítrofes | Mediana / mínima / máxima u.d. | Seções válidas |
| --- | --- | --- | --- |
${namedRoadCorridors.map((r) => `| ${r.name} | ${r.neighbors.join(", ")} | ${r.width.toFixed(3)} / ${r.minimumWidth.toFixed(3)} / ${r.maximumWidth.toFixed(3)} | ${r.sampleCount} |`).join("\n")}

## Inventário de estruturas e apresentação

| Estrutura | Responsável visual | Frente no mundo x,z | Entradas de apresentação / aproximação | Fonte |
| --- | --- | --- | --- | --- |
${inventory.map((b) => `| ${b.name} | ${b.owner} | ${b.front?.map((n) => n.toFixed(4)).join(", ") ?? "não documentada neste registro"} | ${b.mainEntries.map((p) => p.map((v) => v.toFixed(3)).join(", ")).join("; ") || (b.approachPoints.length ? `aproximação estimada: ${b.approachPoints.map((p) => p.map((v) => v.toFixed(3)).join(", ")).join("; ")}` : "conferir aproximação e patamar do equipamento")} | ${b.source} |`).join("\n")}

P8, P13 e P3 conservam identidades próprias e a continuidade das arestas correspondentes. Os footprints A2 incluem os recortes frontais e o anexo posterior de P8; não foi aplicado casco convexo. Casa/Sede B12, Palco Lactalis B13 e Cozinha da Soja B7 são estruturas diferentes. O B7 impresso na Indumóveis permanece uma identidade própria, sem equivalência automática com a Cozinha. As aproximações estimadas dos equipamentos são âncoras para verificar o piso diante da frente; não comprovam uma porta levantada ou uma abertura específica em cada parede do modelo de contexto.

## Portões e abertura física

| Portão | Passagem registrada x,z | Direção de passagem x,z | Largura gráfica u.d. | Condição |
| --- | --- | --- | --- | --- |
${current.PARK_GATES.map((g) => `| ${g.name} (${g.id}) | ${g.point.map((v) => v.toFixed(3)).join(", ")} | ${typeof g.axis === "string" ? g.axis : g.axis.map((v) => v.toFixed(4)).join(", ")} | ${g.width.toFixed(3)} | ${(g as Gate & { condition?: string }).condition ?? "abertura gráfica da A2; arquitetura não levantada"} |`).join("\n")}

As passagens usam a abertura branca e a borda correspondente. Círculos e códigos são identificação, não volumetria de portal. A3 tem fluxo leste/oeste na barra de entrada; isso é distinto da direção norte/sul do eixo Brasília. A6 usa a abertura ao lado da pequena guarita, preservando a curva. A largura não certifica altura livre ou funcionamento operacional.

## Maciços, clareiras e exclusões

| Massa confirmada | Árvores de apresentação | Condição da fonte |
| --- | --- | --- |
${PARK_PLANTING_AUDIT.map((m) => `| ${m.id} | ${m.count} | ${m.frame}; ${m.note} |`).join("\n")}

Os centros são distribuição orgânica determinística dentro de massas documentadas, sem alegação de troncos levantados. A copa inteira respeita lotes, edifícios, ruas com furos, passeios, pátios, quadras esportivas e aberturas. O centro cívico das Nações e as clareiras de acesso permanecem sem árvores.

## Pendências específicas preservadas

${unmatchedCommercial.map((lot) => `- Lote(s) **${lot.numbers?.join(" / ")}**: IDs e geometrias comerciais mantidos; correspondência física de quadra completa ainda não atribuída. A posição continua visível na sobreposição e não foi deslocada para simular ajuste.`).join("\n")}
- **C2/C3**: a referência A2 contém um footprint conjunto de restaurante/pizzaria. Café, Bar e Restaurante Indumóveis conservam seus três responsáveis existentes e suas posições aprovadas, até haver correspondência individual fundamentada; não se cria um edifício conjunto duplicado.
- **Altimetria, cercamentos e acessibilidade**: a continuidade em planta não comprova permissão de veículos, horário de portão, inclinação de rampas ou ausência de barreiras em campo. A revisão visual e os testes físicos de superfície precisam ser avaliados separadamente das correspondências e resíduos.

## Percursos de conferência

O SVG permite acompanhar Portão 4 → Buenos Aires → Paraguai → Mercosul → Brasil → quadras comerciais; Brasília relaciona esse núcleo ao conjunto Mirante/Arena e à frente das Etnias. As ruas transversais dão continuidade ao setor rural por Pastor Albert Lehenbauer, 15 de Novembro e Ubiretama. Essa descrição orienta a inspeção das superfícies reais desenhadas; não é uma nova funcionalidade de rotas nem uma certificação operacional de todos os trajetos.

${connectivity ? `A auditoria geométrica verificou **${connectivity.verified}/${connectivity.anchors.length} âncoras** a partir do núcleo Argentina. Componentes conservadoras: veículos ${connectivity.vehicleComponents}, pedestres ${connectivity.pedestrianComponents}. Preparação ${connectivity.preparationMs.toFixed(1)} ms nesta execução de exportação; não é medição de frames. A união física das superfícies é rasterizada em grade de ${connectivity.grid.step} u.d., com erosão de uma célula, vizinhança de quatro direções e remoção de lotes/volumes. Essa grade apenas propõe caminhos para a auditoria: não gera piso, rota de produção ou geometria de conexão. Cada segmento central e suas laterais a ±${connectivity.criteria.routeHalfWidth} u.d. são divididos em todas as interseções com bordas dos pisos e obstáculos; cada intervalo de classificação constante precisa permanecer sobre o piso vetorial exato. Essa prova analítica rejeita também o vão de 0.04 u.d. do teste de regressão. O campo sampleStep=${connectivity.criteria.sampleStep} permanece no JSON apenas como histórico da amostragem uniforme anterior, que foi substituída pela partição analítica. Essa folga é um critério gráfico, sem certificação de largura operacional ou acessibilidade. Entradas estimadas permanecem identificadas no JSON. Percursos verificados aparecem em azul no SVG técnico; círculos vermelhos apontam o primeiro trecho ainda sem verificação.\n\n| Âncora pendente | Função | Resultado | Primeiro ponto a conferir |\n| --- | --- | --- | --- |\n${connectivity.pending.map((a) => `| ${a.name} (${a.id}) | ${a.kind} | ${a.status} | ${a.firstGap?.map((v) => v.toFixed(4)).join(", ") ?? "ver JSON"} |`).join("\n") || "| Nenhuma nesta execução | — | — | — |"}` : "Esta exportação não executou o grafo de superfícies. Use --connectivity para medir os percursos e registrar suas pendências; a sobreposição visual sozinha não prova continuidade."}

${raster ? "Este SVG é a variante **privada**, com vínculo local à planta A2 e sua numeração original para conferência. Não publicar ou incorporar essa variante ao mapa." : "Este SVG é a variante pública de evidência, sem raster da planta e sem parcelamento comercial FENASOJA."}
${verifiedRoutesMarkdown}
`;
  return {
    svg,
    data,
    markdown:
      markdown +
      `\n## Áreas abertas e condições de correspondência\n\n${openAreas.map((area) => `- ${area.name}: envelope físico aberto da fonte ${area.source}, sob o mesmo registro; sem volume edificado ou parcelamento comercial.`).join("\n")}\n\n${blocks
        .filter((block) => block.note)
        .map((block) => `- Quadra ${block.id}: ${block.note}`)
        .join("\n")}\n` +
      `\nControles independentes: ${independentChecks.count}; RMS ${independentChecks.rms.toFixed(4)} u.d.; máximo ${independentChecks.maximum.toFixed(4)} u.d.; ${independentChecks.outsideTolerance} fora da tolerância. Os resíduos de ajuste e de controle permanecem separados no JSON.\n`,
    summary: {
      physicalBlocks: blocks.length,
      protectedLotEnvelopes: lots.length,
      protectedNumbers: lots.flatMap((e) => e.numbers ?? []).length,
      roads: roads.length,
      roadSurfaceFragments: roads.reduce((sum, road) => sum + road.polygons.length, 0),
      publicApproachSurfaces: publicSurfaces.length,
      structures: inventory.length,
      gates: current.PARK_GATES.length,
      residualsOutsideTolerance: unresolvedResiduals.length,
      connectivityVerified: connectivity?.verified ?? null,
      connectivityPending: connectivity?.pending.length ?? null,
      rasterEmbedded: false,
    },
  };
}
