import { describe, expect, it } from "vitest";
import { boundaryDistance } from "./commercialPresentation";
import { ENTITIES, type Point } from "./data/territory";
import { deriveParkDetails } from "./parkDetails";
import { PARK_LOT_TREES, selectParkLotTrees } from "./parkLotPlanting";
import { derivePavement } from "./pavement";
import { derivePavilionGround } from "./pavilionGround";
import {
  PARK_CONTEXT_ROADS,
  PARK_CONTEXT_WALKS,
  PARK_RENDER_ENTITIES,
} from "./permanentParkLayout";

describe("aerial-reference planting in and around the commercial blocks", () => {
  const topology = derivePavement(PARK_RENDER_ENTITIES);
  const ground = derivePavilionGround(PARK_RENDER_ENTITIES);
  const { concrete } = deriveParkDetails(PARK_RENDER_ENTITIES, ground);

  it("fits every authored centre and crown on the same geometry as the 3D renderer", () => {
    const trees = selectParkLotTrees(topology, ground, concrete);
    expect(trees).toEqual(PARK_LOT_TREES);
    expect(new Set(trees.map(({ id }) => id)).size).toBe(trees.length);
    expect(new Set(trees.map(({ form }) => form))).toEqual(
      new Set(["broadleaf", "upright", "spreading"]),
    );

    const insideLots = trees.filter(({ priority }) => priority === "lot");
    const surroundingBlocks = trees.filter(({ priority }) => priority === "edge");
    expect(new Set(insideLots.map(({ blockId }) => blockId))).toEqual(
      new Set(["L", "F", "J", "E", "I", "D"]),
    );
    expect(insideLots.length).toBeGreaterThanOrEqual(20);
    expect(surroundingBlocks.some(({ blockId }) => blockId === "C")).toBe(true);
    expect(surroundingBlocks.some(({ blockId }) => blockId === "O")).toBe(true);
    for (const tree of insideLots) {
      const lot = ENTITIES.find((entity) => entity.id === tree.ownerEntityId);
      expect(lot?.kind, tree.id).toBe("lot");
      expect(boundaryDistance(tree.world, lot!.polygon), tree.id).toBeGreaterThan(tree.crownRadius);
    }
  });

  it("also keeps surrounding canopies off the raw street and path rings in the fallback map", () => {
    const surfaces = [...PARK_CONTEXT_ROADS, ...PARK_CONTEXT_WALKS];
    for (const tree of PARK_LOT_TREES.filter(({ priority }) => priority === "edge")) {
      expect(
        surfaces.every(
          ({ polygon, holes }) =>
            boundaryDistance(tree.world, polygon) < -tree.crownRadius ||
            holes?.some((hole) => boundaryDistance(tree.world, hole) > tree.crownRadius),
        ),
        tree.id,
      ).toBe(true);
    }
  });

  it("drops a tree when a new surface intersects only its crown, without moving its centre", () => {
    const tree = PARK_LOT_TREES.find(({ ownerEntityId }) => ownerEntityId?.endsWith(":46"))!;
    const [x, z] = tree.world;
    const edge = x + tree.crownRadius * 0.8;
    const patch: Point[] = [
      [edge, z - 0.2],
      [edge + 0.2, z - 0.2],
      [edge + 0.2, z + 0.2],
      [edge, z + 0.2],
    ];
    expect(boundaryDistance(tree.world, patch)).toBeLessThan(0);
    const expected = PARK_LOT_TREES.filter(({ id }) => id !== tree.id);
    expect(
      selectParkLotTrees(
        { ...topology, asphaltCells: [...topology.asphaltCells, patch] },
        ground,
        concrete,
      ),
    ).toEqual(expected);
    expect(selectParkLotTrees(topology, ground, [...concrete, patch])).toEqual(expected);
  });
});
