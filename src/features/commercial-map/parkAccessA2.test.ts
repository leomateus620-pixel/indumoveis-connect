import { describe, expect, it } from "vitest";
import { pointInPolygon, polygonBounds } from "./geometry";
import { deriveParkDetails, equipmentEntry } from "./parkDetails";
import { derivePavement } from "./pavement";
import { polygonsOverlap } from "./parkGeometry";
import { getPavilionPresentation } from "./architectureOrientation";
import {
  ARENA_APPROACH_POLYGONS,
  PARK_CORE_ENTITIES,
  PARK_GATES,
  PARK_RENDER_ENTITIES,
  PERMANENT_PARK_LANDMARKS,
} from "./permanentParkLayout";

describe("registered A2 physical thresholds", () => {
  it("supports all six public pavilion entries and all gate openings on actual floor", () => {
    const pavement = derivePavement(PARK_RENDER_ENTITIES),
      details = deriveParkDetails(PARK_RENDER_ENTITIES);
    const floor = [
      ...pavement.asphaltCells,
      ...pavement.walkCells,
      ...details.concrete,
      ...Object.values(ARENA_APPROACH_POLYGONS),
    ];
    const supports = (point: [number, number]) => floor.some((p) => pointInPolygon(point, p));
    for (const gate of PARK_GATES) expect(supports(gate.point), gate.id).toBe(true);
    for (const hall of PARK_CORE_ENTITIES.filter((e) => e.kind === "pavilion")) {
      const p = getPavilionPresentation(hall)!;
      for (const entry of p.mainEntries)
        expect(
          supports([entry[0] + p.frontNormal[0] * 0.04, entry[1] + p.frontNormal[1] * 0.04]),
          hall.id,
        ).toBe(true);
    }
  });
  it("clips new thresholds by actual protected polygons and keeps the Arena plaza on its slanted front", () => {
    const details = deriveParkDetails(PARK_RENDER_ENTITIES);
    const protectedPolygons = [
      ...PARK_CORE_ENTITIES.filter(
        (e) =>
          e.kind === "lot" ||
          e.kind === "pavilion" ||
          (e.kind === "support" && e.id !== "indumoveis:support:gate-03"),
      ).map((e) => e.polygon),
      ...PERMANENT_PARK_LANDMARKS.map((e) => e.polygon),
    ];
    const blockers = protectedPolygons.map((p) => ({ p, b: polygonBounds(p) }));
    for (const cell of details.concrete) {
      const c = polygonBounds(cell);
      for (const { p, b } of blockers) {
        if (c.maxX <= b.minX || c.minX >= b.maxX || c.maxY <= b.minY || c.minY >= b.maxY) continue;
        expect(polygonsOverlap(cell, p)).toBe(false);
      }
    }
    const arena = PERMANENT_PARK_LANDMARKS.find((e) => e.id === "arena")!;
    const right = ARENA_APPROACH_POLYGONS.plaza.slice(1, 3);
    for (const point of right) {
      const distance = Math.min(
        ...arena.polygon.map((a, i) => {
          const b = arena.polygon[(i + 1) % arena.polygon.length],
            dx = b[0] - a[0],
            dz = b[1] - a[1];
          const t = Math.max(
            0,
            Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)),
          );
          return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t);
        }),
      );
      expect(distance).toBeLessThan(1e-7);
    }
    const restaurant = PERMANENT_PARK_LANDMARKS.find((e) => e.id === "churrascaria-rural")!;
    expect(restaurant.front[1]).toBeLessThan(-0.99);
    const entry = equipmentEntry(
      restaurant.polygon,
      restaurant.front,
      PARK_RENDER_ENTITIES.filter((e) => e.kind === "road"),
    )!;
    expect(entry.gap).toBeLessThan(1);
  });
});
