import type { Point } from "./data/territory";

/** Selected OpenStreetMap facts aligned to the approved schematic; not cadastral/GIS. */
const OSM_NODES: Record<string, Point> = {
  "11478911847": [-54.4766566, -27.8477735],
  "5489891755": [-54.4795974, -27.8432849],
  "5489891756": [-54.4791388, -27.8441621],
  "5489891757": [-54.4765824, -27.8478655],
  "5489891758": [-54.4765314, -27.8478976],
  "5489900217": [-54.4783634, -27.8473213],
  "5489900218": [-54.4773938, -27.8468588],
  "5489900219": [-54.4777814, -27.8470379],
  "5489900220": [-54.4781287, -27.8472098],
  "5489902830": [-54.4783268, -27.8437524],
  "5489902831": [-54.4779624, -27.8443555],
  "5489902832": [-54.4774443, -27.8451137],
  "5489902833": [-54.4770006, -27.8457084],
  "5489904078": [-54.4774245, -27.8451403],
  "5489904079": [-54.4782789, -27.8455212],
  "5492052117": [-54.4787657, -27.8447587],
  "7402400633": [-54.477507, -27.8466946],
  "7402400647": [-54.4794792, -27.8435776],
  "7402400648": [-54.4787121, -27.8431982],
  "8787950880": [-54.4790927, -27.8476932],
  "2132115237": [-54.4764496, -27.8433274],
  "2132115242": [-54.4755833, -27.8482464],
  "2132115246": [-54.4765388, -27.8452799],
  "2132115251": [-54.4750185, -27.8454329],
  "2132115254": [-54.4770156, -27.8445405],
  "2132115382": [-54.4760976, -27.8459991],
  "2132115475": [-54.4755104, -27.8447839],
  "2132115497": [-54.4759774, -27.8440322],
  "2470629442": [-54.4777125, -27.8434439],
  "2984819505": [-54.4774715, -27.843806],
  "4596413453": [-54.476302, -27.8451687],
  "6770753557": [-54.4757818, -27.8464675],
  "6873632512": [-54.4746347, -27.844695],
  "7776424467": [-54.4758216, -27.8479571],
  "7776424468": [-54.4758446, -27.8479823],
  "7776424469": [-54.4758572, -27.8480127],
  "7776424470": [-54.4758579, -27.848045],
  "7776424471": [-54.4756617, -27.8480936],
  "7776424472": [-54.4756432, -27.8480654],
  "7776424473": [-54.4756362, -27.8480334],
  "7776424474": [-54.4756413, -27.8480012],
  "7776424475": [-54.4758468, -27.8480758],
  "7776424476": [-54.475825, -27.8481018],
  "7776424477": [-54.4757949, -27.8481201],
  "7776424478": [-54.4757597, -27.8481288],
  "7776424479": [-54.4757232, -27.848127],
  "7776424480": [-54.4756893, -27.8481148],
  "7776424481": [-54.475658, -27.8479722],
  "7776424482": [-54.4756845, -27.8479495],
  "7776424483": [-54.4757179, -27.8479358],
  "7776424484": [-54.4757546, -27.8479324],
  "7776480386": [-54.4755484, -27.8477653],
  "7776485885": [-54.4757904, -27.8479398],
  "7776485886": [-54.4755403, -27.8473476],
  "7776485887": [-54.4755391, -27.847481],
  "7776485898": [-54.4756499, -27.8467157],
  "7776485899": [-54.475697, -27.8467362],
  "7776485900": [-54.475734, -27.846769],
  "7776485901": [-54.4757572, -27.8468106],
  "7776485902": [-54.4757638, -27.8468566],
  "7776485903": [-54.4755862, -27.8469922],
  "7776485904": [-54.4755351, -27.8469795],
  "7776485905": [-54.4754916, -27.8469527],
  "7776485906": [-54.4754604, -27.8469148],
  "7776485907": [-54.4754448, -27.84687],
  "7776485908": [-54.4757534, -27.846902],
  "7776485909": [-54.4757269, -27.846942],
  "7776485910": [-54.4756872, -27.8469723],
  "7776485911": [-54.4756385, -27.8469897],
  "7776485912": [-54.4754466, -27.8468231],
  "7776485913": [-54.4754657, -27.8467793],
  "7776485914": [-54.4754998, -27.8467434],
  "7776485915": [-54.4755454, -27.8467194],
  "7776485916": [-54.4755973, -27.8467098],
  "7776485917": [-54.4755065, -27.8465653],
  "7776485919": [-54.4752708, -27.8459706],
  "7776485920": [-54.4758597, -27.8466158],
  "7776485927": [-54.4750777, -27.8455437],
  "7776485934": [-54.4763196, -27.8479367],
  "7776485935": [-54.4760784, -27.8479576],
  "8787950866": [-54.4759252, -27.8463145],
  "8787950879": [-54.4764624, -27.8479183],
  "8811500794": [-54.4758179, -27.8467029],
  "8822915998": [-54.4755411, -27.8475432],
  "14073468107": [-54.4755903, -27.8483253],
  "14102589768": [-54.4757273, -27.8465525],
};

