import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES, type Point } from "./data/territory";
import { pointInPolygon, signedPolygonArea } from "./geometry";
import { DAYLIGHT } from "./daylight";
import { projectSunShadow, SUN_SHADOW } from "./sunShadows";
import { polygonsOverlap, subtractPolygons } from "./parkGeometry";
import { PARK_CORE_ENTITIES } from "./permanentParkLayout";
import {
  createParkContextShadows,
  deriveParkContextShadowCells,
  projectParkContextShadow,
} from "./parkContextShadows";

const rect = (x0: number, z0: number, x1: number, z1: number): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

describe("shared permanent-park contact projection", () => {
  it("keeps a concave yard open rather than shadowing its convex hull", () => {
    const source = {
      id: "concave",
      polygon: [
        [0, 0],
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 4],
        [0, 4],
      ] as Point[],
      height: 3,
    };
    const cells = deriveParkContextShadowCells([source], [], [0, 1, 0]);
    expect(
      cells.reduce((area, polygon) => area + Math.abs(signedPolygonArea(polygon)), 0),
    ).toBeCloseTo(7);
    expect(cells.some((polygon) => pointInPolygon([2, 2], polygon))).toBe(false);
    const projected = projectParkContextShadow(source);
    expect(projected.flat().some(([x, z]) => x > 4 || z < 0)).toBe(true);
    expect(() => projectParkContextShadow(source, [0, 0, 1])).toThrow("invalid-projection");
  });

  it("unions repeated projections once and preserves all protected lot interiors", () => {
    const source = { id: "body", polygon: rect(0, 0, 4, 4), height: 3 };
    const lot = rect(1, 1, 3, 3);
    const one = deriveParkContextShadowCells([source], [lot], [0, 1, 0]);
    const duplicated = deriveParkContextShadowCells([source, source], [lot], [0, 1, 0]);
    const area = (cells: Point[][]) =>
      cells.reduce((sum, polygon) => sum + Math.abs(signedPolygonArea(polygon)), 0);
    expect(area(one)).toBeCloseTo(12);
    expect(area(duplicated)).toBeCloseTo(area(one));
    expect(duplicated.some((polygon) => polygonsOverlap(polygon, lot))).toBe(false);
  });

  it("uses one finite ground mesh without picking, lights, textures or quality regeneration", () => {
    const before = JSON.stringify(ENTITIES);
    const shadow = createParkContextShadows();
    try {
      expect(shadow.group.children).toHaveLength(1);
      expect(shadow.material.map).toBeNull();
      expect(shadow.material.opacity).toBe(SUN_SHADOW.opacity);
      expect(shadow.material.depthWrite).toBe(false);
      expect(shadow.metadata.sunDirection).toEqual(DAYLIGHT.sunDirection);
      expect(shadow.metadata.sourceIds).toEqual(
        expect.arrayContaining(["arena", "sede", "palco-lactalis", "pavilhao-9"]),
      );
      const positions = shadow.geometry.getAttribute("position"),
        normals = shadow.geometry.getAttribute("normal");
      const original = Array.from(positions.array);
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getZ(i))).toBe(true);
        expect(positions.getY(i)).toBeCloseTo(SUN_SHADOW.elevation);
        expect(normals.getY(i)).toBeCloseTo(1);
      }
      for (const quality of ["light", "balanced", "detailed"] as const) shadow.setQuality(quality);
      expect(Array.from(positions.array)).toEqual(original);
      expect(shadow.mesh.visible).toBe(true);
      shadow.group.updateMatrixWorld(true);
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(220, 20, 0),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(shadow.group, true),
      ).toHaveLength(0);
      for (const lot of ENTITIES.filter((e) => e.kind === "lot"))
        expect(
          shadow.cells.some((cell) => polygonsOverlap(cell, lot.polygon)),
          lot.id,
        ).toBe(false);
      const core = PARK_CORE_ENTITIES.flatMap((entity) => {
        const polygon = projectSunShadow(entity);
        return polygon ? [polygon] : [];
      });
      const area = (cells: Point[][]) =>
        cells.reduce((sum, polygon) => sum + Math.abs(signedPolygonArea(polygon)), 0);
      expect(area(subtractPolygons(shadow.cells, core))).toBeCloseTo(area(shadow.cells), 7);
      expect(JSON.stringify(ENTITIES)).toBe(before);
    } finally {
      shadow.dispose();
    }
  });

  it("disposes only its owned buffers and material once across reopens", () => {
    const first = createParkContextShadows(),
      second = createParkContextShadows();
    expect(first.geometry).not.toBe(second.geometry);
    expect(first.material).not.toBe(second.material);
    const geometry = vi.spyOn(first.geometry, "dispose"),
      material = vi.spyOn(first.material, "dispose");
    first.dispose();
    first.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(second.group.children).toHaveLength(1);
    second.dispose();
  });
});
