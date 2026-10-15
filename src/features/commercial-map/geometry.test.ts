import { describe, expect, it } from "vitest";
import { ENTITIES, MAP_BOUNDS, sourcePoint, TREES } from "./data/territory";
import {
  declaredAreaDifference,
  hasSelfIntersections,
  pointInPolygon,
  polygonBounds,
  rectangleOverlap,
  sheetToWorld,
  signedPolygonArea,
  validateTerritory,
} from "./geometry";

describe("Indumóveis source geometry", () => {
  it("transforms a sheet triangle without horizontal or vertical mirroring", () => {
    const source = [
      [100, 200],
      [300, 200],
      [300, 500],
    ] as const;
    const points = source.map(sourcePoint);
    expect(points.map((point) => sheetToWorld(point, 0.1))).toEqual([
      [10, 0.1, 20],
      [30, 0.1, 20],
      [30, 0.1, 50],
    ]);
    expect(signedPolygonArea(points)).toBe(300);
  });

  it("keeps finite nondegenerate geometry, unique IDs and interior label anchors", () => {
    expect(validateTerritory(ENTITIES, MAP_BOUNDS)).toEqual([]);
    expect(
      hasSelfIntersections([
        [0, 0],
        [4, 4],
        [0, 4],
        [4, 0],
        [5, 0],
      ]),
    ).toBe(true);
    expect(
      hasSelfIntersections([
        [0, 0],
        [4, 0],
        [4, 4],
        [2, 2],
        [0, 4],
      ]),
    ).toBe(false);
    const broken = {
      ...ENTITIES[0],
      polygon: [
        [NaN, 0],
        [0, 0],
        [0, 0],
      ] as [number, number][],
    };
    expect(
      validateTerritory([broken, broken], MAP_BOUNDS).some((error) => error.includes("non-finite")),
    ).toBe(true);
    expect(
      validateTerritory([broken, broken], MAP_BOUNDS).some((error) =>
        error.includes("duplicate id"),
      ),
    ).toBe(true);
  });

  it("covers each external number once and keeps unverifiable subdivisions aggregated", () => {
    const lots = ENTITIES.filter((entity) => entity.kind === "lot");
    const numbers = lots.flatMap((entity) => entity.numbers ?? []).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
    expect(lots).toHaveLength(59);
    expect(lots.filter((entity) => (entity.numbers?.length ?? 0) > 1)).toHaveLength(7);
    const combined = lots.find((entity) => entity.numbers?.includes(35));
    expect(combined?.numbers).toEqual([35, 36, 49, 50]);
    expect(combined?.numbers).not.toContain(37);
    expect(combined?.declaredAreaM2).toBeUndefined();
    expect(lots.find((entity) => entity.numbers?.includes(10))?.numbers).toEqual([9, 10]);
  });

  it("does not draw overlapping external envelopes", () => {
    const lots = ENTITIES.filter((entity) => entity.kind === "lot");
    for (let i = 0; i < lots.length; i++)
      for (let j = i + 1; j < lots.length; j++) {
        expect(
          rectangleOverlap(polygonBounds(lots[i].polygon), polygonBounds(lots[j].polygon)),
          `${lots[i].label} / ${lots[j].label}`,
        ).toBe(false);
      }
  });

  it("preserves lower-band building order and a separate Mostra west of the quadras", () => {
    const pavilion = (number: number) =>
      ENTITIES.find((entity) => entity.id === `indumoveis:pavilion:${number}`)!;
    const xs = [14, 12, 8, 13, 3].map((number) => pavilion(number).anchor[0]);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(pavilion(1).anchor[1]).toBeLessThan(pavilion(14).anchor[1]);
    expect(polygonBounds(pavilion(1).polygon).maxY).toBeLessThan(
      polygonBounds(pavilion(14).polygon).minY,
    );
    expect(pavilion(14).declaredAreaM2).toBeUndefined();
    expect(pavilion(1).source).toContain("Mostra Arq&Design 1.pdf");
    expect(pavilion(14).source).not.toContain("Mostra Arq&Design");
  });

  it("retains declared areas and their rounding discrepancy without pricing", () => {
    expect(declaredAreaDifference(11.3, 18, 203)).toEqual({
      declaredM2: 203,
      calculatedM2: 203.4,
      differenceM2: 0.4,
    });
    expect(declaredAreaDifference(11.3, 20.1, 227)).toEqual({
      declaredM2: 227,
      calculatedM2: 227.13,
      differenceM2: 0.13,
    });
    expect(ENTITIES.find((entity) => entity.numbers?.[0] === 14)?.declaredAreaM2).toBe(243);
    expect(ENTITIES.find((entity) => entity.numbers?.[0] === 28)?.declaredAreaM2).toBe(243);
  });

  it("leaves numbered terrain distinct from green unnumbered areas and circulation", () => {
    const lot70 = ENTITIES.find((entity) => entity.numbers?.[0] === 70)!;
    expect(pointInPolygon(sourcePoint([1600, 800]), lot70.polygon)).toBe(true);
    expect(pointInPolygon(sourcePoint([1750, 800]), lot70.polygon)).toBe(false);
    const grove = ENTITIES.find((entity) => entity.id === "indumoveis:landscape:grove")!;
    expect(TREES.slice(0, 13).every((point) => pointInPolygon(point, grove.polygon))).toBe(true);
    expect(
      ENTITIES.filter((entity) => entity.kind !== "lot").every((entity) => !entity.numbers),
    ).toBe(true);
  });
});
