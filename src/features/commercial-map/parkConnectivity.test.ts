import { describe, expect, it } from "vitest";
import type { Point } from "./data/territory";
import { ENTITIES } from "./data/territory";
import { derivePavement } from "./pavement";
import { deriveParkDetails } from "./parkDetails";
import { PARK_PHYSICAL_BLOCKS } from "./permanentParkLayout";
import { auditParkConnectivity, buildSurfaceNetwork, sampleSurfacePath } from "./parkConnectivity";

const rect = (x0: number, z0: number, x1: number, z1: number): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

describe("surface-supported physical park connectivity", () => {
  it("finds the existing documented Mostra promenade without a detour through P12", () => {
    const pavement = derivePavement(ENTITIES);
    const network = buildSurfaceNetwork(
      [...pavement.asphaltCells, ...pavement.walkCells, ...deriveParkDetails(ENTITIES).concrete],
      {
        blockers: ENTITIES.filter((e) => e.kind === "lot" || e.kind === "pavilion").map(
          (e) => e.polygon,
        ),
      },
    );
    const from = ENTITIES.find((e) => e.id === "indumoveis:road:argentina")!.anchor;
    const to: Point = [60.18092, 60.7];
    const authored: Point[] = [from, [68, 65.7125], [68, 60.7], to];
    expect(sampleSurfacePath(authored, network.surfaces).supported).toBe(true);
    expect(network.trace(from, to)).not.toBeNull();
  });
  it("walks the actual bend and rejects a short straight line across the grass", () => {
    const surfaces = [rect(0, 0, 10, 2), rect(8, 0, 10, 10)];
    const network = buildSurfaceNetwork(surfaces);
    expect(network.componentCount).toBe(1);
    const route = network.trace([1, 1], [9, 9]);
    expect(route).not.toBeNull();
    expect(sampleSurfacePath(route!, surfaces).supported).toBe(true);
    expect(
      sampleSurfacePath(
        [
          [1, 1],
          [9, 9],
        ],
        surfaces,
      ).supported,
    ).toBe(false);
  });

  it("rejects close bounds, corner-only contacts, a narrow pinch and a wall across the road", () => {
    for (const surfaces of [
      [rect(0, 0, 5, 2), rect(5.01, 0, 10, 2)],
      [rect(0, 0, 5, 2), rect(5, 2, 10, 4)],
      [rect(0, 0, 5, 2), rect(5, 1.95, 10, 4)],
    ])
      expect(buildSurfaceNetwork(surfaces).componentCount).toBe(2);
    const blocked = buildSurfaceNetwork([rect(0, 0, 10, 2)], { blockers: [rect(4, -1, 6, 3)] });
    expect(blocked.trace([1, 1], [9, 1])).toBeNull();
    expect(blocked.locate([5, 1])).toBe(-1);
    expect(sampleSurfacePath([[5, 1]], blocked.surfaces).supported).toBe(false);
  });

  it("reports uncovered gate and equipment anchors instead of accepting proximity", () => {
    const report = auditParkConnectivity();
    expect(report.anchors.some((anchor) => anchor.kind === "gate")).toBe(true);
    expect(report.anchors.some((anchor) => anchor.kind === "block")).toBe(true);
    expect(report.anchors.filter((anchor) => anchor.kind === "block")).toHaveLength(
      PARK_PHYSICAL_BLOCKS.reduce((count, block) => count + block.referencePieces.length, 0),
    );
    expect(report.anchors.filter((anchor) => anchor.kind === "pavilion")).toHaveLength(6);
    expect(report.anchors.some((anchor) => anchor.kind === "equipment")).toBe(true);
    expect(report.pending.every((anchor) => anchor.route === null)).toBe(true);
    expect(report.verified + report.pending.length).toBe(report.anchors.length);
    // Keep diagnostics explicit while the implantation is being reconciled.
    console.info(
      JSON.stringify({
        vehicleComponents: report.vehicleComponents,
        pedestrianComponents: report.pedestrianComponents,
        verified: report.verified,
        preparationMs: report.preparationMs,
        pending: report.pending.map(({ id, status, firstGap }) => ({ id, status, firstGap })),
      }),
    );
  }, 60000);
});
