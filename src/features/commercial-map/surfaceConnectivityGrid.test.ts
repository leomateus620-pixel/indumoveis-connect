import { describe, expect, it } from "vitest";
import type { Point } from "./data/territory";
import { pointInPolygon } from "./geometry";
import { sampleSurfacePath } from "./parkConnectivity";
import { buildSurfaceConnectivityGrid } from "./surfaceConnectivityGrid";

const rectangle = (x0: number, z0: number, x1: number, z1: number): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const network = (surfaces: Point[][], blockers: Point[][], root: Point) => {
  const contains = (p: Point) =>
    surfaces.some((surface) => pointInPolygon(p, surface)) &&
    !blockers.some((blocker) => pointInPolygon(p, blocker));
  const supported = (path: Point[]) => sampleSurfacePath(path, surfaces, { contains }).supported;
  return { grid: buildSurfaceConnectivityGrid(surfaces, blockers, root, supported), supported };
};

describe("conservative physical surface audit grid", () => {
  it("follows a real paved bend and independently revalidates the vector route", () => {
    const surfaces = [rectangle(0, 0, 10, 2), rectangle(8, 0, 10, 10)],
      root: Point = [1, 1],
      target: Point = [9, 9];
    const n = network(surfaces, [], root),
      route = n.grid.trace(target);
    expect(n.supported([root, target])).toBe(false);
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(2);
    expect(n.supported(route!)).toBe(true);
  });
  it("cannot turn a subcell gap or a wall into a rendered or certified connection", () => {
    const gap = network([rectangle(0, 0, 5, 2), rectangle(5.04, 0, 10, 2)], [], [1, 1]);
    expect(gap.grid.trace([9, 1])).toBeNull();
    const wall = network([rectangle(0, 0, 10, 2)], [rectangle(4, -1, 6, 3)], [1, 1]);
    expect(wall.grid.trace([9, 1])).toBeNull();
  });
  it("rejects an opening without the required lateral clearance", () => {
    const n = network(
      [rectangle(0, 0, 10, 4)],
      [rectangle(4, 0, 6, 1.98), rectangle(4, 2.02, 6, 4)],
      [1, 2],
    );
    expect(n.grid.trace([9, 2])).toBeNull();
  });
});
