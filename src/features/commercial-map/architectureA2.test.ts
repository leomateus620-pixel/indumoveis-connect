import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENTITIES, type MapEntity, type Point } from "./data/territory";
import { PARK_CORE_ENTITIES } from "./permanentParkLayout";
import { pointInPolygon } from "./geometry";
import { getPavilionPresentation } from "./architectureOrientation";
import { buildArchitecture, getArchitectureDefinition } from "./architecture";

const pavilions = PARK_CORE_ENTITIES.filter((entity) => entity.kind === "pavilion");
function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
}
function inside(point: Point, polygon: Point[]) {
  return (
    pointInPolygon(point, polygon) ||
    polygon.some((a, i) => distanceToSegment(point, a, polygon[(i + 1) % polygon.length]) < 0.00004)
  );
}
function assertPortals(entity: MapEntity) {
  const presentation = getPavilionPresentation(entity)!;
  const model = buildArchitecture([entity]);
  try {
    model.group.updateMatrixWorld(true);
    const gates = model.group.getObjectByName("photo-paintedSheet")!;
    const wallLayers = ["walls", "photo-paintedMasonry", "brick-front", "photo-whitePaint"]
      .map((name) => model.group.getObjectByName(name))
      .filter((object): object is THREE.Object3D => object !== undefined);
    expect(gates, entity.id).toBeDefined();
    for (const [x, z] of presentation.mainEntries) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(
          x + presentation.frontNormal[0],
          entity.id === "indumoveis:pavilion:14" ? 0.55 : 1.4,
          z + presentation.frontNormal[1],
        ),
        new THREE.Vector3(-presentation.frontNormal[0], 0, -presentation.frontNormal[1]),
        0,
        3,
      );
      const gate = ray.intersectObject(gates)[0];
      expect(gate, `${entity.id} opaque portal ${x},${z}`).toBeDefined();
      expect(gate.distance, `${entity.id} recessed portal`).toBeGreaterThan(1.05);
      expect(gate.distance, entity.id).toBeLessThan(1.5);
      expect(
        ray.intersectObjects(wallLayers)[0]?.distance ?? Infinity,
        `${entity.id} masonry must not cover the metal gate`,
      ).toBeGreaterThan(gate.distance - 0.00001);
      expect(ray.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(entity.id);
    }
  } finally {
    model.dispose();
  }
}

