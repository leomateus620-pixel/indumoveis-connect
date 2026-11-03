import { describe, expect, it } from "vitest";
import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { polygonsOverlap } from "./parkGeometry";
import {
  createPavement,
  classifyRoad,
  derivePavement,
  isPedestrianRoad,
  pavementUnionCells,
  pavementSurfaceUnionCells,
  PAVEMENT,
} from "./pavement";

const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const road = (id: string, polygon: Point[]): MapEntity => ({
  id,
  kind: "road",
  polygon,
  label: id,
  location: "test",
  anchor: polygon[0],
  source: "test",
  confidence: "test",
});
const area = (polygons: readonly Point[][]) =>
  polygons.reduce((sum, polygon) => sum + Math.abs(signedPolygonArea(polygon)), 0);
const horizontal = road("horizontal", rectangle(0, 4, 10, 6));
const vertical = road("vertical", rectangle(4, 0, 6, 10));

describe("derived park pavement", () => {
  it("retains actual block voids in a traced road surface with multiple rings", () => {
    const polygon = rectangle(0, 0, 30, 20);
    const holes = [rectangle(2, 2, 12, 18), rectangle(18, 2, 28, 18).reverse()];
    const before = JSON.stringify({ polygon, holes });
    const cells = pavementSurfaceUnionCells([{ polygon, holes }]);
    expect(area(cells)).toBeCloseTo(280, 8);
    for (let x = 0.17; x < 30; x += 0.41)
      for (let z = 0.13; z < 20; z += 0.39) {
        const p: Point = [x, z];
        const expected =
          pointInPolygon(p, polygon) && !holes.some((hole) => pointInPolygon(p, hole));
        expect(cells.filter((cell) => pointInPolygon(p, cell))).toHaveLength(expected ? 1 : 0);
      }
    const donut = { ...road("indumoveis:context:road:a2-network:test", polygon), holes };
    expect(area(derivePavement([donut]).asphaltCells)).toBeCloseTo(280, 8);
    expect(JSON.stringify({ polygon, holes })).toBe(before);
  });

  it("preserves a concave road void and joins its outside mouth without filling the block", () => {
    const hole: Point[] = [
      [2, 2],
      [18, 2],
      [18, 6],
      [6, 6],
      [6, 18],
      [2, 18],
    ];
    const cells = pavementSurfaceUnionCells([
      { polygon: rectangle(0, 0, 20, 20), holes: [hole] },
      { polygon: rectangle(5, -5, 15, 0) },
    ]);
    expect(area(cells)).toBeCloseTo(338, 8);
    expect(cells.some((cell) => pointInPolygon([4, 14], cell))).toBe(false);
    expect(cells.some((cell) => pointInPolygon([14, 14], cell))).toBe(true);
    expect(cells.some((cell) => pointInPolygon([10, -0.01], cell))).toBe(true);
    expect(cells.some((cell) => pointInPolygon([10, 0.01], cell))).toBe(true);
  });

  it("classifies park service streets separately from pedestrian paths and public avenues", () => {
    const classes = Object.fromEntries(
      ENTITIES.filter((entity) => entity.kind === "road").map((entity) => [
        entity.id,
        classifyRoad(entity),
      ]),
    );
    for (const id of ["argentina", "uruguai", "brasil", "mercosul", "brasilia", "la-paz"])
      expect(classes[`indumoveis:road:${id}`]).toBe("park-internal");
    for (const id of ["arvoredo", "east-walk-upper", "east-walk-lower"])
      expect(classes[`indumoveis:road:${id}`]).toBe("park-pedestrian");
    for (const id of ["benvenuto", "imigrantes"])
      expect(classes[`indumoveis:road:${id}`]).toBe("public-external");
    expect(classifyRoad({ id: "park-context:road:bruno-schwartz" })).toBe("park-internal");
    expect(classifyRoad({ id: "indumoveis:context:walk:gate-2-woodland-connector:0" })).toBe(
      "park-pedestrian",
    );
  });

  it("unions overlapping source roads into nonoverlapping cells with the exact network area", () => {
    const cells = pavementUnionCells([horizontal.polygon, vertical.polygon]);
    expect(area(cells)).toBeCloseTo(36, 8);
    for (let x = 0.15; x < 10; x += 0.3)
      for (let y = 0.17; y < 10; y += 0.31) {
        const point: Point = [x, y];
        const sourceInside = [horizontal, vertical].some((entity) =>
          pointInPolygon(point, entity.polygon),
        );
        expect(cells.filter((cell) => pointInPolygon(point, cell)).length).toBe(
          sourceInside ? 1 : 0,
        );
      }
  });

  it("assigns a pedestrian crossing one concrete owner without asphalt or edge paint beneath it", () => {
    const crossing = road("indumoveis:context:walk:test-crossing", rectangle(4, 0, 6, 10));
    const topology = derivePavement([horizontal, crossing]);
    expect(area(topology.asphaltCells)).toBeCloseTo(16, 8);
    expect(area(topology.walkCells)).toBeCloseTo(20, 8);
    for (let x = 0.17; x < 10; x += 0.31)
      for (let y = 0.19; y < 10; y += 0.29) {
        const p: Point = [x, y];
        const asphaltOwners = topology.asphaltCells.filter((cell) =>
          pointInPolygon(p, cell),
        ).length;
        const walkOwners = topology.walkCells.filter((cell) => pointInPolygon(p, cell)).length;
        expect(asphaltOwners + walkOwners).toBeLessThanOrEqual(1);
        if (pointInPolygon(p, crossing.polygon)) expect(asphaltOwners).toBe(0);
      }
    expect(
      topology.lateralEdges.some(
        ({ a, b }) => Math.min(a[0], b[0]) < 5 && Math.max(a[0], b[0]) > 5,
      ),
    ).toBe(false);
  });

  it("clips graphical road and walk residuals against real lot and concave building polygons, keeping gate markers open", () => {
    const street = road("street", rectangle(0, 0, 10, 4));
    const walk = road("indumoveis:context:walk:frontage", rectangle(4, 0, 6, 10));
    const lot: MapEntity = { ...road("lot", rectangle(4, 0, 6, 2)), kind: "lot", numbers: [1] };
    const pavilion: MapEntity = {
      ...road("pavilion", [
        [7, 0],
        [9, 0],
        [9, 1],
        [8, 1],
        [8, 3],
        [7, 3],
      ]),
      kind: "pavilion",
    };
    const support: MapEntity = { ...road("support", rectangle(0, 3, 2, 4)), kind: "support" };
    const gate: MapEntity = {
      ...road("indumoveis:support:gate-03", rectangle(3, 2, 4, 4)),
      kind: "support",
    };
    const source = [street, walk, lot, pavilion, support, gate],
      before = JSON.stringify(source);
    const topology = derivePavement(source);
    expect(area(topology.asphaltCells)).toBeCloseTo(26, 8);
    expect(area(topology.walkCells)).toBeCloseTo(16, 8);
    for (const cell of [...topology.asphaltCells, ...topology.walkCells])
      for (const blocker of [lot, pavilion, support])
        expect(polygonsOverlap(cell, blocker.polygon)).toBe(false);
    expect(topology.asphaltCells.some((cell) => pointInPolygon([8.5, 2], cell))).toBe(true);
    expect(topology.asphaltCells.some((cell) => pointInPolygon([3.5, 3], cell))).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("leaves cross and T junctions open and paints only lateral edges, never a centre line or an end cap", () => {
    const { lateralEdges } = derivePavement([horizontal, vertical]);
    expect(lateralEdges).toHaveLength(8);
    for (const { a, b, sourceId } of lateralEdges) {
      const x = (a[0] + b[0]) / 2,
        y = (a[1] + b[1]) / 2;
      if (sourceId === "horizontal") {
        expect(a[1]).toBe(b[1]);
        expect([4, 6]).toContain(y);
        expect(x < 4 || x > 6).toBe(true);
      } else {
        expect(a[0]).toBe(b[0]);
        expect([4, 6]).toContain(x);
        expect(y < 4 || y > 6).toBe(true);
      }
    }
    const tJunction = derivePavement([horizontal, road("branch", rectangle(4, 0, 6, 4))]);
    expect(
      tJunction.lateralEdges.some(({ a, b }) => a[1] === 4 && b[1] === 4 && a[0] < 5 && b[0] > 5),
    ).toBe(false);
  });

  it("connects only small facing drafting gaps and preserves the original polygons", () => {
    const branch = road("branch", rectangle(4, 0, 6, 3.99));
    const before = JSON.stringify([horizontal, branch]);
    const topology = derivePavement([horizontal, branch]);
    expect(topology.connectorCount).toBe(1);
    expect(topology.asphaltCells.some((cell) => pointInPolygon([5, 3.995], cell))).toBe(true);
    expect(
      topology.lateralEdges.some(({ a, b }) => a[1] === 4 && b[1] === 4 && a[0] < 5 && b[0] > 5),
    ).toBe(false);
    expect(JSON.stringify([horizontal, branch])).toBe(before);
    expect(derivePavement([horizontal, road("far", rectangle(4, 0, 6, 3.8))]).connectorCount).toBe(
      0,
    );
  });

  it("cuts an aperture facing a source-confirmed building access and the existing gate", () => {
    const building: MapEntity = {
      ...road("building", rectangle(2, 6.3, 8, 9)),
      kind: "pavilion",
      accesses: [[5, 6.3]],
    };
    const gate: MapEntity = {
      ...road("indumoveis:support:gate-03", rectangle(7, 6.2, 8, 7)),
      kind: "support",
      anchor: [7.5, 6.2],
    };
    const { lateralEdges } = derivePavement([horizontal, building, gate]);
    for (const x of [5, 7.5])
      expect(
        lateralEdges.some(
          ({ a, b }) =>
            a[1] === 6 && b[1] === 6 && x > Math.min(a[0], b[0]) && x < Math.max(a[0], b[0]),
        ),
      ).toBe(false);
    expect(lateralEdges.some(({ a, b }) => a[1] === 4 && b[1] === 4 && a[0] < 5 && b[0] > 5)).toBe(
      true,
    );
  });

  it("separates all three source pedestrian areas and retains every protected entity unchanged", () => {
    const before = JSON.stringify(ENTITIES);
    const walks = ENTITIES.filter((entity) => entity.kind === "road" && isPedestrianRoad(entity));
    expect(walks.map((entity) => entity.id)).toEqual([
      "indumoveis:road:arvoredo",
      "indumoveis:road:east-walk-upper",
      "indumoveis:road:east-walk-lower",
    ]);
    const topology = derivePavement(ENTITIES);
    // Source drawings contain tiny walk/building overlaps. The rendered
    // footprint now removes those residuals while preserving the source.
    expect(area(topology.walkCells)).toBeLessThanOrEqual(
      area(walks.map((entity) => entity.polygon)),
    );
    expect(area(topology.walkCells)).toBeGreaterThan(
      area(walks.map((entity) => entity.polygon)) * 0.99,
    );
    for (const cell of topology.walkCells)
      for (const blocker of ENTITIES.filter(
        (entity) =>
          entity.kind === "lot" ||
          entity.kind === "pavilion" ||
          (entity.kind === "support" && entity.id !== "indumoveis:support:gate-03"),
      ))
        expect(polygonsOverlap(cell, blocker.polygon)).toBe(false);
    expect(
      topology.lateralEdges.every(({ sourceId }) => !walks.some(({ id }) => id === sourceId)),
    ).toBe(true);
    expect(topology.connectorCount).toBeGreaterThan(0);
    expect(topology.asphaltCells.every((cell) => cell.flat().every(Number.isFinite))).toBe(true);
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });

  it("batches pavement in three semantic meshes with upward normals and bounded shared surface maps", () => {
    const pavement = createPavement(ENTITIES);
    expect(pavement.group.children).toHaveLength(3);
    expect(pavement.resources.filter((resource) => "isTexture" in resource)).toHaveLength(4);
    expect(pavement.textureBytes).toBeLessThan(0.5 * 1024 * 1024);
    expect(PAVEMENT.paintElevation).toBeGreaterThan(PAVEMENT.asphaltElevation);
    expect(PAVEMENT.junctionTolerance).toBeLessThan(0.03);
    for (const mesh of pavement.group.children) {
      const geometry = (mesh as import("three").Mesh).geometry;
      const positions = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      expect(geometry.getAttribute("uv").count).toBe(positions.count);
      const color = geometry.getAttribute("color");
      expect(color.count).toBe(positions.count);
      expect(Array.from(color.array).every((channel) => channel === 1)).toBe(true);
      expect(positions.count).toBeGreaterThan(0);
      for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeCloseTo(1, 6);
      expect(mesh.userData.entityId).toBeUndefined();
    }
    for (const resource of pavement.resources) resource.dispose();
  });

  it("opens only selected source south paint seams while preserving north paint, source topology and all pavement", () => {
    const surfaces = createSurfaceMaterials({ maps: false });
    const ids = new Set(["indumoveis:road:benvenuto", "indumoveis:road:imigrantes"]);
    const before = JSON.stringify(ENTITIES);
    const original = createPavement(ENTITIES, surfaces),
      explicitDefault = createPavement(ENTITIES, surfaces, {});
    const open = createPavement(ENTITIES, surfaces, { openSouthEdgesOf: ids });
    const attributes = (model: typeof original, mesh: number) =>
      (model.group.children[mesh] as import("three").Mesh).geometry.getAttribute("position");
    expect(open.topology).toEqual(original.topology);
    for (const mesh of [0, 1])
      expect(Array.from(attributes(open, mesh).array)).toEqual(
        Array.from(attributes(original, mesh).array),
      );
    expect(Array.from(attributes(explicitDefault, 2).array)).toEqual(
      Array.from(attributes(original, 2).array),
    );
    const hasPaint = (model: typeof original, point: Point) => {
      const positions = attributes(model, 2);
      for (let i = 0; i < positions.count; i += 3) {
        const triangle: Point[] = [0, 1, 2].map((j) => [
          positions.getX(i + j),
          positions.getZ(i + j),
        ]);
        if (pointInPolygon(point, triangle)) return true;
      }
      return false;
    };
    let omitted = 0;
    for (const edge of original.topology.lateralEdges) {
      const road = ENTITIES.find((entity) => entity.id === edge.sourceId)!,
        south = polygonBounds(road.polygon).maxY;
      const suppressed =
        ids.has(edge.sourceId) &&
        Math.abs(edge.a[1] - south) < 1e-7 &&
        Math.abs(edge.b[1] - south) < 1e-7;
      const point: Point = [
        (edge.a[0] + edge.b[0]) / 2 + (edge.inward[0] * edge.width) / 2,
        (edge.a[1] + edge.b[1]) / 2 + (edge.inward[1] * edge.width) / 2,
      ];
      expect(hasPaint(original, point)).toBe(true);
      expect(hasPaint(open, point)).toBe(!suppressed);
      if (suppressed) omitted++;
    }
    expect(omitted).toBeGreaterThan(1);
    expect(attributes(open, 2).count).toBe(attributes(original, 2).count - omitted * 6);
    expect(open.group.children).toHaveLength(3);
    expect(JSON.stringify(ENTITIES)).toBe(before);
    for (const model of [original, explicitDefault, open])
      for (const resource of model.resources) resource.dispose();
    surfaces.dispose();
  });
});
