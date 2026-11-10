import { ENTITIES, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds, type Bounds } from "./geometry";
import {
  URBAN_REFERENCE,
  ACTIVE_REFERENCE_ROADS,
  EXPLORATION_POLYGONS,
  RESIDENTIAL_ROAD_WIDTH,
  type ReferenceRoad,
} from "./urbanReference";
import { deriveRoadRibbon } from "./roadGeometry";
import {
  DISTRICT_REFERENCE,
  WEDGE_GROVE,
  type DistrictGround,
  type DistrictRecord,
  type DistrictTypology,
} from "./urbanDistrictReference";

// Lightweight authored layout only: no renderer, materials or scene factories.
const AVENUE_SOUTH = URBAN_REFERENCE.avenueSouth;

/** Selected OpenStreetMap road nodes, aligned to the schematic with pavilion
 * and junction landmarks. Source geometry stays fixed. Added properties are
 * visual context only, not surveyed parcels or additional commercial stock. */
export const URBAN_CONTEXT = {
  minimumZ: Math.min(...EXPLORATION_POLYGONS.flatMap((p) => p.map(([, z]) => z))) - 2,
  houseMinimumZ: AVENUE_SOUTH + 1.05,
  avenueSouth: AVENUE_SOUTH,
  groundY: -0.145,
  clusters: 5,
  ground: { soil: "#8f6451", beds: "#a39472", paved: "#a9aaa1" },
  palette: {
    walls: ["#d4cfc0", "#e1dccf", "#c5c4b9", "#d9c9ad", "#c9c4b4"],
    roofs: ["#986952", "#a9775b", "#65716f", "#8f8d7e", "#b6b8ad", "#765748"],
    garden: ["#7e9569", "#8c9f72", "#81976a", "#96a97b"],
  },
} as const;

export type UrbanHouse = {
  center: Point;
  heading: number;
  frontageDistance: number;
  /** A direct unobstructed link to a road was found; otherwise no driveway is drawn. */
  roadAccess: boolean;
  form: "courtyard" | "split" | "villa" | "compact" | "two-storey" | "gable" | "shed";
  footprint: Point[];
  parcel: Point[];
  width: number;
  depth: number;
  height: number;
  roof: "hip" | "gable" | "flat";
  facing: -1 | 1;
  pool: boolean;
  cluster: number;
  /** Dominant colours read from the orthophoto. */
  roofColor: string;
  wallColor?: string;
  ground: DistrictGround;
};
export type UrbanVacantLot = {
  parcel: Point[];
  ground: DistrictGround;
  cluster: number;
  trees: Point[];
};
const rectangle = (x: number, z: number, width: number, depth: number): Point[] => [
  [x - width / 2, z - depth / 2],
  [x + width / 2, z - depth / 2],
  [x + width / 2, z + depth / 2],
  [x - width / 2, z + depth / 2],
];
const overlap = (a: Bounds, b: Bounds) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Positive-area overlap is rejected before creating presentation geometry.
 * The dedicated south-side boundary is an additional guard, not a substitute
 * for protecting the actual source polygons if their outlines change later. */
export function urbanPolygonAllowed(polygon: readonly Point[]) {
  if (polygon.some(([x, z]) => !Number.isFinite(x) || z < URBAN_CONTEXT.minimumZ)) return false;
  const bounds = polygonBounds(polygon);
  for (const entity of ENTITIES) {
    if (!overlap(bounds, polygonBounds(entity.polygon))) continue;
    if (
      polygon.some((point) => pointInPolygon(point, entity.polygon)) ||
      entity.polygon.some((point) => pointInPolygon(point, polygon))
    )
      return false;
    for (let i = 0; i < polygon.length; i++)
      for (let j = 0; j < entity.polygon.length; j++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const c = entity.polygon[j],
          d = entity.polygon[(j + 1) % entity.polygon.length];
        if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
          return false;
      }
  }
  return true;
}