export const REFERENCE_WAYS: Record<string, { nodes: string[]; tags: Record<string, string> }> = {
  "571136683": {
    nodes: [
      "5489891755",
      "7402400647",
      "5489891756",
      "5492052117",
      "5489904079",
      "7402400633",
      "5489900218",
      "11478911847",
      "5489891757",
      "5489891758",
      "8787950879",
    ],
    tags: { access: "destination", highway: "unclassified", name: "Rua Brasil" },
  },
  "571138889": {
    nodes: ["5489900218", "5489900219", "5489900220", "5489900217", "8787950880"],
    tags: {
      access: "destination",
      highway: "service",
      name: "Rua Buenos Aires",
      service: "driveway",
    },
  },
  "571138892": {
    nodes: ["7402400648", "5489902830", "5489902831", "5489902832", "5489904078", "5489902833"],
    tags: { access: "destination", highway: "service", name: "Rua Argentina", service: "driveway" },
  },
  "203230163": {
    nodes: ["2132115251", "2132115382"],
    tags: {
      highway: "residential",
      name: "Rua Campeira",
    },
  },
  "203230168": {
    nodes: ["2132115237", "2984819505"],
    tags: {
      highway: "residential",
      name: "Rua Fenasoja",
      noexit: "yes",
    },
  },
  "203230194": {
    nodes: ["2132115497", "2132115254"],
    tags: {
      highway: "residential",
      name: "Rua 10 de Agosto",
      noexit: "yes",
    },
  },
  "203230209": {
    nodes: ["2132115475", "4596413453", "2132115246"],
    tags: {
      highway: "residential",
      lanes: "2",
      maxspeed: "40",
      name: "Rua Musicanto",
      noexit: "yes",
      surface: "asphalt",
    },
  },
  "203230187": {
    nodes: ["7776485917", "7776485919", "7776485927", "2132115251", "6873632512"],
    tags: {
      highway: "secondary",
      name: "Avenida Tuparendi",
      oneway: "no",
    },
  },
  "447054088": {
    nodes: ["14073468107", "2132115242", "7776480386", "8822915998", "7776485887", "7776485886"],
    tags: {
      highway: "secondary",
      name: "Avenida Tuparendi",
      oneway: "no",
    },
  },
  "953262435": {
    nodes: ["8787950866", "2132115382", "2132115246", "2132115254", "2984819505", "2470629442"],
    tags: {
      access: "yes",
      highway: "residential",
      name: "Avenida Benvenuto de Conti",
      oneway: "no",
      surface: "asphalt",
    },
  },
  "1553497179": {
    nodes: ["7776485898", "14102589768", "6770753557", "8787950866"],
    tags: {
      access: "yes",
      highway: "residential",
      name: "Avenida Benvenuto de Conti",
      oneway: "yes",
      surface: "asphalt",
    },
  },
  "1553497180": {
    nodes: ["8787950866", "7776485920", "8811500794", "7776485901"],
    tags: {
      highway: "residential",
      oneway: "yes",
    },
  },
  "949273418": {
    nodes: [
      "7776485916",
      "7776485898",
      "7776485899",
      "7776485900",
      "7776485901",
      "7776485902",
      "7776485908",
      "7776485909",
      "7776485910",
    ],
    tags: {
      highway: "secondary",
      oneway: "yes",
    },
  },
  "833033189": {
    nodes: [
      "7776485910",
      "7776485911",
      "7776485903",
      "7776485904",
      "7776485905",
      "7776485906",
      "7776485907",
      "7776485912",
      "7776485913",
      "7776485914",
      "7776485915",
      "7776485916",
    ],
    tags: {
      highway: "secondary",
      oneway: "yes",
    },
  },
  "833033190": {
    nodes: ["7776485913", "7776485917"],
    tags: {
      highway: "secondary",
      oneway: "yes",
    },
  },
  "833033191": {
    nodes: ["7776485910", "7776485886"],
    tags: {
      highway: "secondary",
      oneway: "yes",
    },
  },
  "891242797": {
    nodes: ["7776485886", "7776485906"],
    tags: {
      highway: "secondary",
      oneway: "yes",
    },
  },
  "891242798": {
    nodes: ["7776485917", "7776485916"],
    tags: {
      highway: "secondary",
      oneway: "yes",
    },
  },
  "833033188": {
    nodes: [
      "7776424481",
      "7776424482",
      "7776424483",
      "7776424484",
      "7776485885",
      "7776424467",
      "7776424468",
      "7776424469",
      "7776424470",
      "7776424475",
      "7776424476",
      "7776424477",
      "7776424478",
      "7776424479",
      "7776424480",
      "7776424471",
      "7776424472",
      "7776424473",
      "7776424474",
      "7776424481",
    ],
    tags: {
      highway: "living_street",
      oneway: "yes",
    },
  },
  "833033345": {
    nodes: ["7776480386", "7776424481"],
    tags: {
      highway: "living_street",
    },
  },
  "833033346": {
    nodes: ["2132115242", "7776424480"],
    tags: {
      highway: "living_street",
    },
  },
  "833033192": {
    nodes: ["7776424467", "7776485935"],
    tags: {
      access: "yes",
      highway: "unclassified",
      oneway: "yes",
    },
  },
  "953224598": {
    nodes: ["7776485935", "7776424475"],
    tags: {
      access: "yes",
      highway: "unclassified",
      oneway: "yes",
    },
  },
  "1553497181": {
    nodes: ["8787950879", "7776485934", "7776485935"],
    tags: {
      access: "yes",
      highway: "unclassified",
      name: "Rua Brasil",
    },
  },
};

