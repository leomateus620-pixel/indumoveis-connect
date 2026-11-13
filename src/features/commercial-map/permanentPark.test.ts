import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ENTITIES } from "./data/territory";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { createPermanentPark } from "./permanentPark";
import { searchLandmarks } from "./search";
import {
  PARK_CORE_ENTITIES,
  PARK_GATES,
  PARK_PHYSICAL_BLOCKS,
  PARK_RENDER_ENTITIES,
  PERMANENT_PARK_LANDMARKS,
} from "./permanentParkLayout";
import {
  PARK_REGISTRATION_RESIDUALS,
  PARK_REGISTRATION,
  registerA2Point,
} from "./parkRegistration";
import { PARK_A2_GATES } from "./parkA2Reference";
import { polygonsOverlap } from "./parkGeometry";
import { footprintClipper } from "./architectureClip";
import { pointInPolygon } from "./geometry";

describe("one registered physical park with protected commercial cadastre", () => {
  it("preserves every commercial field and original object while allowing structural registration", () => {
    const lots = ENTITIES.filter((e) => e.kind === "lot");
    expect(lots).toHaveLength(68);
    expect(lots.flatMap((e) => e.numbers ?? [])).toHaveLength(68);
    for (const lot of lots) expect(PARK_CORE_ENTITIES.find((e) => e.id === lot.id)).toBe(lot);
    for (const block of PARK_PHYSICAL_BLOCKS.filter(
      (b) => b.coverage === "whole-commercial-envelope",
    ))
      expect(block.polygons).toEqual(
        lots.filter((e) => block.commercialIds.includes(e.id)).map((e) => e.polygon),
      );
  });
  it("uses primary A2 controls and independent checks within a corridor-proportional review tolerance", () => {
    expect(PARK_REGISTRATION_RESIDUALS.filter((c) => c.role === "fit")).toHaveLength(16);
    expect(PARK_REGISTRATION_RESIDUALS.filter((c) => c.role === "holdout")).toHaveLength(3);
    for (const control of PARK_REGISTRATION_RESIDUALS)
      expect(control.residual).toBeLessThanOrEqual(PARK_REGISTRATION.edgeReviewTolerance);
    expect(PARK_REGISTRATION.primaryFrame).toBe("a2-normalized");
  });
  it("retains single building owners and checks actual polygons instead of disjoint bounds", () => {
    expect(new Set(PERMANENT_PARK_LANDMARKS.map((l) => l.sourceId)).size).toBe(
      PERMANENT_PARK_LANDMARKS.length,
    );
    const lots = ENTITIES.filter((e) => e.kind === "lot");
    for (const landmark of PERMANENT_PARK_LANDMARKS) {
      for (const lot of lots)
        expect(polygonsOverlap(landmark.polygon, lot.polygon), `${landmark.id} / ${lot.id}`).toBe(
          false,
        );
      if (landmark.existingOwner)
        expect(PARK_CORE_ENTITIES.find((e) => e.id === landmark.existingOwner)!.polygon).toEqual(
          landmark.polygon,
        );
      expect(landmark).not.toHaveProperty("numbers");
      expect(landmark).not.toHaveProperty("status");
    }
    expect(PERMANENT_PARK_LANDMARKS.some((l) => l.sourceId === "C1")).toBe(false);
    expect(PERMANENT_PARK_LANDMARKS.some((l) => l.sourceId === "B11")).toBe(false);
    expect(
      PARK_RENDER_ENTITIES.filter((e) => e.id.includes("a2-network")).some(
        (e) => (e.holes?.length ?? 0) > 0,
      ),
    ).toBe(true);
    expect(
      PARK_RENDER_ENTITIES.some((e) => /parking|estacionamento|fenasoja.*lot/i.test(e.id)),
    ).toBe(false);
  });
  it("uses verified gate openings, preserving source code versus public-name distinction", () => {
    expect(PARK_GATES).toHaveLength(11);
    for (const gate of PARK_GATES) {
      expect(gate.point).toEqual(registerA2Point(PARK_A2_GATES[gate.id].passagePoint));
      expect(Math.hypot(...gate.axis)).toBeCloseTo(1, 8);
      expect(gate.width).toBeGreaterThan(2);
      expect(gate.condition).toMatch(/White|white|Threshold|threshold|Visitor/);
    }
  });
  it("clips sloping architectural triangles to concave footprints while preserving height", () => {
    const footprint: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 1],
      [1, 1],
      [1, 4],
      [0, 4],
    ];
    const triangles = footprintClipper(footprint)([
      [0, 0, 0],
      [4, 4, 0],
      [0, 0, 4],
    ]);
    expect(triangles.length).toBeGreaterThan(1);
    for (const triangle of triangles) {
      for (const p of triangle) expect(p[1]).toBeCloseTo(p[0], 8);
      const center: [number, number] = [
        triangle.reduce((s, p) => s + p[0], 0) / 3,
        triangle.reduce((s, p) => s + p[2], 0) / 3,
      ];
      expect(pointInPolygon(center, footprint)).toBe(true);
    }
  });
  it("prepares static non-pickable batches and releases owned resources once", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const surfaces = createSurfaceMaterials({ maps: false });
    const materialDispose = vi.spyOn(surfaces.materials.paintedSheet, "dispose");
    const context = createPermanentPark(surfaces);
    const geometries: THREE.BufferGeometry[] = [];
    try {
      expect(context.metadata.drawBatches).toBeLessThanOrEqual(8);
      expect(context.metadata.labelCount).toBe(0);
      expect(context.metadata.textureBytes).toBe(0);
      expect(context.group.getObjectByName("permanent-park-labels")).toBeUndefined();
      expect(getContext).not.toHaveBeenCalled();
      context.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.push(object.geometry);
        expect(object.userData.commercialPickable).toBe(false);
        expect(object.userData.entityId).toBeUndefined();
        expect(
          Array.from(object.geometry.getAttribute("position").array).every(Number.isFinite),
        ).toBe(true);
      });
      context.group.updateMatrixWorld(true);
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(200, 30, -5),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(context.group, true),
      ).toHaveLength(0);
      const spies = geometries.map((geometry) => vi.spyOn(geometry, "dispose"));
      context.dispose();
      context.dispose();
      expect(spies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
      expect(materialDispose).not.toHaveBeenCalled();
    } finally {
      context.dispose();
      surfaces.dispose();
      getContext.mockRestore();
    }
  });
  it("keeps contextual destinations and names searchable without above-building labels", () => {
    const before = JSON.stringify(PERMANENT_PARK_LANDMARKS);
    const arena = searchLandmarks(PERMANENT_PARK_LANDMARKS, "arena")[0];
    const mirante = searchLandmarks(PERMANENT_PARK_LANDMARKS, "mirante")[0];
    expect(arena.id).toBe("arena");
    expect(mirante.id).toBe("mirante");
    expect(arena.name).toBeTruthy();
    expect(mirante.name).toBeTruthy();
    expect(arena.polygon.length).toBeGreaterThanOrEqual(3);
    expect(mirante.polygon.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(PERMANENT_PARK_LANDMARKS)).toBe(before);
  });
});
