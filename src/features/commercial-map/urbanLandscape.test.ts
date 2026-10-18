import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { pointInPolygon } from "./geometry";
import type { Point } from "./data/territory";
import {
  appendResidentialLandscape,
  appendRoundaboutLandscape,
  appendBoundaryTrees,
  type ResidentialLandscapeInput,
  type UrbanLandscapeBatches,
} from "./urbanLandscape";

const bucket = () => ({ position: [] as number[], color: [] as number[], uv: [] as number[] });
const batches = (): UrbanLandscapeBatches => ({
  ground: bucket(),
  canopy: bucket(),
  detail: bucket(),
  water: bucket(),
});
const rect = (width: number, depth: number): Point[] => [
  [-width / 2, -depth / 2],
  [width / 2, -depth / 2],
  [width / 2, depth / 2],
  [-width / 2, depth / 2],
];
const inputs: ResidentialLandscapeInput[] = [
  { parcel: rect(8.4, 22), width: 6.2, depth: 11, pool: true, frontageDistance: 12.5 },
  { parcel: rect(10.5, 15), width: 6.8, depth: 10.5, pool: false, frontageDistance: 8 },
  {
    parcel: [
      [-6, -10],
      [5, -10],
      [5, 7],
      [1, 11],
      [-6, 11],
    ],
    width: 6.2,
    depth: 10,
    pool: true,
    frontageDistance: 11,
  },
];

