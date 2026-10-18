import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENTITIES, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds } from "./geometry";
import {
  EXPLORATION_POLYGONS,
  projectReferenceNode,
  REFERENCE_ROADS,
  REFERENCE_EXCLUSIONS,
  REFERENCE_WAYS,
  URBAN_REFERENCE,
  URBAN_REFERENCE_PROVENANCE,
} from "./urbanReference";

const evidence = JSON.parse(
  readFileSync("docs/validation/commercial-map-realism/streetmap-reference.json", "utf8"),
);
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function haversine(a: Point, b: Point) {
  const r = Math.PI / 180;
  const deltaLat = (b[1] - a[1]) * r;
  const deltaLon = (b[0] - a[0]) * r;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(deltaLon / 2) ** 2;
  return 2 * 6378137 * Math.asin(Math.sqrt(h));
}

describe("selected OpenStreetMap context aligned to the approved schematic", () => {
  it("anchors the shared Brasilia/Imigrantes junction without mutating the commercial source and keeps metric distances under one uniform scale", () => {
    const before = JSON.stringify(ENTITIES);
    const avenue = polygonBounds(
      ENTITIES.find((e) => e.id === "indumoveis:road:benvenuto")!.polygon,
    );
    const anchor = projectReferenceNode("2470629442");
    expect(anchor[0]).toBe(avenue.maxX);
    expect(anchor[1]).toBe((avenue.minY + URBAN_REFERENCE.avenueSouth) / 2);
    expect(evidence.sourceEvidence.nodeHighwayWayIds["2470629442"].sort()).toEqual([
      "953224596",
      "953224597",
      "953262435",
    ]);
    const nodes = evidence.sourceEvidence.selectedNodesLonLat;
    for (const id of ["2132115382", "2132115251", "7776485886", "6873632512"]) {
      const metric = haversine(nodes["2470629442"], nodes[id]);
      expect(
        Math.abs(
          distance(anchor, projectReferenceNode(id)) / URBAN_REFERENCE.unitsPerMetre - metric,
        ),
      ).toBeLessThan(0.02);
    }
    expect(projectReferenceNode("2132115251")[1]).toBeGreaterThan(anchor[1]);
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });

  it("keeps the three verified noexit leaves and their original curved approaches without inventing connections to Tuparendi", () => {
    for (const road of REFERENCE_ROADS.filter((road) => road.terminal)) {
      const way = evidence.sourceEvidence.selectedWays[road.sourceWayIds[0]];
      expect(way.tags.noexit).toBe("yes");
      expect(road.name).toBe(way.tags.name);
      expect(road.sourceNodeIds).toEqual([...way.nodes].reverse());
      expect(evidence.sourceEvidence.nodeHighwayWayIds[road.terminalNodeId!]).toEqual(
        road.sourceWayIds,
      );
      expect(road.connects).toEqual(["benvenuto"]);
      expect(road.path.at(-1)).toEqual(projectReferenceNode(way.nodes[0]));
      expect(road.path.at(-1)![1]).toBeGreaterThan(road.path[0][1]);
    }
    expect(REFERENCE_ROADS.filter((road) => road.terminal)).toHaveLength(3);
    const musicanto = REFERENCE_ROADS.find((road) => road.id === "musicanto")!;
    expect(musicanto.path).toHaveLength(3);
    const [a, bend, b] = musicanto.path;
    expect(
      Math.abs((bend[0] - a[0]) * (b[1] - a[1]) - (bend[1] - a[1]) * (b[0] - a[0])),
    ).toBeGreaterThan(0.01);
  });

  it("connects Campeira at the exact shared OSM nodes and clips both Tuparendi branches to the requested local extent", () => {
    const campeira = REFERENCE_ROADS.find((road) => road.id === "campeira")!;
    const northeast = REFERENCE_ROADS.find((road) => road.id === "tuparendi")!;
    const southwest = REFERENCE_ROADS.find((road) => road.id === "tuparendi-southwest")!;
    expect(campeira.sourceNodeIds).toEqual(["2132115382", "2132115251"]);
    expect(northeast.sourceNodeIds).toContain("2132115251");
    expect(northeast.path).toContainEqual(campeira.path.at(-1));
    expect(northeast.sourceNodeIds.at(-1)).toBe("6873632512");
    expect(southwest.sourceNodeIds[0]).toBe("7776485910");
    expect(southwest.sourceNodeIds.at(-1)).toBe("14073468107");
    expect(southwest.sourceNodeIds).toContain("2132115242");
    expect(southwest.path).toHaveLength(7);
    expect(distance(southwest.path[0], southwest.path.at(-1)!)).toBeLessThan(80);
    const approach = REFERENCE_ROADS.find((road) => road.id === "benvenuto-approach")!;
    expect(approach.sourceNodeIds).toContain("8787950866");
    expect(approach.sourceNodeIds).toContain("14102589768");
    expect(approach.path).toContainEqual(campeira.path[0]);
  });

  it("fits only the original circular arc nodes and keeps exploration corridors over every useful road point", () => {
    const ring = URBAN_REFERENCE.roundabout;
    const arcs = ["949273418", "833033189"].flatMap(
      (id) => evidence.sourceEvidence.selectedWays[id].nodes,
    );
    expect(new Set(ring.nodeIds)).toEqual(new Set(arcs));
    expect(ring.nodeIds).toHaveLength(19);
    expect(ring.nodeIds).not.toContain("7776485917");
    expect(ring.nodeIds).not.toContain("7776485886");
    for (const id of ring.nodeIds)
      expect(
        Math.abs(distance(projectReferenceNode(id), ring.center) - ring.centerlineRadius),
      ).toBeLessThan(0.01);
    for (const road of REFERENCE_ROADS)
      for (const point of road.path)
        expect(EXPLORATION_POLYGONS.some((polygon) => pointInPolygon(point, polygon))).toBe(true);
    expect(URBAN_REFERENCE_PROVENANCE.attribution).toContain("OpenStreetMap");
    expect(URBAN_REFERENCE_PROVENANCE.license).toBe("ODbL 1.0");
  });

  it("clips verified western approaches by interpolation and does not extend Argentina beyond its mapped end", () => {
    const brasil = REFERENCE_ROADS.find((road) => road.id === "park-brasil")!;
    const buenos = REFERENCE_ROADS.find((road) => road.id === "park-buenos-aires")!;
    for (const road of [brasil, buenos]) {
      const source = evidence.sourceEvidence.selectedWays[road.sourceWayIds[0]];
      expect(road.sourceNodeIds).toEqual(source.nodes);
      expect(source.tags.highway).not.toBe("footway");
      expect(road.pedestrian).toBe(false);
      expect(road.width).toBeGreaterThan(2);
      for (const [x, z] of road.path) {
        expect(x).toBeLessThanOrEqual(road.clipping!.maxX + 1e-8);
        expect(z).toBeGreaterThanOrEqual(road.clipping!.minZ - 1e-8);
      }
      // Each generated endpoint must lie on an actual original segment, rather
      // than replacing the source path with a made-up rectangular boundary.
      const sourcePath = source.nodes.map(projectReferenceNode) as Point[];
      for (const point of [road.path[0], road.path.at(-1)!])
        expect(
          sourcePath.some((a, i) => {
            if (!i) return false;
            const b = sourcePath[i - 1];
            return Math.abs(distance(a, point) + distance(point, b) - distance(a, b)) < 1e-7;
          }),
        ).toBe(true);
    }
    expect(brasil.path[0][0]).toBeCloseTo(5.8, 8);
    expect(buenos.path[0]).toEqual(projectReferenceNode("5489900218"));
    expect(brasil.path).toContainEqual(buenos.path[0]);
    expect(buenos.path.at(-1)![1]).toBeCloseTo(
      URBAN_REFERENCE.secondaryJunction.center[1] - 100,
      8,
    );
    const argentina = REFERENCE_EXCLUSIONS.find((road) => road.id === "park-argentina")!;
    expect(argentina.sourceWayIds).toEqual(["571138892"]);
    expect(argentina.sourcePath.every(([x]) => x > 5.8)).toBe(true);
    expect(REFERENCE_ROADS.some((road) => road.id === argentina.id)).toBe(false);
  });

  it("uses the smaller closed OSM access loop for Rua Brasil without claiming an unmapped secondary gate", () => {
    const second = URBAN_REFERENCE.secondaryJunction;
    const source = evidence.sourceEvidence.selectedWays["833033188"];
    expect(source.tags.highway).toBe("living_street");
    expect(source.tags.oneway).toBe("yes");
    expect(source.nodes[0]).toBe(source.nodes.at(-1));
    expect(new Set(second.nodeIds)).toEqual(new Set(source.nodes));
    expect(second.centerlineRadius).toBeLessThan(URBAN_REFERENCE.roundabout.centerlineRadius);
    for (const id of second.nodeIds)
      expect(
        Math.abs(distance(projectReferenceNode(id), second.center) - second.centerlineRadius),
      ).toBeLessThan(0.01);
    const brasil = REFERENCE_ROADS.find((road) => road.id === "brasil-access")!;
    expect(brasil.sourceNodeIds).toContain("7776485935");
    expect(second.path).toContainEqual(brasil.path.at(-1));
    expect(second.evidence.gateMapped).toBe(false);
    expect(second.evidence.secondaryGateSource).toContain("human-indicated");
    expect(evidence.sourceEvidence.nodeFeatureTags["2470629442"]).toMatchObject({
      barrier: "gate",
      entrance: "main",
    });
    for (const id of [...second.nodeIds, ...brasil.sourceNodeIds])
      expect(evidence.sourceEvidence.nodeFeatureTags[id]?.barrier).not.toBe("gate");
  });
});
