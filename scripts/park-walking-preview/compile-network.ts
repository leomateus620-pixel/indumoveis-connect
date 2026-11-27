// Offline compiler for the preview only. See docs/navegar-parque.md.
import { writeFileSync } from "node:fs";
import type { Point } from "../../src/features/commercial-map/data/territory";
import { auditParkConnectivity } from "../../src/features/commercial-map/parkConnectivity";
import { PARK_CORE_ENTITIES } from "../../src/features/commercial-map/permanentParkLayout";
import { pointInPolygon } from "../../src/features/commercial-map/geometry";
import { sceneToReferenceMetres } from "../../src/features/commercial-map/urbanReference";
import {
  distance,
  lengthOf,
  findWalkingRoute,
  type WalkingNetwork,
} from "../../src/features/commercial-map/walking/network";

const samples = auditParkConnectivity([], true).previewPaths;
const idFor = (point: Point) => point.join(",");
const cells = new Map<string, { point: Point; adjacent: Set<string>; terminal?: string }>();
const at = (point: Point) => {
  const id = idFor(point);
  if (!cells.has(id)) cells.set(id, { point, adjacent: new Set() });
  return cells.get(id)!;
};
const roads = PARK_CORE_ENTITIES.filter((entity) => entity.kind === "road");
const roadLabel = (point: Point) =>
  roads.find((road) => pointInPolygon(point, road.polygon))?.label ?? "";
const network: WalkingNetwork = {
  editionYear: 2027,
  revision: "2027-cobertura-em-revisao.1",
  validation: "preview",
  speedMps: 1.25,
  nodes: {},
  edges: [],
  destinations: [],
  starts: [],
  exits: ["A3-exterior:1", "A2:1"],
};
const edges: (typeof network.edges)[number][] = [];
const destinations: (typeof network.destinations)[number][] = [];
for (const { id, kind, name, paths } of samples) {
  if (!paths.length || id === "A3") continue;
  const entries = paths.map(({ index, path }) => {
    const terminal = `${id}:${index}`;
    const end = path.at(-1)!;
    at(end).terminal ??= terminal;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if (idFor(a) === idFor(b)) continue;
      at(a).adjacent.add(idFor(b));
      at(b).adjacent.add(idFor(a));
    }
    const nodeId = at(end).terminal!;
    network.nodes[nodeId] = {
      point: sceneToReferenceMetres(end),
      kind: kind === "gate" ? "gate" : kind === "lot" ? "frontage" : "door",
      label:
        kind === "lot"
          ? `Frente externa · ${name}`
          : kind === "gate"
            ? `${name} · acesso em revisão`
            : `${name} · ${index === 1 ? "entrada candidata" : `entrada candidata ${index}`}`,
    };
    return nodeId;
  });
  const destinationId = id === "A3-exterior" ? "indumoveis:support:gate-03" : id;
  destinations.push({ id: destinationId, label: name, entries: [...new Set(entries)] });
}
const walkNodes = new Map<string, string>();
for (const [id, { adjacent, terminal, point }] of cells) {
  if (terminal) walkNodes.set(id, terminal);
  else if (adjacent.size !== 2) {
    const key = `junction:${id}`;
    walkNodes.set(id, key);
    network.nodes[key] = {
      point: sceneToReferenceMetres(point),
      label: roadLabel(point),
      kind: "junction",
    };
  }
}
const seen = new Set<string>();
const keyFor = (a: string, b: string) => [a, b].sort().join("/");
for (const [start, from] of walkNodes) {
  for (const adjacent of cells.get(start)!.adjacent) {
    let last = start,
      current = adjacent;
    if (seen.has(keyFor(last, current))) continue;
    const path: Point[] = [cells.get(last)!.point];
    while (true) {
      seen.add(keyFor(last, current));
      const point = cells.get(current)!.point;
      const prior = path.at(-1)!;
      const before = path.at(-2);
      if (
        before &&
        Math.abs(
          (prior[0] - before[0]) * (point[1] - prior[1]) -
            (prior[1] - before[1]) * (point[0] - prior[0]),
        ) < 1e-9
      )
        path[path.length - 1] = point;
      else path.push(point);
      const to = walkNodes.get(current);
      if (to) {
        const metric = path.map(sceneToReferenceMetres);
        edges.push({
          id: keyFor(from, to),
          from,
          to,
          path: metric,
          metres: lengthOf(metric),
          access: "open",
          steps: "unknown",
        });
        break;
      }
      const next = [...cells.get(current)!.adjacent].find((candidate) => candidate !== last)!;
      last = current;
      current = next;
    }
  }
}
network.edges = edges;
// Add a small number of independently checked connections across junctions.
// Only join different paths when the existing detour is substantial.
const junctions = [...walkNodes].filter(([_, node]) => network.nodes[node].kind === "junction");
const bridges = [];
for (const [index, [aKey, from]] of junctions.entries()) {
  for (const [bKey, to] of junctions.slice(index + 1)) {
    const a = cells.get(aKey)!.point,
      b = cells.get(bKey)!.point;
    const width = distance(a, b);
    if (width < 3 || width > 17 || (Math.abs(a[0] - b[0]) > 1.5 && Math.abs(a[1] - b[1]) > 1.5))
      continue;
    const route = findWalkingRoute(network, { node: from }, { id: to, label: "", entries: [to] });
    const path = [a, b];
    const metres = lengthOf(path.map(sceneToReferenceMetres));
    if (route && route.metres - metres >= 22)
      bridges.push({ from, to, path, gain: route.metres - metres });
  }
}
const candidates = bridges.sort((a, b) => b.gain - a.gain).slice(0, 130);
const proofs = auditParkConnectivity(candidates.map(({ path }) => path)).candidatePaths;
const served = new Set<string>();
candidates.forEach(({ from, to, path }, i) => {
  if (!proofs[i].supported || served.has(from) || served.has(to) || served.size >= 20) return;
  served.add(from);
  served.add(to);
  const metric = path.map(sceneToReferenceMetres);
  edges.push({
    id: keyFor(from, to),
    from,
    to,
    path: metric,
    metres: lengthOf(metric),
    access: "open",
    steps: "unknown",
  });
});
network.destinations = destinations;
network.starts = [
  "A3-exterior:1",
  "indumoveis:pavilion:1:1",
  "indumoveis:pavilion:12:1",
  "A2:1",
].filter((id) => network.nodes[id]);
const disconnected = destinations
  .filter((destination) => !findWalkingRoute(network, { node: network.starts[0] }, destination))
  .map(({ id }) => id);
if (!network.starts.length || disconnected.length)
  throw Error(`Preview without a connected start: ${disconnected.join(", ")}`);
writeFileSync(process.argv[2], JSON.stringify(network) + "\n");
console.log(
  JSON.stringify({
    destinations: destinations.length,
    exits: network.exits?.length,
    edges: edges.length,
    links: served.size / 2,
    pending: samples.filter(({ paths }) => !paths.length).map(({ id }) => id),
  }),
);
