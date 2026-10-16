import { describe, expect, it } from "vitest";
import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { pointInPolygon, signedPolygonArea } from "./geometry";
import {
  createPavement,
  derivePavement,
  isPedestrianRoad,
  pavementUnionCells,
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
    expect(area(topology.walkCells)).toBeCloseTo(area(walks.map((entity) => entity.polygon)), 6);
    expect(
      topology.lateralEdges.every(({ sourceId }) => !walks.some(({ id }) => id === sourceId)),
    ).toBe(true);
    expect(topology.connectorCount).toBeGreaterThan(0);
    expect(topology.asphaltCells.every((cell) => cell.flat().every(Number.isFinite))).toBe(true);
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });

  it("batches pavement in three meshes with upward normals and one small shared aggregate texture", () => {
    const pavement = createPavement(ENTITIES);
    expect(pavement.group.children).toHaveLength(3);
    expect(pavement.resources.filter((resource) => "isTexture" in resource)).toHaveLength(1);
    expect(pavement.textureBytes).toBeLessThan(24 * 1024);
    expect(PAVEMENT.paintElevation).toBeGreaterThan(PAVEMENT.asphaltElevation);
    expect(PAVEMENT.junctionTolerance).toBeLessThan(0.03);
    for (const mesh of pavement.group.children) {
      const geometry = (mesh as import("three").Mesh).geometry;
      const positions = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      expect(positions.count).toBeGreaterThan(0);
      for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeCloseTo(1, 6);
      expect(mesh.userData.entityId).toBeUndefined();
    }
    for (const resource of pavement.resources) resource.dispose();
  });
});
