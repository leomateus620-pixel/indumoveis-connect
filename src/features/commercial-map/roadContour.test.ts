import { describe, expect, it } from "vitest";
import { PARK_A2_ROAD_SURFACES } from "./parkA2Reference";
import { simplifyRoadContour, ROAD_CONTOUR_REVIEW } from "./roadContour";
import { signedPolygonArea } from "./geometry";
import type { Point } from "./data/territory";

const distance = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
    );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
describe("subpixel road contour presentation", () => {
  it("keeps every source sample within its documented subpixel error without rewriting evidence or losing holes", () => {
    const original = JSON.stringify(PARK_A2_ROAD_SURFACES);
    let before = 0,
      after = 0;
    for (const surface of PARK_A2_ROAD_SURFACES)
      for (const ring of [surface.polygon, ...surface.holes]) {
        const simplified = simplifyRoadContour(ring);
        before += ring.length;
        after += simplified.length;
        expect(simplified.length).toBeGreaterThanOrEqual(3);
        expect(Math.sign(signedPolygonArea(simplified))).toBe(Math.sign(signedPolygonArea(ring)));
        for (const p of ring)
          expect(
            Math.min(
              ...simplified.map((a, i) => distance(p, a, simplified[(i + 1) % simplified.length])),
            ),
          ).toBeLessThanOrEqual(ROAD_CONTOUR_REVIEW.tolerancePdfPoints + 1e-8);
      }
    expect(after).toBeLessThan(before * 0.8);
    expect(JSON.stringify(PARK_A2_ROAD_SURFACES)).toBe(original);
  });
  it("retains a real reentrant corridor and exact vector corners at this tolerance", () => {
    const outline: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [7, 10],
      [7, 3],
      [3, 3],
      [3, 10],
      [0, 10],
    ];
    expect(simplifyRoadContour(outline)).toEqual(outline);
    expect(simplifyRoadContour(outline, 0)).toEqual(outline);
  });
});
