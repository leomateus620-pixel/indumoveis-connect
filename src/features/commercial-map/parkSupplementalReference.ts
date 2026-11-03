import {
  parkSourceRect,
  type ParkReferenceRoad,
  type ParkReferenceAccessPath,
  type ParkSourcePolygon,
} from "./parkReference";

/** Physical source additions identified while checking disconnected sectors.
 * All coordinates use the SAME source frame and registerParkPolygon transform.
 * Source marker anchors and physical passage centres are intentionally distinct. */
export const PARK_GATE_PASSAGE_SOURCE_POINTS = {
  A4: [1624, 1744],
  A5: [5940, 3678],
} as const;

const surface = (
  id: string,
  name: string,
  sourcePolygon: ParkSourcePolygon,
  source: string,
  roadClass: ParkReferenceRoad["roadClass"] = "internal-vehicle",
): ParkReferenceRoad => ({ id, name, sourcePolygon, source, roadClass });

export const PARK_SUPPLEMENTAL_ROADS: readonly ParkReferenceRoad[] = [
  surface(
    "RUA-BUENOS-AIRES-NORTE",
    "Rua Buenos Aires — Portão 4",
    parkSourceRect([1600, 1744, 1648, 3145]),
    "gateFourDistrict.ts / connectorRoad.sourcePdfPolygon; extends original source [1600,2410,1648,3145] to Gate 4 physical axis [1624,1744]",
  ),
  surface(
    "NATIONS-MAIN-ASPHALT",
    "Circulação da Praça das Nações",
    [
      [4792, 4320],
      [5058, 4320],
      [5090, 4352],
      [5090, 4833],
      [5058, 4865],
      [4792, 4865],
      [4760, 4833],
      [4760, 4352],
    ],
    "nationsDistrict.ts / NATIONS_DISTRICT_LAYOUT.mainAsphalt",
  ),
  // Source northApproach starts at z4245, while the adjoining official avenue
  // ends at z4235. Extending the SAME approach edges by those ten source points
  // resolves their documented common mouth, not an arbitrary cross-sector line.
  surface(
    "NATIONS-NORTH-APPROACH",
    "Entrada da Praça das Nações",
    [
      [4890, 4235],
      [4980, 4235],
      [4980, 4382],
      [4890, 4382],
    ],
    "nationsDistrict.ts / northApproach [4890,4245,4980,4382]; officialReference2026.ts / AV-IMIGRANTES south edge4235; 10-source-point butt-joint normalization, graphic condition",
  ),
];

export const PARK_SUPPLEMENTAL_WALKS: readonly ParkReferenceRoad[] = [
  surface(
    "NATIONS-CIVIC-PAVING",
    "Passeio cívico das Nações",
    [
      [4868, 4380],
      [5002, 4380],
      [5025, 4404],
      [5025, 4816],
      [5002, 4840],
      [4868, 4840],
      [4845, 4816],
      [4845, 4404],
    ],
    "nationsDistrict.ts / civicPaving",
    "internal-pedestrian",
  ),
  surface(
    "NATIONS-SOUTH-APPROACH",
    "Passeio sul das Nações",
    [
      [4850, 4830],
      [5020, 4830],
      [5020, 5010],
      [4850, 5010],
    ],
    "nationsDistrict.ts / southApproach",
    "internal-pedestrian",
  ),
  surface(
    "NATIONS-STAGE-APRON",
    "Patamar do palco das Nações",
    [
      [4828, 4895],
      [5042, 4895],
      [5070, 4930],
      [5070, 5078],
      [4800, 5078],
      [4800, 4930],
    ],
    "nationsDistrict.ts / stageApron",
    "internal-pedestrian",
  ),
  surface(
    "PAVILHAO-09-SERVICE-APRON",
    "Passeio de serviço do Pavilhão 9",
    parkSourceRect([1682, 1848, 1928, 2390]),
    "gateFourDistrict.ts / pavilion9.serviceApron.sourcePdfPolygon; building footprint must be subtracted",
    "internal-pedestrian",
  ),
];

export const PARK_SUPPLEMENTAL_ACCESS_PATHS: readonly ParkReferenceAccessPath[] = [
  {
    id: "crioulo-access",
    name: "Acesso do Núcleo Crioulo",
    sourcePath: [
      [1600, 2278],
      [1584, 2278],
      [1568, 2289],
    ],
    widthSource: 22,
    roadClass: "internal-pedestrian",
    source: "gateFourDistrict.ts / crioulos.access.sourcePdfCenterline / width",
  },
];

/** This is the source footprint of the existing public frontage, not a new
 * parallel avenue. Reconcile it with the current avenue surface owner before
 * using it: in particular the Nations approach meets z4235 at x4890..4980. */
export const PARK_IMIGRANTES_SOURCE_FRONTAGE = {
  id: "AV-IMIGRANTES",
  name: "Avenida dos Imigrantes / frente das Etnias",
  sourcePolygon: parkSourceRect([3940, 4165, 5290, 4235]),
  source: "officialReference2026.ts / AV-IMIGRANTES; arenaRoadCorrection.ts / frontageTerminus",
};

export const PARK_SUPPLEMENTAL_SOURCE_NOTES = [
  "The symbol A4 at [1656,1744] has a documented source visual offset [-32,0]; the real road-axis portal centre is [1624,1744].",
  "The service-road axis ending at [1650,1600] belongs to the motorhome upper approach. It is not the source of the Buenos Aires/Gate4 connection and must not be extended arbitrarily through the fenced Crioulo/pecuary sector.",
  "Buenos Aires connects Gate4 to Paraguai by its source strip x1600..1648, z1744..3145. Main nodes belong to that corridor, not the independent motorhome service-road tip.",
  "Nations surfaces are nested source owners. Subtract civic paving/walks from asphalt or resolve one surface owner; do not render coincident planes.",
  "The short 10-source-point north-approach joint is a documented graphic reconciliation between adjoining source surfaces, not surveyed pavement width or a new route through woodland.",
] as const;
