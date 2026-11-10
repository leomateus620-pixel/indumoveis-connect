import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { PHOTO_P1_COURTYARD } from "./photoPavilionSetting";
import { deriveRoadRibbon } from "./roadGeometry";
import { subtractPolygons } from "./parkGeometry";
import {
  PARK_REFERENCE_ACCESS_PATHS,
  PARK_REFERENCE_BLOCKS,
  PARK_REFERENCE_BUILDINGS,
  PARK_REFERENCE_GATES,
} from "./parkReference";
import {
  PARK_REGISTRATION,
  PARK_A2_REGISTRATION,
  registerParkPoint,
  registerParkPolygon,
  registerA2Point,
  registerA2Polygon,
} from "./parkRegistration";
import {
  PARK_A2_BLOCK_PIECES,
  PARK_A2_BUILDING_FOOTPRINTS,
  PARK_A2_ROAD_SURFACES,
  PARK_A2_GATES,
} from "./parkA2Reference";
import {
  PARK_SUPPLEMENTAL_WALKS,
  PARK_SUPPLEMENTAL_ACCESS_PATHS,
  PARK_IMIGRANTES_SOURCE_FRONTAGE,
} from "./parkSupplementalReference";
import { PARK_A2_GATE_PAVEMENT_REPAIRS } from "./parkA2CirculationRepairs";
import { simplifyRoadContour } from "./roadContour";

/** One physical drawing frame. Cadastre stays in territory.ts. Context never
 * carries a status, edition, company, parcel number or commercial raycast. */
export type PermanentParkLandmark = {
  id: string;
  name: string;
  source: string;
  sourceId: string;
  polygon: Point[];
  bounds: readonly [number, number, number, number];
  front: Point;
  existingOwner?: string;
};
const ids: Record<string, string> = {
  "PAVILHAO-09": "pavilhao-9",
  B10: "pavilhao-7",
  B9: "pavilhoes-6-10-11",
  B8: "pavilhao-5",
  D1: "alameda",
  D3: "mirante",
  F: "arena",
  B12: "sede",
  B13: "palco-lactalis",
  C5: "etnia-polonesa",
  C6: "etnia-italiana",
  C8: "etnia-alema",
  C7: "etnia-afro",
  B7: "cozinha-soja",
  C4: "churrascaria-rural",
  B28: "cooperativismo",
  B22: "terceira-idade",
  B29: "casa-rotaria",
  D2: "via-expressa",
};
const boundsTuple = (polygon: readonly Point[]): [number, number, number, number] => {
  const b = polygonBounds(polygon);
  return [b.minX, b.minY, b.maxX, b.maxY];
};
const clockwise = (polygon: Point[]): Point[] =>
  signedPolygonArea(polygon) > 0 ? polygon : [...polygon].reverse();
const physicalBuildingPolygon = (id: string, source: readonly (readonly [number, number])[]) =>
  clockwise(
    PARK_A2_BUILDING_FOOTPRINTS[id]
      ? registerA2Polygon(PARK_A2_BUILDING_FOOTPRINTS[id])
      : registerParkPolygon(source),
  );
// A presentation-owner correspondence is independent of the printed code B7.
// The auditorium occupies the already represented support beside P3; C1 and
// commercial pavilions likewise keep their existing owners, without copies.
export const PARK_EXISTING_BUILDING_OWNERS: Record<string, string> = {
  B11: "indumoveis:support:b7",
};
export const PERMANENT_PARK_LANDMARKS: readonly PermanentParkLandmark[] =
  PARK_REFERENCE_BUILDINGS.filter(
    (item) =>
      !item.existingOwner &&
      item.id !== "PISTA-CAMPEIRA" &&
      !PARK_EXISTING_BUILDING_OWNERS[item.id],
  ).map((item) => {
    const polygon = physicalBuildingPolygon(item.id, item.sourcePolygon),
      [fx, fz] = item.front ?? [0, 1];
    const origin = registerParkPoint([0, 0]),
      tip = registerParkPoint([fx, fz]),
      length = Math.hypot(tip[0] - origin[0], tip[1] - origin[1]);
    return {
      id: ids[item.id] ?? item.id.toLowerCase(),
      sourceId: item.id,
      name: item.name,
      source: `${item.source}${PARK_A2_BUILDING_FOOTPRINTS[item.id] ? "; footprint A2 normalizado" : "; conversão gráfica comum"}`,
      polygon,
      bounds: boundsTuple(polygon),
      front: [(tip[0] - origin[0]) / length, (tip[1] - origin[1]) / length] as Point,
      existingOwner: item.id === "B12" ? "indumoveis:support:mao-na-massa" : undefined,
    };
  });
