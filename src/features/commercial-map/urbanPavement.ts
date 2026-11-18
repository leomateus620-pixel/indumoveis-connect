import { ShapeUtils, Vector2 } from "three";
import { ENTITIES, type Point } from "./data/territory";
import { polygonBounds } from "./geometry";
import {
  pavementClipper,
  pavementSurfaceUnionCells,
  type PavementTopology,
  type PavementSurface,
} from "./pavement";
import { deriveRoadRibbon } from "./roadGeometry";
import { deriveProtectedGround } from "./terrain";
import { deriveUrbanRoads } from "./urbanLayout";
import { MAIN_GATE_PORTAL } from "./permanentParkLayout";
import east from "./eastApproach.json";
import { projectReferenceCoordinate, URBAN_REFERENCE } from "./urbanReference";

export const AVENUE_END = URBAN_REFERENCE.mainGate.x - 0.3;
export const AVENUE_BOUNDS = polygonBounds(
  ENTITIES.find((entity) => entity.id === "indumoveis:road:benvenuto")!.polygon,
);
const section = URBAN_REFERENCE.avenueSection;
const band = (north: number, south: number): Point[] => [
  [AVENUE_BOUNDS.minX, north],
  [AVENUE_END, north],
  [AVENUE_END, south],
  [AVENUE_BOUNDS.minX, south],
];
export const PUBLIC_AVENUE = band(section.asphaltNorth, section.asphaltSouth);
const circle = (center: Point, radius: number) =>
  Array.from({ length: 48 }, (_, i): Point => {
    const angle = (Math.PI * i) / 24;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  });

const eastNode = (id: string) =>
  projectReferenceCoordinate(east.nodes[id as keyof typeof east.nodes]);
const eastWay = (id: keyof typeof east.ways) => east.ways[id].nodes.map(eastNode);
const highwayWays = ["1573144859", "1414654007", "1414654006", "431693361"] as const;
const highway = highwayWays.flatMap((id, i) => eastWay(id).slice(i ? 1 : 0));
const eastArms = ["569781512", "569781511", "569781513", "569781514", "1569871079"] as const;
export const EAST_APPROACH = {
  highway,
  // A common OSM node joins both external arms to the destination-only
  // Rua Brasil at A5. The inside remains owned by the A2 park drawing.
  threshold: eastNode("5479124532"),
  throughArm: eastWay("569781512"),
  returnArm: [...eastWay("569781513"), ...eastWay("1569871079").slice(1)],
};
/** The scene and the offline audit use the same disjoint footprints. The A2
 * pavement owns the shared approach on first paint and during lazy hydration. */
export function deriveUrbanPavement(park?: Pick<PavementTopology, "asphaltCells" | "walkCells">) {
  const streets: PavementSurface[] = [];
  const walks: PavementSurface[] = [
    { polygon: band(section.asphaltSouth, section.asphaltSouth + section.southWalkWidth) },
  ];
  for (const road of deriveUrbanRoads()) {
    const through = road.id === "tuparendi" || road.id === "tuparendi-southwest";
    // The first OSM way is a one-way arm. Its paired arm has its own centreline.
    if (through) streets.push({ polygon: deriveRoadRibbon(road.path.slice(0, 2), 3.15) });
    const path = through ? road.path.slice(1) : road.path;
    streets.push({ polygon: deriveRoadRibbon(path, road.width) });
    // Residential doors and yards front these streets. Elsewhere the outer
    // edge meets the planted verge unless the reference establishes a walk.
    if (road.terminal || road.id === "campeira")
      walks.push({ polygon: deriveRoadRibbon(path, road.width + 1.05) });
  }
  streets.push({ polygon: deriveRoadRibbon(highway, 3.7) });
  for (const ring of [URBAN_REFERENCE.roundabout, URBAN_REFERENCE.secondaryJunction])
    streets.push({
      polygon: circle(ring.center, ring.centerlineRadius + ring.roadWidth / 2),
      holes: [circle(ring.center, ring.centerlineRadius - ring.roadWidth / 2)],
    });

  const protectedGround = deriveProtectedGround(ENTITIES);
  const solids = ENTITIES.filter(
    (e) =>
      e.kind === "lot" ||
      e.kind === "pavilion" ||
      (e.kind === "support" && e.id !== "indumoveis:support:gate-03"),
  ).flatMap(({ polygon }) =>
    ShapeUtils.triangulateShape(
      polygon.map((p) => new Vector2(...p)),
      [],
    ).map((indices) => indices.map((i) => polygon[i])),
  );
  // In A3 the cadastral street starts at a slant. End the public body at
  // its seam, then carry only the two openings under the portal to its face.
  const throat = MAIN_GATE_PORTAL.piers.slice(1).map(([north], i): Point[] => {
    const south = MAIN_GATE_PORTAL.piers[i][1];
    const end = MAIN_GATE_PORTAL.x[1];
    return [
      [AVENUE_END, south],
      [end, south],
      [end, north],
      [AVENUE_END, north],
    ];
  });
  const approach = pavementClipper(solids)([PUBLIC_AVENUE, ...throat]);
  const outside = pavementClipper([...protectedGround, PUBLIC_AVENUE])(
    pavementSurfaceUnionCells(streets),
  );
  const claimed = park ? [...park.asphaltCells, ...park.walkCells] : [];
  const asphalt = [...outside, ...approach];
  const gravel = pavementSurfaceUnionCells(
    eastArms.map((id) => ({
      polygon: deriveRoadRibbon(eastWay(id), east.ways[id].highway === "primary_link" ? 2.35 : 2.5),
    })),
  );
  const roadside = pavementClipper([...claimed, ...asphalt])(gravel);
  // No strip of concrete under either carriageway or across a side-street mouth.
  const sidewalks = pavementClipper([...protectedGround, ...asphalt, ...claimed])(
    pavementSurfaceUnionCells(walks),
  );
  return { asphalt: pavementClipper(claimed)(asphalt), sidewalks, gravel: roadside };
}
