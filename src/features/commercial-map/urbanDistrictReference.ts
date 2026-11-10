/** Residential context read from the registered orthophoto (see
 * URBAN_REGISTRATION). Every value is a plan coordinate of the commercial
 * drawing, taken on a 1-unit grid over the aerial image: roof outline centre
 * and size, dominant roof colour, visible pools and empty ground.
 *
 * These are presentation envelopes, not cadastral parcels, addresses or
 * owners. Envelope edges follow visible walls/hedges where they exist and are
 * otherwise an even split between neighbouring roofs. */
export type DistrictGround = "lawn" | "soil" | "beds" | "paved";
export type DistrictTypology =
  | "hip-villa"
  | "courtyard"
  | "gable"
  | "flat-modern"
  | "split-level"
  | "long-shed"
  | "shed";
export type DistrictRecord = {
  block: "Q1" | "Q2" | "Q3" | "Q4" | "E" | "W";
  /** [minX, minZ, maxX, maxZ] */
  parcel: readonly [number, number, number, number];
  ground?: DistrictGround;
  pool?: boolean;
  /** Canopies visible on open ground, used only for vacant envelopes. */
  trees?: readonly (readonly [number, number])[];
  house?: {
    center: readonly [number, number];
    /** World-axis extent of the roof outline: [along X, along Z]. */
    size: readonly [number, number];
    typology: DistrictTypology;
    storeys: 1 | 2;
    roof: string;
    wall?: string;
    /** Side the facade addresses. Side-street homes face east or west. */
    frontage: "avenue" | "east" | "west";
  };
};

const TILE = { clay: "#b9714f", salmon: "#cb8769", tan: "#b8936f", brown: "#8a5c46" } as const;
const DARK = { maroon: "#74403a", umber: "#5d3e35", graphite: "#474c4e" } as const;
const PALE = { white: "#e4e2da", grey: "#b9bcb7", slate: "#7c878c", zinc: "#8d918e" } as const;