const ANCHOR_ID = "2470629442";
const CAMPEIRA_BENVENUTO_ID = "2132115382";
const ANCHOR_WORLD: Point = [143.9, 98.175];
const RADIANS = Math.PI / 180;
const METRES_PER_RADIAN = 6378137;
const referenceScale = 0.195;
const anchor = OSM_NODES[ANCHOR_ID];
const longitudeScale = Math.cos(anchor[1] * RADIANS);
function localMetres(id: string): Point {
  const node = OSM_NODES[id];
  if (!node) throw new Error(`Missing selected OSM node ${id}`);
  return [
    (node[0] - anchor[0]) * RADIANS * METRES_PER_RADIAN * longitudeScale,
    (node[1] - anchor[1]) * RADIANS * METRES_PER_RADIAN,
  ];
}
const cam = localMetres(CAMPEIRA_BENVENUTO_ID);
const measuredAnchorDistance = Math.hypot(...cam);
const unitsPerMetre = (referenceScale * 760) / measuredAnchorDistance;
const u: Point = [-cam[0] / measuredAnchorDistance, -cam[1] / measuredAnchorDistance];
const v: Point = [u[1], -u[0]];
export function projectReferenceNode(id: string): Point {
  const [east, north] = localMetres(id);
  return [
    ANCHOR_WORLD[0] + (east * u[0] + north * u[1]) * unitsPerMetre,
    ANCHOR_WORLD[1] + (east * v[0] + north * v[1]) * unitsPerMetre,
  ];
}

/** Least-squares circle from the two circular carriageway arcs only, excluding
 * entry/exit slip roads. Centring improves numerical conditioning. */
