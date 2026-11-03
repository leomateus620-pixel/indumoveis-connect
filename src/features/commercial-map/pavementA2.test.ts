import { describe, expect, it } from "vitest";
import { PARK_RENDER_ENTITIES } from "./permanentParkLayout";
import { derivePavement } from "./pavement";
import { polygonsOverlap } from "./parkGeometry";
import { polygonBounds } from "./geometry";

describe("complete A2 park pavement preparation", () => {
  it("preserves the full trace with bounded geometry and excludes protected commercial/building footprints", () => {
    const reference = PARK_RENDER_ENTITIES.filter((entity) =>
      entity.id.startsWith("indumoveis:context:road:a2-network:"),
    );
    const vertices = reference.reduce(
      (sum, entity) =>
        sum + entity.polygon.length + (entity.holes ?? []).reduce((n, hole) => n + hole.length, 0),
      0,
    );
    const protectedEntities = PARK_RENDER_ENTITIES.filter(
      (entity) =>
        entity.kind === "lot" ||
        entity.kind === "pavilion" ||
        (entity.kind === "support" && entity.id !== "indumoveis:support:gate-03"),
    );
    const before = JSON.stringify(protectedEntities.filter((entity) => entity.kind === "lot"));
    const started = performance.now();
    const topology = derivePavement(PARK_RENDER_ENTITIES);
    const preparationMs = performance.now() - started;
    expect(topology.asphaltCells.length).toBeGreaterThan(0);
    // Exact Earcut/refinement stays proportional to the source boundary. This
    // catches the former raster-x slab explosion without a CPU-specific timer.
    expect(topology.asphaltCells.length + topology.walkCells.length).toBeLessThan(vertices * 4);
    const blockers = protectedEntities.map((entity) => ({
      entity,
      bounds: polygonBounds(entity.polygon),
    }));
    const collisions: string[] = [];
    for (const cell of [...topology.asphaltCells, ...topology.walkCells]) {
      const b = polygonBounds(cell);
      for (const blocker of blockers) {
        const p = blocker.bounds;
        if (b.maxX <= p.minX || b.minX >= p.maxX || b.maxY <= p.minY || b.minY >= p.maxY) continue;
        if (polygonsOverlap(cell, blocker.entity.polygon)) collisions.push(blocker.entity.id);
      }
    }
    expect([...new Set(collisions)]).toEqual([]);
    expect(JSON.stringify(protectedEntities.filter((entity) => entity.kind === "lot"))).toBe(
      before,
    );
    console.info(
      JSON.stringify({
        sourceVertices: vertices,
        asphaltCells: topology.asphaltCells.length,
        walkCells: topology.walkCells.length,
        preparationMs: Math.round(preparationMs * 100) / 100,
      }),
    );
  }, 30000);
});
