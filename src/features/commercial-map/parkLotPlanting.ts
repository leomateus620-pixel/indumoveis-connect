import {
  boundaryDistance,
  interiorLotAnchor,
  LOT_GRAPHICS,
  lotLabelAxis,
  lotLabelExtent,
} from "./commercialPresentation";
import { ENTITIES, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds } from "./geometry";
import { PARK_A2_BUILDING_FOOTPRINTS } from "./parkA2Reference";
import {
  PARK_GATES,
  PARK_PHYSICAL_BLOCKS,
  PARK_RENDER_ENTITIES,
  PERMANENT_PARK_LANDMARKS,
} from "./permanentParkLayout";
import { registerA2Polygon } from "./parkRegistration";
import type { PavementTopology } from "./pavement";
import type { PavilionGround } from "./pavilionGround";

type TreeForm = "broadleaf" | "upright" | "spreading";
type PlantingBlock =
  "L" | "F" | "J" | "E" | "I" | "D" | "O" | "U" | "P" | "Q" | "M" | "C" | "B" | "A";
type PlantingZone = PlantingBlock | "arvoredo";

export type ParkLotTree = {
  id: string;
  world: Point;
  blockId: PlantingZone;
  form: TreeForm;
  scale: number;
  /** Maximum horizontal extent from the trunk, including crown motion. */
  crownRadius: number;
  priority: "lot" | "edge";
  origin: "park-landscape-reference";
  confidence: "registered-landscape-approximation";
  ownerEntityId: string | null;
  zone: string;
  sourceEntityIds: string[];
  referenceImage: string;
  referencePixel: null;
  localRegistration: string;
  decision: string;
};

type Placement = [
  key: string,
  world: Point,
  form: TreeForm,
  scale: number,
  crownRadius: number,
  lotNumber?: number,
];
type PlantingGroup = { setting: string; trees: Placement[] };

/** Positions and dimensions authored in drawing units from the A2 park and
 * V1 lot geometry. Aerial views check which parts of each block are wooded
 * and which are clear. Each point represents approximate landscape. */