function fitCircle(points: readonly Point[]) {
  const mean: Point = [
    points.reduce((sum, p) => sum + p[0], 0) / points.length,
    points.reduce((sum, p) => sum + p[1], 0) / points.length,
  ];
  const local = points.map(([x, z]): Point => [x - mean[0], z - mean[1]]);
  const m = Array.from({ length: 3 }, (_, row) => [
    ...Array.from({ length: 3 }, (_, col) =>
      local.reduce((sum, [x, z]) => sum + [x, z, 1][row] * [x, z, 1][col], 0),
    ),
    -local.reduce((sum, [x, z]) => sum + [x, z, 1][row] * (x * x + z * z), 0),
  ]);
  for (let pivot = 0; pivot < 3; pivot++) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row++)
      if (Math.abs(m[row][pivot]) > Math.abs(m[best][pivot])) best = row;
    [m[pivot], m[best]] = [m[best], m[pivot]];
    if (Math.abs(m[pivot][pivot]) < 1e-10) throw new Error("Degenerate OSM circular arcs");
    const divisor = m[pivot][pivot];
    m[pivot] = m[pivot].map((value) => value / divisor);
    for (let row = 0; row < 3; row++) {
      if (row === pivot) continue;
      const multiplier = m[row][pivot];
      m[row] = m[row].map((value, col) => value - multiplier * m[pivot][col]);
    }
  }
  const [d, e, f] = m.map((row) => row[3]);
  const center: Point = [mean[0] - d / 2, mean[1] - e / 2];
  const centerlineRadius = Math.sqrt((d * d + e * e) / 4 - f);
  return {
    center,
    centerlineRadius,
    maximumResidual: Math.max(
      ...points.map(([x, z]) =>
        Math.abs(Math.hypot(x - center[0], z - center[1]) - centerlineRadius),
      ),
    ),
  };
}
const roundaboutNodeIds = [
  ...new Set([...REFERENCE_WAYS["949273418"].nodes, ...REFERENCE_WAYS["833033189"].nodes]),
];
const fittedRoundabout = fitCircle(roundaboutNodeIds.map(projectReferenceNode));
const secondaryNodeIds = [...new Set(REFERENCE_WAYS["833033188"].nodes)];
const fittedSecondary = fitCircle(secondaryNodeIds.map(projectReferenceNode));
export const URBAN_REFERENCE = {
  avenueNorth: 93.3,
  avenueSouth: 103.05,
  avenueCenter: ANCHOR_WORLD[1],
  center: ANCHOR_WORLD[1],
  referenceScale,
  unitsPerMetre,
  anchor: { nodeId: ANCHOR_ID, world: ANCHOR_WORLD },
  axis: { u, v, measuredAnchorDistanceMetres: measuredAnchorDistance },
  roundabout: { ...fittedRoundabout, nodeIds: roundaboutNodeIds, roadWidth: 4.2 },
  secondaryJunction: {
    ...fittedSecondary,
    radius: fittedSecondary.centerlineRadius,
    roadWidth: 3.6,
    sourceWayIds: ["833033188"],
    nodeIds: secondaryNodeIds,
    path: REFERENCE_WAYS["833033188"].nodes.map(projectReferenceNode),
    evidence: {
      osmFeature: "closed living_street with oneway=yes",
      junctionRoundaboutTag: false,
      miniRoundaboutTag: false,
      gateMapped: false,
      secondaryGateSource: "human-indicated; placement approximate near Rua Brasil access",
      mappedMainGateNodeId: "2470629442",
    },
  },
} as const;

export type ReferenceRoad = {
  id: string;
  name: string;
  sourceWayIds: string[];
  sourceNodeIds: string[];
  path: Point[];
  width: number;
  connects: string[];
  terminal: boolean;
  terminalNodeId?: string;
  pedestrian?: boolean;
  clipping?: { maxX: number; minZ: number };
};
const fromNodes = (
  id: string,
  name: string,
  sourceWayIds: string[],
  sourceNodeIds: string[],
  width: number,
  connects: string[],
  terminal = false,
): ReferenceRoad => ({
  id,
  name,
  sourceWayIds,
  sourceNodeIds,
  path: sourceNodeIds.map(projectReferenceNode),
  width,
  connects,
  terminal,
  ...(terminal ? { terminalNodeId: sourceNodeIds.at(-1) } : {}),
});
/** Keep only the supplied western approach and a finite neighbourhood of the
 * second junction. Intersections are linearly interpolated in world units;
 * commercial protected polygons remain the stronger clipping boundary. */
