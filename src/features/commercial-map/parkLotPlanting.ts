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
type PlantingBlock = "L" | "F" | "J" | "E" | "I" | "D" | "O" | "U" | "P" | "M" | "C" | "B" | "A";

export type ParkLotTree = {
  id: string;
  world: Point;
  blockId: PlantingBlock;
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

/** Positions and dimensions authored in drawing units from the A2 park and
 * V1 lot geometry. Aerial views check which parts of each block are wooded
 * and which are clear. Each point represents approximate landscape. */
const placements: Record<PlantingBlock, { setting: string; trees: Placement[] }> = {
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

const lots = ENTITIES.filter((entity) => entity.kind === "lot");
const blockById = new Map(PARK_PHYSICAL_BLOCKS.map((block) => [block.id, block]));

export const PARK_LOT_TREES: readonly ParkLotTree[] = (
  Object.keys(placements) as PlantingBlock[]
).flatMap((blockId) => {
  const { setting, trees } = placements[blockId];
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
      zone: `quadra-${blockId}`,
      sourceEntityIds: [`block:${blockId}`, ...(ownerEntityId ? [ownerEntityId] : [])],
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
    if (!block?.polygons.some((polygon) => boundaryDistance(world, polygon) >= rootSetback))
      return false;
    const owner = lots.find((lot) => pointInPolygon(world, lot.polygon));
    if (priority === "lot") {
      if (
        !owner ||
        owner.id !== ownerEntityId ||
        !block.commercialIds.includes(owner.id) ||
        boundaryDistance(world, owner.polygon) < crownRadius + rootSetback
      )
        return false;
    } else if (
      owner ||
      !block.referencePieces.some((polygon) => boundaryDistance(world, polygon) >= crownRadius)
    ) {
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