const placements: Partial<Record<PlantingZone, PlantingGroup>> = {
  L: {
    setting: "Maciço no gramado ao sul da Rua Chile e copas esparsas junto à Rua Brasil",
    trees: [
      ["chile-west", [75.1, 9.15], "spreading", 0.97, 1.73],
      ["chile-west-centre", [79.45, 10.7], "broadleaf", 1.14, 2.35],
      ["chile-central", [85.8, 9.55], "upright", 0.96, 1.8],
      ["chile-east-centre", [92.5, 10.65], "spreading", 1.08, 2.21],
      ["chile-east", [97.0, 10.35], "broadleaf", 1.16, 2.48],
      ["chile-montevideu", [104.85, 10.35], "spreading", 1.06, 2.14],
      ["chile-corner", [109.3, 9.8], "broadleaf", 1.09, 2.15],
      ["brasil-west", [75.1, 21.1], "upright", 0.48, 0.67, 58],
      ["brasil-centre", [97.95, 21.13], "broadleaf", 0.47, 0.78, 63],
      ["brasil-east", [108.4, 21.25], "spreading", 0.52, 0.83, 65],
    ],
  },
  F: {
    setting: "Grupo descontínuo junto à Rua Chile e copas isoladas perto da Alameda Gastronômica",
    trees: [
      ["chile-west", [118.5, 9.1], "broadleaf", 0.92, 1.59],
      ["chile-centre", [124, 9.8], "spreading", 1.04, 2.12],
      ["open-grass", [127.4, 16.2], "upright", 0.77, 1.11, 68],
      ["brasil-verge", [132, 19.8], "broadleaf", 0.86, 1.22],
    ],
  },
  J: {
    setting:
      "Copas concentradas junto à Mercosul e exemplares menores nos bordos da Rua Brasil e Rua Uruguai",
    trees: [
      ["brasil-west", [74.1, 27.5], "broadleaf", 0.81, 1.05, 43],
      ["brasil-centre", [89.3, 27.9], "upright", 0.68, 0.96, 46],
      ["uruguai-west", [72.75, 42.8], "spreading", 0.88, 1.25, 29],
    ],
  },
  E: {
    setting:
      "Árvores de bordo na Rua Brasil e copas maiores junto à Rua Brasília, com clareira central",
    trees: [
      ["brasil-west", [117.5, 28.1], "upright", 0.72, 0.92, 51],
      ["brasil-centre-west", [123, 27.85], "upright", 0.59, 0.74, 52],
      ["brasil-centre", [127.2, 27.82], "broadleaf", 0.68, 0.95, 53],
      ["brasil-east", [139.7, 27.8], "spreading", 0.78, 1.09, 55],
      ["brasilia-north", [145.2, 33.6], "broadleaf", 0.87, 1.31, 56],
      ["brasilia-south", [145.22, 37], "spreading", 0.91, 1.26, 42],
    ],
  },
  I: {
    setting:
      "Transição do Arvoredo no lado oeste, árvores pequenas na Rua Uruguai e copa isolada no gramado",
    trees: [
      ["uruguai-west", [73.25, 49.15], "spreading", 0.81, 1.17, 15],
      ["uruguai-verge", [79.5, 49.04], "upright", 0.62, 0.81, 16],
      ["argentina-west", [72.75, 62.9], "broadleaf", 0.84, 1.17, 1],
      ["open-grass", [88.1, 54.45], "spreading", 0.88, 1.18, 18],
    ],
  },
  D: {
    setting: "Maciço descontínuo na borda da Rua Uruguai e copas isoladas a leste e no gramado",
    trees: [
      ["uruguai-west", [117.4, 49.38], "broadleaf", 0.71, 0.85, 23],
      ["uruguai-centre-west", [123.15, 49.35], "upright", 0.72, 0.85, 24],
      ["uruguai-centre", [127.7, 49.2], "broadleaf", 0.86, 1.1, 25],
      ["uruguai-east", [132.35, 49.4], "spreading", 0.86, 0.94, 26],
      ["brasilia-verge", [142.4, 49.2], "upright", 0.73, 0.85, 28],
      ["open-grass", [129.1, 57.6], "spreading", 1.03, 1.15, 11],
    ],
  },
  O: {
    setting: "Copas isoladas ao sul da Rua Chile, no entorno do lote 57",
    trees: [
      ["chile-west", [38, 9.9], "broadleaf", 0.86, 1.5],
      ["mercosul", [64.3, 9.4], "upright", 0.9, 1.32],
    ],
  },
  U: {
    setting: "Copa madura no gramado do setor oeste",
    trees: [["grass-west", [17.4, -4.9], "spreading", 1.04, 2.23]],
  },
  P: {
    setting: "Copa isolada junto à Rua Chile",
    trees: [["chile-west", [38.5, 1.8], "broadleaf", 0.97, 1.6]],
  },
  M: {
    setting: "Pequenos grupos do lado oposto da Rua Chile, diante do maciço de L",
    trees: [
      ["chile-west", [76.9, 2.6], "broadleaf", 0.92, 1.57],
      ["chile-centre", [92.7, 2.4], "upright", 0.72, 1.08],
    ],
  },
  C: {
    setting: "Gramados laterais do Centro de Eventos, junto à Rua La Paz",
    trees: [
      ["events-north", [177.1, 29.2], "broadleaf", 0.96, 1.76],
      ["events-south", [179.6, 41.65], "spreading", 1.11, 2.2],
    ],
  },
  B: {
    setting: "Copas periféricas no gramado a leste do palco e da sede, com passagem livre",
    trees: [
      ["lactalis-east", [173.1, 51.5], "broadleaf", 1.02, 1.82],
      ["sede-east", [177.9, 61.8], "spreading", 1.13, 2.09],
    ],
  },
  A: {
    setting: "Grupos separados em gramados do setor administrativo, sem preencher a clareira",
    trees: [
      ["argentina-east", [163, 70.5], "broadleaf", 1.01, 2.08],
      ["imigrantes-east", [178.5, 84.3], "spreading", 1.08, 2.03],
    ],
  },
};

