import type { Point } from "./data/territory";
import { PARK_A2_BLOCK_PIECES } from "./parkA2Reference";

/** Physical reference only. No FENASOJA commercial parcels, state or numbering.
 * The source frame is the unrotated Illustrator park drawing (PDF points,
 * +x right / +z down), NOT the attached Civil3D A2 page's coordinate frame.
 * Inspected read-only at the revision below; these are drawing coordinates,
 * with source-dependent accuracy, not a topographic survey. */
export const PARK_REFERENCE_REVISION = "6d284e9ed491cfa6171a9fe377051b556ea6e73c";
export const PARK_REFERENCE_SOURCE = "expo-logistics-hub/src/features/commercial-map/data/";
export type ParkSourcePoint = readonly [number, number];
export type ParkSourcePolygon = readonly ParkSourcePoint[];
export const parkSourceRect = ([x0, z0, x1, z1]: readonly [
  number,
  number,
  number,
  number,
]): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const rect = parkSourceRect;

export interface ParkReferenceBlock {
  id: string;
  name: string;
  sourcePolygon: ParkSourcePolygon;
  /** Original normalized A2 vector outline, preferred over approximate code bounds. */
  a2Polygon?: ParkSourcePolygon;
  /** Multiple physical pieces keep internal road corridors open (V/U/T/R/S). */
  a2Polygons?: readonly ParkSourcePolygon[];
  neighborRoads: readonly string[];
  /** Only Indumóveis identities; reference commercial numbers are excluded. */
  indumoveisNumbers: readonly number[];
  coverage: "whole-commercial-envelope" | "partial-commercial-envelope" | "physical-context";
  note?: string;
}
const seq = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const block = (
  id: string,
  bounds: readonly [number, number, number, number],
  neighborRoads: readonly string[],
  indumoveisNumbers: readonly number[] = [],
  coverage: ParkReferenceBlock["coverage"] = "physical-context",
  note?: string,
): ParkReferenceBlock => ({
  id,
  name: `Quadra física ${id}`,
  sourcePolygon: rect(bounds),
  a2Polygon: PARK_A2_BLOCK_PIECES[id]?.length === 1 ? PARK_A2_BLOCK_PIECES[id][0] : undefined,
  a2Polygons: PARK_A2_BLOCK_PIECES[id],
  neighborRoads,
  indumoveisNumbers,
  coverage,
  note,
});

