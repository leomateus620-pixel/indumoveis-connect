import { describe, expect, it } from "vitest";
import { ENTITIES, TREES } from "./data/territory";
import { getArchitectureDefinition } from "./architecture";
import { pointInPolygon } from "./geometry";
import {
  auditPlanting,
  derivePresentationPlanting,
  distanceToPolygon,
  REVIEWED_CROWNS,
  PLANTING_REFERENCE,
} from "./planting";

describe("per-tree source and photographed-crown audit", () => {
  it("retains every original symbol with stable identity and explicitly leaves its photographic match unresolved", () => {
    const before = JSON.stringify([ENTITIES, TREES]);
    const source = auditPlanting(ENTITIES, false);
    expect(source).toHaveLength(TREES.length);
    source.forEach((record, index) => {
      expect(record.id).toBe(`drawing-tree-${String(index + 1).padStart(2, "0")}`);
      expect(record.world).toEqual(TREES[index]);
      expect(record.confidence).toBe("unmatched-drawing-symbol");
      expect(record.referenceImage).toBeNull();
      expect(record.referencePixel).toBeNull();
      expect(record.sourceEntityIds).toEqual(
        ENTITIES.filter((entity) => pointInPolygon(TREES[index], entity.polygon)).map(
          (entity) => entity.id,
        ),
      );
    });
    expect(source.find((record) => record.id === "drawing-tree-14")!.ownerEntityId).toBeNull();
    expect(source.find((record) => record.id === "drawing-tree-14")!.decision).toContain(
      "fora dos polígonos",
    );
    expect(JSON.stringify([ENTITIES, TREES])).toBe(before);
  });

  it("replaces automatic rows with exactly fifteen reviewed crowns and no inferred tree on a commercial lot", () => {
    const records = auditPlanting(),
      observed = records.filter((record) => record.origin === "satellite-crown");
    expect(observed).toHaveLength(15);
    expect(observed.filter((record) => record.zone === "arvoredo")).toHaveLength(7);
    expect(observed.filter((record) => record.zone === "pavilion-frontage")).toHaveLength(8);
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
    expect(new Set(observed.map((record) => record.referencePixel!.join(":"))).size).toBe(
      observed.length,
    );
    for (const record of observed) {
      expect(record.referenceImage).toBe(PLANTING_REFERENCE);
      expect(record.referencePixel![0]).toBeGreaterThan(0);
      expect(record.referencePixel![0]).toBeLessThan(1536);
      expect(record.referencePixel![1]).toBeGreaterThan(0);
      expect(record.referencePixel![1]).toBeLessThan(1024);
      expect(record.localRegistration.length).toBeGreaterThan(40);
      expect(record.confidence).toBe("visible-crown-local-approximation");
      const owner = ENTITIES.find((entity) => entity.id === record.ownerEntityId)!;
      expect(pointInPolygon(record.world, owner.polygon)).toBe(true);
      expect(owner.kind).not.toBe("lot");
      expect(record.sourceEntityIds).toContain(owner.id);
      expect(
        ENTITIES.some(
          (entity) => entity.kind === "lot" && pointInPolygon(record.world, entity.polygon),
        ),
      ).toBe(false);
      for (const vehicleRoad of ENTITIES.filter(
        (entity) => entity.kind === "road" && entity.id !== "indumoveis:road:arvoredo",
      ))
        expect(pointInPolygon(record.world, vehicleRoad.polygon)).toBe(false);
      for (const building of ENTITIES.filter((entity) => getArchitectureDefinition(entity)))
        expect(distanceToPolygon(record.world, building.polygon)).toBeGreaterThanOrEqual(2.4);
    }
    expect(derivePresentationPlanting()).toEqual(observed.map((record) => record.world));
    expect(auditPlanting()).toEqual(records);
  });

  it("drops a reviewed crown when source ownership changes rather than placing it in a different lot or regenerating rows", () => {
    const revised = ENTITIES.map((entity) =>
      entity.id === "indumoveis:road:arvoredo"
        ? {
            ...entity,
            polygon: [
              [1, 1],
              [2, 1],
              [2, 2],
              [1, 2],
            ] as [number, number][],
          }
        : entity,
    );
    const before = JSON.stringify(revised);
    const observed = auditPlanting(revised).filter((record) => record.origin === "satellite-crown");
    expect(observed).toHaveLength(8);
    expect(observed.every((record) => record.zone === "pavilion-frontage")).toBe(true);
    expect(
      observed.every((record) =>
        REVIEWED_CROWNS.some(
          (source) =>
            source.id === record.id &&
            source.world[0] === record.world[0] &&
            source.world[1] === record.world[1],
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify(revised)).toBe(before);
  });
});
