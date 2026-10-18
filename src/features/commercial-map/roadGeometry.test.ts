import { describe, expect, it } from "vitest";
import { hasSelfIntersections, signedPolygonArea } from "./geometry";
import { deriveRoadRibbon, markRoadLanes } from "./roadGeometry";
import type { Point } from "./data/territory";

describe("joined two-way road geometry", () => {
  it("joins a bend with one continuous, constant-width miter instead of overlapping strips", () => {
    const path: Point[] = [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      before = JSON.stringify(path);
    const ribbon = deriveRoadRibbon(path, 4);
    expect(ribbon).toEqual([
      [0, 2],
      [8, 2],
      [8, 10],
      [12, 10],
      [12, -2],
      [0, -2],
    ]);
    expect(Math.abs(signedPolygonArea(ribbon))).toBeCloseTo(80);
    expect(hasSelfIntersections(ribbon)).toBe(false);
    expect(JSON.stringify(path)).toBe(before);
  });
  it("filters invalid and zero-length vertices and bounds an acute join", () => {
    const ribbon = deriveRoadRibbon(
      [
        [NaN, 0],
        [0, 0],
        [0, 0],
        [10, 0],
        [0.1, 0.2],
      ],
      4,
      { miterLimit: 2 },
    );
    expect(ribbon.length).toBe(8);
    expect(ribbon.flat().every(Number.isFinite)).toBe(true);
    for (const p of [ribbon[1], ribbon[2], ribbon[5], ribbon[6]])
      expect(Math.hypot(p[0] - 10, p[1])).toBeLessThanOrEqual(4 + 1e-8);
    expect(
      deriveRoadRibbon(
        [
          [0, 0],
          [0, 0],
        ],
        5,
      ),
    ).toEqual([]);
    expect(
      deriveRoadRibbon(
        [
          [0, 0],
          [1, 0],
        ],
        Infinity,
      ),
    ).toEqual([]);
  });
  it("continues dash phase through a corner and remains deterministic", () => {
    const path: Point[] = [
      [0, 0],
      [7, 0],
      [7, 10],
    ];
    const markings = markRoadLanes(path, 2, {
      dashLength: 4,
      dashGap: 2,
      lineWidth: 0.1,
      arrowSpacing: 100,
    });
    expect(markings.centerDashes).toHaveLength(3);
    expect(markings.centerDashes[1].length).toBe(6);
    expect(Math.abs(signedPolygonArea(markings.centerDashes[1]))).toBeCloseTo(0.4);
    expect(Math.min(...markings.centerDashes[2].map((p) => p[1]))).toBeCloseTo(5);
    expect(
      markRoadLanes(path, 2, { dashLength: 4, dashGap: 2, lineWidth: 0.1, arrowSpacing: 100 }),
    ).toEqual(markings);
  });
  it("places opposite arrows at the centres of equal-width carriageway halves", () => {
    const marks = markRoadLanes(
      [
        [0, 0],
        [100, 0],
      ],
      8,
      { arrowSpacing: 20 },
    );
    expect(marks.laneWidth).toBe(4);
    expect(marks.edgeWhite).toHaveLength(2);
    for (let i = 0; i < marks.directionArrows.length; i += 2) {
      const forward = marks.directionArrows[i],
        backward = marks.directionArrows[i + 1];
      const centerY = (p: Point[]) =>
        (Math.min(...p.map((v) => v[1])) + Math.max(...p.map((v) => v[1]))) / 2;
      expect(centerY(forward)).toBeCloseTo(2);
      expect(centerY(backward)).toBeCloseTo(-2);
      expect(forward[3][0]).toBeGreaterThan(forward[0][0]);
      expect(backward[3][0]).toBeLessThan(backward[0][0]);
      expect(forward.every((p) => p[1] > 0 && p[1] < 4)).toBe(true);
      expect(backward.every((p) => p[1] < 0 && p[1] > -4)).toBe(true);
    }
  });
});
