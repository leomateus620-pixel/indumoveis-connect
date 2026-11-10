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
      // Photographed steel trusses, recesses and shared fine-relief batches
      // add real geometry. Observed full model: 40 meshes / 25,049 triangles;
      // keep a bounded preparation budget including the visible fine tier.
      expect(meshes).toBeLessThanOrEqual(42);
      expect(triangles).toBeLessThan(32000);
      for (const entity of pavilions) {
        const roof = model.roofs.get(entity.id)!;
        const geometry = (roof.children[0] as THREE.Mesh).geometry;
        expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeGreaterThan(
          getArchitectureDefinition(entity)!.roofThickness,
        );
      }
      expect(
        getArchitectureDefinition(pavilions.find((entity) => entity.id.endsWith(":1"))!)!.profile,
      ).toBe("p1-parapet");
      expect(
        getArchitectureDefinition(pavilions.find((entity) => entity.id.endsWith(":14"))!)!.profile,
      ).toBe("p14-low-gable");
      expect(model.group.getObjectByName("photographic-fine-relief-lod")).toBeDefined();
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
        // Observer-left window of the integrated Brigada, world +X.
        new THREE.Vector3(127.5, 1.5, 66),
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

  it("puts opaque photographed gates at the public entries and preserves their pick volume", () => {
    for (const entity of ENTITIES.filter((entry) => entry.kind === "pavilion")) {
      const presentation = getPavilionPresentation(entity)!;
      const model = buildArchitecture([entity]);
      try {
        model.group.updateMatrixWorld(true);
        const gates = model.group.getObjectByName("photo-paintedSheet")!;
        // The metal-clad P14 has no painted-wall batch. Other halls may use
        // painted masonry rather than generic paintedWall; none may occlude
        // a photographed gate with a second opaque facade.
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
            2,
          );
          const gateHit = ray.intersectObject(gates)[0];
          expect(gateHit, entity.id).toBeDefined();
          expect(gateHit.distance, `${entity.id} gate must be recessed`).toBeGreaterThan(1.05);
          expect(gateHit.distance, entity.id).toBeLessThan(1.5);
          expect(
            ray.intersectObjects(wallLayers)[0]?.distance ?? Infinity,
            `${entity.id} wall must not cover the opaque gate`,
          ).toBeGreaterThan(gateHit.distance - 0.00001);
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
    expect(getArchitectureDefinition(entity)?.profile).toBe("event-center-hip-lantern");
    const model = buildArchitecture([entity]);
    try {
      const [minX, minZ] = entity.polygon[0];
      const [maxX, maxZ] = entity.polygon[2];
      // Walls, glazing, frames and picking stay inside the registered
      // footprint. Only the roof sheet may project, by one eave (about 20 cm).
      const roofSheets = new Set<THREE.Object3D>(model.roofs.get(entity.id)!.children);
      expect(roofSheets.size).toBeGreaterThan(0);
      const check = (object: THREE.Object3D) => {
        if (!(object instanceof THREE.Mesh)) return;
        const eave = roofSheets.has(object) ? 0.1 : 0.00002;
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          expect(positions.getX(i)).toBeGreaterThanOrEqual(minX - eave);
          expect(positions.getX(i)).toBeLessThanOrEqual(maxX + eave);
          expect(positions.getZ(i)).toBeGreaterThanOrEqual(minZ - eave);
          expect(positions.getZ(i)).toBeLessThanOrEqual(maxZ + eave);
        }
      };
      model.group.traverse(check);
      for (const pickable of model.pickables) {
        const positions = pickable.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          expect(positions.getX(i)).toBeGreaterThanOrEqual(minX - 0.00002);
          expect(positions.getX(i)).toBeLessThanOrEqual(maxX + 0.00002);
          expect(positions.getZ(i)).toBeGreaterThanOrEqual(minZ - 0.00002);
          expect(positions.getZ(i)).toBeLessThanOrEqual(maxZ + 0.00002);
        }
      }
      // The four-water roof converges on a raised lantern above the eave.
      const sheet = [...roofSheets][0] as THREE.Mesh;
      sheet.geometry.computeBoundingBox();
      const walls = model.group.getObjectByName("walls") as THREE.Mesh;
      walls.geometry.computeBoundingBox();
      expect(sheet.geometry.boundingBox!.max.y).toBeGreaterThan(
        walls.geometry.boundingBox!.max.y * 1.3,
      );
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

  it("preserves the cadastral Mostra access while presenting its photographed recessed gate", () => {
    const entity = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:1")!;
    const model = buildArchitecture([entity]);
    try {
      model.group.updateMatrixWorld(true);
      const before = JSON.stringify(entity.accesses);
      const originalAccess = entity.accesses![0];
      const originalRay = new THREE.Raycaster(
        new THREE.Vector3(originalAccess[0] + 1, 1.2, originalAccess[1]),
        new THREE.Vector3(-1, 0, 0),
      );
      expect(originalRay.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(
        entity.id,
      );
      const access = getPavilionPresentation(entity)!.mainEntries[0];
      const ray = new THREE.Raycaster(
        new THREE.Vector3(access[0] + 1, 1.2, access[1]),
        new THREE.Vector3(-1, 0, 0),
      );
      expect(ray.intersectObjects(model.pickables)[0]?.object.userData.entityId).toBe(entity.id);
      const gate = ray.intersectObject(model.group.getObjectByName("photo-paintedSheet")!)[0];
      expect(gate).toBeDefined();
      expect(gate.distance).toBeGreaterThan(1.15);
      expect(gate.distance).toBeLessThan(1.4);
      expect(JSON.stringify(entity.accesses)).toBe(before);
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
        // The Centro Administrativo garden is planting, not construction: it
        // follows the landscape convention (unlit-map vertex colour foliage).
        if (object.name === "administrative-centre-garden") {
          expect((object.material as THREE.MeshLambertMaterial).isMeshLambertMaterial).toBe(true);
          expect(object.castShadow).toBe(true);
          return;
        }
        const material = object.material as THREE.MeshStandardMaterial;
        families.add(material);
        expect(material.isMeshStandardMaterial).toBe(true);
        const position = object.geometry.getAttribute("position");
        const uv = object.geometry.getAttribute("uv");
        const color = object.geometry.getAttribute("color");
        expect(uv.count).toBe(position.count);
        expect(Array.from(uv.array).every(Number.isFinite)).toBe(true);
        expect(new Set(uv.array).size).toBeGreaterThan(1);
        // Photo-specific paint is compensated against the shared palette in
        // linear space. Grey steel and red masonry need different multipliers.
        expect(
          Array.from(color.array as ArrayLike<number>).every(
            (value) => Number.isFinite(value) && value >= 0,
          ),
        ).toBe(true);
      });
      // Ten shared physical families; the small permanent Brigada sign can
      // own one additional material where canvas textures are available.
      expect(families.size).toBeGreaterThanOrEqual(10);
      expect(families.size).toBeLessThanOrEqual(11);
      const family = (name: string) =>
        (model.group.children.find((child) => child.name === name) as THREE.Mesh).material;
      const roof = model.roofs.get("indumoveis:pavilion:1")!.children[0] as THREE.Mesh;
      expect(roof.material).not.toBe(family("walls"));
      expect(family("walls")).not.toBe(family("floors-contact"));
      expect(family("entry-glazing")).not.toBe(family("entry-lintels"));
      expect(family("brick-front")).not.toBe(family("walls"));
      expect(family("architectural-frames")).not.toBe(family("walls"));
      expect(family("photo-paintedSheet")).not.toBe(family("entry-glazing"));
      // P1's photographed charcoal structure must remain charcoal after
      // multiplying its vertex tint by the existing shared material palette.
      const structure = model.group.getObjectByName("architectural-frames") as THREE.Mesh;
      const material = structure.material as THREE.MeshStandardMaterial;
      const color = structure.geometry.getAttribute("color");
      const expected = new THREE.Color("#525658");
      expect(
        Array.from(
          { length: color.count },
          (_, i) =>
            Math.abs(color.getX(i) * material.color.r - expected.r) < 0.00001 &&
            Math.abs(color.getY(i) * material.color.g - expected.g) < 0.00001 &&
            Math.abs(color.getZ(i) * material.color.b - expected.b) < 0.00001,
        ).some(Boolean),
      ).toBe(true);
      expect(model.textureBytes).toBeLessThan(0.5 * 1024 * 1024);
    } finally {
      model.dispose();
    }
  });

  it("recesses photographed P1 panels behind raised posts and conceals its low roof with the parapet", () => {
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
      expect(walls.geometry.boundingBox!.max.y).toBeLessThan(structure.geometry.boundingBox!.max.y);
      expect(roof.geometry.boundingBox!.max.y).toBeLessThan(structure.geometry.boundingBox!.max.y);
      const presentation = getPavilionPresentation(entity)!;
      const [a, b] = presentation.frontEdge;
      const at = (fraction: number) => [
        a[0] + (b[0] - a[0]) * fraction,
        a[1] + (b[1] - a[1]) * fraction,
      ];
      const panelPoint = at(0.125),
        postPoint = at(0.25);
      const panelRay = new THREE.Raycaster(
        new THREE.Vector3(panelPoint[0] + 1, definition.eaveHeight * 0.65, panelPoint[1]),
        new THREE.Vector3(-1, 0, 0),
      );
      const postRay = new THREE.Raycaster(
        new THREE.Vector3(postPoint[0] + 1, definition.eaveHeight * 0.65, postPoint[1]),
        new THREE.Vector3(-1, 0, 0),
      );
      const panelHit = panelRay.intersectObject(walls)[0];
      const postHit = postRay.intersectObject(structure)[0];
      expect(panelHit).toBeDefined();
      expect(postHit).toBeDefined();
      expect(panelHit.distance - postHit.distance).toBeGreaterThan(0.12);
    } finally {
      model.dispose();
    }
  });

  it("removes internal thickness closures from a continuous ridge and makes both doorway reveals face the opening", () => {
    const entity = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:1")!;
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
      const access = getPavilionPresentation(entity)!.mainEntries[0];
      const frontage = Math.hypot(
        ...getPavilionPresentation(entity)!.frontEdge[1].map(
          (value, axis) => value - getPavilionPresentation(entity)!.frontEdge[0][axis],
        ),
      );
      for (const direction of [-1, 1]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(access[0] - 0.1, 1, access[1]),
          new THREE.Vector3(0, 0, direction),
        );
        const reveal = ray.intersectObjects(model.group.children, true)[0];
        expect(reveal).toBeDefined();
        expect(reveal.distance).toBeGreaterThan(frontage * 0.09);
        expect(reveal.distance).toBeLessThan(frontage * 0.13);
      }
    } finally {
      model.dispose();
    }
  });

  it("picks P14's low-gable silhouette instead of the empty box above its outer eave", () => {
    const entity = ENTITIES.find((entry) => entry.id === "indumoveis:pavilion:14")!;
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
