import { describe, expect, it } from "vitest";
import { ENTITIES, TREES } from "./data/territory";
import { pointInPolygon } from "./geometry";
import { auditPlanting, distanceToPolygon } from "./planting";
import { EXPLORATION_POLYGONS } from "./urbanReference";
import { auditContextPlanting, CONTEXT_WOODLAND } from "./contextPlanting";

describe("external woodland mass", () => {
  it("keeps twenty explicit context roots outside all source geometry and urban corridors", () => {
    const sourceBefore = JSON.stringify([ENTITIES, TREES]);
    expect(CONTEXT_WOODLAND).toHaveLength(20);
    expect(new Set(CONTEXT_WOODLAND.map((record) => record.id)).size).toBe(CONTEXT_WOODLAND.length);
    for (const record of CONTEXT_WOODLAND) {
      expect(record.scale).toBeGreaterThanOrEqual(1.1);
      expect(record.scale).toBeLessThanOrEqual(1.5);
      expect(record.world.every(Number.isFinite)).toBe(true);
      for (const polygon of [
        ...ENTITIES.map((entity) => entity.polygon),
        ...EXPLORATION_POLYGONS,
      ]) {
        expect(pointInPolygon(record.world, polygon)).toBe(false);
        expect(distanceToPolygon(record.world, polygon)).toBeGreaterThan(3);
      }
    }
    expect(auditPlanting()).toHaveLength(30);
    expect(JSON.stringify([ENTITIES, TREES])).toBe(sourceBefore);
  });

  it("identifies a photographed mass, never an individually confirmed trunk or commercial owner", () => {
    const before = JSON.stringify(CONTEXT_WOODLAND);
    const records = auditContextPlanting(CONTEXT_WOODLAND);
    expect(records).toHaveLength(CONTEXT_WOODLAND.length);
    expect(records.every((record) => record.origin === "satellite-mass")).toBe(true);
    expect(records.every((record) => record.confidence === "approximate-woodland-mass")).toBe(true);
    expect(records.every((record) => record.referenceImage?.endsWith("21_33_52.jpg"))).toBe(true);
    expect(
      records.every((record) => record.referencePixel === null && record.ownerEntityId === null),
    ).toBe(true);
    expect(records.every((record) => record.sourceEntityIds.length === 0)).toBe(true);
    expect(records[0].world).not.toBe(CONTEXT_WOODLAND[0].world);
    expect(JSON.stringify(CONTEXT_WOODLAND)).toBe(before);
  });

  it("drops invalid, duplicated and protected roots rather than moving or regenerating them", () => {
    const record = CONTEXT_WOODLAND[0];
    expect(
      auditContextPlanting([
        record,
        { ...record },
        { id: "not-finite", world: [NaN, 60], scale: 1.2 },
        { id: "not-scaled", world: [-15, 55], scale: Infinity },
        {
          id: "commercial-root",
          world: ENTITIES.find((entity) => entity.kind === "lot")!.anchor,
          scale: 1.2,
        },
        { id: "urban-root", world: EXPLORATION_POLYGONS[0][0], scale: 1.2 },
      ]).map((entry) => entry.id),
    ).toEqual([record.id]);
  });
});
