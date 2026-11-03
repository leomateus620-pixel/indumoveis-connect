import type { ContextPlanting } from "./contextPlanting";
import { ENTITIES, TREES, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds } from "./geometry";
import { distanceToPolygon } from "./planting";
import {
  ARENA_APPROACH,
  PARK_GATES,
  PARK_RENDER_ENTITIES,
  PERMANENT_PARK_LANDMARKS,
} from "./permanentParkLayout";
import { PARK_REFERENCE_REVISION, parkSourceRect, type ParkSourcePolygon } from "./parkReference";
import { registerParkPoint, registerParkPolygon } from "./parkRegistration";
import { registerA2Polygon } from "./parkRegistration";
import { PARK_A2_BUILDING_FOOTPRINTS, PARK_A2_ROAD_SURFACES } from "./parkA2Reference";
import { PAVILION_GROVE_A2 } from "./pavilionGround";

export const PARK_PLANTING = {
  referenceRevision: PARK_REFERENCE_REVISION,
  reference: "Planta geral A3 e referências de maciços do parque; registro físico pelas quadras",
  confidence: "approximate-woodland-mass",
  crownRadiusScale: 3.2,
  accessMargin: 0.8,
  maximumAttemptsPerTree: 90,
} as const;

type WoodlandMassInput = {
  id: string;
  sourcePolygon: ParkSourcePolygon;
  a2Polygon?: ParkSourcePolygon;
  targetCount: number;
  seed: number;
  source: string;
  note: string;
};

/** These are documented MASS envelopes, never a claim that each generated
 * centre is a surveyed or individually visible trunk. Gaps remain real:
 * paths, equipment, courts, lots and entrances are explicit exclusions.
 * No row is generated around a displaced rectangular rural sector. */
const massInputs: readonly WoodlandMassInput[] = [
  {
    id: "lunar-woodland",
    a2Polygon: PAVILION_GROVE_A2,
    sourcePolygon: [
      [930, 3160],
      [2020, 3160],
      [2260, 3200],
      [2390, 3340],
      [2380, 3520],
      [2290, 3590],
      [2290, 3820],
      [2385, 3870],
      [2380, 4055],
      [2200, 4130],
      [1320, 4115],
      [1080, 3990],
      [950, 3820],
    ],
    targetCount: 100,
    seed: 320911,
    source:
      "parkAccessSpatialPlan.ts / WOODLAND_OUTER_SOURCE; commercialTrees.ts / PAVILIONS_1_14_GROVE; A3 aerial plan",
    note: "Mature woodland west of P1/P14 and the Arvoredo. Irregular source outline, with the Gate 2 path left open. Centres are a deterministic presentation distribution inside the documented mass.",
  },
  {
    id: "nations-woodland",
    a2Polygon: [
      [1219.96, 958.74],
      [1405.84, 959.58],
      [1404.76, 1141.5],
      [1218.94, 1140.75],
    ],
    sourcePolygon: [
      [4495, 4270],
      [4770, 4270],
      [4820, 4235],
      [5050, 4235],
      [5100, 4270],
      [5335, 4270],
      [5350, 4925],
      [5300, 5105],
      [5105, 5160],
      [4740, 5160],
      [4490, 5070],
    ],
    targetCount: 48,
    seed: 967071,
    source: "nationsDistrict.ts / NATIONS_DISTRICT_LAYOUT.grassBoundary; A3 aerial plan",
    note: "Peripheral cultural-district woodland. The central asphalt, civic plaza, stage apron, approaches and houses are separate exclusions; the civic space remains open.",
  },
  {
    id: "arena-north-margin",
    a2Polygon: [
      [1110, 480],
      [1295, 483],
      [1291, 510],
      [1105, 507],
    ],
    sourcePolygon: parkSourceRect([4107, 2570, 4873, 2656]),
    targetCount: 8,
    seed: 5201,
    source: "arenaCanonicalLayout.ts / vegetationZones:north-open-margin",
    note: "Open canopy margin north of the Arena approach; courts and circulation are protected. This does not create trees across the stair or plaza.",
  },
  {
    id: "arena-south-grove",
    a2Polygon: [
      [1105, 604],
      [1288, 607],
      [1286, 635],
      [1103, 632],
    ],
    sourcePolygon: parkSourceRect([4117, 2968, 4860, 3072]),
    targetCount: 12,
    seed: 1847,
    source: "arenaCanonicalLayout.ts / vegetationZones:south-grove-margin",
    note: "Grove margin south of the stair/plaza, bounded by documented circulation. The ground and access remain visible.",
  },
  {
    id: "arena-rear-open-margin",
    a2Polygon: [
      [1450, 533],
      [1490, 537],
      [1465, 620],
      [1440, 617],
    ],
    sourcePolygon: parkSourceRect([5336.2421875, 2598.27734375, 5441.2421875, 3033.72265625]),
    targetCount: 7,
    seed: 9111,
    source: "arenaCanonicalLayout.ts / vegetationZones:rear-open-margin",
    note: "Small open canopy mass behind the Arena roof envelope. No rear parking pavement, bays or parking vegetation grid is imported.",
  },
];

