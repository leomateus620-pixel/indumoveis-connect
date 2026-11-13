import { describe, expect, it } from "vitest";
import { placePavilionMarkers, stepPavilionMarkerScale } from "./pavilionSalesProgress";

describe("roof marker placement", () => {
  it("keeps the selected pavilion over a conflicting roof and excludes the detail panel and stage edges", () => {
    const result = placePavilionMarkers(
      [
        { pavilionNumber: 8, x: 150, y: 118, distance: 5, scale: 1 },
        { pavilionNumber: 12, x: 155, y: 118, distance: 14, scale: 1 },
        { pavilionNumber: 13, x: 260, y: 160, distance: 7, scale: 1 },
        { pavilionNumber: 3, x: 32, y: 180, distance: 1, scale: 1 },
        { pavilionNumber: 14, x: 150, y: 190, distance: 30, scale: 1 },
      ],
      { width: 320, height: 240 },
      { right: 76, bottom: 40 },
      new Set([3, 8, 12, 13, 14]),
      12,
    );
    expect([...result.keys()]).toEqual([12, 14]);
    expect(result.get(12)).toMatchObject({ x: 155, y: 118 });
  });

  it("keeps clear diagonals and prioritizes the closer roof when there is no selection", () => {
    const result = placePavilionMarkers(
      [
        { pavilionNumber: 8, x: 90, y: 110, distance: 5, scale: 1 },
        { pavilionNumber: 12, x: 132, y: 150, distance: 14, scale: 1 },
        { pavilionNumber: 3, x: 100, y: 110, distance: 2, scale: 1 },
      ],
      { width: 250, height: 220 },
      { right: 0, bottom: 0 },
      new Set([3, 8, 12]),
    );
    expect([...result.keys()]).toEqual([3]);
    const shifted = placePavilionMarkers(
      [
        { pavilionNumber: 8, x: 90, y: 110, distance: 5, scale: 1 },
        { pavilionNumber: 12, x: 132, y: 150, distance: 14, scale: 1 },
      ],
      { width: 250, height: 220 },
      { right: 0, bottom: 0 },
      new Set([8, 12]),
    );
    expect([...shifted.keys()]).toEqual([8, 12]);
    expect(shifted.get(12)).toMatchObject({ x: 132, y: 150 });
  });

  it("bounds marker scale lag and settles without oscillating after a zoom", () => {
    const target = 1.07;
    let state = { value: 0.92, velocity: 0 };
    for (let frame = 0; frame < 45; frame++) {
      const next = stepPavilionMarkerScale(state, target, 1 / 60);
      expect(next.value).toBeGreaterThanOrEqual(target - 0.035);
      expect(next.value).toBeGreaterThanOrEqual(state.value);
      expect(next.value).toBeLessThanOrEqual(target);
      state = next;
    }
    expect(state).toEqual({ value: target, velocity: 0 });
    expect(stepPavilionMarkerScale({ value: 1.009, velocity: 0.2 }, 1.01, 1 / 60)).toEqual({
      value: 1.01,
      velocity: 0,
    });
  });
});
