import type { Point } from "./data/territory";
import { REFERENCE_ROADS } from "./urbanReference";
import { deriveRoadRibbon } from "./roadGeometry";

/** A deliberately schematic sector placement, NOT a geographic transform.
 * Physical identities are from the FENASOJA checkout a09a4c68052a7c5fb2a1966d6e1e67980264e8fd;
 * coordinates are presentation-only in the Indumóveis drawing. No feature is
 * a commercial entity and no identity is assigned to an existing Indumóveis lot. */
export type PermanentParkLandmark = {
  id:
    | "arena"
    | "mirante"
    | "alameda"
    | "sede"
    | "etnia-polonesa"
    | "etnia-italiana"
    | "etnia-alema"
    | "etnia-afro"
    | "pavilhao-9"
    | "pavilhao-7"
    | "pavilhoes-6-10-11"
    | "pavilhao-5";
  name: string;
  source: string;
  bounds: readonly [number, number, number, number];
  placement: "arena-sector" | "east-sector" | "rural-sector";
};
export const PERMANENT_PARK_LANDMARKS: readonly PermanentParkLandmark[] = [
  {
    id: "pavilhao-9",
    name: "Pavilhão 9",
    source: "PAVILHAO-09 / gateFourDistrict.ts",
    bounds: [-9.3, -56.24, -0.66, -35.76],
    placement: "rural-sector",
  },
  {
    id: "pavilhao-7",
    name: "Pavilhão 7",
    source: "B10 / officialReference2026.ts",
    bounds: [1.74, -40.64, 15.18, -35.56],
    placement: "rural-sector",
  },
  {
    id: "pavilhoes-6-10-11",
    name: "Pavilhões 6, 10 e 11",
    source: "B9 / officialReference2026.ts",
    bounds: [15.58, -40.48, 49.98, -35.16],
    placement: "rural-sector",
  },
  {
    id: "pavilhao-5",
    name: "Pavilhão 5",
    source: "B8 / officialReference2026.ts",
    bounds: [50.74, -42.6, 59.26, -35.12],
    placement: "rural-sector",
  },
  {
    id: "alameda",
    name: "Alameda Gastronômica",
    source: "D1 / officialReference2026.ts",
    bounds: [145, -5.9, 152, 3.9],
    placement: "arena-sector",
  },
  {
    id: "mirante",
    name: "Mirante",
    source: "D3 / miranteComplexReconstruction.ts",
    bounds: [155, -18, 161, -5],
    placement: "arena-sector",
  },
  {
    id: "arena",
    name: "Arena",
    source: "F / arenaCanonicalLayout.ts; SicrediArena.tsx, without brand",
    bounds: [191, -12, 210, 2],
    placement: "arena-sector",
  },
  {
    id: "sede",
    name: "Casa / Sede",
    source: "B12 / fenasojaComplexReconstruction.ts",
    bounds: [190, 50, 197, 58],
    placement: "east-sector",
  },
  {
    id: "etnia-polonesa",
    name: "Casa da Etnia Polonesa",
    source: "C5 / officialReference2026.ts",
    bounds: [196, 68, 201, 75],
    placement: "east-sector",
  },
  {
    id: "etnia-italiana",
    name: "Casa da Etnia Italiana",
    source: "C6 / officialReference2026.ts",
    bounds: [215, 68, 220, 75],
    placement: "east-sector",
  },
  {
    id: "etnia-alema",
    name: "Casa da Etnia Alemã",
    source: "C8 / officialReference2026.ts",
    bounds: [196, 82, 201, 89],
    placement: "east-sector",
  },
  {
    id: "etnia-afro",
    name: "Casa da Etnia Afro",
    source: "C7 / officialReference2026.ts",
    bounds: [215, 82, 220, 89],
    placement: "east-sector",
  },
];
export function permanentParkPolygon(landmark: PermanentParkLandmark): Point[] {
  const [x0, z0, x1, z1] = landmark.bounds;
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}
export const PERMANENT_PARK_EXPLORATION = PERMANENT_PARK_LANDMARKS.map(permanentParkPolygon);

/** R/S Exporural context only: uniform PDF-source × 0.04 with a translated
 * sector origin, never the source's commercial parcels or numbering. */
