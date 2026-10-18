import * as THREE from "three";
import { describe, it, expect, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { pointInPolygon, signedPolygonArea } from "./geometry";
import {
  deriveParkDetails,
  subtractGround,
  lotStatusBands,
  createParkDetails,
  deriveCommercialLanePaint,
} from "./parkDetails";
import { createSurfaceMaterials } from "./surfaceMaterials";

describe("satellite-inspired surface details preserve cadastral surfaces", () => {
  it("subtracts rotated blockers without overlap or lost outside area", () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const diamond: [number, number][] = [
      [5, 1],
      [9, 5],
      [5, 9],
      [1, 5],
    ];
    const pieces = subtractGround(square, diamond);
    expect(pieces.reduce((s, p) => s + Math.abs(signedPolygonArea(p)), 0)).toBeCloseTo(68);
    const adjacent: [number, number][] = [
      [0, -4],
      [10, -4],
      [10, 0],
      [0, 0],
    ];
    expect(
      subtractGround(square, adjacent).reduce((s, p) => s + Math.abs(signedPolygonArea(p)), 0),
    ).toBeCloseTo(100);
    for (const p of pieces) {
      const c: [number, number] = [
        p.reduce((s, v) => s + v[0], 0) / p.length,
        p.reduce((s, v) => s + v[1], 0) / p.length,
      ];
      expect(pointInPolygon(c, diamond)).toBe(false);
    }
  });
  it("never places new concrete inside lots, architecture, roads or approved landscaping", () => {
    const source = JSON.stringify(ENTITIES),
      details = deriveParkDetails(ENTITIES);
    expect(details.concrete.length).toBeGreaterThan(4);
    expect(details.paint.length).toBeGreaterThan(30);
    for (const cell of details.concrete) {
      const center: [number, number] = [
        cell.reduce((s, p) => s + p[0], 0) / cell.length,
        cell.reduce((s, p) => s + p[1], 0) / cell.length,
      ];
      expect(ENTITIES.some((e) => pointInPolygon(center, e.polygon))).toBe(false);
    }
    const av = ENTITIES.find((e) => e.id.endsWith("road:benvenuto"))!;
    expect(details.paint.every((p) => p.every((v) => pointInPolygon(v, av.polygon)))).toBe(true);
    expect(JSON.stringify(ENTITIES)).toBe(source);
  });
  it("keeps status bands inside every real lot, including the skewed lot70", () => {
    for (const lot of ENTITIES.filter((e) => e.kind === "lot")) {
      const bands = lotStatusBands(lot.polygon);
      expect(bands.length).toBe(lot.polygon.length);
      expect(bands.every((b) => b.every((v) => pointInPolygon(v, lot.polygon)))).toBe(true);
      expect(bands.reduce((s, p) => s + Math.abs(signedPolygonArea(p)), 0)).toBeLessThan(
        Math.abs(signedPolygonArea(lot.polygon)) * 0.3,
      );
    }
  });
  it("does not capture picking or dispose borrowed materials", () => {
    const surfaces = createSurfaceMaterials({ maps: false }),
      dispose = vi.spyOn(surfaces.materials.concrete, "dispose");
    const model = createParkDetails(ENTITIES, surfaces),
      raycaster = new THREE.Raycaster(new THREE.Vector3(90, 10, 92), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(model.group, true)).toEqual([]);
    expect(model.group.getObjectByName("indumoveis-commercial-lane-paint")).toBeDefined();
    model.dispose();
    model.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(model.group.children).toHaveLength(0);
    surfaces.dispose();
  });
  it("fits every commercial marking triangle inside its authored road and outside junctions", () => {
    const before = JSON.stringify(ENTITIES),
      sources = deriveCommercialLanePaint(ENTITIES);
    expect(sources.length).toBeGreaterThan(3);
    expect(sources.flatMap((s) => s.directionArrows).length).toBeGreaterThan(10);
    expect(sources.some((s) => /benvenuto|imigrantes|arvoredo|east-walk/.test(s.sourceId))).toBe(
      false,
    );
    for (const source of sources) {
      const road = ENTITIES.find((e) => e.id === source.sourceId)!;
      expect(source.laneWidth * 2).toBeCloseTo(source.width);
      for (const polygon of [...source.centerDashes, ...source.directionArrows]) {
        const triangles = THREE.ShapeUtils.triangulateShape(
          polygon.map((p) => new THREE.Vector2(...p)),
          [],
        );
        for (const triangle of triangles) {
          const vertices = triangle.map((i) => polygon[i]);
          const centroid: [number, number] = [
            vertices.reduce((s, p) => s + p[0], 0) / 3,
            vertices.reduce((s, p) => s + p[1], 0) / 3,
          ];
          expect([...vertices, centroid].every((p) => pointInPolygon(p, road.polygon))).toBe(true);
          expect(
            ENTITIES.filter((e) => e.kind === "road" && e !== road).some((e) =>
              pointInPolygon(centroid, e.polygon),
            ),
          ).toBe(false);
        }
      }
    }
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });
});
