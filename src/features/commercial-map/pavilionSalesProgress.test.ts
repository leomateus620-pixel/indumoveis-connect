import { describe, expect, it } from "vitest";
import { placePavilionMarkers } from "./pavilionSalesProgress";

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
    expect(result.get(12)).toMatchObject({ x: 155, y: 108 });
  });
});
