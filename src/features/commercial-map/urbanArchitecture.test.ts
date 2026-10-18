import { describe, expect, it } from "vitest";
import { deriveUrbanHouses } from "./urbanContext";
import {
  appendHouseArchitecture,
  type HouseArchitectureBatches,
  type HouseForm,
  type HouseStructuralInput,
} from "./urbanArchitecture";

const FORMS: HouseForm[] = ["courtyard", "split", "villa", "compact", "two-storey", "gable"];
const buckets = (): HouseArchitectureBatches => ({
  walls: { position: [], color: [], uv: [] },
  roof: { position: [], color: [], uv: [] },
  detail: { position: [], color: [], uv: [] },
  glass: { position: [], color: [], uv: [] },
});
const house = (form: HouseForm, facing: -1 | 1 = -1): HouseStructuralInput => ({
  center: [90, 120],
  width: 5.2,
  depth: 6,
  height: 1.8,
  roof: "hip",
  facing,
  form,
});

describe("distinct batched residential architecture", () => {
  it("creates six structurally different deterministic forms rather than recoloured boxes", () => {
    const signatures = FORMS.map((form, index) => {
      const source = house(form);
      const before = JSON.stringify(source);
      const a = buckets(),
        b = buckets();
      const metadata = appendHouseArchitecture(source, index, a);
      expect(appendHouseArchitecture(source, index, b)).toEqual(metadata);
      expect(a).toEqual(b);
      expect(JSON.stringify(source)).toBe(before);
      expect(metadata.volumes).toBeGreaterThanOrEqual(2);
      expect(metadata.windows).toBeGreaterThanOrEqual(6);
      expect(metadata.doors).toBeGreaterThanOrEqual(1);
      expect(metadata.pillars).toBeGreaterThanOrEqual(2);
      expect(metadata.roofParts).toBeGreaterThanOrEqual(3);
      return JSON.stringify(metadata.structuralVolumes);
    });
    expect(new Set(signatures).size).toBe(6);
  });

  it.each([-1, 1] as const)(
    "fits every form within the authored footprint and .25 eave allowance for facing=%s",
    (facing) => {
      for (const width of [5.2, 6.5])
        for (const depth of [6, 7.2])
          for (const form of FORMS) {
            const source = { ...house(form, facing), width, depth, height: 2.14 };
            const batch = buckets();
            const metadata = appendHouseArchitecture(source, 3, batch);
            for (const part of Object.values(batch))
              for (let i = 0; i < part.position.length; i += 3) {
                expect(Math.abs(part.position[i] - source.center[0])).toBeLessThanOrEqual(
                  width / 2 + 0.250001,
                );
                expect(Math.abs(part.position[i + 2] - source.center[1])).toBeLessThanOrEqual(
                  depth / 2 + 0.250001,
                );
                expect(part.position[i + 1]).toBeGreaterThanOrEqual(-0.100001);
                expect(part.position[i + 1]).toBeLessThanOrEqual(metadata.height - 0.1 + 1e-8);
              }
            if (form === "two-storey") expect(metadata.height).toBeCloseTo(3.8, 6);
            else expect(metadata.height).toBeLessThanOrEqual(source.height + 0.08);
            expect(metadata.triangles).toBeLessThanOrEqual(1500);
          }
    },
  );

  it("emits finite nondegenerate triangles with valid dominant-face UVs in all four PBR buckets", () => {
    for (const form of FORMS) {
      const batch = buckets();
      const metadata = appendHouseArchitecture(house(form), 2, batch);
      let triangles = 0;
      for (const part of Object.values(batch)) {
        expect(part.position.length).toBeGreaterThan(0);
        expect(part.color.length).toBe(part.position.length);
        expect(part.uv.length).toBe((part.position.length / 3) * 2);
        expect([...part.position, ...part.color, ...part.uv].every(Number.isFinite)).toBe(true);
        for (let i = 0; i < part.position.length; i += 9) {
          const [ax, ay, az, bx, by, bz, cx, cy, cz] = part.position.slice(i, i + 9);
          const normal = [
            (by - ay) * (cz - az) - (bz - az) * (cy - ay),
            (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
            (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
          ];
          expect(Math.hypot(...normal)).toBeGreaterThan(1e-9);
          const uvIndex = (i / 3) * 2;
          const [u0, v0, u1, v1, u2, v2] = part.uv.slice(uvIndex, uvIndex + 6);
          expect(Math.abs((u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0))).toBeGreaterThan(1e-10);
          triangles++;
        }
      }
      expect(triangles).toBe(metadata.triangles);
    }
  });

  it("leaves an actual open courtyard and builds the upper storey on only part of the lower footprint", () => {
    const courtyard = appendHouseArchitecture(house("courtyard"), 0, buckets());
    const footprintContains = (x: number, z: number) =>
      courtyard.structuralVolumes.some((v) => x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1);
    expect(footprintContains(1, 0)).toBe(false);
    expect(courtyard.structuralVolumes.some((v) => v.role === "garage")).toBe(true);
    expect(footprintContains(-1.4, -1)).toBe(true);
    expect(footprintContains(1, 2)).toBe(true);
    const two = appendHouseArchitecture(house("two-storey"), 0, buckets());
    const lower = two.structuralVolumes.find((v) => v.role === "main")!;
    const upper = two.structuralVolumes.find((v) => v.role === "upper")!;
    expect(upper.base).toBeGreaterThan(lower.base);
    expect((upper.x1 - upper.x0) * (upper.z1 - upper.z0)).toBeLessThan(
      (lower.x1 - lower.x0) * (lower.z1 - lower.z0) * 0.6,
    );
    expect(
      upper.x0 >= lower.x0 && upper.x1 <= lower.x1 && upper.z0 >= lower.z0 && upper.z1 <= lower.z1,
    ).toBe(true);
  });

  it("uses compatible authored roof choices without replacing the form's structural plan", () => {
    const pitched = buckets(),
      flat = buckets();
    const hip = appendHouseArchitecture({ ...house("villa"), roof: "hip" }, 0, pitched);
    const slab = appendHouseArchitecture({ ...house("villa"), roof: "flat" }, 0, flat);
    expect(hip.structuralVolumes.map((v) => [v.x0, v.x1, v.z0, v.z1])).toEqual(
      slab.structuralVolumes.map((v) => [v.x0, v.x1, v.z0, v.z1]),
    );
    expect(hip.structuralVolumes[0].roof).toBe("hip");
    expect(slab.structuralVolumes[0].roof).toBe("flat");
    expect(pitched.roof.position).not.toEqual(flat.roof.position);
  });

  it("connects attached garage walls to the house instead of leaving detached miniature boxes", () => {
    for (const form of ["villa", "compact", "gable"] as const) {
      const { structuralVolumes } = appendHouseArchitecture(house(form), 0, buckets());
      const main = structuralVolumes.find((v) => v.role === "main")!;
      const garage = structuralVolumes.find((v) => v.role === "garage")!;
      const xOverlap = Math.min(main.x1, garage.x1) - Math.max(main.x0, garage.x0);
      const zOverlap = Math.min(main.z1, garage.z1) - Math.max(main.z0, garage.z0);
      expect(xOverlap).toBeGreaterThanOrEqual(-1e-8);
      expect(zOverlap).toBeGreaterThanOrEqual(-1e-8);
      expect(xOverlap > 0 || zOverlap > 0).toBe(true);
      expect(
        Math.min(
          Math.abs(main.x1 - garage.x0),
          Math.abs(main.x0 - garage.x1),
          Math.abs(main.z1 - garage.z0),
          Math.abs(main.z0 - garage.z1),
        ),
      ).toBeLessThan(1e-8);
    }
  });

  it("joins hip and crossed roof planes into an exact footprint union without overlapping top surfaces", () => {
    for (const form of FORMS) {
      const source = { ...house(form), width: 6.5, depth: 7.2 },
        batch = buckets();
      const metadata = appendHouseArchitecture(source, 0, batch);
      const eave = Math.min(0.2, Math.min(source.width, source.depth) * 0.028);
      const rectangles = metadata.structuralVolumes.map((v) => ({
        x0: v.x0 - eave,
        x1: v.x1 + eave,
        z0: v.z0 - eave,
        z1: v.z1 + eave,
      }));
      let union = 0;
      // Independent rectangle inclusion/exclusion checks the projected roof
      // area. The former overlapping box roofs would double-count junctions.
      for (let mask = 1; mask < 1 << rectangles.length; mask++) {
        const selected = rectangles.filter((_, i) => mask & (1 << i));
        const width = Math.max(
          0,
          Math.min(...selected.map((r) => r.x1)) - Math.max(...selected.map((r) => r.x0)),
        );
        const depth = Math.max(
          0,
          Math.min(...selected.map((r) => r.z1)) - Math.max(...selected.map((r) => r.z0)),
        );
        union += (selected.length % 2 ? 1 : -1) * width * depth;
      }
      let projectedArea = 0;
      for (let i = 0; i < metadata.roofSurfaceTriangles * 9; i += 9) {
        const [ax, , az, bx, , bz, cx, , cz] = batch.roof.position.slice(i, i + 9);
        projectedArea += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
      }
      expect(projectedArea, form).toBeCloseTo(union, 5);
      expect(metadata.pitchedVolumes).toBeGreaterThan(0);
      expect(metadata.roofPlanes).toBeGreaterThan(metadata.volumes);
      expect(metadata.triangles).toBeLessThanOrEqual(1500);
    }
  });

  it("preserves roof and wall proportions at compact dense-block sizes and larger end parcels", () => {
    for (const [width, depth] of [
      [4.8, 6],
      [7.6, 9],
      [10.6, 11.5],
    ])
      for (const form of FORMS) {
        const batch = buckets(),
          source = { ...house(form), width, depth, height: 2.5 };
        const metadata = appendHouseArchitecture(source, 7, batch);
        expect(metadata.volumes).toBeGreaterThanOrEqual(3);
        expect(metadata.triangles).toBeLessThanOrEqual(1500);
        expect(metadata.height).toBeGreaterThan(1.8);
        for (const v of metadata.structuralVolumes) {
          expect(v.x0).toBeGreaterThanOrEqual(-width / 2 - 1e-8);
          expect(v.x1).toBeLessThanOrEqual(width / 2 + 1e-8);
          expect(v.z0).toBeGreaterThanOrEqual(-depth / 2 - 1e-8);
          expect(v.z1).toBeLessThanOrEqual(depth / 2 + 1e-8);
        }
        const roofHeights = batch.roof.position.filter((_, i) => i % 3 === 1);
        expect(Math.max(...roofHeights) - Math.min(...roofHeights)).toBeGreaterThan(0.3);
      }
  });

  it("alternates the complete attached plan when a form repeats in another block", () => {
    const a = buckets(),
      b = buckets();
    const first = appendHouseArchitecture(house("courtyard"), 0, a);
    const repeat = appendHouseArchitecture(house("courtyard"), 6, b);
    expect(first.handedness).toBe(-repeat.handedness);
    const roofPoints = (batch: HouseArchitectureBatches, flip: boolean) => {
      const p = batch.roof.position,
        points: string[] = [];
      for (let i = 0; i < p.length; i += 3)
        points.push(
          [flip ? 180 - p[i] : p[i], p[i + 1], p[i + 2]].map((v) => v.toFixed(7)).join(","),
        );
      return points.sort();
    };
    expect(roofPoints(a, false)).not.toEqual(roofPoints(b, false));
    expect(roofPoints(a, true)).toEqual(roofPoints(b, false));
    expect(first.triangles).toBe(repeat.triangles);
  });

  it("retains nonzero Float32 world UVs in every currently derived residential parcel", () => {
    const houses = deriveUrbanHouses();
    expect(houses.length).toBeGreaterThanOrEqual(32);
    for (const [index, source] of houses.entries()) {
      const batch = buckets();
      appendHouseArchitecture({ ...source, center: [0, 0] }, index, batch);
      const cos = Math.cos(source.heading),
        sin = Math.sin(source.heading);
      for (const [name, part] of Object.entries(batch))
        for (let i = 0; i < part.position.length; i += 9) {
          const vertices = [0, 3, 6].map((j) => {
            const [x, y, z] = part.position.slice(i + j, i + j + 3);
            return [source.center[0] + x * cos - z * sin, y, source.center[1] + x * sin + z * cos];
          });
          const [a, b, c] = vertices,
            ab = b.map((v, j) => v - a[j]),
            ac = c.map((v, j) => v - a[j]);
          const normal = [
            Math.abs(ab[1] * ac[2] - ab[2] * ac[1]),
            Math.abs(ab[2] * ac[0] - ab[0] * ac[2]),
            Math.abs(ab[0] * ac[1] - ab[1] * ac[0]),
          ];
          const dominant =
            normal[1] >= Math.max(normal[0], normal[2]) ? 1 : normal[0] > normal[2] ? 0 : 2;
          const uv = vertices.map((v) => [
            Math.fround(dominant === 0 ? v[2] : v[0]),
            Math.fround(dominant === 1 ? v[2] : v[1]),
          ]);
          const area =
            (uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) -
            (uv[1][1] - uv[0][1]) * (uv[2][0] - uv[0][0]);
          expect(
            Math.abs(area),
            JSON.stringify({ index, form: source.form, name, i, vertices }),
          ).toBeGreaterThan(0);
        }
    }
  });

  it("mirrors the complete geometry and keeps outward glazing normals when a house faces the opposite street", () => {
    const a = buckets(),
      b = buckets();
    appendHouseArchitecture(house("villa", -1), 1, a);
    appendHouseArchitecture(house("villa", 1), 1, b);
    const signature = (part: HouseArchitectureBatches["walls"], mirror: boolean) => {
      const points: string[] = [];
      for (let i = 0; i < part.position.length; i += 3)
        points.push(
          [
            part.position[i],
            part.position[i + 1],
            mirror ? 240 - part.position[i + 2] : part.position[i + 2],
          ]
            .map((x) => x.toFixed(7))
            .join(","),
        );
      return points.sort();
    };
    for (const name of Object.keys(a) as (keyof HouseArchitectureBatches)[])
      expect(signature(a[name], true)).toEqual(signature(b[name], false));
    // Front-facing windows are actual recessed planes, with outward -Z/+Z
    // triangle normals instead of a blanket DoubleSide material requirement.
    const normalZ = (part: HouseArchitectureBatches["glass"], i: number) => {
      const p = part.position;
      return (p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 4] - p[i + 1]) * (p[i + 6] - p[i]);
    };
    const normals = (part: HouseArchitectureBatches["glass"]) =>
      part.position.filter((_, i) => i % 9 === 0).map((_, i) => normalZ(part, i * 9));
    expect(normals(a.glass).some((n) => n < 0)).toBe(true);
    expect(
      normals(a.glass)
        .map((n) => Number((-n).toFixed(8)))
        .sort((a, b) => a - b),
    ).toEqual(
      normals(b.glass)
        .map((n) => Number(n.toFixed(8)))
        .sort((a, b) => a - b),
    );
  });
});
