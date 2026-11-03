import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENTITIES } from "./data/territory";
import { pointInPolygon } from "./geometry";
import { polygonsOverlap } from "./parkGeometry";
import { derivePavement } from "./pavement";
import {
  PARK_CONTEXT_ROADS,
  PARK_CORE_ENTITIES,
  PARK_RENDER_ENTITIES,
} from "./permanentParkLayout";
import { PHOTO_P1_COURTYARD, photoPlanterContains } from "./photoPavilionSetting";
import { createPhotoPavilionSetting } from "./photoPavilionSettingGeometry";
import { SURFACE_PALETTE, type SurfaceMaterials } from "./surfaceMaterials";

describe("photographed P1 planter island", () => {
  it("has one road-hole owner and leaves commercial and building polygons untouched", () => {
    const owners = PARK_CONTEXT_ROADS.filter((road) =>
      road.holes?.some((hole) => hole === PHOTO_P1_COURTYARD.polygon),
    );
    expect(owners).toHaveLength(1);
    expect(
      PHOTO_P1_COURTYARD.polygon.every((point) => pointInPolygon(point, owners[0].polygon)),
    ).toBe(true);
    for (const entity of PARK_CORE_ENTITIES.filter(
      (item) => item.kind === "lot" || item.kind === "pavilion" || item.kind === "support",
    )) {
      expect(polygonsOverlap(entity.polygon, PHOTO_P1_COURTYARD.polygon), entity.id).toBe(false);
    }
    expect(PARK_CORE_ENTITIES.filter((item) => item.kind === "lot")).toEqual(
      ENTITIES.filter((item) => item.kind === "lot"),
    );
  });

  it("cuts actual asphalt triangles out of the island instead of drawing a soil decal over road", () => {
    const pavement = derivePavement(PARK_RENDER_ENTITIES);
    expect(
      pavement.asphaltCells.some((cell) => pointInPolygon(PHOTO_P1_COURTYARD.center, cell)),
    ).toBe(false);
    expect(
      pavement.asphaltCells.some((cell) => polygonsOverlap(cell, PHOTO_P1_COURTYARD.polygon)),
    ).toBe(false);
    expect(photoPlanterContains(PHOTO_P1_COURTYARD.center)).toBe(true);
    expect(photoPlanterContains([61.25 + PHOTO_P1_COURTYARD.radius + 0.01, 59.5])).toBe(false);
  });

  it("uses shared materials, preserves the open soil well, and never captures selection", () => {
    const materials = Object.fromEntries(
      Object.keys(SURFACE_PALETTE).map((family) => [family, new THREE.MeshStandardMaterial()]),
    ) as SurfaceMaterials["materials"];
    const model = createPhotoPavilionSetting({ materials } as SurfaceMaterials);
    expect(model.textureBytes).toBe(0);
    expect(model.group.children).toHaveLength(3);
    for (const object of model.group.children as THREE.Mesh[]) {
      expect(Object.values(materials)).toContain(object.material);
      const position = object.geometry.getAttribute("position");
      expect([...position.array].every(Number.isFinite)).toBe(true);
    }
    const ray = new THREE.Raycaster(new THREE.Vector3(61.25, 2, 59.5), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(model.group, true)).toHaveLength(0);
    model.dispose();
    model.dispose();
    expect(model.group.children).toHaveLength(0);
    for (const material of Object.values(materials)) material.dispose();
  });
});