describe("architecture integrated with the normalized physical A2 footprints", () => {
  it("retains every original commercial lot while selecting a substantial public facade independently of source start/winding", () => {
    for (const original of ENTITIES.filter((entity) => entity.kind === "lot"))
      expect(PARK_CORE_ENTITIES.find((entity) => entity.id === original.id)).toBe(original);
    for (const entity of pavilions) {
      const presentation = getPavilionPresentation(entity)!;
      const sourceFront = presentation.frontEdge;
      const length = Math.hypot(
        sourceFront[1][0] - sourceFront[0][0],
        sourceFront[1][1] - sourceFront[0][1],
      );
      const span = Math.min(
        ...[0, 1].map(
          (axis) =>
            Math.max(...entity.polygon.map((p) => p[axis])) -
            Math.min(...entity.polygon.map((p) => p[axis])),
        ),
      );
      expect(length, `${entity.id} front must not be a notch fragment`).toBeGreaterThan(
        span * 0.35,
      );
      for (const point of presentation.mainEntries)
        expect(
          distanceToSegment(point, ...sourceFront),
          `${entity.id} main entry must be on its public front`,
        ).toBeLessThan(0.03);
      const start = Math.floor(entity.polygon.length / 2);
      const variants = [
        { ...entity, polygon: [...entity.polygon.slice(start), ...entity.polygon.slice(0, start)] },
        { ...entity, polygon: [...entity.polygon].reverse() },
      ];
      for (const variant of variants) {
        expect(getPavilionPresentation(variant)).toEqual(presentation);
        expect(getArchitectureDefinition(variant)?.height).toBeCloseTo(
          getArchitectureDefinition(entity)!.height,
          6,
        );
      }
    }
  });
  it("keeps roofs and their picking silhouette inside actual notches, including triangle interiors", () => {
    for (const entity of pavilions) {
      const model = buildArchitecture([entity]);
      try {
        const meshes = [...model.pickables];
        model.roofs.get(entity.id)!.traverse((object) => {
          if (object instanceof THREE.Mesh) meshes.push(object);
        });
        for (const mesh of meshes) {
          const vertices = mesh.geometry.getAttribute("position");
          for (let i = 0; i < vertices.count; i += 3) {
            const a: Point = [vertices.getX(i), vertices.getZ(i)],
              b: Point = [vertices.getX(i + 1), vertices.getZ(i + 1)],
              c: Point = [vertices.getX(i + 2), vertices.getZ(i + 2)];
            for (const point of [
              a,
              b,
              c,
              [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3] as Point,
            ])
              expect(
                inside(point, entity.polygon),
                `${entity.id} roof or proxy crosses a physical cut-out at ${point}`,
              ).toBe(true);
          }
        }
      } finally {
        model.dispose();
      }
    }
  });
  it("puts photographed opaque recessed gates on the public side of all six physical shells", () => {
    for (const entity of pavilions) assertPortals(entity);
  });
  it("selects P1's visible parapet above the low roof without extending the proxy into air above it", () => {
    const entity = pavilions.find((entry) => entry.id === "indumoveis:pavilion:1")!;
    const presentation = getPavilionPresentation(entity)!;
    const definition = getArchitectureDefinition(entity)!;
    const model = buildArchitecture([entity]);
    try {
      model.group.updateMatrixWorld(true);
      const [a, b] = presentation.frontEdge;
      for (const fraction of [0.05, 0.95]) {
        const x = a[0] + (b[0] - a[0]) * fraction;
        const z = a[1] + (b[1] - a[1]) * fraction;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(
            x + presentation.frontNormal[0],
            definition.eaveHeight * 1.025,
            z + presentation.frontNormal[1],
          ),
          new THREE.Vector3(-presentation.frontNormal[0], 0, -presentation.frontNormal[1]),
          0,
          2,
        );
        expect(
          ray.intersectObject(model.group.getObjectByName("architectural-frames")!),
        ).not.toHaveLength(0);
        expect(ray.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(entity.id);
        ray.ray.origin.y = model.visualBounds.get(entity.id)!.height + 0.05;
        expect(ray.intersectObjects(model.pickables)).toHaveLength(0);
      }
    } finally {
      model.dispose();
    }
  });
  it("keeps public portal placement after a cyclic or reversed footprint representation", () => {
    for (const entity of pavilions.filter((entry) =>
      ["indumoveis:pavilion:1", "indumoveis:pavilion:12"].includes(entry.id),
    )) {
      const start = Math.floor(entity.polygon.length / 2);
      assertPortals({
        ...entity,
        polygon: [...entity.polygon.slice(start), ...entity.polygon.slice(0, start)],
      });
      assertPortals({ ...entity, polygon: [...entity.polygon].reverse() });
    }
  });
  it("aligns constructed ridge edges with their authored world ridge instead of inferring front from a short axis", () => {
    for (const entity of pavilions) {
      const presentation = getPavilionPresentation(entity)!;
      const model = buildArchitecture([entity]);
      try {
        const roof = model.roofs.get(entity.id)!.children[0] as THREE.Mesh;
        const vertices = roof.geometry.getAttribute("position"),
          highest = roof.geometry.boundingBox!.max.y;
        let ridges = 0;
        for (let i = 0; i < vertices.count; i += 3)
          for (let j = 0; j < 3; j++) {
            const a = i + j,
              b = i + ((j + 1) % 3);
            if (
              Math.abs(vertices.getY(a) - highest) > 0.00001 ||
              Math.abs(vertices.getY(b) - highest) > 0.00001
            )
              continue;
            const dx = vertices.getX(b) - vertices.getX(a),
              dz = vertices.getZ(b) - vertices.getZ(a),
              length = Math.hypot(dx, dz);
            if (length < 0.1) continue;
            const dot = Math.abs(
              (dx * presentation.ridgeDirection[0] + dz * presentation.ridgeDirection[1]) / length,
            );
            expect(dot, `${entity.id} ridge differs from its world record`).toBeGreaterThan(0.995);
            ridges++;
          }
        expect(ridges, `${entity.id} must retain visible roof ridges`).toBeGreaterThan(0);
      } finally {
        model.dispose();
      }
    }
  });
});