// Keep the original entries first so their instanced rotations and tones stay stable.
const sidePlanting: Partial<Record<PlantingZone, PlantingGroup>> = {
  arvoredo: {
    setting:
      "Grupos laterais da Calçada do Arvoredo junto aos apoios, com passagem entre as copas e a Mercosul",
    trees: [
      ["cafe-side", [63.2, 28.8], "broadleaf", 0.93, 1.36],
      ["bar-side", [62.95, 33.1], "upright", 0.84, 1.2],
      ["restaurant-side", [63.55, 40.6], "spreading", 0.91, 1.36],
      ["south-corner", [63, 46.9], "broadleaf", 0.82, 1.3],
      ["grove-transition", [57.25, 49.45], "spreading", 0.88, 1.34],
    ],
  },
  J: {
    setting: "Copas escalonadas na fileira 43–50, junto à Rua Brasil e na borda da Mercosul",
    trees: [
      ["arvoredo-grass-43", [72.66, 33.5], "spreading", 0.81, 1.15, 43],
      ["brasil-grass-44", [78.95, 28], "broadleaf", 0.56, 0.83, 44],
      ["brasil-grass-45", [83.2, 33.2], "spreading", 0.67, 0.94, 45],
      ["brasil-grass-47", [94.6, 27.9], "broadleaf", 0.62, 1.03, 47],
      ["brasil-grass-49", [104, 28.2], "upright", 0.56, 0.78, 49],
      ["brasil-grass-50", [110.3, 33.2], "spreading", 0.66, 0.94, 50],
    ],
  },
  I: {
    setting: "Copa na borda gramada do lote 01, na transição da Mercosul com o Arvoredo",
    trees: [["arvoredo-grass-01", [73.17, 57.78], "broadleaf", 0.73, 0.93, 1]],
  },
  C: {
    setting: "Vegetação na faixa gramada entre o Centro de Eventos e a Rua La Paz",
    trees: [["events-side-grass", [173.8, 38.3], "upright", 0.76, 1.19]],
  },
  B: {
    setting: "Copas nas laterais gramadas do Palco Lactalis e da Sede, espaçadas ao longo do setor",
    trees: [
      ["lactalis-side-grass", [177.55, 53.9], "broadleaf", 1.07, 2.09],
      ["sede-side-grass", [166.7, 59.8], "spreading", 0.96, 1.88],
    ],
  },
  A: {
    setting: "Copa na faixa verde além do passeio leste, ao sul da Rua Argentina",
    trees: [["argentina-east-verge", [178.2, 72], "broadleaf", 1.08, 1.97]],
  },
  Q: {
    setting: "Copa ao sul dos pavilhões da Pecuária, na lateral oeste do parque",
    trees: [["pecuaria-green-edge", [48.4, -17.9], "spreading", 1.03, 2.05]],
  },
  P: {
    setting: "Copa junto à Rua Bolívia, com abertura de gramado até a Rua Chile",
    trees: [["bolivia-green-edge", [47.4, -7.2], "broadleaf", 1.04, 1.97]],
  },
};

const lots = ENTITIES.filter((entity) => entity.kind === "lot");
const blockById = new Map(PARK_PHYSICAL_BLOCKS.map((block) => [block.id, block]));
const arvoredo = ENTITIES.find(({ id }) => id === "indumoveis:road:arvoredo")!;

export const PARK_LOT_TREES: readonly ParkLotTree[] = [
  ...Object.entries(placements),
  ...Object.entries(sidePlanting),
].flatMap(([zone, { setting, trees }]) => {
  const blockId = zone as PlantingZone;
  return trees.map(([key, world, form, scale, crownRadius, lotNumber]) => {
    const ownerEntityId = lotNumber
      ? `indumoveis:external:lot:${String(lotNumber).padStart(2, "0")}`
      : null;
    return {
      id: `park-planting:${blockId.toLowerCase()}:${key}`,
      world,
      blockId,
      form,
      scale,
      crownRadius,
      priority: lotNumber ? "lot" : "edge",
      origin: "park-landscape-reference",
      confidence: "registered-landscape-approximation",
      ownerEntityId,
      zone: blockId === "arvoredo" ? "calçada-do-arvoredo" : `quadra-${blockId}`,
      sourceEntityIds: [
        blockId === "arvoredo" ? arvoredo.id : `block:${blockId}`,
        ...(ownerEntityId ? [ownerEntityId] : []),
      ],
      referenceImage: "Vista aérea do Parque de Exposições, Google Earth, conferência visual",
      referencePixel: null,
      localRegistration: "Implantação gráfica A2 e V1 na cena Indumóveis, em unidades de desenho",
      decision: setting,
    };
  });
});