export const PARK_WOODLAND_MASSES = massInputs.map((mass) => ({
  ...mass,
  polygon: mass.a2Polygon
    ? registerA2Polygon(mass.a2Polygon)
    : registerParkPolygon(mass.sourcePolygon),
}));

/** Evidence-defined clearings and surfaces not all represented as cadastral
 * entities. They are deliberately exclusions even while architectural detail
 * is prepared progressively, so a late surface cannot reveal a planted road. */
const sourceClearings = [
  {
    id: "nations-main-asphalt",
    polygon: [
      [4792, 4320],
      [5058, 4320],
      [5090, 4352],
      [5090, 4833],
      [5058, 4865],
      [4792, 4865],
      [4760, 4833],
      [4760, 4352],
    ],
    source: "nationsDistrict.ts / mainAsphalt",
  },
  {
    id: "nations-north-approach",
    polygon: [
      [4890, 4245],
      [4980, 4245],
      [4980, 4382],
      [4890, 4382],
    ],
    source: "nationsDistrict.ts / northApproach",
  },
  {
    id: "nations-south-approach",
    polygon: [
      [4850, 4830],
      [5020, 4830],
      [5020, 5010],
      [4850, 5010],
    ],
    source: "nationsDistrict.ts / southApproach",
  },
  {
    id: "nations-stage-apron",
    polygon: [
      [4828, 4895],
      [5042, 4895],
      [5070, 4930],
      [5070, 5078],
      [4800, 5078],
      [4800, 4930],
    ],
    source: "nationsDistrict.ts / stageApron",
  },
  {
    id: "arena-multisport-court",
    polygon: parkSourceRect([4675, 2480, 4765, 2640]),
    source: "arenaCanonicalLayout.ts / multiSportCourt",
  },
  {
    id: "arena-sand-court",
    polygon: parkSourceRect([4525, 2480, 4615, 2640]),
    source: "arenaCanonicalLayout.ts / sandVolleyballCourt",
  },
  {
    id: "rural-concrete-c4",
    polygon: [
      [5100, 2372],
      [5360, 2372],
      [5375, 2388],
      [5375, 2482],
      [5358, 2500],
      [5100, 2500],
    ],
    source: "parkEnvironment.ts / EXPORURAL_SMOOTH_CONCRETE_CORRECTION",
  },
] satisfies readonly { id: string; polygon: ParkSourcePolygon; source: string }[];

export const PARK_PLANTING_CLEARINGS = [
  ...sourceClearings.map((clearing) => ({
    ...clearing,
    polygon: registerParkPolygon(clearing.polygon),
  })),
  ...Object.entries(ARENA_APPROACH).map(([id, bounds]) => ({
    id: `arena-${id}`,
    polygon: parkSourceRect(bounds),
    source: "permanentParkLayout.ts / ARENA_APPROACH",
  })),
];

