import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENTITIES } from "./data/territory";
import { getPavilionPresentation, isPavilionFrontEdge } from "./architectureOrientation";
import {
  architectureVisualHeight,
  buildArchitecture,
  clipArchitecturePolygon,
  getArchitectureDefinition,
} from "./architecture";

describe("static presentation architecture", () => {
  it("clips the skewed P12 roof inside the source footprint, without mutating territory", () => {
    const before = JSON.stringify(ENTITIES);
    const model = buildArchitecture(ENTITIES);
    try {
      for (const entity of ENTITIES.filter((entry) => entry.kind === "pavilion")) {
        const roof = model.roofs.get(entity.id)!;
        roof.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const vertices = object.geometry.getAttribute("position");
          for (let v = 0; v < vertices.count; v++) {
            const x = vertices.getX(v),
              z = vertices.getZ(v);
            for (let edge = 0; edge < entity.polygon.length; edge++) {
              const a = entity.polygon[edge],
                b = entity.polygon[(edge + 1) % entity.polygon.length];
              const signedDistance =
                ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) /
                Math.hypot(b[0] - a[0], b[1] - a[1]);
              expect(signedDistance, `${entity.id} roof outside footprint`).toBeGreaterThanOrEqual(
                -0.00002,
              );
            }
            expect(vertices.getY(v)).toBeLessThanOrEqual(
              architectureVisualHeight(entity) + 0.00001,
            );
          }
        });
      }
      expect(JSON.stringify(ENTITIES)).toBe(before);
    } finally {
      model.dispose();
    }
  });

  it("has six distinct pavilion silhouettes and retains volume on the light shared model", () => {
    const pavilions = ENTITIES.filter((entity) => entity.kind === "pavilion");
    expect(
      new Set(pavilions.map((entity) => getArchitectureDefinition(entity)?.profile)).size,
    ).toBe(6);
    const model = buildArchitecture(ENTITIES);
    try {
      let meshes = 0,
        triangles = 0;
      model.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        meshes++;
        triangles += object.geometry.getAttribute("position").count / 3;
      });
      // Two batches distinguish brick and structural frames in addition to
      // the event-center roof; roofs remain independently inspectable.
      expect(meshes).toBeLessThanOrEqual(36);
      expect(triangles).toBeLessThan(20000);
      for (const entity of pavilions) {
        const roof = model.roofs.get(entity.id)!;
        const geometry = (roof.children[0] as THREE.Mesh).geometry;
        expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeGreaterThan(0.5);
      }
      const walls = model.group.children.find((child) => child.name === "walls")!;
      model.roofs.get(pavilions[0].id)!.visible = false;
      expect(walls.visible).toBe(true);
      expect(model.group.children.find((child) => child.name === "floors-contact")!.visible).toBe(
        true,
      );
    } finally {
      model.dispose();
    }
  });

  it("uses the photographed gables for P8 and P13 and retains P8's recessed high front glazing", () => {
    const p8 = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:8")!;
    const p13 = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:13")!;
    expect(getArchitectureDefinition(p8)?.profile).toBe("p8-gable");
    expect(getArchitectureDefinition(p13)?.profile).toBe("p13-gable");
    const model = buildArchitecture([p8, p13]);
    try {
      model.group.updateMatrixWorld(true);
      // Roof glazing here would recreate the unsubstantiated raised monitor.
      for (const entity of [p8, p13]) expect(model.roofs.get(entity.id)!.children).toHaveLength(2);
      const glazing = model.group.children.find((child) => child.name === "entry-glazing")!;
      const ray = new THREE.Raycaster(new THREE.Vector3(100, 2.8, 66), new THREE.Vector3(0, 0, 1));
      expect(ray.intersectObject(glazing).length).toBeGreaterThan(0);
      // The source shells meet directly; no bridge or new circulation is needed.
      expect(p8.polygon[1][0]).toBeCloseTo(p13.polygon[0][0], 6);
    } finally {
      model.dispose();
    }
  });

  it("adds distinct P12 brick and P3 glazing at their front without changing the territory", () => {
    const p12 = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:12")!;
    const p3 = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:3")!;
    const before = JSON.stringify([p12, p3]);
    const model = buildArchitecture([p12, p3]);
    try {
      model.group.updateMatrixWorld(true);
      const brick = model.group.getObjectByName("brick-front")!;
      const glass = model.group.getObjectByName("entry-glazing")!;
      const p12Ray = new THREE.Raycaster(
        new THREE.Vector3(70, 1.4, 66),
        new THREE.Vector3(0, 0, 1),
      );
      const p3Ray = new THREE.Raycaster(
        new THREE.Vector3(125, 1.5, 66),
        new THREE.Vector3(0, 0, 1),
      );
      expect(p12Ray.intersectObject(brick)).not.toHaveLength(0);
      expect(p3Ray.intersectObject(glass)).not.toHaveLength(0);
      const reverse = new THREE.Raycaster(
        new THREE.Vector3(70, 1.4, 89),
        new THREE.Vector3(0, 0, -1),
        0,
        3,
      );
      expect(reverse.intersectObject(brick)).toHaveLength(0);
      expect(reverse.intersectObject(model.group.getObjectByName("walls")!)).not.toHaveLength(0);
      expect(JSON.stringify([p12, p3])).toBe(before);
    } finally {
      model.dispose();
    }
  });

  it("keeps public fronts in world coordinates and separate from roof axes and source order", () => {
    const before = JSON.stringify(ENTITIES);
    for (const id of [1, 14, 12, 8, 13, 3]) {
      const entity = ENTITIES.find((entry) => entry.id === `indumoveis:pavilion:${id}`)!;
      const presentation = getPavilionPresentation(entity)!;
      const direction = [1, 14].includes(id) ? [1, 0] : [0, -1];
      expect(presentation.frontNormal).toEqual(direction);
      expect(presentation.frontStreetId).toBe(
        [1, 14].includes(id) ? "indumoveis:road:mercosul" : "indumoveis:road:argentina",
      );
      for (let start = 0; start < entity.polygon.length; start++) {
        const rotated = {
          ...entity,
          polygon: [...entity.polygon.slice(start), ...entity.polygon.slice(0, start)],
        };
        expect(getPavilionPresentation(rotated)).toEqual(presentation);
      }
      expect(
        getPavilionPresentation({ ...entity, polygon: [...entity.polygon].reverse() }),
      ).toEqual(presentation);
      expect(isPavilionFrontEdge(entity, ...presentation.frontEdge)).toBe(true);
      expect(isPavilionFrontEdge(entity, ...presentation.rearEdge)).toBe(false);
      const [a, b] = presentation.frontEdge;
      for (const point of presentation.mainEntries) {
        const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
        expect(Math.abs(cross)).toBeLessThan(0.00001);
      }
    }
    expect(
      getPavilionPresentation(ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:12")!)!
        .ridgeDirection,
    ).not.toEqual([0, -1]);
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });

  it("opens all public entries toward the internal circulation and preserves their pick volume", () => {
    for (const entity of ENTITIES.filter((entry) => entry.kind === "pavilion")) {
      const presentation = getPavilionPresentation(entity)!;
      const model = buildArchitecture([entity]);
      try {
        model.group.updateMatrixWorld(true);
        const glazing = model.group.getObjectByName("entry-glazing")!;
        for (const [x, z] of presentation.mainEntries) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(
              x + presentation.frontNormal[0],
              1.4,
              z + presentation.frontNormal[1],
            ),
            new THREE.Vector3(-presentation.frontNormal[0], 0, -presentation.frontNormal[1]),
            0,
            2,
          );
          expect(ray.intersectObject(glazing).length, entity.id).toBeGreaterThan(0);
          expect(ray.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(
            entity.id,
          );
        }
      } finally {
        model.dispose();
      }
    }
  });

  it("retains a closed construction seam at P8/P13/P3 with both roofs hidden", () => {
    const entities = ["8", "13", "3"].map((id) =>
      ENTITIES.find((entry) => entry.id === `indumoveis:pavilion:${id}`)!,
    );
    const model = buildArchitecture(entities);
    try {
      for (const roof of model.roofs.values()) roof.visible = false;
      model.group.updateMatrixWorld(true);
      for (let i = 0; i < entities.length - 1; i++) {
        const left = entities[i],
          right = entities[i + 1];
        const seam = left.polygon[1][0];
        expect(seam).toBeCloseTo(right.polygon[0][0], 6);
        const minZ = Math.max(left.polygon[0][1], right.polygon[0][1]);
        const maxZ = Math.min(left.polygon[2][1], right.polygon[2][1]);
        // Include ordinary bays and existing recesses, in both viewing directions.
        for (let z = minZ + 0.2; z < maxZ - 0.2; z += 0.2) {
          for (const direction of [-1, 1]) {
            const ray = new THREE.Raycaster(
              new THREE.Vector3(seam - direction * 0.4, 1.5, z),
              new THREE.Vector3(direction, 0, 0),
              0,
              0.8,
            );
            expect(ray.intersectObjects(model.group.children, true).length).toBeGreaterThan(0);
          }
        }
      }
    } finally {
      model.dispose();
    }
  });

  it("keeps Mão na Massa and Portão 03 unroofed; B7 and annexes retain their identity", () => {
    const bySuffix = (suffix: string) =>
      ENTITIES.find((entity) => entity.id === `indumoveis:support:${suffix}`)!;
    for (const suffix of ["mao-na-massa", "gate-03"])
      expect(getArchitectureDefinition(bySuffix(suffix))).toBeNull();
    for (const suffix of ["cafe", "bar", "restaurant", "b7", "b7-annex-a", "b7-annex-b"]) {
      const entity = bySuffix(suffix);
      expect(architectureVisualHeight(entity)).toBeGreaterThan(entity.height!);
      expect(getArchitectureDefinition(entity)?.estimated).toBe(true);
    }
  });

  it("keeps the authorised event-center model and its picking volume inside its existing footprint", () => {
    const entity = ENTITIES.find((entry) => entry.id === "indumoveis:support:events")!;
    const before = JSON.stringify(entity);
    expect(getArchitectureDefinition(entity)?.profile).toBe("event-center-gable");
    const model = buildArchitecture([entity]);
    try {
      const [minX, minZ] = entity.polygon[0];
      const [maxX, maxZ] = entity.polygon[2];
      model.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          expect(positions.getX(i)).toBeGreaterThanOrEqual(minX - 0.00002);
          expect(positions.getX(i)).toBeLessThanOrEqual(maxX + 0.00002);
          expect(positions.getZ(i)).toBeGreaterThanOrEqual(minZ - 0.00002);
          expect(positions.getZ(i)).toBeLessThanOrEqual(maxZ + 0.00002);
        }
      });
      const ray = new THREE.Raycaster(
        new THREE.Vector3(minX - 1, 1, (minZ + maxZ) / 2),
        new THREE.Vector3(1, 0, 0),
      );
      expect(ray.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(entity.id);
      expect(JSON.stringify(entity)).toBe(before);
    } finally {
      model.dispose();
    }
  });

  it("gives the three food supports an aligned longitudinal roof while preserving separate picks", () => {
    const entities = ["cafe", "bar", "restaurant"].map((id) =>
      ENTITIES.find((entry) => entry.id === `indumoveis:support:${id}`)!,
    );
    const before = JSON.stringify(entities);
    const model = buildArchitecture(entities);
    try {
      const ridges = entities.map((entity) => {
        const roof = model.roofs.get(entity.id)!.children[0] as THREE.Mesh;
        const position = roof.geometry.getAttribute("position");
        const maxY = roof.geometry.boundingBox!.max.y;
        const ridgeXs = Array.from({ length: position.count }, (_, i) => i)
          .filter((i) => Math.abs(position.getY(i) - maxY) < 0.00001)
          .map((i) => position.getX(i));
        expect(ridgeXs.length).toBeGreaterThan(0);
        expect(Math.max(...ridgeXs) - Math.min(...ridgeXs)).toBeLessThan(0.0001);
        const ray = new THREE.Raycaster(
          new THREE.Vector3(entity.anchor[0], 20, entity.anchor[1]),
          new THREE.Vector3(0, -1, 0),
        );
        expect(ray.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(entity.id);
        return { x: ridgeXs[0], y: maxY };
      });
      for (const ridge of ridges.slice(1)) {
        expect(ridge.x).toBeCloseTo(ridges[0].x, 5);
        expect(ridge.y).toBeCloseTo(ridges[0].y, 5);
      }
      expect(JSON.stringify(entities)).toBe(before);
    } finally {
      model.dispose();
    }
  });

  it("picks the visible facade and creates a real recessed opening at the existing Mostra access", () => {
    const entity = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:1")!;
    const model = buildArchitecture([entity]);
    try {
      model.group.updateMatrixWorld(true);
      const access = entity.accesses![0];
      const ray = new THREE.Raycaster(
        new THREE.Vector3(access[0] + 1, 1.4, access[1]),
        new THREE.Vector3(-1, 0, 0),
      );
      expect(ray.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(entity.id);
      const hits = ray.intersectObjects(model.group.children, true);
      expect(hits[0]?.distance).toBeGreaterThan(1.15);
      expect(hits[0]?.distance).toBeLessThan(1.6);
    } finally {
      model.dispose();
    }
  });

  it("clips a slanted boundary instead of extending a rectangular roof slab", () => {
    const clipped = clipArchitecturePolygon(
      [
        [0, 0],
        [4, 0],
        [5, 3],
        [1, 3],
      ],
      1,
      1.5,
      true,
    );
    expect(clipped).toContainEqual([0.5, 1.5]);
    expect(clipped).toContainEqual([4.5, 1.5]);
    expect(clipped.every((point) => point[1] >= 1.5)).toBe(true);
  });

  it("separates wall, concrete, sheet, glass and metal while preserving finite local UVs", () => {
    const model = buildArchitecture(ENTITIES);
    try {
      const families = new Set<THREE.Material>();
      model.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material as THREE.MeshStandardMaterial;
        families.add(material);
        expect(material.isMeshStandardMaterial).toBe(true);
        const position = object.geometry.getAttribute("position");
        const uv = object.geometry.getAttribute("uv");
        const color = object.geometry.getAttribute("color");
        expect(uv.count).toBe(position.count);
        expect(Array.from(uv.array).every(Number.isFinite)).toBe(true);
        expect(new Set(uv.array).size).toBeGreaterThan(1);
        // Warm tones belong to the semantic material, not stale beige vertex
        // multipliers contaminating every facade/roof texture.
        for (let i = 0; i < color.count; i++)
          expect(color.getX(i) - color.getZ(i)).toBeLessThan(0.015);
      });
      expect(families.size).toBe(8);
      const family = (name: string) =>
        (model.group.children.find((child) => child.name === name) as THREE.Mesh).material;
      const roof = model.roofs.get("indumoveis:pavilion:1")!.children[0] as THREE.Mesh;
      expect(roof.material).not.toBe(family("walls"));
      expect(family("walls")).not.toBe(family("floors-contact"));
      expect(family("entry-glazing")).not.toBe(family("entry-lintels"));
      expect(family("brick-front")).not.toBe(family("walls"));
      expect(family("architectural-frames")).not.toBe(family("walls"));
      expect(model.textureBytes).toBeLessThan(0.5 * 1024 * 1024);
    } finally {
      model.dispose();
    }
  });

  it("keeps facade panels behind posts and meets the roof underside without coplanar overlap", () => {
    const entity = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:1")!;
    const definition = getArchitectureDefinition(entity)!;
    const model = buildArchitecture([entity]);
    try {
      model.group.updateMatrixWorld(true);
      const walls = model.group.children.find((child) => child.name === "walls") as THREE.Mesh;
      const structure = model.group.children.find(
        (child) => child.name === "architectural-frames",
      ) as THREE.Mesh;
      const roof = model.roofs.get(entity.id)!.children[0] as THREE.Mesh;
      expect(walls.geometry.boundingBox!.max.y).toBeCloseTo(
        definition.eaveHeight - definition.roofThickness,
        5,
      );
      expect(walls.geometry.boundingBox!.max.y).toBeLessThanOrEqual(
        roof.geometry.boundingBox!.min.y + 0.00001,
      );
      const [x, z] = entity.polygon[0];
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x + definition.wallThickness * 0.5, 1.4, z - 1),
        new THREE.Vector3(0, 0, 1),
      );
      const panelHit = ray.intersectObject(walls)[0];
      const postHit = ray.intersectObject(structure)[0];
      expect(panelHit).toBeDefined();
      expect(postHit).toBeDefined();
      expect(panelHit.distance - postHit.distance).toBeGreaterThan(definition.wallThickness * 0.1);
    } finally {
      model.dispose();
    }
  });

  it("removes internal thickness closures from a continuous ridge and makes both doorway reveals face the opening", () => {
    const entity = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:1")!;
    const definition = getArchitectureDefinition(entity)!;
    const model = buildArchitecture([entity]);
    try {
      model.group.updateMatrixWorld(true);
      const roof = model.roofs.get(entity.id)!.children[0] as THREE.Mesh;
      const vertices = roof.geometry.getAttribute("position");
      const ridge = (entity.polygon[0][1] + entity.polygon[2][1]) / 2;
      let internalClosures = 0;
      for (let i = 0; i < vertices.count; i += 3) {
        const allAtRidge = [0, 1, 2].every(
          (offset) => Math.abs(vertices.getZ(i + offset) - ridge) < 0.00001,
        );
        const verticalExtent =
          Math.max(...[0, 1, 2].map((offset) => vertices.getY(i + offset))) -
          Math.min(...[0, 1, 2].map((offset) => vertices.getY(i + offset)));
        if (allAtRidge && verticalExtent > 0.01) internalClosures++;
      }
      expect(internalClosures).toBe(0);
      const access = entity.accesses![0];
      for (const direction of [-1, 1]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(access[0] - definition.wallThickness * 0.5, 1.4, access[1]),
          new THREE.Vector3(0, 0, direction),
        );
        const reveal = ray.intersectObjects(model.group.children, true)[0];
        expect(reveal).toBeDefined();
        expect(reveal.distance).toBeGreaterThan(0.4);
        expect(reveal.distance).toBeLessThan(1.2);
      }
    } finally {
      model.dispose();
    }
  });

  it("picks the architectural silhouette instead of the empty box above an eave", () => {
    const entity = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:1")!;
    const b7 = ENTITIES.find((entry) => entry.id === "indumoveis:support:b7")!;
    const definition = getArchitectureDefinition(entity)!;
    const model = buildArchitecture([entity, b7]);
    try {
      const span = entity.polygon[2][1] - entity.polygon[0][1];
      const rayAboveEave = new THREE.Raycaster(
        new THREE.Vector3(
          entity.polygon[1][0] + 1,
          definition.eaveHeight + definition.roofRise * 0.6,
          entity.polygon[0][1] + span * 0.05,
        ),
        new THREE.Vector3(-1, 0, 0),
      );
      expect(rayAboveEave.intersectObjects(model.pickables)).toHaveLength(0);
      const b7Facade = new THREE.Raycaster(
        new THREE.Vector3(b7.polygon[1][0] + 1, 1.4, b7.anchor[1]),
        new THREE.Vector3(-1, 0, 0),
      );
      expect(b7Facade.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(b7.id);
    } finally {
      model.dispose();
    }
  });
});