describe("persistent batched residential landscape", () => {
  it("uses deterministic volumetric trees/branches and planted garden detail without allocating GPU resources", () => {
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const material = vi.spyOn(THREE.Material.prototype, "dispose");
    try {
      const before = JSON.stringify(inputs);
      for (const [index, input] of inputs.entries()) {
        const a = batches(),
          b = batches();
        const result = appendResidentialLandscape(input, index, a);
        expect(appendResidentialLandscape(input, index, b)).toEqual(result);
        expect(a).toEqual(b);
        expect(result.trees).toBe(1);
        expect(result.persistentTriangles).toBeGreaterThanOrEqual(280);
        expect(result.persistentTriangles).toBeLessThanOrEqual(400);
        expect(a.ground.position.length).toBeGreaterThan(0);
        expect(a.canopy.position.length).toBeGreaterThan(a.detail.position.length);
      }
      expect(JSON.stringify(inputs)).toBe(before);
      expect(geometry).not.toHaveBeenCalled();
      expect(material).not.toHaveBeenCalled();
    } finally {
      geometry.mockRestore();
      material.mockRestore();
    }
  });

  it("keeps actual emitted geometry inside each oriented local parcel and outside the house/access", () => {
    const cases = inputs
      .map((input, index) => ({ input, index }))
      .concat(
        [3, 10, 17, 24, 31].map((index) => ({ input: inputs[index % inputs.length], index })),
      );
    for (const { index, input } of cases) {
      const out = batches();
      const result = appendResidentialLandscape(input, index, out);
      for (const part of Object.values(out)) {
        expect(part.position.length).toBe(part.color.length);
        expect(part.uv.length).toBe((part.position.length / 3) * 2);
        expect([...part.position, ...part.color, ...part.uv].every(Number.isFinite)).toBe(true);
        for (let i = 0; i < part.position.length; i += 3) {
          const [x, y, z] = part.position.slice(i, i + 3);
          expect(pointInPolygon([x, z], input.parcel), `parcel ${index} ${x},${z}`).toBe(true);
          expect(Math.abs(x) < input.width / 2 && Math.abs(z) < input.depth / 2).toBe(false);
          expect(y).toBeGreaterThanOrEqual(-0.19);
          expect(y).toBeLessThan(3.6);
        }
        for (let i = 0; i < part.position.length; i += 9) {
          const p = part.position.slice(i, i + 9);
          const a = new THREE.Vector3(p[0], p[1], p[2]),
            b = new THREE.Vector3(p[3], p[4], p[5]),
            c = new THREE.Vector3(p[6], p[7], p[8]);
          expect(b.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(1e-10);
        }
      }
      expect(result.tree).not.toBeNull();
      expect(result.tree!.species).toBe(index % 7 === 3 ? "palm" : "broadleaf");
      expect(result.tree!.persistentTriangles).toBeLessThanOrEqual(280);
      if (result.tree!.species === "palm") {
        expect(result.tree!.fronds).toBeGreaterThanOrEqual(7);
        expect(result.tree!.fronds).toBeLessThanOrEqual(9);
        for (let i = 0; i < result.tree!.persistentTriangles * 9; i += 3)
          expect(
            Math.hypot(
              out.canopy.position[i] - result.tree!.center[0],
              out.canopy.position[i + 2] - result.tree!.center[1],
            ),
          ).toBeLessThan(result.tree!.crownRadius);
      }
      // Connected woody geometry begins just below the garden, rather than
      // attaching a crown to an unrelated floating primitive.
      expect(Math.min(...out.canopy.position.filter((_, i) => i % 3 === 1))).toBeLessThan(-0.145);
      if (result.pool) expect(out.water!.position.length).toBe(18);
    }
  });

  it("omits impossible pool/tree placements instead of spilling into a building or a tiny parcel", () => {
    const output = batches();
    const result = appendResidentialLandscape(
      { parcel: rect(6, 10), width: 5.9, depth: 9.8, pool: true, frontageDistance: 6 },
      0,
      output,
    );
    expect(result.pool).toBeNull();
    expect(result.trees).toBe(0);
    expect(output.water!.position).toHaveLength(0);
    expect(() => appendResidentialLandscape({ ...inputs[0], width: NaN }, 0, output)).toThrow(
      "urban-landscape-invalid-input",
    );
  });

  it("adds grounded low planting wholly inside the usable circular island without introducing an object lifecycle", () => {
    for (const radius of [2.4, 4.8]) {
      const out = batches();
      const source = { center: [-52, 96] as Point, radius, groundElevation: -0.02 };
      const before = JSON.stringify(source);
      const result = appendRoundaboutLandscape(source, 2, out);
      expect(result.persistent).toBe(true);
      expect(result.shrubs).toBeGreaterThanOrEqual(4);
      expect(result.trees).toBe(0);
      expect(out.canopy.position.length).toBeGreaterThan(0);
      for (const part of Object.values(out))
        for (let i = 0; i < part.position.length; i += 3)
          expect(
            Math.hypot(
              part.position[i] - source.center[0],
              part.position[i + 2] - source.center[1],
            ),
          ).toBeLessThan(radius);
      expect(JSON.stringify(source)).toBe(before);
    }
  });

  it("bakes only explicit finite boundary centres with persistent 280-triangle crowns and independent mass provenance", () => {
    const points: Point[] = [
      [8, 155],
      [24, 157],
      [83, 154.5],
      [170, 158],
    ];
    const before = JSON.stringify(points),
      a = batches(),
      b = batches();
    const result = appendBoundaryTrees(points, 31, a, { scale: 1.1, groundElevation: -0.15 });
    expect(appendBoundaryTrees(points, 31, b, { scale: 1.1, groundElevation: -0.15 })).toEqual(
      result,
    );
    expect(a).toEqual(b);
    expect(result.trees).toBe(points.length);
    expect(result.persistent).toBe(true);
    expect(result.persistentTriangles).toBe(points.length * 280);
    expect(result.positions).toEqual(points);
    expect(new Set(result.records.map((record) => record.id)).size).toBe(points.length);
    expect(result.records.every((record) => record.origin === "satellite-mass")).toBe(true);
    const underCanopy = new THREE.Color("#829267").toArray();
    for (let i = 0; i < a.ground.color.length; i += 3)
      expect(a.ground.color.slice(i, i + 3)).toEqual(underCanopy);
    result.records.forEach((record, i) => expect(record.world).not.toBe(points[i]));
    for (let i = 0; i < a.canopy.position.length; i += 3) {
      const [x, y, z] = a.canopy.position.slice(i, i + 3);
      expect([x, y, z].every(Number.isFinite)).toBe(true);
      expect(
        points.some((point) => Math.hypot(x - point[0], z - point[1]) <= result.crownRadius),
      ).toBe(true);
      expect(y).toBeGreaterThan(-0.2);
    }
    expect(a.detail.position).toHaveLength(0);
    expect(a.water!.position).toHaveLength(0);
    expect(JSON.stringify(points)).toBe(before);
    const invalid = appendBoundaryTrees([points[0], points[0], [NaN, 154]], 31, batches());
    expect(invalid.trees).toBe(1);
    expect(invalid.positions).toEqual([points[0]]);
  });
});
