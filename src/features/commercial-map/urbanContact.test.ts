import { describe, expect, it } from "vitest";
import type { Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import {
  deriveUrbanContact,
  projectUrbanContactVolume,
  type UrbanContactHouse,
} from "./urbanContact";

const volume = { x0: -1, x1: 1, z0: -1.5, z1: 1.5, base: 0, height: 4 };
const house: UrbanContactHouse = { center: [0, 0], heading: 0, structuralVolumes: [volume] };
const sunDirection = [1, 1, 0] as const;
const area = (polygons: Point[][]) =>
  polygons.reduce((sum, p) => sum + Math.abs(signedPolygonArea(p)), 0);

function assertCoverageWithoutDoubleAlpha(source: Point[][], cells: Point[][]) {
  const bounds = polygonBounds(source.flat());
  for (let x = bounds.minX + 0.037; x < bounds.maxX; x += 0.173)
    for (let z = bounds.minY + 0.053; z < bounds.maxY; z += 0.191) {
      const point: Point = [x, z];
      const hits = cells.filter((cell) => pointInPolygon(point, cell)).length;
      expect(hits).toBe(source.some((polygon) => pointInPolygon(point, polygon)) ? 1 : 0);
    }
}

describe("static urban solar contact projections", () => {
  it("projects an analytic box away from the sun and preserves its exact swept area", () => {
    const polygon = projectUrbanContactVolume(house, volume, { sunDirection });
    expect(polygonBounds(polygon)).toEqual({ minX: -5, minY: -1.5, maxX: 1, maxY: 1.5 });
    expect(Math.abs(signedPolygonArea(polygon))).toBeCloseTo(18, 8);
    const vertical = projectUrbanContactVolume(house, volume, { sunDirection: [0, 3, 0] });
    expect(Math.abs(signedPolygonArea(vertical))).toBeCloseTo(6, 8);
    expect(projectUrbanContactVolume(house, volume, { sunDirection: [10, 10, 0] })).toEqual(
      polygon,
    );
  });

  it("rotates the architecture without rotating the world sun and respects real ground/base elevations", () => {
    const rotated = projectUrbanContactVolume({ center: [10, 20], heading: Math.PI / 2 }, volume, {
      sunDirection,
      groundElevation: -0.15,
      buildingBaseElevation: -0.1,
    });
    const b = polygonBounds(rotated);
    expect(b.minX).toBeCloseTo(4.45, 8);
    expect(b.maxX).toBeCloseTo(11.45, 8);
    expect(b.minY).toBeCloseTo(19, 8);
    expect(b.maxY).toBeCloseTo(21, 8);
    expect(Math.abs(signedPolygonArea(rotated))).toBeCloseTo(14, 8);
    const raised = projectUrbanContactVolume(
      house,
      { ...volume, base: 5, height: 2 },
      { sunDirection },
    );
    expect(polygonBounds(raised)).toEqual({ minX: -8, minY: -1.5, maxX: -4, maxY: 1.5 });
    expect(pointInPolygon([0, 0], raised)).toBe(false);
  });

  it("unions overlapping wings and upper storeys before alpha compositing", () => {
    const input = [
      {
        ...house,
        structuralVolumes: [volume, { ...volume, x0: 0, x1: 2 }, { ...volume, base: 1, height: 2 }],
      },
    ];
    const before = JSON.stringify(input);
    const result = deriveUrbanContact(input, { sunDirection });
    expect(area(result.cells)).toBeCloseTo(21, 8);
    assertCoverageWithoutDoubleAlpha(result.houses[0].sourcePolygons, result.cells);
    expect(JSON.stringify(input)).toBe(before);
    expect(deriveUrbanContact(input, { sunDirection })).toEqual(result);
  });

  it("also removes overlap between neighbouring homes while isolating spatially separate unions", () => {
    const result = deriveUrbanContact(
      [house, { ...house, center: [1, 0] }, { ...house, center: [30, 0] }],
      { sunDirection },
    );
    expect(result.componentCount).toBe(2);
    expect(area(result.cells)).toBeCloseTo(39, 8);
    expect(result.sourceVolumeCount).toBe(3);
    assertCoverageWithoutDoubleAlpha(
      result.houses.flatMap((h) => h.sourcePolygons),
      result.cells,
    );
    expect(result.houses.map((h) => h.index)).toEqual([0, 1, 2]);
  });

  it("clips volumes below the receiving ground and rejects non-finite or below-horizon inputs", () => {
    const below = deriveUrbanContact([{ ...house, structuralVolumes: [{ ...volume, base: -6 }] }], {
      sunDirection,
    });
    expect(below.cells).toEqual([]);
    expect(below.bounds).toBeNull();
    expect(below.projectedVolumeCount).toBe(0);
    for (const direction of [
      [0, 0, 0],
      [1, -1, 0],
      [1, 1e-9, 0],
      [NaN, 1, 0],
    ] as const)
      expect(() => deriveUrbanContact([house], { sunDirection: direction })).toThrow(
        "urban-contact-invalid-sun",
      );
    expect(() =>
      deriveUrbanContact([{ ...house, structuralVolumes: [{ ...volume, height: -1 }] }], {
        sunDirection,
      }),
    ).toThrow("urban-contact-invalid-volume");
    // Architectural metadata has string fields too; only coordinates are validated.
    const metadata = { ...volume, role: "main", roof: "hip", axis: "z" };
    expect(projectUrbanContactVolume(house, metadata, { sunDirection }).length).toBeGreaterThan(2);
  });
});