export const DISTRICT_REFERENCE: readonly DistrictRecord[] = [
  // Q1: between Rua Campeira and Rua Musicanto.
  {
    block: "Q1",
    parcel: [4.2, 104.7, 15.5, 119.3],
    house: {
      center: [10.5, 112.6],
      size: [7, 12.4],
      typology: "gable",
      storeys: 1,
      roof: PALE.grey,
      frontage: "avenue",
    },
  },
  {
    block: "Q1",
    parcel: [15.7, 104.7, 29.3, 119.3],
    pool: true,
    house: {
      center: [21.8, 111.8],
      size: [9.4, 8],
      typology: "hip-villa",
      storeys: 1,
      roof: TILE.tan,
      frontage: "avenue",
    },
  },
  {
    block: "Q1",
    parcel: [29.5, 104.7, 38.4, 119.3],
    pool: true,
    house: {
      center: [34, 110.2],
      size: [7, 7.4],
      typology: "gable",
      storeys: 1,
      roof: TILE.brown,
      frontage: "east",
    },
  },
  {
    block: "Q1",
    parcel: [4.2, 119.5, 19.8, 127.6],
    house: {
      center: [11.8, 123.5],
      size: [14.4, 6.6],
      typology: "flat-modern",
      storeys: 1,
      roof: PALE.white,
      wall: "#e9e6dc",
      frontage: "west",
    },
  },
  {
    block: "Q1",
    parcel: [20, 119.5, 38.4, 127.6],
    pool: true,
    house: {
      center: [30.6, 123.2],
      size: [13, 6.6],
      typology: "split-level",
      storeys: 2,
      roof: PALE.zinc,
      wall: "#e6e4da",
      frontage: "east",
    },
  },
  { block: "Q1", parcel: [4.2, 127.8, 21, 134.6], ground: "soil" },
  {
    block: "Q1",
    parcel: [21.2, 127.8, 38.4, 134.6],
    house: {
      center: [32.4, 131.2],
      size: [6.6, 6],
      typology: "hip-villa",
      storeys: 1,
      roof: TILE.clay,
      frontage: "east",
    },
  },
  {
    block: "Q1",
    parcel: [4.2, 134.8, 20.5, 143.2],
    ground: "lawn",
    trees: [
      [9.5, 139],
      [15, 139.2],
    ],
  },
  {
    block: "Q1",
    parcel: [20.7, 134.8, 29, 143.2],
    house: {
      center: [25, 139.2],
      size: [6, 7.4],
      typology: "flat-modern",
      storeys: 1,
      roof: "#d6cbb5",
      frontage: "east",
    },
  },
  {
    block: "Q1",
    parcel: [29.2, 134.8, 38.4, 143.2],
    house: {
      center: [33.4, 139],
      size: [6.8, 7.4],
      typology: "hip-villa",
      storeys: 1,
      roof: PALE.slate,
      frontage: "east",
    },
  },
  {
    block: "Q1",
    parcel: [4.2, 143.4, 21.5, 151],
    house: {
      center: [13, 147.3],
      size: [13.6, 5.4],
      typology: "gable",
      storeys: 1,
      roof: DARK.maroon,
      frontage: "west",
    },
  },
  {
    block: "Q1",
    parcel: [21.7, 143.4, 38.4, 151],
    pool: true,
    house: {
      center: [31.4, 146.9],
      size: [12.6, 6.2],
      typology: "flat-modern",
      storeys: 1,
      roof: "#dacdb7",
      frontage: "east",
    },
  },

  // Q2: between Rua Musicanto and Rua 10 de Agosto.
  {
    block: "Q2",
    parcel: [43.9, 104.7, 60, 127.4],
    pool: true,
    house: {
      center: [52, 111.2],
      size: [11.4, 10],
      typology: "hip-villa",
      storeys: 1,
      roof: DARK.umber,
      frontage: "avenue",
    },
  },
  {
    block: "Q2",
    parcel: [60.2, 104.7, 73, 119.3],
    pool: true,
    house: {
      center: [67.6, 113],
      size: [8, 9.6],
      typology: "hip-villa",
      storeys: 1,
      roof: PALE.zinc,
      frontage: "avenue",
    },
  },
  {
    block: "Q2",
    parcel: [73.2, 104.7, 81.9, 119.3],
    pool: true,
    house: {
      center: [77.2, 115.4],
      size: [6.8, 6],
      typology: "gable",
      storeys: 1,
      roof: "#8f918c",
      frontage: "east",
    },
  },
  {
    block: "Q2",
    parcel: [60.2, 119.5, 81.9, 127.4],
    pool: true,
    house: {
      center: [72.8, 123.3],
      size: [14, 6.2],
      typology: "long-shed",
      storeys: 1,
      roof: TILE.tan,
      frontage: "east",
    },
  },
  {
    block: "Q2",
    parcel: [43.9, 127.6, 61.5, 135.3],
    pool: true,
    house: {
      center: [51, 131.4],
      size: [10, 6.4],
      typology: "hip-villa",
      storeys: 1,
      roof: DARK.maroon,
      frontage: "west",
    },
  },
  {
    block: "Q2",
    parcel: [61.7, 127.6, 81.9, 135.6],
    pool: true,
    house: {
      center: [71.6, 131.7],
      size: [13, 7.2],
      typology: "courtyard",
      storeys: 1,
      roof: TILE.salmon,
      frontage: "east",
    },
  },
  {
    block: "Q2",
    parcel: [43.9, 135.5, 63, 151],
    pool: true,
    house: {
      center: [53, 143.2],
      size: [10.4, 12.6],
      typology: "courtyard",
      storeys: 1,
      roof: PALE.grey,
      frontage: "west",
    },
  },
  {
    block: "Q2",
    parcel: [63.2, 135.8, 81.9, 143.1],
    pool: true,
    house: {
      center: [72.6, 139.5],
      size: [11, 6.4],
      typology: "hip-villa",
      storeys: 1,
      roof: TILE.brown,
      frontage: "east",
    },
  },
  {
    block: "Q2",
    parcel: [63.2, 143.3, 81.9, 151],
    pool: true,
    house: {
      center: [73.6, 147],
      size: [9, 6.4],
      typology: "gable",
      storeys: 1,
      roof: "#8a3d35",
      frontage: "east",
    },
  },

  // Q3: between Rua 10 de Agosto and Rua Fenasoja.
  {
    block: "Q3",
    parcel: [87, 104.7, 97, 119.4],
    pool: true,
    house: {
      center: [92.2, 111.6],
      size: [5.4, 9.8],
      typology: "gable",
      storeys: 1,
      roof: "#8d8478",
      frontage: "west",
    },
  },
  {
    block: "Q3",
    parcel: [97.2, 104.7, 107, 119.4],
    pool: true,
    house: {
      center: [102.3, 110],
      size: [8.6, 6.4],
      typology: "split-level",
      storeys: 2,
      roof: DARK.graphite,
      wall: "#dedcd2",
      frontage: "avenue",
    },
  },
  {
    block: "Q3",
    parcel: [107.2, 104.7, 116, 119.4],
    pool: true,
    house: {
      center: [111.6, 111.4],
      size: [7.8, 11.8],
      typology: "flat-modern",
      storeys: 2,
      roof: PALE.white,
      wall: "#ebe8df",
      frontage: "avenue",
    },
  },
  {
    block: "Q3",
    parcel: [116.2, 104.7, 123.3, 119.4],
    house: {
      center: [119.8, 112.6],
      size: [6.2, 9.4],
      typology: "hip-villa",
      storeys: 1,
      roof: PALE.zinc,
      frontage: "east",
    },
  },
  {
    block: "Q3",
    parcel: [87, 119.6, 100, 127.2],
    house: {
      center: [93.6, 123.3],
      size: [7.4, 6],
      typology: "flat-modern",
      storeys: 1,
      roof: "#dfddd4",
      frontage: "west",
    },
  },
  {
    block: "Q3",
    parcel: [100.2, 119.6, 110, 127.2],
    pool: true,
    house: {
      center: [104.4, 123.5],
      size: [6.4, 6.4],
      typology: "flat-modern",
      storeys: 1,
      roof: PALE.white,
      frontage: "west",
    },
  },
  {
    block: "Q3",
    parcel: [110.2, 119.6, 123.3, 128.4],
    house: {
      center: [115.4, 124.2],
      size: [7.4, 6.8],
      typology: "hip-villa",
      storeys: 1,
      roof: "#5f6566",
      frontage: "east",
    },
  },
  {
    block: "Q3",
    parcel: [87, 127.4, 110, 135.2],
    pool: true,
    house: {
      center: [101, 130.7],
      size: [16.6, 5.8],
      typology: "long-shed",
      storeys: 1,
      roof: "#6e3b35",
      frontage: "west",
    },
  },
  {
    block: "Q3",
    parcel: [110.2, 128.6, 123.3, 143.2],
    ground: "lawn",
    trees: [
      [114, 132.6],
      [119.4, 136],
      [114.4, 139.8],
    ],
  },
  {
    block: "Q3",
    parcel: [87, 135.4, 110, 142.8],
    house: {
      center: [99.6, 139.1],
      size: [15, 6],
      typology: "hip-villa",
      storeys: 1,
      roof: "#96634a",
      frontage: "west",
    },
  },
  {
    block: "Q3",
    parcel: [87, 143, 108, 151],
    pool: true,
    house: {
      center: [93.4, 147],
      size: [8, 7.2],
      typology: "hip-villa",
      storeys: 1,
      roof: "#d08e70",
      frontage: "west",
    },
  },
  {
    block: "Q3",
    parcel: [108.2, 143.4, 123.3, 151],
    house: {
      center: [118.2, 147.3],
      size: [8.8, 6.2],
      typology: "hip-villa",
      storeys: 1,
      roof: TILE.salmon,
      frontage: "east",
    },
  },

  // Q4: single row east of Rua Fenasoja, up to the main-gate alignment.
  { block: "Q4", parcel: [129.4, 104.7, 146, 109.6], ground: "lawn" },
  {
    block: "Q4",
    parcel: [129.4, 109.8, 146, 117.6],
    pool: true,
    house: {
      center: [139.4, 113.4],
      size: [10.4, 6],
      typology: "flat-modern",
      storeys: 1,
      roof: "#d9d9d2",
      frontage: "west",
    },
  },
  {
    block: "Q4",
    parcel: [129.4, 117.8, 146, 125.2],
    pool: true,
    house: {
      center: [137.2, 121.5],
      size: [6.6, 6.4],
      typology: "split-level",
      storeys: 2,
      roof: "#ecebe4",
      wall: "#efede5",
      frontage: "west",
    },
  },
  {
    block: "Q4",
    parcel: [129.4, 125.4, 146, 130.4],
    house: {
      center: [138, 127.9],
      size: [8, 4.2],
      typology: "gable",
      storeys: 1,
      roof: "#c2a283",
      frontage: "west",
    },
  },
  {
    block: "Q4",
    parcel: [129.4, 130.6, 146, 137.6],
    pool: true,
    house: {
      center: [139.6, 134],
      size: [10, 6],
      typology: "hip-villa",
      storeys: 1,
      roof: "#c99a78",
      frontage: "west",
    },
  },
  {
    block: "Q4",
    parcel: [129.4, 137.8, 146, 144.2],
    pool: true,
    house: {
      center: [136.2, 141.1],
      size: [6.2, 5.6],
      typology: "hip-villa",
      storeys: 1,
      roof: "#5b4038",
      frontage: "west",
    },
  },
  {
    block: "Q4",
    parcel: [129.4, 144.4, 146, 151],
    pool: true,
    house: {
      center: [137.8, 147.8],
      size: [10.4, 5.8],
      typology: "flat-modern",
      storeys: 1,
      roof: "#e2e0d8",
      frontage: "west",
    },
  },

  // E: institutional volume on its paved yard, east of the gate alignment.
  {
    block: "E",
    parcel: [148.6, 107.2, 166, 133.4],
    ground: "paved",
    house: {
      center: [156.6, 123.8],
      size: [12, 11.2],
      typology: "shed",
      storeys: 2,
      roof: "#d3cbb9",
      wall: "#dcd6c8",
      frontage: "avenue",
    },
  },

  // W: tapered block between the avenue, Rua Campeira and the Tuparendi
  // diagonal. Envelopes are clipped against the diagonal corridor.
  {
    block: "W",
    parcel: [-34, 104.6, -19.8, 119],
    pool: true,
    house: {
      center: [-25.4, 107.4],
      size: [7.4, 5.2],
      typology: "hip-villa",
      storeys: 1,
      roof: "#7d3d36",
      frontage: "avenue",
    },
  },
  {
    block: "W",
    parcel: [-19.6, 104.6, -17.1, 118.4],
    ground: "paved",
    house: {
      center: [-18.35, 111.5],
      size: [1.9, 12.4],
      typology: "shed",
      storeys: 1,
      roof: "#3f4345",
      frontage: "avenue",
    },
  },
  { block: "W", parcel: [-16.9, 104.6, -10.8, 118.4], ground: "beds" },
  { block: "W", parcel: [-10.6, 105.6, -3.6, 118.4], ground: "soil" },
] as const;

/** Tree mass that fills the wedge between Rua Campeira and the diagonal. */
export const WEDGE_GROVE: readonly (readonly [number, number])[] = [
  [-20.6, 122.2],
  [-16.8, 121.4],
  [-13, 122],
  [-9.2, 121.2],
  [-5.6, 121.8],
  [-17.6, 125.4],
  [-13.8, 125.8],
  [-10, 125],
  [-6.2, 125.6],
  [-13.6, 129.4],
  [-9.8, 129],
  [-6, 129.6],
  [-10.4, 132.8],
  [-6.4, 133.4],
  [-8.2, 136.6],
  [-4.9, 137.4],
  [-5, 141],
];
