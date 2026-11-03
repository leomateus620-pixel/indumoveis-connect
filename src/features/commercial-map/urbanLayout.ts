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
import { DISTRICT_REFERENCE } from "./urbanDistrictReference";

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
  form: "courtyard" | "split" | "villa" | "compact" | "two-storey" | "gable";
  footprint: Point[];
  parcel: Point[];
  width: number;
  depth: number;
  height: number;
  roof: "hip" | "gable" | "flat";
  facing: -1 | 1;
  pool: boolean;
  cluster: number;
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

/** Sector-local presentation adapter. A uniform scale is used within each
 * sector; each sector is independently placed between the existing OSM road
 * interfaces because the commercial schematic is not a single metric survey.
 * Source rectangles are interpretive landscaping envelopes, not real parcels. */
export function deriveUrbanHouses(): UrbanHouse[] {
  const boundaries = ["campeira", "musicanto", "10-de-agosto", "fenasoja"].map(
    (id) => ACTIVE_REFERENCE_ROADS.find((r) => r.id === id)!.path[0][0],
  );
  const spans = [
    { source: [98, 155], target: [boundaries[0], boundaries[1]], block: "Q2", cluster: 0 },
    { source: [166, 239], target: [boundaries[1], boundaries[2]], block: "Q3", cluster: 1 },
    { source: [250, 318], target: [boundaries[2], boundaries[3]], block: "Q4", cluster: 2 },
    { source: [329, 409], target: [boundaries[3], boundaries[3] + 43], block: "Q5", cluster: 3 },
  ] as const;
  const forms: Record<string, UrbanHouse["form"]> = {
    "hip-villa": "villa",
    courtyard: "courtyard",
    gable: "gable",
    "flat-modern": "compact",
    "split-level": "two-storey",
    "long-shed": "split",
  };
  const houses: UrbanHouse[] = [];
  for (const span of spans) {
    // Road + sidewalk clearance is kept at both ends. The t extent is bounded
    // by the original dead ends; no street is invented behind the residences.
    const roadClearance = (RESIDENTIAL_ROAD_WIDTH + 1.05) / 2 + 1.0;
    const usable = span.target[1] - span.target[0] - 2 * roadClearance;
    const scale = Math.min(usable / (span.source[1] - span.source[0]), 45 / 90);
    const offsetX =
      (span.target[0] + span.target[1] - scale * (span.source[0] + span.source[1])) / 2;
    const world = ([s, t]: readonly [number, number]): Point => [
      offsetX + s * scale,
      AVENUE_SOUTH + 1.5 + (t - 11) * scale,
    ];
    for (const item of DISTRICT_REFERENCE.filter((record) => record.block === span.block)) {
      const [a, b, c, d] = item.bounds;
      const min = world([a, b]),
        max = world([c, d]);
      const center = world(item.center);
      const parcel = rectangle(
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        max[0] - min[0],
        max[1] - min[1],
      );
      const sideFrontage = item.frontage !== "avenue";
      const heading =
        item.frontage === "north" ? Math.PI / 2 : item.frontage === "south" ? -Math.PI / 2 : 0;
      // Rotate the facade while keeping the original world-space footprint.
      const width = item.size[sideFrontage ? 1 : 0] * scale,
        depth = item.size[sideFrontage ? 0 : 1] * scale;
      const footprint = rectangle(...center, item.size[0] * scale, item.size[1] * scale);
      if (!urbanPolygonAllowed(parcel) || !footprint.every((p) => pointInPolygon(p, parcel)))
        continue;
      houses.push({
        center,
        parcel,
        footprint,
        heading,
        cluster: span.cluster,
        frontageDistance: depth / 2,
        roadAccess: false,
        width,
        depth,
        height: item.storeys === 2 ? 2.6 : 2.1,
        form: forms[item.typology],
        roof:
          item.typology === "flat-modern"
            ? "flat"
            : item.typology === "gable" || item.typology === "long-shed"
              ? "gable"
              : "hip",
        facing: -1,
        pool: item.pool,
      });
    }
  }
  // The tapered wedge is clipped against the actual diagonal OSM corridor.
  // Keep the two separately interpreted built volumes, without duplicate wings.
  const diagonal = ACTIVE_REFERENCE_ROADS.find((r) => r.id === "tuparendi")!.path;
  const diagonalCeiling = (x: number) => {
    for (let i = 1; i < diagonal.length; i++) {
      const [a, b] = [diagonal[i - 1], diagonal[i]];
      if (x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]))
        return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]) - 6.8;
    }
    return -Infinity;
  };
  const clipDiagonal = (polygon: Point[]) => {
    const out: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = diagonalCeiling(a[0]) - a[1],
        db = diagonalCeiling(b[0]) - b[1];
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  for (const [center, parcel, heading, form] of [
    [[-23, 112], clipDiagonal(rectangle(-24.5, 111.7, 15, 14)), 0, "villa"],
    [[-13, 123.6], clipDiagonal(rectangle(-14, 125.3, 12, 12.2)), Math.PI / 2, "split"],
  ] as [Point, Point[], number, UrbanHouse["form"]][]) {
    const width = 8,
      depth = 9.5;
    const footprint = rectangle(...center, heading ? depth : width, heading ? width : depth);
    if (urbanPolygonAllowed(parcel) && footprint.every((p) => pointInPolygon(p, parcel)))
      houses.push({
        center,
        parcel,
        heading,
        frontageDistance: 6.2,
        roadAccess: true,
        cluster: 4,
        width,
        depth,
        footprint,
        form,
        height: 2.1,
        roof: "hip",
        facing: -1,
        pool: false,
      });
  }
  // The source marks facade orientation, but an internal parcel is not proof of
  // a public driveway through its neighbours. Draw a direct access only where
  // a straight segment reaches the existing sidewalk without crossing another
  // parcel. The source's shared drives remain pending rather than invented.
  const sideRoads = ACTIVE_REFERENCE_ROADS.filter((road) =>
    ["campeira", "musicanto", "10-de-agosto", "fenasoja"].includes(road.id),
  );
  for (const house of houses.filter((item) => item.cluster !== 4)) {
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
    if (houses.some((other) => other !== house && overlap(linkBounds, polygonBounds(other.parcel))))
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

/** Explicit approximate canopy masses along the photographed residential/field
 * edge. These are not surveyed individual trees or new commercial plantings. */
export function deriveResidentialBuffer() {
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
  ];
  const parcels = deriveUrbanHouses().map((house) => house.parcel);
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
