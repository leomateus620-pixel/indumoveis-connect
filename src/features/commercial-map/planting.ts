import { ENTITIES, TREES, type MapEntity, type Point } from "./data/territory";
import { getArchitectureDefinition } from "./architecture";
import { pointInPolygon } from "./geometry";

export const PLANTING = { crownClearance: 1.55, maximumAdditional: 15 } as const;
export const PLANTING_REFERENCE = "Imagem do ChatGPT 17 de out. de 2026, 21_33_48.jpg";

export type PlantingAuditRecord = {
  id: string;
  world: Point;
  origin: "drawing-symbol" | "satellite-crown";
  zone: string;
  ownerEntityId: string | null;
  sourceEntityIds: string[];
  confidence: "unmatched-drawing-symbol" | "visible-crown-local-approximation";
  referenceImage: string | null;
  referencePixel: Point | null;
  localRegistration: string;
  decision: string;
  scale: number;
};

type ReviewedCrown = {
  id: string;
  world: Point;
  pixel: Point;
  owner: string;
  zone: "arvoredo" | "pavilion-frontage";
  scale: number;
  registration: string;
};

/** Hand-reviewed crown witnesses, NOT generated rows. Pixels mark visible crown
 * centres in the 1536×1024 reference, not measured/visible trunk coordinates.
 * The schematic is locally distorted: no single photo→world affine transform
 * can certify an individual commercial lot. Accordingly no new tree is rooted
 * in a lot. The Arvoredo is a pedestrian road, with visible tree planting along
 * its side, not a vehicle road or a substitute for vacant-lot planting. */
export const REVIEWED_CROWNS: readonly ReviewedCrown[] = [
  {
    id: "observed-arvoredo-01",
    world: [59.7, 27.7],
    pixel: [450, 449],
    owner: "indumoveis:road:arvoredo",
    zone: "arvoredo",
    scale: 0.7,
    registration:
      "Abaixo de Brasil, lateral leste dos apoios / lado oeste de Mercosul; primeira pequena copa visível.",
  },
  {
    id: "observed-arvoredo-02",
    world: [59.9, 31.5],
    pixel: [450, 477],
    owner: "indumoveis:road:arvoredo",
    zone: "arvoredo",
    scale: 0.66,
    registration:
      "Mesmo passeio, copa seguinte ao sul; apoio Café/Bar usado apenas como relação local.",
  },
  {
    id: "observed-arvoredo-03",
    world: [60.0, 35.3],
    pixel: [452, 506],
    owner: "indumoveis:road:arvoredo",
    zone: "arvoredo",
    scale: 0.7,
    registration:
      "Pequena copa entre a fachada dos apoios e Mercosul; posição aproximada no trecho central.",
  },
  {
    id: "observed-arvoredo-04",
    world: [60.2, 39.2],
    pixel: [452, 535],
    owner: "indumoveis:road:arvoredo",
    zone: "arvoredo",
    scale: 0.68,
    registration:
      "Pequena copa do mesmo corredor pedonal, abaixo da copa anterior e antes de Uruguai.",
  },
  {
    id: "observed-arvoredo-05",
    world: [60.3, 43.2],
    pixel: [454, 565],
    owner: "indumoveis:road:arvoredo",
    zone: "arvoredo",
    scale: 0.72,
    registration:
      "Copa junto à extremidade sul dos apoios, a oeste de Mercosul e ao norte de Uruguai.",
  },
  {
    id: "observed-arvoredo-06",
    world: [60.0, 47.2],
    pixel: [454, 595],
    owner: "indumoveis:road:arvoredo",
    zone: "arvoredo",
    scale: 0.78,
    registration:
      "Copa no prolongamento pedonal ao sul dos apoios; Uruguai é a referência transversal próxima.",
  },
  {
    id: "observed-arvoredo-07",
    world: [60.2, 50.4],
    pixel: [455, 621],
    owner: "indumoveis:road:arvoredo",
    zone: "arvoredo",
    scale: 0.74,
    registration:
      "Última copa isolável antes da massa arbórea e do setor da Mostra; não prolongar a fileira além desta evidência.",
  },
  {
    id: "observed-frontage-01",
    world: [67.1, 90.3],
    pixel: [520, 923],
    owner: "indumoveis:landscape:frontage",
    zone: "pavilion-frontage",
    scale: 1.02,
    registration:
      "Copa frontal próxima ao início oeste do conjunto longitudinal de pavilhões, antes da avenida.",
  },
  {
    id: "observed-frontage-02",
    world: [82.9, 89.8],
    pixel: [651, 909],
    owner: "indumoveis:landscape:frontage",
    zone: "pavilion-frontage",
    scale: 0.82,
    registration:
      "Pequena copa frontal na borda do telhado longitudinal, usando as extremidades do conjunto como referências locais.",
  },
  {
    id: "observed-frontage-03",
    world: [88.7, 90.0],
    pixel: [700, 916],
    owner: "indumoveis:landscape:frontage",
    zone: "pavilion-frontage",
    scale: 0.96,
    registration: "Copa verde arredondada na faixa entre cobertura e vagas da Benvenuto.",
  },
  {
    id: "observed-frontage-04",
    world: [95.3, 90.2],
    pixel: [755, 919],
    owner: "indumoveis:landscape:frontage",
    zone: "pavilion-frontage",
    scale: 0.8,
    registration:
      "Copa menor no alinhamento frontal; mapeamento local do conjunto, sem atribuir espécie ou precisão cadastral.",
  },
  {
    id: "observed-frontage-05",
    world: [101.5, 89.8],
    pixel: [806, 912],
    owner: "indumoveis:landscape:frontage",
    zone: "pavilion-frontage",
    scale: 0.86,
    registration:
      "Copa frontal visível entre o prédio e a faixa de estacionamento, acima do limite da avenida.",
  },
  {
    id: "observed-frontage-06",
    world: [108.0, 90.0],
    pixel: [860, 915],
    owner: "indumoveis:landscape:frontage",
    zone: "pavilion-frontage",
    scale: 0.84,
    registration:
      "Copa isolável no segmento frontal centro-leste, anterior à árvore maior seguinte.",
  },
  {
    id: "observed-frontage-07",
    world: [114.5, 90.2],
    pixel: [914, 919],
    owner: "indumoveis:landscape:frontage",
    zone: "pavilion-frontage",
    scale: 1.04,
    registration:
      "Copa maior ao leste da faixa frontal; raiz representada no verde, sem ocupar rua ou lote.",
  },
  {
    id: "observed-frontage-08",
    world: [128.0, 90.4],
    pixel: [1027, 918],
    owner: "indumoveis:landscape:frontage",
    zone: "pavilion-frontage",
    scale: 0.92,
    registration:
      "Copa próxima à ponta leste do conjunto longitudinal, antes do acesso; a estrutura B7 não fornece uma posição exata de tronco.",
  },
];