export const permanentParkPolygon = (landmark: PermanentParkLandmark): Point[] => landmark.polygon;
/** Structural overrides are presentation data; the original cadastro is never
 * rewritten. The one Sede model replaces the schematic Mão na Massa box. */
export const PARK_CORE_ENTITIES: MapEntity[] = ENTITIES.map((e) => {
  // Lots retain the exact original object, polygon, metadata and subdivision.
  if (e.kind === "lot") return e;
  if (e.id === "indumoveis:support:gate-03") {
    const evidence = PARK_A2_GATES.A3,
      anchor = registerA2Point(evidence.passagePoint),
      [dx, dz] = evidence.axis2D;
    const width = evidence.width * PARK_A2_REGISTRATION.scale;
    const polygon: Point[] = [
      [-0.3, -width / 2],
      [0.3, -width / 2],
      [0.3, width / 2],
      [-0.3, width / 2],
    ].map(([along, across]) => [
      anchor[0] + dx * along - dz * across,
      anchor[1] + dz * along + dx * across,
    ]);
    return { ...e, anchor, polygon, height: 0.1 };
  }
  // C2/C3 is a combined reference envelope. Its three existing presentation
  // owners retain their footprints until an individual correspondence exists.
  const reference = PARK_REFERENCE_BUILDINGS.find(
    (b) =>
      b.id !== "C2-C3" &&
      (b.existingOwner === e.id ||
        PARK_EXISTING_BUILDING_OWNERS[b.id] === e.id ||
        (b.id === "B12" && e.id === "indumoveis:support:mao-na-massa")),
  );
  if (!reference) return e;
  const polygon = physicalBuildingPolygon(reference.id, reference.sourcePolygon),
    b = polygonBounds(polygon),
    old = polygonBounds(e.polygon);
  const project = (p: Point): Point => {
    const candidate: Point = [
      b.minX + ((p[0] - old.minX) / (old.maxX - old.minX)) * (b.maxX - b.minX),
      b.minY + ((p[1] - old.minY) / (old.maxY - old.minY)) * (b.maxY - b.minY),
    ];
    let closest: Point = candidate,
      best = Infinity;
    polygon.forEach((a, i) => {
      const q = polygon[(i + 1) % polygon.length],
        dx = q[0] - a[0],
        dz = q[1] - a[1],
        t = Math.max(
          0,
          Math.min(
            1,
            ((candidate[0] - a[0]) * dx + (candidate[1] - a[1]) * dz) / (dx * dx + dz * dz),
          ),
        ),
        c: Point = [a[0] + t * dx, a[1] + t * dz],
        d = Math.hypot(c[0] - candidate[0], c[1] - candidate[1]);
      if (d < best) {
        best = d;
        closest = c;
      }
    });
    return closest;
  };
  return {
    ...e,
    polygon,
    anchor: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    accesses: e.accesses?.map(project),
    ...(reference.id === "B12" ? { height: 4.4 } : {}),
  };
});
const lots = ENTITIES.filter((e) => e.kind === "lot");
export const PARK_PHYSICAL_BLOCKS = PARK_REFERENCE_BLOCKS.map((block) => {
  const members = lots.filter((e) => e.numbers?.some((n) => block.indumoveisNumbers.includes(n))),
    referencePieces = (PARK_A2_BLOCK_PIECES[block.id] ?? []).map(registerA2Polygon);
  if (!referencePieces.length) referencePieces.push(registerParkPolygon(block.sourcePolygon));
  return {
    ...block,
    referencePolygon: referencePieces[0],
    referencePieces,
    commercialIds: members.map((e) => e.id),
    polygons:
      block.coverage === "whole-commercial-envelope"
        ? members.map((e) => e.polygon)
        : referencePieces,
  };
});
export const PARK_UNMATCHED_COMMERCIAL_NUMBERS = lots
  .flatMap((e) => e.numbers ?? [])
  .filter((n) => !PARK_REFERENCE_BLOCKS.some((b) => b.indumoveisNumbers.includes(n)));
