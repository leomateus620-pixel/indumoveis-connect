import { describe, expect, it } from "vitest";
import { ENTITIES, TREES } from "./data/territory";
import { pointInPolygon } from "./geometry";
import { distanceToPolygon } from "./planting";
import { PARK_GATES } from "./permanentParkLayout";
import {
  buildRegisteredParkWoodland,
  PARK_PLANTING,
  PARK_PLANTING_AUDIT,
  PARK_PLANTING_BARRIERS,
  getRegisteredParkWoodland,
  PARK_WOODLAND_MASSES,
  parkRegisteredCrownRadius,
  parkRegisteredPlantingAllowed,
  parkPlantingCrownClearsRoads,
} from "./parkPlanting";

const PARK_REGISTERED_WOODLAND = getRegisteredParkWoodland();

describe("registered park woodland", () => {
  it("keeps full crowns outside commercial parcels, buildings, circulation and clearings", () => {
    expect(PARK_REGISTERED_WOODLAND.length).toBeGreaterThan(80);
    expect(PARK_PLANTING_AUDIT.find((mass) => mass.id === "lunar-woodland")!.count).toBeGreaterThan(
      0,
    );
    expect(
      PARK_PLANTING_AUDIT.find((mass) => mass.id === "nations-woodland")!.count,
    ).toBeGreaterThan(0);
    for (const record of PARK_REGISTERED_WOODLAND) {
      const radius = parkRegisteredCrownRadius(record);
      expect(parkRegisteredPlantingAllowed(record), record.id).toBe(true);
      expect(parkPlantingCrownClearsRoads(record.world, radius), record.id).toBe(true);
      for (const barrier of PARK_PLANTING_BARRIERS) {
        expect(pointInPolygon(record.world, barrier.polygon), `${record.id} / ${barrier.id}`).toBe(
          false,
        );
        expect(
          distanceToPolygon(record.world, barrier.polygon),
          `${record.id} / ${barrier.id}`,
        ).toBeGreaterThanOrEqual(radius + PARK_PLANTING.accessMargin);
      }
      for (const gate of PARK_GATES)
        expect(
          Math.hypot(record.world[0] - gate.point[0], record.world[1] - gate.point[1]),
          `${record.id} / ${gate.id}`,
        ).toBeGreaterThanOrEqual(radius + gate.width / 2 + PARK_PLANTING.accessMargin);
    }
  });

  it("represents documented masses and preserves the unplanted civic and access spaces", () => {
    for (const record of PARK_REGISTERED_WOODLAND) {
      const mass = PARK_WOODLAND_MASSES.find((zone) =>
        record.id.startsWith(`park-registered:${zone.id}:`),
      )!;
      expect(pointInPolygon(record.world, mass.polygon)).toBe(true);
      expect(distanceToPolygon(record.world, mass.polygon)).toBeGreaterThanOrEqual(
        parkRegisteredCrownRadius(record),
      );
    }
    const first = PARK_REGISTERED_WOODLAND[0];
    expect(
      parkRegisteredPlantingAllowed({
        ...first,
        world: ENTITIES.find((entity) => entity.kind === "lot")!.anchor,
      }),
    ).toBe(false);
    expect(parkRegisteredPlantingAllowed({ ...first, world: PARK_GATES[0].point })).toBe(false);
    expect(parkRegisteredPlantingAllowed({ ...first, world: [NaN, 0] })).toBe(false);
    expect(PARK_PLANTING_AUDIT.every((mass) => !mass.individualTrunksSurveyed)).toBe(true);
  });

  it("prepares a deterministic irregular distribution without mutating cadastre or tree symbols", () => {
    const before = JSON.stringify([ENTITIES, TREES]);
    expect(buildRegisteredParkWoodland()).toEqual(PARK_REGISTERED_WOODLAND);
    expect(new Set(PARK_REGISTERED_WOODLAND.map((record) => record.id)).size).toBe(
      PARK_REGISTERED_WOODLAND.length,
    );
    const points = PARK_REGISTERED_WOODLAND.map((record) => record.world);
    expect(new Set(points.map((point) => point[0])).size).toBe(points.length);
    expect(new Set(points.map((point) => point[1])).size).toBe(points.length);
    expect(JSON.stringify([ENTITIES, TREES])).toBe(before);
  });
});
