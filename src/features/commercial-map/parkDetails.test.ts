import * as THREE from "three";
import { describe, it, expect, vi } from "vitest";
import { ENTITIES, type Point } from "./data/territory";
import { pointInPolygon, polygonBounds, signedPolygonArea } from "./geometry";
import { getPavilionPresentation } from "./architectureOrientation";
import {
  deriveParkDetails,
  subtractGround,
  lotStatusBands,
  createParkDetails,
  deriveCommercialLanePaint,
} from "./parkDetails";
import { createSurfaceMaterials } from "./surfaceMaterials";

describe("satellite-inspired surface details preserve cadastral surfaces", () => {
  it("subtracts rotated blockers without overlap or lost outside area", () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const diamond: [number, number][] = [
      [5, 1],
      [9, 5],
      [5, 9],
      [1, 5],
    ];
    const pieces = subtractGround(square, diamond);
    expect(pieces.reduce((s, p) => s + Math.abs(signedPolygonArea(p)), 0)).toBeCloseTo(68);
    const adjacent: [number, number][] = [
      [0, -4],
      [10, -4],
      [10, 0],
      [0, 0],
    ];
    expect(
      subtractGround(square, adjacent).reduce((s, p) => s + Math.abs(signedPolygonArea(p)), 0),
    ).toBeCloseTo(100);
    for (const p of pieces) {
      const c: [number, number] = [
        p.reduce((s, v) => s + v[0], 0) / p.length,
        p.reduce((s, v) => s + v[1], 0) / p.length,
      ];
      expect(pointInPolygon(c, diamond)).toBe(false);
    }
  });
  it("never places new concrete inside lots, architecture, roads or approved landscaping", () => {
    const source = JSON.stringify(ENTITIES),
      details = deriveParkDetails(ENTITIES);
    expect(details.concrete.length).toBeGreaterThan(4);
    // Angled bays belong to the avenue's single owner (urbanContext), painted
    // on its asphalt; nothing is striped on the kerbside walk here.
    expect(details.paint).toEqual([]);
    for (const cell of details.concrete) {
      const center: [number, number] = [
        cell.reduce((s, p) => s + p[0], 0) / cell.length,
        cell.reduce((s, p) => s + p[1], 0) / cell.length,
      ];
      expect(ENTITIES.some((e) => pointInPolygon(center, e.polygon))).toBe(false);
    }
    const av = ENTITIES.find((e) => e.id.endsWith("road:benvenuto"))!;
    expect(details.paint.every((p) => p.every((v) => pointInPolygon(v, av.polygon)))).toBe(true);
    expect(JSON.stringify(ENTITIES)).toBe(source);
  });
  it("keeps status bands inside every real lot, including the skewed lot70", () => {
    for (const lot of ENTITIES.filter((e) => e.kind === "lot")) {
      const bands = lotStatusBands(lot.polygon);
      expect(bands.length).toBe(lot.polygon.length);
      expect(bands.every((b) => b.every((v) => pointInPolygon(v, lot.polygon)))).toBe(true);
      expect(bands.reduce((s, p) => s + Math.abs(signedPolygonArea(p)), 0)).toBeLessThan(
        Math.abs(signedPolygonArea(lot.polygon)) * 0.3,
      );
    }
  });
  it("retains an apron inside a traced road void and resolves named streets without duplicate runtime road entities", () => {
    const source = ENTITIES.filter((entity) => entity.kind !== "road");
    const trace = {
      ...ENTITIES.find((entity) => entity.id === "indumoveis:road:brasil")!,
      id: "indumoveis:context:road:a2-test",
      polygon: [
        [0, 0],
        [200, 0],
        [200, 100],
        [0, 100],
      ] as Point[],
      holes: [
        [
          [60.1, 55],
          [66.12, 55],
          [66.12, 66.19],
          [60.1, 66.19],
        ] as Point[],
      ],
    };
    const details = deriveParkDetails([...source, trace]);
    expect(details.concrete.some((cell) => pointInPolygon([63, 60], cell))).toBe(true);
    expect(details.concrete.some((cell) => pointInPolygon([63, 68], cell))).toBe(false);
    expect(details.lanePaint).toEqual([]);
  });
  it("connects the explicit interior fronts to their street without walking through P12 or any lot", () => {
    const concrete = deriveParkDetails(ENTITIES).concrete;
    const roads = ENTITIES.filter((entity) => entity.kind === "road");
    const protectedVolumes = ENTITIES.filter((entity) => ["lot", "pavilion"].includes(entity.kind));
    const p1 = polygonBounds(
      ENTITIES.find((entity) => entity.id === "indumoveis:pavilion:1")!.polygon,
    );
    const p14 = polygonBounds(
      ENTITIES.find((entity) => entity.id === "indumoveis:pavilion:14")!.polygon,
    );
    for (const building of ENTITIES.filter((entity) => entity.kind === "pavilion")) {
      const front = getPavilionPresentation(building)!;
      const street = roads.find((road) => road.id === front.frontStreetId)!;
      const n = front.frontNormal;
      const projection = (p: Point) => p[0] * n[0] + p[1] * n[1];
      const nearStreet = Math.min(...street.polygon.map(projection));
      for (const entry of front.mainEntries) {
        const start: Point = [entry[0] + n[0] * 0.04, entry[1] + n[1] * 0.04];
        const route: Point[] =
          building.id === "indumoveis:pavilion:14"
            ? [
                start,
                [start[0] + 0.8, start[1]],
                [start[0] + 0.8, (p1.maxY + p14.minY) / 2],
                [polygonBounds(street.polygon).minX + 0.2, (p1.maxY + p14.minY) / 2],
              ]
            : [
                start,
                [
                  entry[0] + n[0] * (nearStreet - projection(entry) + 0.2),
                  entry[1] + n[1] * (nearStreet - projection(entry) + 0.2),
                ],
              ];
        for (let i = 1; i < route.length; i++) {
          const a = route[i - 1],
            b = route[i];
          const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12);
          for (let step = 0; step <= steps; step++) {
            const p: Point = [
              a[0] + ((b[0] - a[0]) * step) / steps,
              a[1] + ((b[1] - a[1]) * step) / steps,
            ];
            expect(
              concrete.some((cell) => pointInPolygon(p, cell)) ||
                roads.some((road) => pointInPolygon(p, road.polygon)),
              `${building.id}: unsupported access ${p.join(",")}`,
            ).toBe(true);
            expect(protectedVolumes.some((volume) => pointInPolygon(p, volume.polygon))).toBe(
              false,
            );
          }
        }
      }
    }
  });
  it("does not capture picking or dispose borrowed materials", () => {
    const surfaces = createSurfaceMaterials({ maps: false }),
      dispose = vi.spyOn(surfaces.materials.concrete, "dispose");
    const model = createParkDetails(ENTITIES, surfaces),
      raycaster = new THREE.Raycaster(new THREE.Vector3(90, 10, 92), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(model.group, true)).toEqual([]);
    expect(model.group.getObjectByName("indumoveis-commercial-lane-paint")).toBeDefined();
    model.dispose();
    model.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(model.group.children).toHaveLength(0);
    surfaces.dispose();
  });
  it("removes generated centre dashes and arrows from internal commercial circulation at every consumer", () => {
    const before = JSON.stringify(ENTITIES),
      sources = deriveCommercialLanePaint(ENTITIES);
    // The public avenues retain their dedicated owner in urbanContext; no
    // second source paint layer is emitted here, including for context roads.
    expect(sources).toEqual([]);
    const details = deriveParkDetails(ENTITIES);
    expect(details.lanePaint).toEqual([]);
    expect(details.laneArrows).toEqual([]);
    expect(details.paint).toEqual([]); // avenue bays are owned by urbanContext
    const surfaces = createSurfaceMaterials({ maps: false });
    const model = createParkDetails(ENTITIES, surfaces);
    try {
      for (const name of [
        "indumoveis-commercial-lane-paint",
        "indumoveis-commercial-direction-arrows",
      ]) {
        const mesh = model.group.getObjectByName(name) as THREE.Mesh;
        expect(mesh.geometry.getAttribute("position").count).toBe(0);
      }
    } finally {
      model.dispose();
      surfaces.dispose();
    }
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });
});