export const PARK_PLANTING_BARRIERS: readonly { id: string; polygon: readonly Point[] }[] = [
  // Landscape polygons are plantable terrain. Commercial parcels and every
  // rendered circulation/building owner remain physical exclusions.
  ...PARK_RENDER_ENTITIES.filter((entity) => entity.kind !== "landscape").map((entity) => ({
    id: entity.id,
    polygon: entity.polygon,
  })),
  ...PERMANENT_PARK_LANDMARKS.map((landmark) => ({
    id: `landmark:${landmark.id}`,
    polygon: landmark.polygon,
  })),
  ...PARK_PLANTING_CLEARINGS,
  ...Object.entries(PARK_A2_BUILDING_FOOTPRINTS).map(([id, polygon]) => ({
    id: `a2-building:${id}`,
    polygon: registerA2Polygon(polygon),
  })),
  // The civic green centre is a deliberate clearing, not a woodland hole to fill.
  {
    id: "a2-nations-civic-clearing",
    polygon: registerA2Polygon([
      [1280, 962],
      [1345, 962],
      [1344, 1086],
      [1280, 1085],
    ]),
  },
];
export const PARK_PLANTING_ROAD_SURFACES = PARK_A2_ROAD_SURFACES.map((road) => ({
  polygon: registerA2Polygon(road.polygon),
  holes: road.holes.map(registerA2Polygon),
}));
const indexedRoadSurfaces = PARK_PLANTING_ROAD_SURFACES.map((road) => ({
  ...road,
  bounds: polygonBounds(road.polygon),
  indexedHoles: road.holes.map((polygon) => ({ polygon, bounds: polygonBounds(polygon) })),
}));
const indexedBarriers = PARK_PLANTING_BARRIERS.map((barrier) => ({
  ...barrier,
  bounds: polygonBounds(barrier.polygon),
}));
const nearBounds = (point: Point, bounds: ReturnType<typeof polygonBounds>, margin = 0) =>
  point[0] >= bounds.minX - margin &&
  point[0] <= bounds.maxX + margin &&
  point[1] >= bounds.minY - margin &&
  point[1] <= bounds.maxY + margin;
/** A physical green hole remains plantable, while its surrounding white street
 * and every inside/outside edge retain full crown clearance. */
export function parkPlantingCrownClearsRoads(world: Point, radius: number): boolean {
  const clearance = radius + PARK_PLANTING.accessMargin;
  return indexedRoadSurfaces.every((road) => {
    if (!nearBounds(world, road.bounds, clearance)) return true;
    const containingHole = road.indexedHoles.find(
      (hole) => nearBounds(world, hole.bounds) && pointInPolygon(world, hole.polygon),
    );
    // A segment from a point inside a hole to ANY other road boundary must
    // cross its own hole edge first. That exact edge distance is sufficient;
    // iterating every distant road/other-hole edge adds no protection.
    if (containingHole) return distanceToPolygon(world, containingHole.polygon) >= clearance;
    if (nearBounds(world, road.bounds) && pointInPolygon(world, road.polygon)) return false;
    return distanceToPolygon(world, road.polygon) >= clearance;
  });
}
const sourceEntrances = ENTITIES.flatMap((entity) => entity.accesses ?? []);

export function parkRegisteredCrownRadius(record: ContextPlanting): number {
  return PARK_PLANTING.crownRadiusScale * record.scale;
}

/** Whole crown disks are tested against polygon edges, not bounding boxes.
 * A landscape owner permits vegetation; it never cancels a road or lot guard. */