function roadEntity(id: string, name: string, polygon: Point[], pedestrian = false): MapEntity {
  const b = polygonBounds(polygon);
  return {
    id: `indumoveis:context:${pedestrian ? "walk" : "road"}:${id}`,
    kind: "road",
    label: name,
    location: "Parque · contexto físico",
    polygon,
    anchor: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    source: "Planta física / registro único pelas quadras",
    confidence: "registro gráfico conferido; não levantamento",
    notes: pedestrian
      ? "Passeio físico sem estado comercial"
      : "Rua interna sem pintura de tráfego",
  };
}
const blockers = PARK_CORE_ENTITIES.filter(
  (e) =>
    e.kind === "lot" ||
    e.kind === "pavilion" ||
    (e.kind === "support" &&
      !["indumoveis:support:gate-03", "indumoveis:support:mao-na-massa"].includes(e.id)),
).map((e) => e.polygon);
const sourceRoads = [...PARK_SUPPLEMENTAL_WALKS]
  .filter((road) => road.id.startsWith("NATIONS-"))
  .flatMap((road) => {
    if (["RUA-ARGENTINA", "RUA-URUGUAI", "CALCADA-ARVOREDO"].includes(road.id)) return [];
    return subtractPolygons([registerParkPolygon(road.sourcePolygon)], blockers).map((part, i) =>
      roadEntity(`${road.id}:${i}`, road.name, part, road.roadClass === "internal-pedestrian"),
    );
  });
const accessRoads = [...PARK_REFERENCE_ACCESS_PATHS, ...PARK_SUPPLEMENTAL_ACCESS_PATHS]
  .filter((path) => path.roadClass === "internal-pedestrian")
  .flatMap((path) => {
    const polygon = deriveRoadRibbon(
      path.sourcePath.map(registerParkPoint),
      path.widthSource * PARK_REGISTRATION.scale,
    );
    return subtractPolygons([polygon], blockers).map((part, i) =>
      roadEntity(`${path.id}:${i}`, path.name, part, path.roadClass === "internal-pedestrian"),
    );
  });
export const PARK_CONTEXT_ROADS: MapEntity[] = [
  ...PARK_A2_ROAD_SURFACES.map((surface, i) => ({
    ...roadEntity(
      `a2-network:${i}`,
      "Circulação interna do parque",
      registerA2Polygon(simplifyRoadContour(surface.polygon)),
    ),
    holes: [
      ...surface.holes.map((ring) => registerA2Polygon(simplifyRoadContour(ring))),
      // Photo 9 resolves a small raised tree island inside the broad A2 white
      // corridor. Source rings remain unchanged; this is one presentation hole.
      ...(pointInPolygon(PHOTO_P1_COURTYARD.center, registerA2Polygon(surface.polygon)) &&
      !surface.holes.some((ring) =>
        pointInPolygon(PHOTO_P1_COURTYARD.center, registerA2Polygon(ring)),
      )
        ? [PHOTO_P1_COURTYARD.polygon]
        : []),
    ],
    source: surface.sourceCondition,
  })),
  ...PARK_A2_GATE_PAVEMENT_REPAIRS.map((repair) => ({
    ...roadEntity(repair.id, "Passagem do acesso", registerA2Polygon(repair.polygon)),
    source: repair.source,
    notes: repair.condition,
  })),
];
export const PARK_CONTEXT_WALKS: MapEntity[] = [...sourceRoads, ...accessRoads].filter((e) =>
  e.id.includes(":walk:"),
);
// The public Imigrantes frontage has the same physical owner as the existing
// avenue: extend that surface east to the documented Nations mouth. It is not
// another independently drawn avenue or an excluded parking lot.
const frontage = registerParkPolygon(PARK_IMIGRANTES_SOURCE_FRONTAGE.sourcePolygon);
const fb = polygonBounds(frontage);
const avenue = ENTITIES.find((e) => e.id === "indumoveis:road:imigrantes")!,
  ab = polygonBounds(avenue.polygon);