export function distanceToPolygon(point: Point, polygon: readonly Point[]): number {
  let nearest = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index],
      b = polygon[(index + 1) % polygon.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy;
    const t = length
      ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length))
      : 0;
    nearest = Math.min(nearest, Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t));
  }
  return nearest;
}

/** Revalidate source ownership on preparation. A changed source revision drops
 * a now-incompatible observed crown instead of relocating it into another lot. */
function compatibleCrown(crown: ReviewedCrown, entities: readonly MapEntity[]) {
  const owner = entities.find((entity) => entity.id === crown.owner);
  if (!owner || !pointInPolygon(crown.world, owner.polygon)) return false;
  if (owner.kind === "lot") return false;
  return !entities.some(
    (entity) =>
      (getArchitectureDefinition(entity) &&
        (pointInPolygon(crown.world, entity.polygon) ||
          distanceToPolygon(crown.world, entity.polygon) < 2.4)) ||
      (entity.kind === "road" &&
        entity.id !== "indumoveis:road:arvoredo" &&
        (pointInPolygon(crown.world, entity.polygon) ||
          distanceToPolygon(crown.world, entity.polygon) < PLANTING.crownClearance)) ||
      entity.accesses?.some(([x, z]) => Math.hypot(x - crown.world[0], z - crown.world[1]) < 2.4),
  );
}

/** Every rendered tree has a stable audit ID. Retained source symbols are not
 * retrospectively assigned a photographed tree or invented reference pixel. */
export function auditPlanting(
  entities: readonly MapEntity[] = ENTITIES,
  includeObserved = true,
): PlantingAuditRecord[] {
  const originals: PlantingAuditRecord[] = TREES.map((point, index) => {
    const owners = entities.filter((entity) => pointInPolygon(point, entity.polygon));
    return {
      id: `drawing-tree-${String(index + 1).padStart(2, "0")}`,
      world: [...point],
      origin: "drawing-symbol",
      zone:
        index < 13
          ? "bosque-Mostra"
          : index === 13
            ? "circulação-lateral-P14"
            : "jardim-frontal-P14",
      ownerEntityId: owners[0]?.id ?? null,
      sourceEntityIds: owners.map((entity) => entity.id),
      confidence: "unmatched-drawing-symbol",
      referenceImage: null,
      referencePixel: null,
      localRegistration: `Símbolo ${index + 1} de TREES / planta V1 - Mapa parque Externo (10).pdf; associação individual com a foto48 inconclusiva.`,
      decision:
        index === 13
          ? "Conservado por origem da planta. Centro fora dos polígonos declarados, a 0,55 unidade da borda do P14; não é nova árvore inferida nem cadastro de paisagismo."
          : "Conservado no centro aprovado da planta; não declarado como correspondência exata de copa/tronco da fotografia.",
      scale: 1,
    };
  });
  if (!includeObserved) return originals;
  return [
    ...originals,
    ...REVIEWED_CROWNS.filter((crown) => compatibleCrown(crown, entities)).map(
      (crown): PlantingAuditRecord => ({
        id: crown.id,
        world: [...crown.world],
        origin: "satellite-crown",
        zone: crown.zone,
        ownerEntityId: crown.owner,
        sourceEntityIds: entities
          .filter((entity) => pointInPolygon(crown.world, entity.polygon))
          .map((entity) => entity.id),
        confidence: "visible-crown-local-approximation",
        referenceImage: PLANTING_REFERENCE,
        referencePixel: [...crown.pixel],
        localRegistration: crown.registration,
        decision:
          "Adicionar apenas esta copa observada. Centro de tronco aproximado no setor identificado; não representa levantamento topográfico ou confirmação botânica.",
        scale: crown.scale,
      }),
    ),
  ];
}

/** Backwards-compatible point API; no spacing loop, jitter or generic planting
 * survives. Only the reviewed per-tree records supply additional positions. */
export function derivePresentationPlanting(entities: readonly MapEntity[] = ENTITIES): Point[] {
  return auditPlanting(entities)
    .filter((record) => record.origin === "satellite-crown")
    .map((record) => [...record.world]);
}