const ruralPoint = ([x, z]: readonly [number, number]): Point => [
  x * 0.04 - 77.18,
  z * 0.04 - 130.72,
];
const ruralRect = (bounds: readonly [number, number, number, number]): Point[] => {
  const [x0, z0, x1, z1] = bounds;
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ].map((point) => ruralPoint(point as [number, number]));
};
export const EXPORURAL_GROUND = ruralRect([3960, 1250, 5980, 2380]);
// Paraguay's western edge terminates at the actual OSM Buenos Aires ribbon.
// Source geometry confirms the intersection; this cut assigns the crossing to
// the existing road surface instead of drawing overlapping asphalt.
const buenos = REFERENCE_ROADS.find((road) => road.id === "park-buenos-aires")!;
const buenosRibbon = deriveRoadRibbon(buenos.path, buenos.width);
function buenosEastEdge(z: number) {
  const crossings: number[] = [];
  for (let i = 0; i < buenosRibbon.length; i++) {
    const a = buenosRibbon[i],
      b = buenosRibbon[(i + 1) % buenosRibbon.length];
    if ((a[1] <= z && b[1] > z) || (b[1] <= z && a[1] > z))
      crossings.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  if (!crossings.length) throw new Error("rural-buenos-aires-junction-not-found");
  return Math.max(...crossings);
}
const paraguay = ruralRect([1640, 2444, 3945, 2467]);
paraguay[0][0] = buenosEastEdge(paraguay[0][1]);
paraguay[3][0] = buenosEastEdge(paraguay[3][1]);
export const EXPORURAL_ROADS = [
  { name: "Rua Bruno Schwartz", polygon: ruralRect([3984, 1484, 5966, 1518]) },
  { name: "Rua Johan Muller", polygon: ruralRect([3984, 1726, 5966, 1762]) },
  { name: "Rua Gustavo Bessel", polygon: ruralRect([3985, 2041, 5966, 2078]) },
  { name: "Rua Emanuel Brachmann", polygon: ruralRect([5227, 2333, 5966, 2372]) },
  { name: "Rua 15 de Novembro", polygon: ruralRect([5188, 1265, 5227, 2372]) },
  {
    name: "Rua Pastor Albert Lehenbauer",
    polygon: [
      [3968, 1265],
      [4004, 1265],
      [4004, 1484],
      [3985, 1518],
      [3984, 1726],
      [3984, 2445],
      [3945, 2445],
      [3945, 1758],
      [3963, 1726],
      [3963, 1518],
      [3968, 1484],
    ].map((point) => ruralPoint(point as [number, number])),
  },
  {
    name: "Rua Ubiretama",
    polygon: [
      [5966, 1265],
      [6008, 1265],
      [6008, 2080],
      [5960, 2320],
      [5880, 2570],
      [5832, 2640],
      [5800, 2618],
      [5842, 2550],
      [5920, 2310],
      [5966, 2070],
    ].map((point) => ruralPoint(point as [number, number])),
  },
  { name: "Rua Paraguai", polygon: paraguay },
  { name: "Rua Brasília — recorte norte", polygon: ruralRect([3940, 2440, 3988, 2600]) },
] as const;

/** Source Arena plaza/stairs [4092..4888] are uniformly adapted between the
 * existing schematic Mirante east edge and Arena west edge; the exact physical
 * landform, levels and registration to the commercial drawing remain unknown. */
const arenaScale = (191 - 161) / (4888 - 4092);
const arenaX = (source: number) => 161 + (source - 4092) * arenaScale;
const arenaZ = (source: number) => -5 + (source - 2811) * arenaScale;
export const ARENA_APPROACH = {
  stairs: [arenaX(4092), arenaZ(2682), arenaX(4480), arenaZ(2940)] as const,
  plaza: [arenaX(4480), arenaZ(2682), arenaX(4888), arenaZ(2940)] as const,
  // 80×196 source points under the same uniform arena-sector scale.
  canopy: [161 - 80 * arenaScale, -5, 161, -5 + 196 * arenaScale] as const,
  // Presentation connection between D1 and the covered access: geometry is
  // locally inferred, not a surveyed crossing of Rua Brasília.
  landing: [152, -4.6, 161, -0.2] as const,
};
const contextRect = ([x0, z0, x1, z1]: readonly [number, number, number, number]): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
PERMANENT_PARK_EXPLORATION.push(
  EXPORURAL_GROUND,
  ...EXPORURAL_ROADS.map((r) => r.polygon),
  contextRect(ARENA_APPROACH.stairs),
  contextRect(ARENA_APPROACH.plaza),
  contextRect(ARENA_APPROACH.landing),
  contextRect(ARENA_APPROACH.canopy),
);

/** Approximate peripheral canopy masses; never road or commercial inventory. */
export const EXPORURAL_EDGE_TREES: Point[] = (
  [
    ...Array.from({ length: 12 }, (_, i): Point => [84 + i * 6.6, -84.5 - (i % 3) * 0.4]),
    ...Array.from({ length: 12 }, (_, i): Point => [84 + i * 6.6, -28.5 + (i % 3) * 0.4]),
    [78, -66],
    [78, -55],
    [78, -44],
    [165, -66],
    [165, -55],
    [165, -44],
  ] as Point[]
).filter(([x, z]) =>
  EXPORURAL_ROADS.every(({ polygon }) => {
    const xs = polygon.map((p) => p[0]),
      zs = polygon.map((p) => p[1]);
    const dx = Math.max(Math.min(...xs) - x, 0, x - Math.max(...xs));
    const dz = Math.max(Math.min(...zs) - z, 0, z - Math.max(...zs));
    return Math.hypot(dx, dz) > 1.6;
  }),
);
PERMANENT_PARK_EXPLORATION.push([
  [76, -87],
  [167, -87],
  [167, -25],
  [76, -25],
]);
