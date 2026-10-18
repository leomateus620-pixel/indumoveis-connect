import { ENTITIES, type Point } from "./data/territory";
import { pointInPolygon } from "./geometry";
import { distanceToPolygon, type PlantingAuditRecord } from "./planting";
import { EXPLORATION_POLYGONS } from "./urbanReference";
import { TERRAIN } from "./terrain";

export type ContextPlanting = { id: string; world: Point; scale: number };
export type ContextPlantingAuditRecord = Omit<PlantingAuditRecord, "origin" | "confidence"> & {
  origin: "satellite-mass";
  confidence: "approximate-woodland-mass";
};

export const CONTEXT_PLANTING = {
  reference: "Imagem do ChatGPT 17 de out. de 2026, 21_33_52.jpg",
  maximumHeight: 5.2,
  groundElevation: TERRAIN.elevation,
  crownClearanceScale: 3.2,
} as const;

/** Context roots and their conservative crown radius remain outside every
 * commercial source polygon and the explicit urban road/parcel corridors.
 * This is an exclusion guard, not inference of individual photographed trees. */
export function contextPlantingAllowed({ world, scale }: ContextPlanting) {
  if (!world.every(Number.isFinite) || !Number.isFinite(scale) || scale <= 0) return false;
  return ![...ENTITIES.map((entity) => entity.polygon), ...EXPLORATION_POLYGONS].some(
    (polygon) =>
      pointInPolygon(world, polygon) ||
      distanceToPolygon(world, polygon) < CONTEXT_PLANTING.crownClearanceScale * scale,
  );
}

// Individually specified presentation centres for the visible woodland MASS
// before P14; no spacing loop, invented trunk match or commercial lot planting.
const woodlandMassCentres: readonly ContextPlanting[] = [
  { id: "context-woodland-01", world: [-34, 52], scale: 1.3 },
  { id: "context-woodland-02", world: [-24, 50], scale: 1.4 },
  { id: "context-woodland-03", world: [-13, 53], scale: 1.2 },
  { id: "context-woodland-04", world: [-3, 50], scale: 1.35 },
  { id: "context-woodland-05", world: [-30, 62], scale: 1.45 },
  { id: "context-woodland-06", world: [-20, 60], scale: 1.2 },
  { id: "context-woodland-07", world: [-9, 64], scale: 1.5 },
  { id: "context-woodland-08", world: [-1, 61], scale: 1.15 },
  { id: "context-woodland-09", world: [-35, 74], scale: 1.25 },
  { id: "context-woodland-10", world: [-26, 72], scale: 1.3 },
  { id: "context-woodland-11", world: [-15, 73], scale: 1.4 },
  { id: "context-woodland-12", world: [-5, 74], scale: 1.3 },
  { id: "context-woodland-13", world: [-31, 84], scale: 1.15 },
  { id: "context-woodland-14", world: [-21, 84], scale: 1.45 },
  { id: "context-woodland-15", world: [-11, 85], scale: 1.2 },
  { id: "context-woodland-16", world: [-1, 84], scale: 1.1 },
  { id: "context-woodland-17", world: [8, 84], scale: 1.2 },
  { id: "context-woodland-18", world: [16, 84], scale: 1.15 },
  { id: "context-woodland-19", world: [24, 84], scale: 1.1 },
  { id: "context-woodland-20", world: [27.5, 83], scale: 1.1 },
];

/** Recheck source/corridor compatibility once when preparing a separate model.
 * A source revision drops incompatible centres instead of relocating them. */
export const CONTEXT_WOODLAND: readonly ContextPlanting[] =
  woodlandMassCentres.filter(contextPlantingAllowed);

export function auditContextPlanting(
  records: readonly ContextPlanting[],
): ContextPlantingAuditRecord[] {
  const ids = new Set<string>();
  return records
    .filter((record) => {
      if (!record.id.trim() || ids.has(record.id) || !contextPlantingAllowed(record)) return false;
      ids.add(record.id);
      return true;
    })
    .map((record) => ({
      id: record.id,
      world: [...record.world],
      scale: record.scale,
      origin: "satellite-mass",
      confidence: "approximate-woodland-mass",
      zone: "external-woodland-before-P14",
      ownerEntityId: null,
      sourceEntityIds: [],
      referenceImage: CONTEXT_PLANTING.reference,
      referencePixel: null,
      localRegistration:
        "Massa arbórea visível no lado do parque antes do P14, alinhada aproximadamente à avenida; centros individuais não identificados na fotografia.",
      decision:
        "Ambientação externa aproximada, fora dos polígonos comerciais e corredores viários. Não é uma árvore auditada da planta nem confirmação de tronco individual.",
    }));
}