const CLUSTER: Record<DistrictRecord["block"], number> = { Q1: 0, Q2: 1, Q3: 2, Q4: 3, E: 3, W: 4 };
const FORMS: Record<DistrictTypology, UrbanHouse["form"]> = {
  "hip-villa": "villa",
  courtyard: "courtyard",
  gable: "gable",
  "flat-modern": "compact",
  "split-level": "two-storey",
  "long-shed": "split",
  shed: "shed",
};

/** The tapered wedge is clipped against the actual diagonal OSM corridor. */
function clipDiagonal(polygon: Point[]) {
  const diagonal = ACTIVE_REFERENCE_ROADS.find((r) => r.id === "tuparendi")!.path;
  const ceiling = (x: number) => {
    for (let i = 1; i < diagonal.length; i++) {
      const [a, b] = [diagonal[i - 1], diagonal[i]];
      if (x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]))
        return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]) - 6.8;
    }
    return -Infinity;
  };
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = ceiling(a[0]) - a[1],
      db = ceiling(b[0]) - b[1];
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function envelope(record: DistrictRecord): Point[] {
  const [x0, z0, x1, z1] = record.parcel;
  const polygon = rectangle((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  return record.block === "W" ? clipDiagonal(polygon) : polygon;
}

/** Envelopes with no roof in the orthophoto: bare soil, garden beds or lawn. */
export function deriveUrbanVacantLots(): UrbanVacantLot[] {
  return DISTRICT_REFERENCE.filter((record) => !record.house)
    .map((record) => ({
      parcel: envelope(record),
      ground: record.ground ?? "lawn",
      cluster: CLUSTER[record.block],
      trees: (record.trees ?? []).map((p): Point => [p[0], p[1]]),
    }))
    .filter((lot) => lot.parcel.length >= 3 && urbanPolygonAllowed(lot.parcel));
}

/** Orthophoto-registered presentation adapter. Roof centres/sizes stay in the
 * drawing's plan coordinates; only the facade heading is interpreted from the
 * side each home addresses. Envelopes are landscaping limits, not parcels. */
export function deriveUrbanHouses(): UrbanHouse[] {
  const houses: UrbanHouse[] = [];
  for (const record of DISTRICT_REFERENCE) {
    const item = record.house;
    if (!item) continue;
    const parcel = envelope(record);
    const center: Point = [item.center[0], item.center[1]];
    const sideFrontage = item.frontage !== "avenue";
    const heading =
      item.frontage === "east" ? Math.PI / 2 : item.frontage === "west" ? -Math.PI / 2 : 0;
    // Rotate the facade while keeping the original world-space footprint.
    const width = item.size[sideFrontage ? 1 : 0],
      depth = item.size[sideFrontage ? 0 : 1];
    const footprint = rectangle(...center, item.size[0], item.size[1]);
    if (
      parcel.length < 3 ||
      !urbanPolygonAllowed(parcel) ||
      !footprint.every((p) => pointInPolygon(p, parcel))
    )
      continue;
    houses.push({
      center,
      parcel,
      footprint,
      heading,
      cluster: CLUSTER[record.block],
      frontageDistance: depth / 2,
      roadAccess: false,
      width,
      depth,
      height: item.storeys === 2 ? 2.6 : 2.1,
      form: FORMS[item.typology],
      roof:
        item.typology === "flat-modern" || item.typology === "split-level"
          ? "flat"
          : item.typology === "gable" || item.typology === "long-shed" || item.typology === "shed"
            ? item.storeys === 2
              ? "flat"
              : "gable"
            : "hip",
      facing: -1,
      pool: record.pool === true,
      roofColor: item.roof,
      wallColor: item.wall,
      ground: record.ground ?? "lawn",
    });
  }
  // An envelope that touches a street is not proof of a driveway through its
  // neighbours. Draw a direct access only where a straight segment reaches
  // the existing sidewalk without crossing another envelope.
  const sideRoads = ACTIVE_REFERENCE_ROADS.filter((road) =>
    ["campeira", "musicanto", "10-de-agosto", "fenasoja"].includes(road.id),
  );
  const occupied = [
    ...houses.map((house) => house.parcel),
    ...deriveUrbanVacantLots().map((lot) => lot.parcel),
  ];
  for (const house of houses) {
    if (house.form === "shed") continue;
    const direction = Math.sign(Math.sin(house.heading));
    const parcel = polygonBounds(house.parcel);
    let distance = 0;
    if (!direction) {
      const edge = AVENUE_SOUTH + 1.05;
      if (parcel.minY >= edge && parcel.minY - edge < 10) distance = house.center[1] - edge;
    } else {
      const targetX: number[] = [];
      for (const road of sideRoads)
        for (let i = 1; i < road.path.length; i++) {
          const a = road.path[i - 1],
            b = road.path[i],
            z = house.center[1];
          if (z < Math.min(a[1], b[1]) || z > Math.max(a[1], b[1]) || Math.abs(b[1] - a[1]) < 1e-9)
            continue;
          const centerX = a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
          const sidewalkEdge = centerX - direction * (road.width / 2 + 0.525 + 0.15);
          const gap = direction * (sidewalkEdge - (direction > 0 ? parcel.maxX : parcel.minX));
          if (gap >= 0 && gap < 10) targetX.push(sidewalkEdge);
        }
      if (targetX.length)
        distance = Math.min(...targetX.map((x) => direction * (x - house.center[0])));
    }
    if (distance <= house.depth / 2) continue;
    // Account for both offset driveway and walkway, not only their centrelines.
    const reach = distance - house.depth / 2;
    const roadLink = direction
      ? rectangle(
          house.center[0] + direction * (house.depth / 2 + reach / 2),
          house.center[1],
          reach,
          house.width * 0.6 + 1.6,
        )
      : rectangle(
          house.center[0],
          house.center[1] - (house.depth / 2 + reach / 2),
          house.width * 0.6 + 1.6,
          reach,
        );
    const linkBounds = polygonBounds(roadLink);
    if (
      occupied.some((other) => other !== house.parcel && overlap(linkBounds, polygonBounds(other)))
    )
      continue;
    house.frontageDistance = distance;
    house.roadAccess = true;
  }
  return houses;
}

export function deriveUrbanRoads(): ReferenceRoad[] {
  return ACTIVE_REFERENCE_ROADS.map((road) => ({
    ...road,
    path: road.path.map((p) => [...p] as Point),
  }));
}

/** Explicit approximate canopy masses: the field edge south of the homes, the
 * grove that fills the wedge beside the diagonal, and the crowns visible on
 * open envelopes. These are not surveyed individual trees. */
export function deriveResidentialBuffer() {
  const lots = deriveUrbanVacantLots();
  const candidates: Point[] = [
    [6, 156.2],
    [13, 158],
    [21, 155.8],
    [29, 158.2],
    [46, 156.4],
    [53, 158.1],
    [61, 155.9],
    [70, 157.8],
    [88, 155.9],
    [96, 158],
    [104, 156.2],
    [112, 158.4],
    [130, 156.3],
    [137, 158.5],
    [145, 156],
    [153, 158.4],
    [162, 155.9],
    [171, 158.5],
    ...WEDGE_GROVE.map((p): Point => [p[0], p[1]]),
    ...lots.flatMap((lot) => lot.trees),
  ];
  const parcels = [
    ...deriveUrbanHouses().map((house) => house.parcel),
    // Bare soil and beds stay open; lawn envelopes may carry their own crowns.
    ...lots.filter((lot) => lot.ground !== "lawn").map((lot) => lot.parcel),
  ];
  const corridors = ACTIVE_REFERENCE_ROADS.map((r) => deriveRoadRibbon(r.path, r.width + 1.05));
  const radius = 1.55 * 1.45 + 0.25;
  return candidates.filter((point) => {
    const disc = Array.from({ length: 16 }, (_, i): Point => [
      point[0] + Math.cos((i * Math.PI) / 8) * radius,
      point[1] + Math.sin((i * Math.PI) / 8) * radius,
    ]);
    return (
      urbanPolygonAllowed(disc) &&
      ![...parcels, ...corridors].some(
        (polygon) =>
          disc.some((p) => pointInPolygon(p, polygon)) ||
          polygon.some((p) => pointInPolygon(p, disc)),
      )
    );
  });
}
