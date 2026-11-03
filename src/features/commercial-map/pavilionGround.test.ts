import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES, type Point } from "./data/territory";
import { PARK_CORE_ENTITIES, PARK_RENDER_ENTITIES } from "./permanentParkLayout";
import { getPavilionPresentation } from "./architectureOrientation";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { polygonsOverlap } from "./parkGeometry";
import { derivePavilionGround } from "./pavilionGround";
import { createTerrain, deriveProtectedGround } from "./terrain";
import { createParkDetails, deriveParkDetails } from "./parkDetails";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { sampleSurfacePath } from "./parkConnectivity";

const contains = (p: Point, cells: readonly Point[][]) => cells.some((c) => pointInPolygon(p, c));
const ground = derivePavilionGround(PARK_RENDER_ENTITIES);
const overlaps = (a: Point[], b: Point[]) => {
  const x = polygonBounds(a),
    y = polygonBounds(b);
  return (
    x.minX < y.maxX &&
    x.maxX > y.minX &&
    x.minY < y.maxY &&
    x.maxY > y.minY &&
    polygonsOverlap(a, b)
  );
};

describe("pavilion landscape and avenue pedestrian sequence", () => {
  it("uses the physical backs without moving a building, lot or commercial identity", () => {
    const before = JSON.stringify(PARK_RENDER_ENTITIES),
      original = JSON.stringify(ENTITIES);
    derivePavilionGround(PARK_RENDER_ENTITIES);
    expect(JSON.stringify(PARK_RENDER_ENTITIES)).toBe(before);
    expect(JSON.stringify(ENTITIES)).toBe(original);
    for (const e of ENTITIES.filter((e) => e.kind === "lot"))
      expect(PARK_CORE_ENTITIES.find((p) => p.id === e.id)).toBe(e);
    for (const id of [1, 14]) {
      const p = getPavilionPresentation(
        PARK_CORE_ENTITIES.find((e) => e.id === `indumoveis:pavilion:${id}`)!,
      )!;
      expect(p.frontNormal).toEqual([1, 0]);
      const rear = p.rearEdge[0].map((n, i) => (n + p.rearEdge[1][i]) / 2) as Point;
      expect(contains([rear[0] - 1, rear[1]], ground.green), `P${id} rear`).toBe(true);
    }
    for (const p of [
      [30, 60],
      [30, 75],
      [40, 75],
      [40, 85],
      [30.9, 88.7],
    ] as Point[])
      expect(contains(p, ground.green), `grove ${p}`).toBe(true);
    // The through-path between P1 and P14 and the eastern entrance gallery remain open.
    expect(contains([35, 68], ground.green)).toBe(false);
    expect(contains([60, 68], ground.green)).toBe(false);
    expect(contains([63, 80], ground.green)).toBe(false);
  });

  it("follows P8's rear annex and gives all four avenue backs grass, sidewalk and curb in that order", () => {
    for (const [x, rearZ] of [
      [80, 88.82],
      [99, 89.48],
      [110, 86.16],
      [128, 89.4],
    ]) {
      expect(contains([x, rearZ + 0.2], ground.green), `rear lawn ${x}`).toBe(true);
      expect(contains([x, 92.1], ground.sidewalk)).toBe(true);
      expect(contains([x, 93.25], ground.curb)).toBe(true);
      expect(contains([x, 93.4], ground.green)).toBe(false);
    }
    expect(contains([103, 87], ground.green)).toBe(true);
    expect(contains([99, 88], ground.green)).toBe(false); // Inside the real rear annex.
    expect(ground.sidewalkStart).toBeLessThan(ground.curbStart);
    expect(ground.curbStart).toBeLessThan(ground.avenueEdge);
    for (const cell of [...ground.sidewalk, ...ground.curb])
      expect(ground.green.some((green) => overlaps(cell, green))).toBe(false);
  });

  it("preserves each existing rear service entry through an explicit narrow path and a continuous longitudinal walk", () => {
    const details = deriveParkDetails(PARK_RENDER_ENTITIES, ground);
    expect(ground.servicePaths).toHaveLength(8);
    for (const building of PARK_CORE_ENTITIES.filter((e) => e.kind === "pavilion")) {
      const p = getPavilionPresentation(building)!;
      if (p.frontNormal[1] !== -1) continue;
      const rearLevel = Math.min(...p.rearEdge.map((e) => e[1]));
      for (const entry of p.serviceEntries.filter((e) => e[1] >= rearLevel - 0.08)) {
        const path: Point[] = [
          [entry[0], entry[1] + 0.06],
          [entry[0], 92.6],
        ];
        expect(sampleSurfacePath(path, details.concrete).supported, `${building.id} ${entry}`).toBe(
          true,
        );
        expect(contains([entry[0], entry[1] + 0.12], ground.green)).toBe(false);
      }
    }
    expect(
      sampleSurfacePath(
        [
          [70, 92.3],
          [130, 92.3],
        ],
        details.concrete,
      ).supported,
    ).toBe(true);
  });

  it("creates a nonoverlapping partition outside protected buildings and roads", () => {
    for (let i = 0; i < ground.green.length; i++) {
      const a = ground.green[i];
      expect(Math.abs(signedPolygonArea(a))).toBeGreaterThan(1e-8);
      expect(a.flat().every(Number.isFinite)).toBe(true);
      for (const b of ground.green.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
      for (const e of PARK_RENDER_ENTITIES.filter((e) => e.kind === "lot" || e.kind === "pavilion"))
        expect(overlaps(a, e.polygon), e.id).toBe(false);
    }
    const details = deriveParkDetails(PARK_RENDER_ENTITIES, ground);
    for (const a of ground.green) expect(details.concrete.some((b) => overlaps(a, b))).toBe(false);
  });

  it("cuts the old concrete mesh rather than covering it with a raised green patch", () => {
    const oldCells = deriveProtectedGround(PARK_CORE_ENTITIES);
    const terrain = createTerrain(PARK_CORE_ENTITIES, {
      extent: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
      maps: false,
      foundationExclusions: ground.foundationExclusions,
    });
    try {
      const mesh = terrain.group.getObjectByName("preserved-circulation-floor") as THREE.Mesh;
      const positions = mesh.geometry.getAttribute("position");
      const triangles: Point[][] = [];
      for (let i = 0; i < positions.count; i += 3)
        triangles.push([0, 1, 2].map((j): Point => [positions.getX(i + j), positions.getZ(i + j)]));
      for (const witness of [
        [30, 60],
        [40, 75],
        [40, 85],
        [30.9, 88.7],
        [80, 90],
        [110, 88],
        [125, 90],
      ] as Point[]) {
        expect(contains(witness, oldCells)).toBe(true);
        expect(contains(witness, triangles), `old concrete removed at ${witness}`).toBe(false);
      }
      expect(contains([60, 68], triangles)).toBe(true);
    } finally {
      terrain.dispose();
    }
  });

  it("shares materials, keeps landscape non-pickable and releases only its own meshes", () => {
    const surfaces = createSurfaceMaterials({ maps: false });
    const spy = vi.spyOn(surfaces.materials.grass, "dispose");
    const details = createParkDetails(PARK_RENDER_ENTITIES, surfaces, ground);
    const green = details.group.getObjectByName("indumoveis-pavilion-back-lawns") as THREE.Mesh;
    const curb = details.group.getObjectByName("indumoveis-avenue-curb") as THREE.Mesh;
    expect(green.material).toBe(surfaces.materials.grass);
    expect(curb.material).toBe(surfaces.materials.concrete);
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(40, 10, 75),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(green),
    ).toEqual([]);
    expect(curb.geometry.getAttribute("position").array.some((v, i) => i % 3 === 1 && v < 0)).toBe(
      true,
    );
    details.dispose();
    details.dispose();
    expect(spy).not.toHaveBeenCalled();
    surfaces.dispose();
  });
});
