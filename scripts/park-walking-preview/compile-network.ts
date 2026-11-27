// Offline compiler for the preview only. See docs/navegar-parque.md.
import { writeFileSync } from "node:fs";
import { WALKING_CORRIDORS } from "./corridors";
import type { Point } from "../../src/features/commercial-map/data/territory";
import { auditParkConnectivity } from "../../src/features/commercial-map/parkConnectivity";
import { PARK_CORE_ENTITIES } from "../../src/features/commercial-map/permanentParkLayout";
import { pointInPolygon } from "../../src/features/commercial-map/geometry";
import {
  referenceMetresToScene,
  sceneToReferenceMetres,
} from "../../src/features/commercial-map/urbanReference";
import {
  distance,
  lengthOf,
  walkingDistances,
  projectOnPath,
  interpolate,
  type WalkingNetwork,
} from "../../src/features/commercial-map/walking/network";

const { previewPaths: samples, verifyPreviewPath } = auditParkConnectivity([], true);
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
  revision: "2027-cobertura-em-revisao.2",
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
// The audit paths certify coverage from one root. The registered axes add
// continuous streets between those branches and share the actual intersections.
const vertices = [...walkNodes].map(([key, id]) => ({ id, point: cells.get(key)!.point }));
const streetKey = ([x, z]: Point) => `${Number(x.toFixed(6))},${Number(z.toFixed(6))}`;
const existingVertex = new Map(vertices.map(({ id, point }) => [streetKey(point), id]));
function addEdge(
  from: string,
  to: string,
  path: Point[],
  options: { corridor?: string; connector?: boolean } = {},
) {
  if (from === to) return;
  const metric = path.map(sceneToReferenceMetres);
  const id = [options.corridor ?? (options.connector ? "link" : "street"), keyFor(from, to)].join(
    "/",
  );
  if (edges.some((edge) => edge.id === id)) return;
  edges.push({
    id,
    from,
    to,
    path: metric,
    metres: lengthOf(metric),
    access: "open",
    steps: "unknown",
    ...options,
  });
}
function streetNode(point: Point, label: string) {
  const key = streetKey(point);
  const existing = existingVertex.get(key);
  if (existing) return existing;
  const id = `corridor:${key}`;
  if (!network.nodes[id])
    network.nodes[id] = { point: sceneToReferenceMetres(point), label, kind: "junction" };
  return id;
}
const originalEdges = [...edges];
const sections = WALKING_CORRIDORS.flatMap(({ id, label, points }) =>
  points.slice(1).map((point, i) => {
    const path = [points[i], point];
    if (!verifyPreviewPath(path).supported)
      throw Error(`Unsupported ${id} section ${path.join(" → ")}`);
    return { id, label, path, attachments: [] as typeof vertices };
  }),
);
let directAccesses = 0;
for (const vertex of vertices) {
  const sectionsByDistance = sections
    .map((section) => ({
      section,
      ...projectOnPath(vertex.point, section.path),
    }))
    .filter(({ offset }) => offset <= 3)
    .sort((a, b) => a.offset - b.offset);
  for (const { section, point, offset } of sectionsByDistance) {
    if (offset < 1e-8) {
      section.attachments.push(vertex);
      break;
    }
    if (!verifyPreviewPath([vertex.point, point]).supported) continue;
    const id = streetNode(point, section.label);
    section.attachments.push({ id, point });
    addEdge(vertex.id, id, [vertex.point, point], { connector: true });
    directAccesses++;
    break;
  }
}
for (const { id: corridor, label, path, attachments } of sections) {
  const [from, to] = path;
  const ordered = [
    { id: streetNode(from, label), point: from },
    ...attachments,
    { id: streetNode(to, label), point: to },
  ].sort((a, b) => distance(from, a.point) - distance(from, b.point));
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1],
      b = ordered[i];
    addEdge(a.id, b.id, [a.point, b.point], { corridor });
  }
}

