import { describe, expect, it } from "vitest";
import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { pointInPolygon } from "./geometry";
import {
  commercialBoundaries,
  boundaryDistance,
  interiorLotAnchor,
  lotNumberHeight,
  LOT_GRAPHICS,
} from "./commercialPresentation";
import { createCommercialBoundaries } from "./commercialBoundaries";
import { COMMERCIAL_STATUS_COLORS } from "./visualTheme";

const entity = (id: string, polygon: Point[]): MapEntity => ({
  ...ENTITIES.find((e) => e.kind === "lot")!,
  id,
  polygon,
});
const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const length = (edge: { a: Point; b: Point }) =>
  Math.hypot(edge.a[0] - edge.b[0], edge.a[1] - edge.b[1]);

describe("commercial cadastral presentation", () => {
  it("draws a shared edge once even where a long edge meets two neighbours", () => {
    const lots = [
      entity("a", rectangle(0, 0, 4, 4)),
      entity("b", rectangle(4, 0, 8, 2)),
      entity("c", rectangle(4, 2, 8, 4)),
    ];
    const edges = commercialBoundaries(lots);
    expect(
      edges.filter((edge) => edge.owners.length === 2).reduce((sum, edge) => sum + length(edge), 0),
    ).toBeCloseTo(8);
    expect(
      edges.filter((edge) => edge.owners.length === 1).reduce((sum, edge) => sum + length(edge), 0),
    ).toBeCloseTo(24);
    expect(edges.every((edge) => edge.owners.length < 3)).toBe(true);
    expect(
      new Set(edges.map((edge) => [edge.a.join(","), edge.b.join(",")].sort().join("/"))).size,
    ).toBe(edges.length);
  });

  it("retains slanted/irregular coordinates and never closes a real gap", () => {
    const polygon: Point[] = [
      [0.123456789, 0],
      [5.4, 0.3],
      [4, 4],
      [2.1, 2],
      [0, 4],
    ];
    const edges = commercialBoundaries([
      entity("irregular", polygon),
      entity("separate", rectangle(5.401, 0.3, 8, 4)),
    ]);
    expect(edges).toHaveLength(9);
    expect(edges.every((edge) => edge.owners.length === 1)).toBe(true);
    expect(edges[0].a).toBe(polygon[0]);
    expect(edges[0].a[0]).toBe(0.123456789);
  });

  it("preserves every commercial identity and canonical source coordinate", () => {
    const before = JSON.stringify(ENTITIES);
    const lots = ENTITIES.filter((e) => e.kind === "lot");
    const edges = commercialBoundaries(ENTITIES);
    expect(lots).toHaveLength(59);
    expect(lots.flatMap((lot) => lot.numbers ?? []).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 70 }, (_, i) => i + 1),
    );
    expect(edges.some((edge) => edge.owners.length === 2)).toBe(true);
    expect(
      edges.every((edge) => edge.owners.every((id) => lots.some((lot) => lot.id === id))),
    ).toBe(true);
    for (const lot of lots) {
      const anchor = interiorLotAnchor(lot.polygon, lot.anchor);
      expect(pointInPolygon(anchor, lot.polygon)).toBe(true);
      expect(boundaryDistance(anchor, lot.polygon)).toBeGreaterThan(0);
    }
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });

  it("finds an interior point in a concave envelope whose bounding-box centre is outside", () => {
    const polygon: Point[] = [
      [0, 0],
      [6, 0],
      [6, 1],
      [1, 1],
      [1, 6],
      [0, 6],
    ];
    expect(pointInPolygon([3, 3], polygon)).toBe(false);
    const anchor = interiorLotAnchor(polygon, [3, 3]);
    expect(pointInPolygon(anchor, polygon)).toBe(true);
    const radius = boundaryDistance(anchor, polygon);
    expect(radius).toBeGreaterThan(0.49);
    // Any ground number bounded by this circle stays inside the polygon,
    // including its corners at arbitrary camera azimuth/polar orientation.
    for (const selected of [false, true]) {
      for (const units of [0.001, 0.04, 0.5, 10]) {
        const badgeHeight = lotNumberHeight(radius, units, 2.5, selected);
        const cornerRadius = Math.hypot(badgeHeight / 2, (badgeHeight * 2.5) / 2);
        expect(cornerRadius).toBeLessThan(radius);
      }
    }
  });

  it("uses a bounded smooth CSS-size policy instead of a world-width jump during zoom", () => {
    expect(lotNumberHeight(100, 0.1, 1.4, false) / 0.1).toBeCloseTo(14);
    expect(lotNumberHeight(100, 0.2, 1.4, false) / 0.2).toBeCloseTo(14);
    expect(lotNumberHeight(1, 20, 1.4, false)).toBeLessThan(1.1);
    const samples = Array.from({ length: 100 }, (_, i) =>
      lotNumberHeight(2, 0.02 + i * 0.001, 2, false),
    );
    expect(samples.every((value, i) => i === 0 || value >= samples[i - 1])).toBe(true);
    expect(samples.every((value, i) => i === 0 || value - samples[i - 1] < 0.017)).toBe(true);
  });

  it("keeps persisted status colours independent from hover and selection ink", () => {
    expect(COMMERCIAL_STATUS_COLORS).toEqual({
      disponivel: "#b8d6c5",
      em_negociacao: "#b9ccdf",
      reservado: "#e2c69e",
      vendido: "#9b7c91",
      bloqueado: "#b6b2b5",
    });
    expect(Object.values(COMMERCIAL_STATUS_COLORS)).not.toContain(LOT_GRAPHICS.selected);
    expect(Object.values(COMMERCIAL_STATUS_COLORS)).not.toContain(LOT_GRAPHICS.hover);
    expect(LOT_GRAPHICS.hover).not.toBe(LOT_GRAPHICS.selected);
  });

  it("reuses every geometry and material across hover and selection updates", () => {
    const lots = ENTITIES.filter((e) => e.kind === "lot");
    const ink = createCommercialBoundaries(lots);
    const uuids = ink.resources.map((resource) => resource.uuid);
    const childCount = ink.group.children.length;
    for (let i = 0; i < 80; i++) {
      ink.hover(lots[i % lots.length]);
      ink.select(lots[(i + 1) % lots.length], 0.2);
    }
    expect(ink.group.children).toHaveLength(childCount);
    expect(ink.resources.map((resource) => resource.uuid)).toEqual(uuids);
    expect(ink.resources.every((resource) => !resource.name.includes("wall"))).toBe(true);
    ink.hover(lots[0]);
    ink.select(lots[0], 0.2);
    expect(ink.group.children.at(-1)?.visible).toBe(false);
    ink.select(undefined, 0.2);
    expect(ink.group.children.at(-1)?.visible).toBe(true);
    ink.resources.forEach((resource) => resource.dispose());
  });
});
