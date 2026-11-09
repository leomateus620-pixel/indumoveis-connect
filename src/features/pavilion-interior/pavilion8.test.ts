import { describe, expect, it } from "vitest";
import { hasSelfIntersections, pointInPolygon, polygonBounds } from "../commercial-map/geometry";
import { PAVILION_8_PLAN as plan } from "./pavilion8";
import { PAVILION_8_LOT_CODES } from "./pavilion8-codes";
import type { InteriorPoint } from "./data";

const environments = new Map(plan.environments.map((env) => [env.code, env]));
const ring = (code: string) => environments.get(code)!.parts[0].polygon;
const bounds = (code: string) => polygonBounds(ring(code));
const at = (point: InteriorPoint) =>
  plan.environments.find((env) => pointInPolygon(point, env.parts[0].polygon))?.code;

describe("Pavilhão 8 documentary geometry", () => {
  it("retains seven independent numbered lots and the pavilion-only area", () => {
    expect(plan.pavilionNumber).toBe(8);
    expect(plan.totalAreaM2).toBe(937.32);
    expect(plan.environments.map(({ code }) => code)).toEqual(PAVILION_8_LOT_CODES);
    expect(PAVILION_8_LOT_CODES).toEqual(["01", "03", "04", "05", "06", "07", "08"]);
    for (const env of plan.environments) {
      expect(env.id).toBe(`indumoveis:pavilion:8:environment:${env.code}`);
      expect(env.name).toBe(`Lote ${env.code}`);
      expect(env.kind).toBe("commercial");
      expect(env.declaredAreaM2).toBeNull();
      expect(env.parts).toHaveLength(1);
      expect(env.parts[0].kind).toBe("interior");
    }
  });

  it("preserves the clear aisles at their offset PDF positions", () => {
    expect(bounds("04").maxY).toBe(bounds("03").minY);
    expect(bounds("06").maxY).toBe(bounds("07").minY);
    expect(bounds("06").maxY - bounds("06").minY).toBeGreaterThan(225);
    expect(bounds("05").minY - bounds("04").minY).toBeCloseTo(43.71, 1);
    expect(bounds("01").minY - bounds("03").maxY).toBeCloseTo(94.64, 1);
    expect(bounds("06").minY - bounds("05").maxY).toBeCloseTo(85.68, 1);
    for (const point of [
      [105, 441], // Left passage between 03 and 01
      [486, 339], // Right passage between 05 and 06
      [436, 130], // Rear exit corridor above 05
      [300, 430], // Main circulation
      [202, 760], // Entrance left of 08
      [395, 760], // Entrance right of 08
    ] as InteriorPoint[]) {
      expect(at(point)).toBeUndefined();
    }
  });

  it("keeps the documentary diagonals selectable only on their commercial side", () => {
    expect(ring("01")).toHaveLength(6);
    expect(ring("07")).toHaveLength(5);
    const [topLeft, topRight, bottomRight, bottomLeft] = ring("08");
    expect(topLeft[1]).toBe(topRight[1]);
    expect(bottomLeft[1]).toBe(bottomRight[1]);
    expect(bottomLeft[1]).toBeGreaterThan(topLeft[1]);
    expect(topRight[0] - topLeft[0]).toBeCloseTo(47.1, 1);
    expect(bottomRight[0] - bottomLeft[0]).toBeCloseTo(124.57, 1);

    // Pairs straddle the vector strokes at y=700. Bounding-box hit areas fail them.
    for (const [inside, outside, code] of [
      [[193, 700], [196, 700], "01"],
      [[403, 700], [400, 700], "07"],
      [[264, 700], [261, 700], "08"],
      [[331, 700], [334, 700], "08"],
    ] as [InteriorPoint, InteriorPoint, string][]) {
      expect(at(inside)).toBe(code);
      expect(at(outside)).toBeUndefined();
    }
  });

  it("uses separate closed polygons with their number labels inside", () => {
    for (const [i, env] of plan.environments.entries()) {
      const polygon = ring(env.code);
      expect(polygon.at(-1)).toEqual(polygon[0]);
      expect(hasSelfIntersections(polygon)).toBe(false);
      expect(pointInPolygon(env.label, polygon)).toBe(true);
      const a = bounds(env.code);
      for (const neighbor of plan.environments.slice(i + 1)) {
        const b = bounds(neighbor.code);
        expect(a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY).toBe(
          true,
        );
      }
    }
  });
});
