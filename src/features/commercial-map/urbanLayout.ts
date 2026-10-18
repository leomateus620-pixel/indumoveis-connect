import { ENTITIES, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds, type Bounds } from "./geometry";
import {
  URBAN_REFERENCE,
  REFERENCE_ROADS,
  EXPLORATION_POLYGONS,
  type ReferenceRoad,
} from "./urbanReference";
import { deriveRoadRibbon } from "./roadGeometry";

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
  houses: 32,
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

/** Fixed modular rhythm inspired by the rotated residential reference, without
 * tracing addresses, private parcels or the satellite's printed annotations. */
export function deriveUrbanHouses(): UrbanHouse[] {
  const houses: UrbanHouse[] = [];
  const boundaries = ["campeira", "musicanto", "10-de-agosto", "fenasoja"].map(
    (id) => REFERENCE_ROADS.find((r) => r.id === id)!.path[0][0],
  );
  const forms = ["courtyard", "split", "villa", "compact", "two-storey", "gable"] as const;
  const addHouse = (
    center: Point,
    parcel: Point[],
    heading: number,
    frontageDistance: number,
    cluster: number,
    dimensions?: [number, number],
  ) => {
    const number = houses.length;
    const width = dimensions?.[0] ?? 6.2 + (number % 4) * 0.3;
    const depth = dimensions?.[1] ?? 10.2 + ((number * 3) % 5) * 0.38;
    const footprint = rectangle(...center, heading ? depth : width, heading ? width : depth);
    if (!urbanPolygonAllowed(parcel) || !footprint.every((p) => pointInPolygon(p, parcel))) return;
    houses.push({
      center,
      parcel,
      heading,
      frontageDistance,
      cluster,
      width,
      depth,
      footprint,
      form: forms[number % forms.length],
      height: 2.1 + (number % 3) * 0.18,
      roof: number % 6 === 0 ? "flat" : number % 3 === 0 ? "gable" : "hip",
      facing: -1,
      pool: number % 3 === 2,
    });
  };
  for (let block = 0; block < 3; block++) {
    const [left, right] = [boundaries[block], boundaries[block + 1]];
    const sidewalkEdge = (5.8 + 1.05) / 2 + 1.4;
    const residentialWidth = right - left - 2 * sidewalkEdge;
    // Four smaller front homes and four rear homes opening onto the existing
    // cross streets reproduce the denser residential grain of reference52.
    // No public/private road is added through the middle of a block.
    for (let column = 0; column < 4; column++) {
      const x = left + sidewalkEdge + (residentialWidth * (column + 0.5)) / 4;
      const parcelWidth = residentialWidth / 4 - 0.16;
      const houseZ = 111.9 + ((column * 2 + block) % 4) * 0.68;
      addHouse(
        [x, houseZ],
        rectangle(x, 115.7, parcelWidth, 22.3),
        0,
        houseZ - AVENUE_SOUTH,
        block,
        [
          Math.min(parcelWidth - 1.45, 6.05 + ((column + block) % 3) * 0.42),
          10.5 + (column % 3) * 0.5,
        ],
      );
    }
    for (let row = 0; row < 2; row++)
      for (let side = 0; side < 2; side++) {
        const x = left + sidewalkEdge + residentialWidth * (side ? 0.75 : 0.25);
        const z = 133.35 + row * 11.55;
        const parcel = rectangle(x, z, residentialWidth / 2 - 0.2, 11.35);
        const heading = side ? Math.PI / 2 : -Math.PI / 2;
        addHouse([x, z], parcel, heading, side ? right - 2.9 - x : x - left - 2.9, block, [
          7.3 + ((row + side + block) % 2) * 0.4,
          10.2 + ((block + row) % 3) * 0.35,
        ]);
      }
  }
  // Partial upper area visible beyond Fenasoja, with separate setbacks rather
  // than repeating the three full blocks into an unlimited suburb.
  for (let column = 0; column < 4; column++) {
    const x = 133.7 + column * 11.15;
    const houseZ = 112.3 + (column % 3) * 0.68;
    addHouse([x, houseZ], rectangle(x, 115.8, 10.9, 22.4), 0, houseZ - AVENUE_SOUTH, 3, [
      7.3 + (column % 2) * 0.6,
      11.3 + (column % 3) * 0.4,
    ]);
  }
  for (let row = 0; row < 2; row++)
    addHouse(
      [136.8, 133.5 + row * 11.5],
      rectangle(136.8, 133.5 + row * 11.5, 17, 11.3),
      -Math.PI / 2,
      136.8 - 125.7,
      3,
      [7.5, 10.7],
    );
  const diagonal = REFERENCE_ROADS.find((r) => r.id === "tuparendi")!.path;
  const diagonalCeiling = (x: number) => {
    for (let i = 1; i < diagonal.length; i++) {
      const [a, b] = [diagonal[i - 1], diagonal[i]];
      if (x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]))
        return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]) - 5.8;
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
  // Two individually fitted dwellings occupy the tapered triangle. Their
  // gardens/fences follow the clipped parcel, not its enclosing rectangle.
  addHouse(
    [-23, 112],
    clipDiagonal(rectangle(-24.5, 111.7, 15, 14)),
    0,
    112 - AVENUE_SOUTH,
    4,
    [8, 9.5],
  );
  addHouse(
    [-13, 123.6],
    clipDiagonal(rectangle(-14, 125.3, 12, 12.2)),
    Math.PI / 2,
    6.2,
    4,
    [8, 9.5],
  );
  return houses;
}

export function deriveUrbanRoads(): ReferenceRoad[] {
  return REFERENCE_ROADS.map((road) => ({ ...road, path: road.path.map((p) => [...p] as Point) }));
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
  const corridors = REFERENCE_ROADS.map((r) => deriveRoadRibbon(r.path, r.width + 1.05));
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