const avenueExtension = roadEntity("imigrantes-frontage", avenue.label, [
  [ab.maxX, ab.minY],
  [fb.maxX, fb.minY],
  [fb.maxX, fb.maxY],
  [ab.maxX, ab.maxY],
]);
export const PARK_RENDER_ENTITIES: MapEntity[] = [
  ...PARK_CORE_ENTITIES.filter((e) => e.kind !== "road"),
  ...PARK_CONTEXT_ROADS,
  ...PARK_CONTEXT_WALKS,
  avenueExtension,
];
/** Gate symbols locate OPENINGS, never building footprints. These clearances
 * are drawing estimates, not invented portal architecture or metre surveys. */
export const PARK_GATES = PARK_REFERENCE_GATES.map((gate) => {
  const evidence = PARK_A2_GATES[gate.id];
  const point = registerA2Point(evidence.passagePoint),
    origin = registerA2Point([0, 0]),
    tip = registerA2Point(evidence.axis2D),
    length = Math.hypot(tip[0] - origin[0], tip[1] - origin[1]);
  const axis: Point = [(tip[0] - origin[0]) / length, (tip[1] - origin[1]) / length];
  return {
    ...gate,
    point,
    axis,
    width: evidence.width * PARK_A2_REGISTRATION.scale,
    source: evidence.source,
    condition: evidence.condition,
    existingOwner: gate.id === "A3" ? "indumoveis:support:gate-03" : undefined,
  };
});
/** Main gate portal (A3 / Portão 03). The registered orthophoto shows a single
 * roofed structure spanning the carriageway where the public avenue ends; its
 * plan extent is read from that image (about +/-1 unit) and anchored to the
 * A2 passage point. Heights are presentation estimates, not a survey. */
export const MAIN_GATE_PORTAL = (() => {
  const gate = PARK_GATES.find((item) => item.id === "A3")!;
  const x: [number, number] = [gate.point[0] - 2.6, gate.point[0] + 0.2];
  const z: [number, number] = [93.0, 103.5];
  const middle = (z[0] + z[1]) / 2;
  return {
    gateId: gate.id,
    owner: "indumoveis:support:gate-03",
    x,
    z,
    piers: [
      [z[0], z[0] + 0.7],
      [middle - 0.35, middle + 0.35],
      [z[1] - 0.7, z[1]],
    ] as [number, number][],
    beam: 2.3,
    eave: 2.62,
    rise: 0.42,
    source: "A2 gate A3 passage point; orthophoto roof outline (layout reference only)",
  };
})();
/** Architectural approach adaptation anchored to the actual A2 buildings.
 * Mirante source bounds 4004,2440–4072,2748 supply the local z proportions;
 * the source stair/plaza split 388:408 is retained across the measured drawing
 * gap to Arena. It is a local equipment recipe, not a sector translation.
 * Alameda's apron follows the existing documented cross-street return to the
 * lateral covered structure. Heights remain illustrative, never field levels. */
