import { describe, expect, it } from "vitest";
import { ENTITIES, MAP_BOUNDS, RETIRED_EXTERNAL_LOTS, sourcePoint, TREES } from "./data/territory";
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

  it("renders each commercial external number as a distinct lot", () => {
    const lots = ENTITIES.filter((entity) => entity.kind === "lot");
    const numbers = lots.flatMap((entity) => entity.numbers ?? []).sort((a, b) => a - b);
    // 69 and 70 were never saleable ground: they are the Centro
    // Administrativo garden and the east green sector, kept as context only.
    expect(numbers).toEqual(Array.from({ length: 68 }, (_, i) => i + 1));
    expect(lots).toHaveLength(68);
    expect(lots.every((entity) => entity.numbers?.length === 1)).toBe(true);
    expect(lots.map((entity) => entity.id)).toEqual(
      numbers.map((number) => `indumoveis:external:lot:${String(number).padStart(2, "0")}`),
    );
    for (const retired of RETIRED_EXTERNAL_LOTS) {
      expect(ENTITIES.some((entity) => entity.id === retired.formerId)).toBe(false);
      const context = ENTITIES.find((entity) => entity.id === retired.contextId)!;
      expect(context.kind).toBe("landscape");
      expect(context.numbers).toBeUndefined();
      expect(context.polygon).toEqual(retired.polygon);
    }
    expect(lots.filter((entity) => entity.schematicBoundary)).toHaveLength(18);
  });

  it("preserves the union of each source envelope while drawing individual lots", () => {
    const lots = ENTITIES.filter((entity) => entity.kind === "lot");
    const envelopes = [
      { numbers: [9, 10], bounds: [1151.1096, 559.9367, 1258.0366, 644.2976], area: 203 },
      { numbers: [31, 32, 33, 34], bounds: [813.489, 353.4922, 1018.6903, 446.6278], area: 227 },
      { numbers: [35, 36, 49, 50], bounds: [1018.6903, 260.3559, 1126.1273, 446.6278], area: 227 },
      { numbers: [37, 38], bounds: [1151.1096, 353.4922, 1258.0366, 446.2806], area: 227 },
      { numbers: [39, 40], bounds: [1258.0366, 353.4922, 1360.6369, 446.2806], area: 227 },
      { numbers: [41, 42], bounds: [1360.6369, 353.4922, 1468.9349, 446.2806], area: 227 },
      { numbers: [43, 44], bounds: [710.5433, 260.3559, 813.489, 353.4922], area: 227 },
    ];
    for (const envelope of envelopes) {
      const [x0, y0, x1, y1] = envelope.bounds;
      const members = lots.filter((entity) => envelope.numbers.includes(entity.numbers![0]));
      const memberPoints = members.flatMap((entity) => entity.polygon);
      expect(members.map((member) => member.declaredAreaM2)).toEqual(
        envelope.numbers.map(() => envelope.area),
      );
      expect(members.every((member) => member.schematicBoundary)).toBe(true);
      expect(polygonBounds(memberPoints)).toEqual({
        minX: x0 / 10,
        minY: y0 / 10,
        maxX: x1 / 10,
        maxY: y1 / 10,
      });
      const areaInDrawingUnits = members.reduce(
        (sum, member) => sum + signedPolygonArea(member.polygon),
        0,
      );
      expect(areaInDrawingUnits).toBeCloseTo(((x1 - x0) * (y1 - y0)) / 100, 8);
    }
    const [a, b, c, d, e] = [35, 36, 37, 49, 50].map((number) => lots[number - 1].anchor);
    expect(a[0]).toBeLessThan(b[0]);
    expect(b[0]).toBeLessThan(c[0]);
    expect(d[0]).toBeLessThan(e[0]);
    expect(d[1]).toBeLessThan(a[1]);
    expect(e[1]).toBeLessThan(b[1]);
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
    expect(ENTITIES.find((entity) => entity.numbers?.[0] === 57)?.declaredAreaM2).toBe(227);
  });

  it("leaves numbered terrain distinct from green unnumbered areas and circulation", () => {
    const eastGarden = ENTITIES.find((entity) => entity.id === "indumoveis:landscape:east-garden")!;
    expect(pointInPolygon(sourcePoint([1600, 800]), eastGarden.polygon)).toBe(true);
    expect(pointInPolygon(sourcePoint([1750, 800]), eastGarden.polygon)).toBe(false);
    expect(
      ENTITIES.filter((entity) => entity.kind === "lot").some((lot) =>
        pointInPolygon(sourcePoint([1600, 800]), lot.polygon),
      ),
    ).toBe(false);
    const grove = ENTITIES.find((entity) => entity.id === "indumoveis:landscape:grove")!;
    expect(TREES.slice(0, 13).every((point) => pointInPolygon(point, grove.polygon))).toBe(true);
    expect(
      ENTITIES.filter((entity) => entity.kind !== "lot").every((entity) => !entity.numbers),
    ).toBe(true);
  });
});
