import { ShapeUtils, Vector2 } from "three";
import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { getPavilionPresentation } from "./architectureOrientation";
import { polygonBounds, signedPolygonArea } from "./geometry";
import { subtractPolygons } from "./parkGeometry";
import { registerA2Polygon } from "./parkRegistration";

/** Same irregular grove used by the registered woodland. This is a landscape
 * envelope, not a surveyed lawn edge, cadastral change or new commercial area. */
export const PAVILION_GROVE_A2 = [
  [232, 652],
  [440, 648],
  [618, 653],
  [618, 745],
  [609, 746],
  [608, 818],
  [650, 818],
  [649, 860],
  [410, 861],
  [337, 835],
  [271, 804],
  [238, 770],
  [220, 711],
] as const;

/** Drawing proportions only, adapted to the available physical gap. No metres
 * or unverified crossing are inferred. Existing service entries stay usable. */
export const PAVILION_GROUND = {
  sidewalkWidth: 1.6,
  curbWidth: 0.1,
  curbSeparation: 0.1,
  rearServiceWidth: 0.64,
  westGreenDepth: 12,
  condition:
    "Estimated landscape/pedestrian widths in drawing units, bounded by registered buildings and avenue",
} as const;

const triangles = (polygon: readonly Point[]) =>
  ShapeUtils.triangulateShape(
    polygon.map((p) => new Vector2(...p)),
    [],
  )
    .map((t) => t.map((i) => polygon[i]))
    .filter((t) => Math.abs(signedPolygonArea(t)) > 1e-8);

function surfaceTriangles(entity: MapEntity): Point[][] {
  const rings = [entity.polygon, ...(entity.holes ?? [])],
    points = rings.flat();
  return ShapeUtils.triangulateShape(
    rings[0].map((p) => new Vector2(...p)),
    rings.slice(1).map((ring) => ring.map((p) => new Vector2(...p))),
  )
    .map((t) => t.map((i) => points[i]))
    .filter((t) => Math.abs(signedPolygonArea(t)) > 1e-8);
}

const rect = (x0: number, z0: number, x1: number, z1: number): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

export type PavilionGround = {
  green: Point[][];
  servicePaths: Point[][];
  sidewalk: Point[][];
  curb: Point[][];
  /** Remove these exact cells from the old concrete backing before drawing. */
  foundationExclusions: Point[][];
  sidewalkStart: number;
  curbStart: number;
  avenueEdge: number;
};

/** All back/front classification comes from the architectural registry, never
 * the camera. Green follows every rear-facing segment, including P8's notches;
 * the road's original rings cut through it instead of being painted over. */
export function derivePavilionGround(entities: readonly MapEntity[]): PavilionGround {
  const avenue =
    entities.find((e) => e.id === "indumoveis:road:benvenuto") ??
    ENTITIES.find((e) => e.id === "indumoveis:road:benvenuto")!;
  const av = polygonBounds(avenue.polygon);
  const curbStart = av.minY - PAVILION_GROUND.curbWidth;
  const sidewalkStart = curbStart - PAVILION_GROUND.sidewalkWidth;
  const greenCandidates: Point[][] = triangles(registerA2Polygon(PAVILION_GROVE_A2));
  // The original southwest P14 planted return contains an existing avenue
  // tree at [30.9,88.7]. It is a confirmed green envelope, not a new row or a
  // guessed circular patch. Buildings/streets below still own every crossing.
  const plantedReturn = entities.find((e) => e.id === "indumoveis:landscape:p14-front");
  if (plantedReturn) greenCandidates.push(...triangles(plantedReturn.polygon));
  const serviceCandidates: Point[][] = [];
  for (const building of entities.filter((e) => e.kind === "pavilion")) {
    const p = getPavilionPresentation(building);
    if (!p) continue;
    const rear: Point = [-p.frontNormal[0], -p.frontNormal[1]];
    const sign = Math.sign(signedPolygonArea(building.polygon));
    building.polygon.forEach((a, i) => {
      const b = building.polygon[(i + 1) % building.polygon.length];
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz);
      if (
        length < 0.2 ||
        ((sign * dz) / length) * rear[0] - ((sign * dx) / length) * rear[1] < 0.94
      )
        return;
      if (rear[0] < -0.9) {
        greenCandidates.push([
          a,
          b,
          [b[0] - PAVILION_GROUND.westGreenDepth, b[1]],
          [a[0] - PAVILION_GROUND.westGreenDepth, a[1]],
        ]);
      } else if (rear[1] > 0.9 && Math.max(a[1], b[1]) < sidewalkStart) {
        greenCandidates.push([a, b, [b[0], sidewalkStart], [a[0], sidewalkStart]]);
      }
    });
    if (rear[1] > 0.9) {
      const rearLevel = Math.min(...p.rearEdge.map((a) => a[1]));
      for (const entry of p.serviceEntries) {
        // Retain only source entries on the rear, not unrelated side portals.
        if (entry[1] < rearLevel - 0.08 || entry[1] >= sidewalkStart) continue;
        const half = PAVILION_GROUND.rearServiceWidth / 2;
        serviceCandidates.push(
          rect(entry[0] - half, entry[1] - 0.04, entry[0] + half, sidewalkStart + 0.08),
        );
      }
    }
  }
  const blockers = entities
    .filter(
      (e) =>
        e.kind === "lot" ||
        e.kind === "pavilion" ||
        (e.kind === "support" && e.id !== "indumoveis:support:gate-03") ||
        e.kind === "road",
    )
    .flatMap(surfaceTriangles);
  // Resolve overlaps once into a disjoint collection. Each new triangle loses
  // all earlier triangles; there are no duplicate coplanar green faces.
  let green: Point[][] = [];
  for (const candidate of greenCandidates) green.push(...subtractPolygons([candidate], green));
  const servicePaths = subtractPolygons(serviceCandidates, blockers);
  green = subtractPolygons(green, [...blockers, ...serviceCandidates]);
  const sidewalk = subtractPolygons(
    [rect(av.minX + 0.05, sidewalkStart, av.maxX - 0.3, curbStart)],
    blockers,
  );
  const curb = subtractPolygons(
    [rect(av.minX + 0.05, curbStart, av.maxX - 0.3, av.minY)],
    blockers,
  );
  return {
    green,
    servicePaths,
    sidewalk,
    curb,
    foundationExclusions: green,
    sidewalkStart,
    curbStart,
    avenueEdge: av.minY,
  };
}