export const PARK_REFERENCE_BLOCKS: readonly ParkReferenceBlock[] = [
  block(
    "V",
    [1650, 2468, 2220, 2578],
    ["RUA-PARAGUAI", "RUA-BOLIVIA", "RUA-BUENOS-AIRES", "RUA-INTERNA-OESTE"],
  ),
  block(
    "Q",
    [2243, 2472, 2785, 2578],
    ["RUA-PARAGUAI", "RUA-BOLIVIA", "RUA-INTERNA-OESTE", "ALAMEDA-MERCOSUL"],
  ),
  block(
    "N",
    [2830, 2470, 3440, 2578],
    ["RUA-PARAGUAI", "RUA-BOLIVIA", "ALAMEDA-MERCOSUL", "RUA-MONTEVIDEU-SUL"],
  ),
  block(
    "U",
    [1650, 2625, 2220, 2830],
    ["RUA-BOLIVIA", "RUA-CHILE", "RUA-BUENOS-AIRES", "RUA-INTERNA-OESTE"],
  ),
  block(
    "P",
    [2243, 2625, 2785, 2835],
    ["RUA-BOLIVIA", "RUA-CHILE", "RUA-INTERNA-OESTE", "ALAMEDA-MERCOSUL"],
  ),
  block(
    "M",
    [2830, 2625, 3440, 2835],
    ["RUA-BOLIVIA", "RUA-CHILE", "ALAMEDA-MERCOSUL", "RUA-MONTEVIDEU-SUL"],
  ),
  block(
    "G",
    [3484, 2625, 3935, 2838],
    ["RUA-BOLIVIA", "RUA-CHILE", "RUA-MONTEVIDEU-SUL", "RUA-BRASILIA"],
  ),
  block(
    "T",
    [1650, 2890, 2220, 3100],
    ["RUA-CHILE", "RUA-BRASIL", "RUA-BUENOS-AIRES", "RUA-INTERNA-OESTE"],
  ),
  block(
    "O",
    [2243, 2890, 2785, 3105],
    ["RUA-CHILE", "RUA-BRASIL", "RUA-INTERNA-OESTE", "ALAMEDA-MERCOSUL"],
    [57],
    "partial-commercial-envelope",
    "Lot57 is a small southeast subset of O by polygon overlap (93.724% of the approved lot inside registered A2 envelope). Its south edge exceeds the graphic source by about0.50 drawing unit. Keep lot geometry; this is a documented edge residual, not a new block or an individual transform.",
  ),
  block(
    "L",
    [2830, 2890, 3440, 3105],
    ["RUA-CHILE", "RUA-BRASIL", "ALAMEDA-MERCOSUL", "RUA-MONTEVIDEU"],
    seq(58, 65),
    "partial-commercial-envelope",
    "Indumóveis occupies one row, not the full two-row physical block; its southern edge is an independent registration check.",
  ),
  block(
    "F",
    [3484, 2890, 3935, 3105],
    ["RUA-CHILE", "RUA-BRASIL", "RUA-MONTEVIDEU", "RUA-BRASILIA"],
    seq(66, 68),
    "partial-commercial-envelope",
    "Only the western portion of one row is commercial in Indumóveis. Alameda Gastronômica D1 occupies the eastern physical portion; never equate three lots with this whole envelope.",
  ),
  block(
    "J",
    [2830, 3182, 3440, 3435],
    ["RUA-BRASIL", "RUA-URUGUAI", "ALAMEDA-MERCOSUL", "RUA-MONTEVIDEU"],
    [...seq(29, 36), ...seq(43, 50)],
    "whole-commercial-envelope",
  ),
  block(
    "E",
    [3484, 3182, 3935, 3437],
    ["RUA-BRASIL", "RUA-URUGUAI", "RUA-MONTEVIDEU", "RUA-BRASILIA"],
    [...seq(37, 42), ...seq(51, 56)],
    "whole-commercial-envelope",
  ),
  block(
    "I",
    [2830, 3495, 3440, 3715],
    ["RUA-URUGUAI", "RUA-ARGENTINA", "ALAMEDA-MERCOSUL", "RUA-MONTEVIDEU"],
    [...seq(1, 8), ...seq(15, 22)],
    "whole-commercial-envelope",
  ),
  block(
    "D",
    [3484, 3495, 3935, 3715],
    ["RUA-URUGUAI", "RUA-ARGENTINA", "RUA-MONTEVIDEU", "RUA-BRASILIA"],
    [...seq(9, 14), ...seq(23, 28)],
    "whole-commercial-envelope",
  ),
  block("C", [4020, 3180, 4510, 3437], ["RUA-BRASIL", "RUA-URUGUAI-LESTE", "RUA-BRASILIA"]),
  block(
    "B",
    [4020, 3495, 4510, 3720],
    ["RUA-URUGUAI-LESTE", "RUA-ARGENTINA-LESTE", "RUA-BRASILIA"],
  ),
  block(
    "A",
    [4020, 3780, 4510, 4165],
    ["RUA-ARGENTINA-LESTE", "RUA-BRASILIA", "AV-IMIGRANTES"],
    [70],
    "partial-commercial-envelope",
    "Lot70 is the western subset of the physical A envelope, with99.785% polygon overlap under the common A2 registration. Preserve the approved polygon and document the small border residual.",
  ),
  {
    id: "APOIOS-P3",
    name: "Faixa física de apoios junto a P3",
    // Compatibility coordinates use the same common A2->reference-code
    // graphic conversion documented in parkRegistration.ts. A2 is authoritative.
    sourcePolygon: PARK_A2_BLOCK_PIECES["APOIOS-P3"][0].map(([x, z]): Point => [
      3.747940110929301 * x + 0.017889574843818864 * z - 21.224037285683938,
      -0.011658574438931304 * x + 3.5810164710240695 * z + 859.1511194637108,
    ]),
    a2Polygon: PARK_A2_BLOCK_PIECES["APOIOS-P3"][0],
    a2Polygons: PARK_A2_BLOCK_PIECES["APOIOS-P3"],
    neighborRoads: [
      "RUA-ARGENTINA",
      "RUA-BRASILIA",
      "AV-BENVENUTO-CONTI",
      "P3-SHARED-CONSTRUCTION-FACE",
    ],
    indumoveisNumbers: [69],
    coverage: "partial-commercial-envelope",
    note: "Working physical support-frontage component beside P3 and the administrative auditorium B11; no printed quadra letter is inferred. Original A2 outline5334 verifies north/east, boundary5308 the avenue edge, and P3's east wall the construction interface. Lot69 overlap97.408%, with the remaining2.592% at the graphic Brasília boundary retained as a residual. No road or commercial subdivision is invented at the west interface.",
  },
  block("X", [760, 2400, 1640, 3140], ["RUA-BUENOS-AIRES"]),
  {
    id: "R",
    name: "Setor rural — envelope físico R",
    neighborRoads: [
      "RUA-JOHAN-MULLER",
      "RUA-GUSTAVO-BESSEL",
      "RUA-EMANUEL-BRACHMANN",
      "RUA-15-NOVEMBRO",
      "RUA-UBIRETAMA",
      "RUA-PASTOR-ALBERT-LEHENBAUER",
    ],
    indumoveisNumbers: [],
    coverage: "physical-context",
    // Concavities and the rural/pecuary interface are intentional. Not a hull.
    sourcePolygon: [
      [3230, 1760],
      [5966, 1760],
      [5966, 2372],
      [5880, 2570],
      [5832, 2640],
      [5700, 2660],
      [5600, 2645],
      [5500, 2615],
      [5370, 2520],
      [5140, 2490],
      [5100, 2482],
      [4980, 2482],
      [4100, 2438],
      [3994, 2438],
      [3984, 2438],
      [3984, 2445],
      [3945, 2445],
      [3940, 2418],
      [3687, 2418],
      [3562, 2388],
      [3541, 2180],
      [3244, 2167],
      [3230, 2080],
    ],
  },
  {
    id: "S",
    name: "Setor rural — envelope físico S",
    neighborRoads: [
      "RUA-BRUNO-SCHWARTZ",
      "RUA-JOHAN-MULLER",
      "RUA-15-NOVEMBRO",
      "RUA-UBIRETAMA",
      "RUA-PASTOR-ALBERT-LEHENBAUER",
    ],
    indumoveisNumbers: [],
    coverage: "physical-context",
    sourcePolygon: [
      [3985, 1265],
      [6008, 1265],
      [6008, 1762],
      [3985, 1762],
    ],
  },
];

