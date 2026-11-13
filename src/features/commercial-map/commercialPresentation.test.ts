import { describe, expect, it } from "vitest";
import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { pointInPolygon } from "./geometry";
import {
  commercialBoundaries,
  boundaryDistance,
  interiorLotAnchor,
  lotLabelAxis,
  lotLabelExtent,
  lotLabelFacing,
  lotLabelProjection,
  lotNumberFit,
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
    expect(lots).toHaveLength(68);
    expect(lots.flatMap((lot) => lot.numbers ?? []).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 68 }, (_, i) => i + 1),
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
    // The number is sized from the free chords through that anchor along its
    // fixed baseline, so it stays inside the reentrant polygon at any zoom.
    const axis = lotLabelAxis(polygon);
    const extent = lotLabelExtent(polygon, anchor, axis);
    expect(extent.along).toBeGreaterThan(0);
    expect(extent.across).toBeGreaterThan(0);
    for (const selected of [false, true]) {
      for (const units of [0.001, 0.04, 0.5, 10]) {
        const height = lotNumberFit(extent, units, 2.5, selected);
        expect(height).toBeLessThanOrEqual(extent.across * LOT_GRAPHICS.numberAcrossShare);
        expect(height * 2.5).toBeLessThanOrEqual(extent.along * LOT_GRAPHICS.numberAlongShare);
        for (const sx of [-1, 1])
          for (const sy of [-1, 1])
            expect(
              pointInPolygon(
                [
                  anchor[0] + (sx * axis[0] * height * 2.5) / 2 - (sy * axis[1] * height) / 2,
                  anchor[1] + (sx * axis[1] * height * 2.5) / 2 + (sy * axis[0] * height) / 2,
                ],
                polygon,
              ),
            ).toBe(true);
      }
    }
  });

  it("uses a bounded smooth CSS-size policy instead of a world-width jump during zoom", () => {
    const roomy = { along: 400, across: 400 };
    expect(lotNumberFit(roomy, 0.1, 1.4, false) / 0.1).toBeCloseTo(14);
    expect(lotNumberFit(roomy, 0.2, 1.4, false) / 0.2).toBeCloseTo(14);
    // Far away the lot, not the pixel target, limits the number: it shrinks
    // on screen until it drops below the legibility threshold.
    expect(lotNumberFit({ along: 2, across: 2 }, 20, 1.4, false)).toBeLessThan(1.1);
    const samples = Array.from({ length: 100 }, (_, i) =>
      lotNumberFit({ along: 4, across: 4 }, 0.02 + i * 0.001, 2, false),
    );
    expect(samples.every((value, i) => i === 0 || value >= samples[i - 1])).toBe(true);
    expect(samples.every((value, i) => i === 0 || value - samples[i - 1] < 0.017)).toBe(true);
  });

  it("gives every lot one camera-independent baseline shared along its block", () => {
    const lots = ENTITIES.filter((e) => e.kind === "lot");
    for (const lot of lots) {
      const axis = lotLabelAxis(lot.polygon);
      expect(Math.hypot(axis[0], axis[1])).toBeCloseTo(1, 9);
      // Recomputing is deterministic and the source cadastre is rectilinear:
      // every number reads along the drawing's east-west frontage.
      expect(lotLabelAxis(lot.polygon)).toEqual(axis);
      expect(axis[0]).toBeGreaterThan(0.99);
      const anchor = interiorLotAnchor(lot.polygon, lot.anchor);
      const extent = lotLabelExtent(lot.polygon, anchor, axis);
      expect(extent.along).toBeGreaterThan(0);
      expect(extent.across).toBeGreaterThan(0);
      const bounds = {
        w: Math.max(...lot.polygon.map((p) => p[0])) - Math.min(...lot.polygon.map((p) => p[0])),
        h: Math.max(...lot.polygon.map((p) => p[1])) - Math.min(...lot.polygon.map((p) => p[1])),
      };
      expect(extent.along).toBeLessThanOrEqual(bounds.w + 1e-6);
      expect(extent.across).toBeLessThanOrEqual(bounds.h + 1e-6);
    }
    // A slanted lot reads along its own frontage, and a chamfer cannot steer it.
    const slanted: Point[] = [
      [0, 0],
      [10, 2],
      [9, 7],
      [-1, 5],
    ];
    const axis = lotLabelAxis(slanted);
    expect(axis[0]).toBeCloseTo(10 / Math.hypot(10, 2));
    expect(axis[1]).toBeCloseTo(2 / Math.hypot(10, 2));
    expect(
      lotLabelAxis([
        [0, 0],
        [0, 10],
        [4, 10],
        [4, 0.4],
        [3.6, 0],
      ]),
    ).toEqual([1, 0]);
  });

  it("never rotates a number with camera azimuth and reverses its reading side only once", () => {
    const axis: Point = [1, 0];
    let facing: 1 | -1 = 1;
    const history: number[] = [];
    for (let degrees = 0; degrees <= 360; degrees += 1) {
      const azimuth = (degrees * Math.PI) / 180;
      facing = lotLabelFacing(axis, [Math.cos(azimuth), Math.sin(azimuth)], facing);
      history.push(facing);
    }
    // Only two orientations ever exist for a lot, 180 degrees apart.
    expect(new Set(history)).toEqual(new Set([1, -1]));
    const flips = history.filter((value, i) => i > 0 && value !== history[i - 1]).length;
    expect(flips).toBe(2);
    // The flip waits until the viewer is clearly beyond side-on (hysteresis),
    // so small movements around 90 degrees cannot make a number oscillate.
    expect(history[90]).toBe(1);
    expect(history[100]).toBe(1);
    expect(history[120]).toBe(-1);
    let side: 1 | -1 = 1;
    for (const degrees of [88, 92, 89, 93, 87, 94, 90])
      side = lotLabelFacing(
        axis,
        [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)],
        side,
      );
    expect(side).toBe(1);
    expect(lotLabelFacing(axis, [0, 0], -1)).toBe(-1);
  });

  it("measures a number as the eye reads it and drops slivers seen along their baseline", () => {
    const axis: Point = [1, 0];
    // Straight down: one world unit is one unit both ways.
    const top = lotLabelProjection(axis, [1, 0], [0, -1]);
    expect(top.height).toBeCloseTo(1);
    expect(top.baseline).toBeCloseTo(1);
    // Pitched 60 degrees from vertical, looking north: only the height shrinks.
    const pitched = lotLabelProjection(axis, [1, 0], [0, -0.5]);
    expect(pitched.height).toBeCloseTo(0.5);
    expect(pitched.baseline).toBeCloseTo(1);
    // The same pitch seen along the baseline: glyphs keep their thickness but
    // collapse sideways, which a height-only test would call legible.
    const endOn = lotLabelProjection(axis, [0, 1], [0.12, 0]);
    expect(endOn.baseline).toBeLessThan(LOT_GRAPHICS.numberMinBaseline);
    // A diagonal grazing view shears the number; its perpendicular height is
    // far smaller than either projected axis suggests.
    const azimuth = Math.PI / 4,
      grazing = 0.12;
    const sheared = lotLabelProjection(
      axis,
      [Math.cos(azimuth), Math.sin(azimuth)],
      [Math.sin(azimuth) * grazing, -Math.cos(azimuth) * grazing],
    );
    expect(sheared.height).toBeLessThan(0.2);
    expect(sheared.height).toBeGreaterThan(0);
    // Orientation of the baseline never changes the measure of a top view.
    for (let degrees = 0; degrees < 360; degrees += 15) {
      const a = (degrees * Math.PI) / 180;
      const result = lotLabelProjection([Math.cos(a), Math.sin(a)], [1, 0], [0, -1]);
      expect(result.height).toBeCloseTo(1);
      expect(result.baseline).toBeCloseTo(1);
    }
    expect(lotLabelProjection(axis, [0, 0], [0, 0])).toEqual({ baseline: 0, height: 0 });
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