export function parkRegisteredPlantingAllowed(record: ContextPlanting): boolean {
  if (
    !record.id.startsWith("park-registered:") ||
    !record.world.every(Number.isFinite) ||
    !Number.isFinite(record.scale) ||
    record.scale <= 0
  )
    return false;
  const radius = parkRegisteredCrownRadius(record);
  if (!parkPlantingCrownClearsRoads(record.world, radius)) return false;
  const zone = PARK_WOODLAND_MASSES.find((mass) =>
    record.id.startsWith(`park-registered:${mass.id}:`),
  );
  if (
    !zone ||
    !pointInPolygon(record.world, zone.polygon) ||
    distanceToPolygon(record.world, zone.polygon) < radius
  )
    return false;
  if (
    indexedBarriers.some(
      ({ polygon, bounds }) =>
        nearBounds(record.world, bounds, radius + PARK_PLANTING.accessMargin) &&
        (pointInPolygon(record.world, polygon) ||
          distanceToPolygon(record.world, polygon) < radius + PARK_PLANTING.accessMargin),
    )
  )
    return false;
  if (
    PARK_GATES.some(
      (gate) =>
        Math.hypot(record.world[0] - gate.point[0], record.world[1] - gate.point[1]) <
        radius + gate.width / 2 + PARK_PLANTING.accessMargin,
    )
  )
    return false;
  if (
    sourceEntrances.some(
      (point) =>
        Math.hypot(record.world[0] - point[0], record.world[1] - point[1]) <
        radius + PARK_PLANTING.accessMargin,
    )
  )
    return false;
  return true;
}

/** Poisson-like bounded rejection sampling gives a stable irregular mass.
 * Static preparation only; no random generation or polygon work during gestures. */
export function buildRegisteredParkWoodland(): ContextPlanting[] {
  const planted: ContextPlanting[] = [];
  const legacyTrees = TREES;
  for (const mass of PARK_WOODLAND_MASSES) {
    let seed = mass.seed;
    const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
    const b = polygonBounds(mass.polygon);
    let count = 0;
    for (
      let attempt = 0;
      attempt < mass.targetCount * PARK_PLANTING.maximumAttemptsPerTree && count < mass.targetCount;
      attempt++
    ) {
      const record: ContextPlanting = {
        id: `park-registered:${mass.id}:${String(count + 1).padStart(3, "0")}`,
        world: [b.minX + random() * (b.maxX - b.minX), b.minY + random() * (b.maxY - b.minY)],
        scale: 0.76 + random() * 0.4,
      };
      const radius = parkRegisteredCrownRadius(record);
      if (!parkRegisteredPlantingAllowed(record)) continue;
      if (
        planted.some(
          (other) =>
            Math.hypot(record.world[0] - other.world[0], record.world[1] - other.world[1]) <
            (radius + parkRegisteredCrownRadius(other)) * 0.8,
        )
      )
        continue;
      // Preserve authored symbols; do not place a second trunk on an old tree.
      if (
        legacyTrees.some(
          (point) =>
            Math.hypot(record.world[0] - point[0], record.world[1] - point[1]) < radius + 1.8,
        )
      )
        continue;
      planted.push(record);
      count++;
    }
  }
  return planted;
}

let registeredWoodland: readonly ContextPlanting[] | undefined;
/** Prepare once in the renderer's existing idle context stage. Importing
 * guards or framing bounds must not generate every supplementary tree. */
export function getRegisteredParkWoodland(): readonly ContextPlanting[] {
  return registeredWoodland ?? (registeredWoodland = buildRegisteredParkWoodland());
}
export const PARK_PLANTING_AUDIT = PARK_WOODLAND_MASSES.map((mass) => ({
  id: mass.id,
  source: mass.source,
  referenceRevision: PARK_REFERENCE_REVISION,
  confidence: PARK_PLANTING.confidence,
  note: mass.note,
  sourcePolygon: mass.sourcePolygon,
  a2Polygon: mass.a2Polygon,
  frame: mass.a2Polygon
    ? "a2-normalized mass boundary; source code is provenance only"
    : "reference-code-converted-to-a2",
  polygon: mass.polygon,
  get count() {
    return getRegisteredParkWoodland().filter((record) =>
      record.id.startsWith(`park-registered:${mass.id}:`),
    ).length;
  },
  individualTrunksSurveyed: false,
}));

/** Reference position utility for technical evidence, never a second transform. */
export const registeredWoodlandSourcePoint = registerParkPoint;