export type ParkRoadClass = "internal-vehicle" | "internal-pedestrian";
export interface ParkReferenceRoad {
  id: string;
  name: string;
  sourcePolygon: ParkSourcePolygon;
  roadClass: ParkRoadClass;
  source: string;
}
const road = (
  id: string,
  name: string,
  polygon: ParkSourcePolygon,
  roadClass: ParkRoadClass = "internal-vehicle",
): ParkReferenceRoad => ({
  id,
  name,
  sourcePolygon: polygon,
  roadClass,
  source: "officialReference2026.ts / roadInputs",
});
/** White separations in the plans are real road corridors. These polygons
 * include transverse links; none is represented as a vacant grass strip.
 * External avenues/highways retain their urbanReference owner. */
export const PARK_REFERENCE_ROADS: readonly ParkReferenceRoad[] = [
  road("RUA-BRUNO-SCHWARTZ", "Rua Bruno Schwartz", rect([3984, 1484, 5966, 1518])),
  road("RUA-JOHAN-MULLER", "Rua Johan Muller", rect([3984, 1726, 5966, 1762])),
  road("RUA-GUSTAVO-BESSEL", "Rua Gustavo Bessel", [
    [3230, 2058],
    [3985, 2058],
    [3985, 2041],
    [5966, 2041],
    [5966, 2078],
    [3985, 2078],
    [3985, 2080],
    [3230, 2080],
  ]),
  road("RUA-EMANUEL-BRACHMANN", "Rua Emanuel Brachmann", rect([5227, 2333, 5966, 2372])),
  road("RUA-PASTOR-ALBERT-LEHENBAUER", "Rua Pastor Albert Lehenbauer", [
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
  ]),
  road("RUA-15-NOVEMBRO", "Rua 15 de Novembro", rect([5188, 1265, 5227, 2372])),
  road("RUA-UBIRETAMA", "Rua Ubiretama", [
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
  ]),
  road("RUA-BUENOS-AIRES", "Rua Buenos Aires", rect([1600, 2410, 1648, 3145])),
  road("RUA-PARAGUAI", "Rua Paraguai", rect([1640, 2444, 3945, 2467])),
  road("RUA-BOLIVIA", "Rua Bolívia", rect([1640, 2579, 3945, 2624])),
  road("RUA-CHILE", "Rua Chile", rect([1640, 2836, 3945, 2889])),
  road("RUA-BRASIL", "Rua Brasil", rect([1640, 3106, 4510, 3181])),
  road("RUA-URUGUAI", "Rua Uruguai", rect([2820, 3438, 3940, 3494])),
  road("RUA-ARGENTINA", "Rua Argentina", rect([2820, 3716, 3940, 3780])),
  road("RUA-BRASILIA", "Rua Brasília", rect([3940, 2440, 3988, 4210])),
  road("RUA-MONTEVIDEU", "Rua Montevidéu", rect([3441, 3106, 3482, 3715])),
  road("RUA-URUGUAI-LESTE", "Rua Uruguai (trecho leste)", rect([3960, 3438, 4510, 3494])),
  road("RUA-ARGENTINA-LESTE", "Rua Argentina (trecho leste)", rect([3960, 3716, 4510, 3780])),
  road("RUA-MONTEVIDEU-SUL", "Rua Montevidéu (trecho sul)", rect([3441, 2600, 3482, 3130])),
  road(
    "RUA-MONTEVIDEU-COZINHA",
    "Rua Montevidéu — ligação Cozinha da Soja",
    rect([3441, 2467, 3482, 2579]),
  ),
  road("RUA-INTERNA-OESTE", "Rua Interna Oeste", rect([2222, 2450, 2241, 3125])),
  road("RUA-INTERNA-QUADRA-T", "Rua Interna das Quadras V, U e T", rect([1749, 2444, 1811, 3108])),
  road("RUA-LESTE-EXPORURAL", "Rua Leste da Exporural", rect([5942, 1265, 5966, 1762])),
  road(
    "RUA-UBIRETAMA-LATERAL-R55",
    "Rua Ubiretama — ligação transversal",
    rect([5965, 1755, 6008, 2085]),
  ),
  road("ALAMEDA-MERCOSUL", "Alameda Mercosul", rect([2786, 2410, 2828, 3780])),
  road(
    "CALCADA-ARVOREDO",
    "Calçada do Arvoredo",
    rect([2630, 3110, 2782, 3565]),
    "internal-pedestrian",
  ),
];