const miranteBounds = PERMANENT_PARK_LANDMARKS.find((item) => item.id === "mirante")!.bounds;
const arenaBounds = PERMANENT_PARK_LANDMARKS.find((item) => item.id === "arena")!.bounds;
const alamedaBounds = PERMANENT_PARK_LANDMARKS.find((item) => item.id === "alameda")!.bounds;
const approachZScale = (miranteBounds[3] - miranteBounds[1]) / 308;
const approachNorth = miranteBounds[3] - (2748 - 2682) * approachZScale;
const approachSouth = miranteBounds[3] + (2940 - 2748) * approachZScale;
const stairEnd = miranteBounds[2] + (arenaBounds[0] - miranteBounds[2]) * (388 / 796);
const arenaOutline = PERMANENT_PARK_LANDMARKS.find((item) => item.id === "arena")!.polygon;
const arenaFront = arenaOutline
  .map((a, i) => ({ a, b: arenaOutline[(i + 1) % arenaOutline.length] }))
  .filter(({ a, b }) => Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]) * 4)
  .sort((a, b) => a.a[0] + a.b[0] - (b.a[0] + b.b[0]))[0];
const arenaFrontX = (z: number) =>
  arenaFront.a[0] +
  ((arenaFront.b[0] - arenaFront.a[0]) * (z - arenaFront.a[1])) /
    (arenaFront.b[1] - arenaFront.a[1]);
export const ARENA_APPROACH = {
  stairs: [miranteBounds[2], approachNorth, stairEnd, approachSouth],
  plaza: [stairEnd, approachNorth, arenaBounds[0], approachSouth],
  canopy: [miranteBounds[0], miranteBounds[3], miranteBounds[2], approachSouth],
  landing: [
    alamedaBounds[2],
    Math.max(alamedaBounds[1], miranteBounds[3]),
    miranteBounds[0],
    Math.min(alamedaBounds[3], approachSouth),
  ],
} satisfies Record<string, readonly [number, number, number, number]>;
/** Plaza ends on the actual slanted facade, not a bounding-box corner. */
export const ARENA_APPROACH_POLYGONS: Record<keyof typeof ARENA_APPROACH, Point[]> = {
  stairs: [
    [miranteBounds[2], approachNorth],
    [stairEnd, approachNorth],
    [stairEnd, approachSouth],
    [miranteBounds[2], approachSouth],
  ],
  plaza: [
    [stairEnd, approachNorth],
    [arenaFrontX(approachNorth), approachNorth],
    [arenaFrontX(approachSouth), approachSouth],
    [stairEnd, approachSouth],
  ],
  canopy: [
    [miranteBounds[0], miranteBounds[3]],
    [miranteBounds[2], miranteBounds[3]],
    [miranteBounds[2], approachSouth],
    [miranteBounds[0], approachSouth],
  ],
  landing: (() => {
    const [x0, z0, x1, z1] = ARENA_APPROACH.landing;
    return [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ] as Point[];
  })(),
};
export const ARENA_APPROACH_CONDITION = {
  source:
    "arenaCanonicalLayout.ts / stairs, frontPlaza; miranteComplexReconstruction.ts / lateralStructure, southApron; A2 actual D1/D3/F footprints",
  levels:
    "Illustrative platform .32 and plaza .03; no surveyed levels or accessibility certification",
  stairPlazaRatio: [388, 408],
  sourceMiranteDepth: 308,
};
export const PARK_CONTEXT_BLOCKS = PARK_PHYSICAL_BLOCKS.filter(
  (b) => b.coverage !== "whole-commercial-envelope",
);
export const PERMANENT_PARK_EXPLORATION: Point[][] = [
  ...PARK_PHYSICAL_BLOCKS.flatMap((b) => b.polygons),
  ...PERMANENT_PARK_LANDMARKS.map((l) => l.polygon),
  ...PARK_CONTEXT_ROADS.map((e) => e.polygon),
  ...PARK_CONTEXT_WALKS.map((e) => e.polygon),
];