const APPROACH_CLIP = { maxX: 5.8, minZ: fittedSecondary.center[1] - 100 };
function clipApproach(path: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    let enter = 0,
      leave = 1;
    for (const [value, delta, maximum] of [
      [a[0], b[0] - a[0], APPROACH_CLIP.maxX],
      [-a[1], a[1] - b[1], -APPROACH_CLIP.minZ],
    ]) {
      if (Math.abs(delta) < 1e-12) {
        if (value > maximum) leave = -1;
      } else if (delta > 0) leave = Math.min(leave, (maximum - value) / delta);
      else enter = Math.max(enter, (maximum - value) / delta);
    }
    if (enter > leave) continue;
    const point = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const start = point(enter),
      end = point(leave);
    if (
      !result.length ||
      Math.hypot(result.at(-1)![0] - start[0], result.at(-1)![1] - start[1]) > 1e-8
    )
      result.push(start);
    if (Math.hypot(start[0] - end[0], start[1] - end[1]) > 1e-8) result.push(end);
  }
  return result;
}
const westernApproaches: ReferenceRoad[] = [
  ["park-brasil", "571136683", 4.2, ["brasil-access", "park-buenos-aires"]],
  ["park-buenos-aires", "571138889", 4.0, ["park-brasil"]],
].map(([id, wayId, width, connects]) => {
  const source = REFERENCE_WAYS[wayId as string];
  const pedestrian = ["footway", "pedestrian", "path"].includes(source.tags.highway);
  return {
    ...fromNodes(
      id as string,
      source.tags.name,
      [wayId as string],
      source.nodes,
      pedestrian ? 2.0 : (width as number),
      connects as string[],
    ),
    path: clipApproach(source.nodes.map(projectReferenceNode)),
    pedestrian,
    clipping: APPROACH_CLIP,
  };
});
/** Verified OSM road, omitted rather than inventing a western continuation. */
export const REFERENCE_EXCLUSIONS = [
  {
    id: "park-argentina",
    name: "Rua Argentina",
    sourceWayIds: ["571138892"],
    reason: "All supplied source nodes lie east of maxX=5.8; no western approach is mapped.",
    sourcePath: REFERENCE_WAYS["571138892"].nodes.map(projectReferenceNode),
  },
];
export const REFERENCE_ROADS: ReferenceRoad[] = [
  ...westernApproaches,

  ...[
    ["fenasoja", "203230168"],
    ["musicanto", "203230209"],
    ["10-de-agosto", "203230194"],
  ].map(([id, way]) =>
    fromNodes(
      id,
      REFERENCE_WAYS[way].tags.name,
      [way],
      [...REFERENCE_WAYS[way].nodes].reverse(),
      5.8,
      ["benvenuto"],
      true,
    ),
  ),
  fromNodes(
    "campeira",
    "Rua Campeira",
    ["203230163"],
    [...REFERENCE_WAYS["203230163"].nodes].reverse(),
    5.8,
    ["benvenuto", "tuparendi"],
  ),
  {
    ...fromNodes(
      "benvenuto-approach",
      "Avenida Benvenuto de Conti",
      ["953262435", "1553497179"],
      ["2132115382", "8787950866", "6770753557", "14102589768", "7776485898"],
      9.75,
      ["benvenuto", "campeira", "roundabout"],
    ),
    path: [
      [26.36, ANCHOR_WORLD[1]],
      ...["2132115382", "8787950866", "6770753557", "14102589768", "7776485898"].map(
        projectReferenceNode,
      ),
    ],
  },
  fromNodes(
    "tuparendi",
    "Avenida Tuparendi",
    ["833033190", "203230187"],
    ["7776485913", ...REFERENCE_WAYS["203230187"].nodes],
    6.4,
    ["roundabout", "campeira"],
  ),
  fromNodes(
    "tuparendi-southwest",
    "Avenida Tuparendi",
    ["833033191", "447054088"],
    ["7776485910", ...[...REFERENCE_WAYS["447054088"].nodes].reverse()],
    6.4,
    ["roundabout", "secondary-roundabout"],
  ),
  fromNodes(
    "secondary-tuparendi-east",
    "Acesso Tuparendi",
    ["833033345"],
    REFERENCE_WAYS["833033345"].nodes,
    4.0,
    ["tuparendi-southwest", "secondary-roundabout"],
  ),
  fromNodes(
    "secondary-tuparendi-west",
    "Acesso Tuparendi",
    ["833033346"],
    REFERENCE_WAYS["833033346"].nodes,
    4.0,
    ["tuparendi-southwest", "secondary-roundabout"],
  ),
  fromNodes(
    "brasil-access",
    "Rua Brasil",
    ["1553497181", "953224598"],
    [...REFERENCE_WAYS["1553497181"].nodes, "7776424475"],
    4.2,
    ["brasil-return", "secondary-roundabout"],
  ),
  fromNodes(
    "brasil-return",
    "Acesso Rua Brasil",
    ["833033192"],
    REFERENCE_WAYS["833033192"].nodes,
    3.4,
    ["brasil-access", "secondary-roundabout"],
  ),
];