export interface ParkReferenceBuilding {
  id: string;
  name: string;
  sourcePolygon: ParkSourcePolygon;
  /** World-source unit vector, independent from ridge/local mesh axes. */
  front?: ParkSourcePoint;
  existingOwner?: string;
  source: string;
}
const building = (
  id: string,
  name: string,
  bounds: readonly [number, number, number, number],
  existingOwner?: string,
  front?: ParkSourcePoint,
): ParkReferenceBuilding => ({
  id,
  name,
  sourcePolygon: rect(bounds),
  existingOwner,
  front,
  source: "officialReference2026.ts",
});
const centerRect = (x: number, z: number, w: number, d: number) =>
  rect([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
const pointsPerPixel = 222 / 658;
const pixelsPerMeter = 20.2;
const complexOrigin = ([x, y]: ParkSourcePoint): Point => [
  3988 + (790 - y) * pointsPerPixel,
  3494 + (x - 170) * pointsPerPixel,
];
const complexFootprint = (points: ParkSourcePolygon, imageOrigin: ParkSourcePoint): Point[] => {
  const [x, z] = complexOrigin(imageOrigin);
  const scale = pixelsPerMeter * pointsPerPixel;
  return points.map(([u, v]) => [x - v * scale, z + u * scale]);
};
const arenaSpan = 2940 - 2682;
export const PARK_REFERENCE_BUILDINGS: readonly ParkReferenceBuilding[] = [
  building("B1", "Pavilhão 1 · Mostra", [2298, 3600, 2655, 3759], "indumoveis:pavilion:1", [1, 0]),
  building("B2", "Pavilhão 14", [2418, 3833, 2658, 4074], "indumoveis:pavilion:14", [1, 0]),
  building("B3", "Pavilhão 12", [2792, 3827, 3147, 4089], "indumoveis:pavilion:12", [0, -1]),
  building("B4", "Pavilhão 8", [3172, 3788, 3296, 4100], "indumoveis:pavilion:8", [0, -1]),
  building("B5", "Pavilhão 13", [3307, 3788, 3445, 4051], "indumoveis:pavilion:13", [0, -1]),
  building("B6", "Pavilhão 3", [3460, 3786, 3670, 4098], "indumoveis:pavilion:3", [0, -1]),
  // This B7 is a reference identity, distinct from the printed Indumóveis B7.
  building("B7", "Cozinha da Soja · Pavilhão 4", [3495, 2497, 3666, 2568], undefined, [0, 1]),
  building("B8", "Pavilhão 5", [3198, 2203, 3411, 2390]),
  building("B9", "Pavilhões 6, 10 e 11 · Pecuária", [2319, 2256, 3179, 2389]),
  building("B10", "Pavilhão 7 · Agricultura Familiar", [1973, 2252, 2309, 2379]),
  building("PAVILHAO-09", "Pavilhão 9", [1697, 1862, 1913, 2374]),
  building("B11", "Centro administrativo / auditório", [3735, 3850, 3860, 4150]),
  {
    id: "B12",
    name: "Casa / Sede",
    front: [-1, 0],
    source: "fenasojaComplexReconstruction.ts / headquarters.footprint",
    sourcePolygon: complexFootprint(
      [
        [-4.5, -4.85],
        [0.7, -4.85],
        [0.7, -2.35],
        [1.025, -2.35],
        [1.025, -6.525],
        [4.475, -6.525],
        [4.475, -3.2],
        [6.275, -3.2],
        [6.275, -0.3],
        [3.25, -0.3],
        [3.25, 4.55],
        [-2.53, 4.55],
        [-2.53, 6.775],
        [-4.24, 6.775],
        [-4.24, 7.6],
        [-4.42, 7.6],
        [-4.42, 6.775],
        [-4.43, 6.775],
        [-4.43, 4.325],
        [-3.25, 4.325],
        [-3.25, -1.55],
        [-4.5, -1.55],
      ],
      [684, 603],
    ),
  },
  {
    id: "B13",
    name: "Palco Cultural Lactalis",
    sourcePolygon: complexFootprint(rect([-8.55, -9.2, 8.55, 9.2]), [407, 563]),
    front: [-1, 0],
    source: "fenasojaComplexReconstruction.ts / stage.footprint",
  },
  building("C1", "Centro de Eventos", [4020, 3180, 4490, 3435], "indumoveis:support:events"),
  building(
    "C2-C3",
    "Restaurante / café",
    [2420, 3185, 2600, 3470],
    "indumoveis:support:restaurant",
    [1, 0],
  ),
  // ExporuralSteakhouse's main sign/entry faces local -Z. The west E marker
  // belongs to the restroom annex and does not define the restaurant front.
  building("C4", "Churrascaria rural", [4980, 2370, 5100, 2480], undefined, [0, -1]),
  {
    id: "C5",
    name: "Casa da Etnia Polonesa",
    sourcePolygon: centerRect(4686, 4422, 118, 116),
    front: [1, 0],
    source: "officialReference2026.ts / C5",
  },
  {
    id: "C6",
    name: "Casa da Etnia Italiana",
    sourcePolygon: centerRect(5178, 4425, 118, 116),
    front: [-1, 0],
    source: "officialReference2026.ts / C6",
  },
  {
    id: "C7",
    name: "Casa da Etnia Afro",
    sourcePolygon: centerRect(5178, 4764, 118, 116),
    front: [-1, 0],
    source: "officialReference2026.ts / C7",
  },
  {
    id: "C8",
    name: "Casa da Etnia Alemã",
    sourcePolygon: centerRect(4657, 4758, 118, 116),
    front: [1, 0],
    source: "officialReference2026.ts / C8",
  },
  building("D1", "Alameda Gastronômica", [3770, 2885, 3920, 3095], undefined, [1, 0]),
  building("D2", "Via Expressa · equipamento", [3760, 2650, 3900, 2825]),
  {
    id: "D3",
    name: "Mirante",
    sourcePolygon: rect([4004, 2440, 4072, 2748]),
    front: [-1, 0],
    source: "miranteComplexReconstruction.ts / mirante.sourceBounds",
  },
  {
    id: "F",
    name: "Arena",
    sourcePolygon: rect([
      4888,
      2811 - (arenaSpan * 313) / 256 / 2,
      4888 + (arenaSpan * 415) / 256,
      2811 + (arenaSpan * 313) / 256 / 2,
    ]),
    front: [-1, 0],
    source: "arenaCanonicalLayout.ts / arenaFootprint",
  },
  building("PISTA-CAMPEIRA", "Pista Campeira", [1990, 1740, 3240, 2175]),
  building("B28", "Espaço do Cooperativismo", [3000, 2480, 3220, 2570]),
  building("B22", "Pavilhão Terceira Idade", [742, 3538, 931, 3834], undefined, [1, 0]),
  building("B29", "Casa Rotária", [4570, 4820, 4740, 5050], undefined, [1, 0]),
];

export interface ParkReferenceGate {
  id: string;
  name: string;
  sourcePoint: ParkSourcePoint;
  source: string;
}
/** A-codes and public names are paired explicitly by the source registry.
 * The source diamonds are NOT architectural portal footprints. */
export const PARK_REFERENCE_GATES: readonly ParkReferenceGate[] = (
  [
    ["A1", "Portão 1", [684, 3306]],
    ["A2", "Portão 2", [1274, 4040]],
    ["A3", "Portão 3", [3935, 4219]],
    ["A4", "Portão 4", [1656, 1744]],
    ["A5", "Portão 5", [5974, 3678]],
    ["A6", "Portão 6", [3276, 941]],
    ["A7", "Portão 7", [3267, 1703]],
    ["A8", "Portão 8", [5206, 1302]],
    ["A9", "Portão 9", [3964, 1302]],
    ["A10", "Portão 10", [1214, 3137]],
    ["A11", "Portão 11", [5954, 1293]],
  ] satisfies readonly [string, string, [number, number]][]
).map(([id, name, sourcePoint]) => ({
  id,
  name,
  sourcePoint,
  source: "officialReference2026.ts / A1–A11 registry",
}));

export interface ParkReferenceAccessPath {
  id: string;
  name: string;
  sourcePath: ParkSourcePolygon;
  widthSource: number;
  roadClass: ParkRoadClass;
  source: string;
}
/** Traced access axes retained separately from cadastral road bands. Widths
 * are reference estimates (6.875 source points/m in the rural/access source),
 * not exact metre observations made from these attachments. No parking bays. */
export const PARK_REFERENCE_ACCESS_PATHS: readonly ParkReferenceAccessPath[] = [
  {
    id: "gate-6-gate-7-asphalt",
    name: "Ligação Portões 6–7",
    sourcePath: [
      [3276, 941],
      [3278, 1050],
      [3268, 1175],
      [3244, 1305],
      [3222, 1435],
      [3218, 1545],
      [3234, 1635],
      [3267, 1703],
    ],
    widthSource: 6 * 6.875,
    roadClass: "internal-vehicle",
    source: "parkAccessSpatialPlan.ts / GATE_6_GATE_7_SOURCE",
  },
  {
    id: "gate-7-gustavo-bessel-link",
    name: "Ligação Portão 7 / Gustavo Bessel",
    sourcePath: [
      [3267, 1703],
      [3267, 1720],
      [3265, 1805],
      [3263.5, 1935],
      [3263.5, 2040],
      [3263.5, 2069],
    ],
    widthSource: 6 * 6.875,
    roadClass: "internal-vehicle",
    source: "parkAccessSpatialPlan.ts / GATE_7_GUSTAVO_BESSEL_LINK_SOURCE",
  },
  {
    id: "costeiros-service-road",
    name: "Via de serviço rural / Portão 1",
    sourcePath: [
      [684, 3306],
      [735, 3175],
      [775, 3040],
      [792, 2850],
      [810, 2600],
      [838, 2300],
      [878, 1980],
      [925, 1710],
      [1030, 1585],
      [1310, 1578],
      [1650, 1600],
    ],
    widthSource: 7 * 6.875,
    roadClass: "internal-vehicle",
    source: "parkAccessSpatialPlan.ts / COSTEIROS_SERVICE_ROAD_SOURCE",
  },
  {
    id: "gate-1-gate-10-rua-brasil-asphalt",
    name: "Ligação Portões 1–10 / Rua Brasil",
    sourcePath: [
      [684, 3306],
      [760, 3260],
      [910, 3198],
      [1060, 3154],
      [1214, 3137],
      [1395, 3138],
      [1545, 3141],
      [1640, 3143.5],
      [1650, 3143.5],
    ],
    widthSource: 6 * 6.875,
    roadClass: "internal-vehicle",
    source: "parkAccessSpatialPlan.ts / GATE_1_GATE_10_RUA_BRASIL_SOURCE",
  },
  {
    id: "gate-2-woodland-connector",
    name: "Caminho do bosque / Portão 2",
    sourcePath: [
      [1274, 4040],
      [1325, 3972],
      [1530, 3940],
      [1780, 3932],
      [2050, 3922],
      [2265, 3900],
      [2360, 3860],
      [2398, 3796],
    ],
    widthSource: 3 * 6.875,
    roadClass: "internal-pedestrian",
    source: "parkAccessSpatialPlan.ts / WOODLAND_PATH_SOURCE",
  },
  {
    id: "arena-ubiretama-approach",
    name: "Rua Ubiretama / ligação de contorno",
    sourcePath: [
      [5987, 2000],
      [5972, 2080],
      [5946, 2250],
      [5880, 2440],
      [5785, 2610],
      [5660, 2790],
      [5600, 2890],
      [5602, 2980],
      [5632, 3070],
      [5620, 3170],
      [5560, 3370],
      [5480, 3524],
    ],
    widthSource: 43,
    roadClass: "internal-vehicle",
    source:
      "arenaRoadCorrection.ts / ubiretamaApproach; width follows adjoining official 42–43-point strip",
  },
  {
    id: "etnias-connector",
    name: "Ligação da Avenida dos Imigrantes / Etnias",
    sourcePath: [
      [5120, 4200],
      [5140, 4130],
      [5198, 3950],
      [5260, 3750],
      [5340, 3554],
      [5410, 3503],
    ],
    widthSource: 36,
    roadClass: "internal-vehicle",
    source:
      "arenaRoadCorrection.ts / etniasConnector; annexSpatialCorrections.ts / ETNIAS_PARKING_CONNECTION_CORRECTION.widthSource",
  },
  {
    id: "rua-brasil-gate-5-approach",
    name: "Rua Brasil / ligação ao Portão 5",
    sourcePath: [
      [4528, 3150],
      [4560, 3170],
      [4596, 3208],
      [4632, 3236],
      [4730, 3250],
      [4860, 3280],
      [4930, 3369],
      [5020, 3419],
      [5066, 3441],
      [5112, 3463],
      [5230, 3475],
      [5340, 3482],
      [5410, 3503],
      [5480, 3524],
      [5600, 3560],
      [5780, 3620],
      [5860, 3633],
      [5900, 3650],
      [5940, 3678],
    ],
    widthSource: 36,
    roadClass: "internal-vehicle",
    source:
      "annexSpatialCorrections.ts / PORTAO5_PARKING_ACCESS_CORRECTION; access infrastructure only, no parking surface or bays",
  },
  {
    id: "acesso-churrascaria",
    name: "Ligação rural / Churrascaria",
    sourcePath: [
      [4875, 2059.5],
      [4875, 2260],
      [4875, 2295],
      [4884, 2330],
      [4915, 2351.5],
      [5100, 2351.5],
      [5207.5, 2351.5],
    ],
    widthSource: 36,
    roadClass: "internal-vehicle",
    source: "annexSpatialCorrections.ts / CHURRASCARIA_ACCESS_CORRECTION",
  },
];