// The original coverage paths often run parallel to the registered street.
// Suppress duplicate GPS candidates only where there is an audited join.
for (const edge of originalEdges) {
  const coverage: NonNullable<(typeof edge)["axisCoverage"]> = [];
  let chainage = 0;
  for (let i = 1; i < edge.path.length; i++) {
    const a = edge.path[i - 1],
      b = edge.path[i];
    const span = distance(a, b);
    const pieces = Math.ceil(span / 2);
    for (let j = 0; j < pieces; j++) {
      const from = chainage + (span * j) / pieces;
      const to = chainage + (span * (j + 1)) / pieces;
      const probes = [j, j + 0.5, j + 1].map((piece) =>
        referenceMetresToScene(interpolate(a, b, piece / pieces)),
      );
      const best = WALKING_CORRIDORS.map((street) => ({
        id: street.id,
        middle: projectOnPath(probes[1], street.points),
        points: street.points,
      }))
        .sort((a, b) => a.middle.offset - b.middle.offset)
        .find(
          (street) =>
            street.middle.offset <= 3 &&
            probes.every((probe) => {
              const { point, offset } = projectOnPath(probe, street.points);
              return offset <= 3 && verifyPreviewPath([probe, point]).supported;
            }),
        );
      if (!best) continue;
      const preceding = coverage.at(-1);
      if (preceding?.corridor === best.id && Math.abs(preceding.to - from) < 1e-7)
        preceding.to = to;
      else coverage.push({ corridor: best.id, from, to });
    }
    chainage += span;
  }
  if (coverage.length) edge.axisCoverage = coverage;
}

// Reconnect remaining branches outside the main streets wherever an audited
// chord eliminates a significant detour. Recheck the gain as links are added.
const connections = [];
for (const [index, from] of vertices.entries()) {
  const distances = walkingDistances(network, { node: from.id });
  for (const to of vertices.slice(index + 1)) {
    const gap = distance(from.point, to.point);
    if (gap < 0.12) continue;
    const dx = Math.abs(from.point[0] - to.point[0]);
    const dz = Math.abs(from.point[1] - to.point[1]);
    if (gap > 6 && (gap > 95 || Math.min(dx, dz) > 2.25)) continue;
    const path = [from.point, to.point];
    const metres = distance(network.nodes[from.id].point, network.nodes[to.id].point);
    const existing = distances.get(to.id) ?? Infinity;
    if (existing - metres < Math.max(10, metres * 0.12)) continue;
    connections.push({ from: from.id, to: to.id, path, metres, saving: existing - metres });
  }
}
const costs = new Map<string, ReturnType<typeof walkingDistances>>();
let links = 0;
for (const { from, to, path, metres } of connections.sort((a, b) => b.saving - a.saving)) {
  const distances = costs.get(from) ?? walkingDistances(network, { node: from });
  costs.set(from, distances);
  if ((distances.get(to) ?? Infinity) - metres < Math.max(10, metres * 0.12)) continue;
  if (!verifyPreviewPath(path).supported) continue;
  addEdge(from, to, path, { connector: true });
  links++;
  costs.clear();
}
network.destinations = destinations;
network.starts = [
  "A3-exterior:1",
  "indumoveis:pavilion:1:1",
  "indumoveis:pavilion:12:1",
  "A2:1",
].filter((id) => network.nodes[id]);
const connected = walkingDistances(network, { node: network.starts[0] });
const disconnected = destinations
  .filter((destination) => !destination.entries.some((entry) => connected.has(entry)))
  .map(({ id }) => id);
if (!network.starts.length || disconnected.length)
  throw Error(`Preview without a connected start: ${disconnected.join(", ")}`);
const blocked = edges.filter(
  (edge) => !verifyPreviewPath(edge.path.map(referenceMetresToScene)).supported,
);
if (blocked.length) throw Error(`Unverified edges: ${blocked.map(({ id }) => id).join(", ")}`);
writeFileSync(process.argv[2], JSON.stringify(network) + "\n");
console.log(
  JSON.stringify({
    destinations: destinations.length,
    exits: network.exits?.length,
    edges: edges.length,
    links,
    directAccesses,
    streets: WALKING_CORRIDORS.length,
    pending: samples.filter(({ paths }) => !paths.length).map(({ id }) => id),
  }),
);