const rootSetback = 0.32;
const pavementSetback = 0.18;
const buildingSetback = 0.55;
const entrySetback = 1.25;
const labelSetback = 0.08;

function protectedLotLabels() {
  return lots.map((lot) => {
    const anchor = interiorLotAnchor(lot.polygon, lot.anchor);
    const axis = lotLabelAxis(lot.polygon);
    const extent = lotLabelExtent(lot.polygon, anchor, axis);
    const width = extent.along * LOT_GRAPHICS.numberAlongShare;
    // Single 2-digit glyph bands are at least 1.4× as wide as they are tall.
    // Use the full across allowance for any other cadastral label.
    const height = Math.min(
      extent.across * LOT_GRAPHICS.numberAcrossShare,
      lot.numbers?.length === 1 ? width / 1.4 : Infinity,
    );
    return { anchor, axis, halfWidth: width / 2, halfHeight: height / 2 };
  });
}

/** Validates authored positions once against the same surfaces the map draws.
 * A conflicting revision drops a tree at its original position. */
export function selectParkLotTrees(
  topology: PavementTopology,
  ground: PavilionGround,
  concrete: readonly Point[][],
): ParkLotTree[] {
  const pavement = [
    ...topology.asphaltCells,
    ...topology.walkCells,
    ...ground.servicePaths,
    ...ground.sidewalk,
    ...ground.curb,
    ...concrete,
  ].map((polygon) => ({ polygon, bounds: polygonBounds(polygon) }));
  const buildings = [
    ...PARK_RENDER_ENTITIES.filter(
      (entity) => entity.kind === "pavilion" || entity.kind === "support",
    ).map(({ polygon }) => polygon),
    ...PERMANENT_PARK_LANDMARKS.map(({ polygon }) => polygon),
    ...Object.values(PARK_A2_BUILDING_FOOTPRINTS).map(registerA2Polygon),
  ].map((polygon) => ({ polygon, bounds: polygonBounds(polygon) }));
  const entrances = PARK_RENDER_ENTITIES.flatMap((entity) => entity.accesses ?? []);
  const lotLabels = protectedLotLabels();

  return PARK_LOT_TREES.filter(({ world, crownRadius, blockId, priority, ownerEntityId }) => {
    const block = blockById.get(blockId);
    const owner = lots.find((lot) => pointInPolygon(world, lot.polygon));
    if (priority === "lot") {
      if (
        !owner ||
        owner.id !== ownerEntityId ||
        !block?.commercialIds.includes(owner.id) ||
        boundaryDistance(world, owner.polygon) < crownRadius + rootSetback
      )
        return false;
    } else {
      const envelope = blockId === "arvoredo" ? [arvoredo.polygon] : block?.referencePieces;
      if (owner || !envelope?.some((polygon) => boundaryDistance(world, polygon) >= crownRadius))
        return false;
    }
    const [x, z] = world;
    const insideClearance = ({ polygon, bounds }: (typeof pavement)[number], clearance: number) =>
      x >= bounds.minX - clearance &&
      x <= bounds.maxX + clearance &&
      z >= bounds.minY - clearance &&
      z <= bounds.maxY + clearance &&
      boundaryDistance(world, polygon) >= -clearance;
    if (
      pavement.some((surface) => insideClearance(surface, crownRadius + pavementSetback)) ||
      buildings.some((surface) => insideClearance(surface, crownRadius + buildingSetback))
    )
      return false;
    if (
      entrances.some(([a, b]) => Math.hypot(x - a, z - b) < crownRadius + entrySetback) ||
      PARK_GATES.some(
        ({ point, width }) =>
          Math.hypot(x - point[0], z - point[1]) < crownRadius + entrySetback + width / 2,
      )
    )
      return false;
    return lotLabels.every(({ anchor, axis: [u, v], halfWidth, halfHeight }) => {
      const dx = x - anchor[0],
        dz = z - anchor[1];
      return (
        Math.hypot(
          Math.max(0, Math.abs(dx * u + dz * v) - halfWidth),
          Math.max(0, Math.abs(dz * u - dx * v) - halfHeight),
        ) >=
        crownRadius + labelSetback
      );
    });
  });
}
