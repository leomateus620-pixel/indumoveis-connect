import type { Point } from "../data/territory";
import { sceneToReferenceMetres } from "../urbanReference";
import { lengthOf, type WalkingEdge, type WalkingNetwork, type WalkingNode } from "./network";

// Candidate centre lines from the A2 paved surfaces, checked in parkConnectivity.test.ts.
// The two door thresholds come from the existing facade probes. See the pilot audit.
const sceneNodes = {
  "gate-03": { point: [149.1042480964776, 95.8], label: "Portão 3 · lado externo", kind: "gate" },
  imigrantes: { point: [146.9042480964776, 95.8], label: "Via dos Imigrantes", kind: "junction" },
  "brasilia-argentina": {
    point: [148.5625, 65.8125],
    label: "Brasília / Argentina",
    kind: "junction",
  },
  "argentina-p12": {
    point: [78.1875, 65.8125],
    label: "Argentina · acesso ao Pavilhão 12",
    kind: "junction",
  },
  "argentina-mercosul": {
    point: [60.1875, 65.8125],
    label: "Argentina / Mercosul",
    kind: "junction",
  },
  "p1-front": {
    point: [60.06665721650226, 60.09357004734268],
    label: "Pavilhão 1 · entrada pela Mercosul",
    kind: "door",
  },
  "p12-front": {
    point: [78.14164218178574, 70.50541947816298],
    label: "Pavilhão 12 · entrada pela Argentina",
    kind: "door",
  },
} satisfies Record<string, WalkingNode>;
type NodeId = keyof typeof sceneNodes;

export const PILOT_SCENE_EDGES: readonly { from: NodeId; to: NodeId; via: Point[] }[] = [
  { from: "gate-03", to: "imigrantes", via: [] },
  {
    from: "imigrantes",
    to: "brasilia-argentina",
    via: [
      [146.9375, 95.8],
      [146.9375, 93.9375],
      [147.3125, 93.9375],
      [147.3125, 92.8125],
      [147.5625, 92.8125],
      [147.5625, 92.6875],
      [148.5625, 92.6875],
    ],
  },
  { from: "brasilia-argentina", to: "argentina-p12", via: [] },
  { from: "argentina-p12", to: "argentina-mercosul", via: [] },
  { from: "argentina-mercosul", to: "p1-front", via: [[60.1875, 60.0625]] },
  { from: "argentina-p12", to: "p12-front", via: [[78.1875, 70.3125]] },
];

export const pilotScenePath = ({ from, to, via }: (typeof PILOT_SCENE_EDGES)[number]) => [
  sceneNodes[from].point,
  ...via,
  sceneNodes[to].point,
];

const nodes = Object.fromEntries(
  Object.entries(sceneNodes).map(([id, node]) => [
    id,
    { ...node, point: sceneToReferenceMetres(node.point) },
  ]),
);
const edges = PILOT_SCENE_EDGES.map((edge): WalkingEdge => {
  const path = pilotScenePath(edge).map(sceneToReferenceMetres);
  return {
    id: `${edge.from}/${edge.to}`,
    from: edge.from,
    to: edge.to,
    path,
    metres: lengthOf(path),
    access: "open",
    steps: "unknown",
  };
});

export const INDOMOVEIS_WALKING_PILOT: WalkingNetwork = {
  editionYear: 2027,
  revision: "2027-piloto-exterior.1",
  validation: "preview",
  speedMps: 1.25,
  nodes,
  edges,
  starts: ["gate-03", "p1-front", "p12-front"],
  exits: ["gate-03"],
  destinations: [
    {
      id: "indumoveis:pavilion:1",
      label: "Pavilhão 1 · Mostra Arq & Design",
      entries: ["p1-front"],
    },
    {
      id: "indumoveis:pavilion:12",
      label: "Pavilhão 12 · Móveis e Seriados",
      entries: ["p12-front"],
    },
    { id: "indumoveis:support:gate-03", label: "Portão 3", entries: ["gate-03"] },
  ],
};

/** Immediate outside approach shown with user consent. Its centre is the
 * verified A3-1 drawing segment; the region is not a street routing network. */
export const GATE_03_APPROACH_METRES = nodes["gate-03"].point;
