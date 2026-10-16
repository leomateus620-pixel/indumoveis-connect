import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ENTITIES, type MapEntity } from "./data/territory";
import { pointInPolygon } from "./geometry";
import {
  projectedTextMetrics,
  STREET_LABEL,
  streetLabelCorridor,
  streetLabelPresentation,
  streetLabelVisible,
  type StreetLabelInput,
} from "./labelPolicy";

const reference: StreetLabelInput = {
  naturalTextHeightPx: 12,
  naturalTextWidthPx: 100,
  worldTextWidth: 8,
  worldTextHeight: 0.78,
  corridorLength: 12,
  corridorWidth: 2,
  wasVisible: false,
};

describe("street text presentation", () => {
  it("hides a grazing word whose final perspective projection shrinks below the disappearance threshold", () => {
    const camera = new THREE.PerspectiveCamera(38, 2, 0.05, 3000);
    camera.position.set(0, Math.cos(1.4) * 10, Math.sin(1.4) * 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const project = (scale: number) =>
      projectedTextMetrics(
        [
          [-0.39, -5.85],
          [-0.39, 5.85],
          [0.39, 5.85],
          [0.39, -5.85],
        ].map(([x, z]) => {
          const point = new THREE.Vector3(x * scale, 0, z * scale).project(camera);
          return { x: (point.x + 1) * 600, y: (1 - point.y) * 300 };
        }),
      );
    const natural = project(1);
    const initial = streetLabelPresentation({
      ...reference,
      naturalTextHeightPx: natural.height,
      naturalTextWidthPx: natural.width,
      worldTextWidth: 11.7,
      corridorLength: 20,
    });
    expect(initial.visible).toBe(true);
    const final = project(initial.scale);
    expect(final.height).toBeLessThan(8);
    expect(streetLabelVisible(final.height, false)).toBe(false);
    expect(streetLabelVisible(final.height, true)).toBe(false);
  });
  it("never enlarges the authored world text during zoom-out or grazing views", () => {
    for (const height of [0.00001, 0.02, 0.3, 2, 7, 9, 12, 30, 200]) {
      const result = streetLabelPresentation({ ...reference, naturalTextHeightPx: height });
      expect(result.scale).toBeLessThanOrEqual(1);
      expect(result.scale).toBeGreaterThanOrEqual(0);
      if (height < STREET_LABEL.disappearPixels) expect(result.visible).toBe(false);
    }
  });
  it("caps close-up glyph height in CSS pixels, with the identical cap for selection", () => {
    for (const height of [13, 14, 40, 140, 1000]) {
      const input = { ...reference, naturalTextHeightPx: height };
      const normal = streetLabelPresentation(input);
      const selected = streetLabelPresentation({ ...input, selected: true });
      expect(normal.textHeightPx).toBeLessThanOrEqual(13.000001);
      expect(selected).toEqual(normal);
      expect(normal.visible).toBe(true);
    }
  });
  it("fits glyph width and height inside the usable corridor without enlargement", () => {
    const narrow = streetLabelPresentation({ ...reference, corridorLength: 4 });
    expect(narrow.scale).toBe(0.5);
    expect(reference.worldTextWidth * narrow.scale).toBeLessThanOrEqual(4);
    expect(narrow.visible).toBe(false);
    const shallow = streetLabelPresentation({ ...reference, corridorWidth: 0.39 });
    expect(shallow.scale).toBe(0.5);
    expect(reference.worldTextHeight * shallow.scale).toBeLessThanOrEqual(0.39);
  });
  it("keeps separate appearance/disappearance thresholds through both hysteresis bands", () => {
    let visible = false;
    const states: boolean[] = [];
    for (const height of [9, 9.9, 10, 9.9, 9, 8.1, 8, 8.1, 9.9, 10]) {
      const result = streetLabelPresentation({
        ...reference,
        naturalTextHeightPx: height,
        wasVisible: visible,
      });
      visible = result.visible;
      states.push(visible);
      if (height === 9 && visible) expect(result.opacity).toBe(0.5);
    }
    expect(states).toEqual([false, false, true, true, true, true, false, false, false, true]);
  });
  it("measures projected glyph thickness independently from screen rotation and cell padding", () => {
    expect(
      projectedTextMetrics([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 12 },
        { x: 0, y: 12 },
      ]),
    ).toEqual({ width: 100, height: 12 });
    const rotated = projectedTextMetrics([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: -12, y: 100 },
      { x: -12, y: 0 },
    ]);
    expect(rotated).toEqual({ width: 100, height: 12 });
    const perspective = projectedTextMetrics([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 18 },
      { x: 0, y: 10 },
    ]);
    expect(perspective.height).toBeGreaterThan(17);
    const grazing = projectedTextMetrics([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 95, y: 0.03 },
      { x: 5, y: 0.03 },
    ]);
    expect(grazing.height).toBeCloseTo(0.03);
    expect(
      streetLabelPresentation({ ...reference, naturalTextHeightPx: grazing.height }).visible,
    ).toBe(false);
  });
  it("hides degenerate, invalid and zero-width corridors with finite results", () => {
    for (const invalid of [0, -1, NaN, Infinity]) {
      const result = streetLabelPresentation({ ...reference, corridorWidth: invalid });
      expect(result).toEqual({
        scale: 0,
        visible: false,
        opacity: 0,
        textHeightPx: 0,
        textWidthPx: 0,
      });
    }
    expect(projectedTextMetrics([])).toEqual({ width: 0, height: 0 });
  });
});

describe("street presentation corridor", () => {
  it("keeps the reference glyph rectangle inside every approved street polygon", () => {
    const roads = ENTITIES.filter((entity) => entity.kind === "road");
    const before = JSON.stringify(roads);
    for (const entity of roads) {
      const corridor = streetLabelCorridor(entity, roads);
      expect(corridor.width, entity.id).toBeGreaterThan(0);
      expect(corridor.length, entity.id).toBeGreaterThan(0);
      for (const longitudinal of [-0.5, 0.5])
        for (const transverse of [-0.5, 0.5]) {
          const point: [number, number] = corridor.vertical
            ? [
                entity.anchor[0] + transverse * corridor.width,
                entity.anchor[1] + longitudinal * corridor.length,
              ]
            : [
                entity.anchor[0] + longitudinal * corridor.length,
                entity.anchor[1] + transverse * corridor.width,
              ];
          expect(pointInPolygon(point, entity.polygon), entity.id).toBe(true);
        }
    }
    expect(JSON.stringify(roads)).toBe(before);
  });
  it("sets a margin before a perpendicular junction rather than placing a name across it", () => {
    const street: MapEntity = {
      id: "street",
      kind: "road",
      label: "Street",
      location: "Test",
      polygon: [
        [0, 0],
        [40, 0],
        [40, 3],
        [0, 3],
      ],
      anchor: [20, 1.5],
      source: "test",
      confidence: "test",
    };
    const cross: MapEntity = {
      ...street,
      id: "cross",
      polygon: [
        [27, -10],
        [30, -10],
        [30, 10],
        [27, 10],
      ],
      anchor: [28.5, 0],
    };
    expect(streetLabelCorridor(street, [street, cross]).length).toBeCloseTo(
      14 - STREET_LABEL.corridorMargin * 2,
    );
  });
});