function corridor(a: Point, b: Point, width: number): Point[] {
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = ((b[0] - a[0]) * 2.5) / distance;
  const dz = ((b[1] - a[1]) * 2.5) / distance;
  const nx = (-(b[1] - a[1]) * width) / (2 * distance);
  const nz = ((b[0] - a[0]) * width) / (2 * distance);
  return [
    [a[0] - dx + nx, a[1] - dz + nz],
    [b[0] + dx + nx, b[1] + dz + nz],
    [b[0] + dx - nx, b[1] + dz - nz],
    [a[0] - dx - nx, a[1] - dz - nz],
  ];
}
const deadEndPaths = REFERENCE_ROADS.filter((road) => road.terminal).flatMap((road) => road.path);
const residentialMinX = Math.min(
  projectReferenceNode(CAMPEIRA_BENVENUTO_ID)[0],
  ...deadEndPaths.map((p) => p[0]),
);
const residentialMaxX = Math.max(...deadEndPaths.map((p) => p[0]));
const residentialMaxZ = Math.max(...deadEndPaths.map((p) => p[1]));
export const RESIDENTIAL_REFERENCE_BOUNDS = {
  minX: residentialMinX,
  minY: URBAN_REFERENCE.avenueSouth,
  maxX: residentialMaxX,
  maxY: residentialMaxZ,
} as const;
export const EXPLORATION_POLYGONS: Point[][] = [
  ...REFERENCE_ROADS.flatMap((road) =>
    road.path.slice(1).map((point, i) => corridor(road.path[i], point, road.width + 5)),
  ),
  Array.from({ length: 40 }, (_, i): Point => [
    fittedRoundabout.center[0] +
      Math.cos((2 * Math.PI * i) / 40) * (fittedRoundabout.centerlineRadius + 4.5),
    fittedRoundabout.center[1] +
      Math.sin((2 * Math.PI * i) / 40) * (fittedRoundabout.centerlineRadius + 4.5),
  ]),
  Array.from({ length: 40 }, (_, i): Point => [
    fittedSecondary.center[0] +
      Math.cos((2 * Math.PI * i) / 40) * (fittedSecondary.centerlineRadius + 4.0),
    fittedSecondary.center[1] +
      Math.sin((2 * Math.PI * i) / 40) * (fittedSecondary.centerlineRadius + 4.0),
  ]),
  [
    [residentialMinX, URBAN_REFERENCE.avenueSouth],
    [residentialMaxX, URBAN_REFERENCE.avenueSouth],
    [residentialMaxX, residentialMaxZ],
    [residentialMinX, residentialMaxZ],
  ],
];

export const URBAN_REFERENCE_PROVENANCE = {
  attribution: "© OpenStreetMap contributors",
  license: "ODbL 1.0",
  licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  copyrightUrl: "https://www.openstreetmap.org/copyright",
  retrievedAtUtc: "2026-10-18T01:39:41.017504Z",
  sourceFile: "streetmap.osm",
  downloadUrl: "https://api.openstreetmap.org/api/0.6/map?bbox=-54.487,-27.852,-54.474,-27.842",
  bounds: { minLat: -27.852, minLon: -54.487, maxLat: -27.842, maxLon: -54.474 },
  wayUrls: Object.keys(REFERENCE_WAYS).map((id) => `https://www.openstreetmap.org/way/${id}`),
  nodeUrls: Object.keys(OSM_NODES).map((id) => `https://www.openstreetmap.org/node/${id}`),
  approximation:
    "Local planar alignment to schematic coordinates; widths are presentation calibration, not OSM lane measurements or cadastral boundaries. Selected NE/SW extents only.",
} as const;
