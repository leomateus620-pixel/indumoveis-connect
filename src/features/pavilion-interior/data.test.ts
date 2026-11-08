import { describe, expect, it } from "vitest";
import {
  PAVILION_1_PLAN as plan,
  isInteriorEnvironmentCode,
  environmentHasExternalPart,
  type InteriorPoint,
} from "./data";

const cross = (a: InteriorPoint, b: InteriorPoint, p: InteriorPoint) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function onBoundary(p: InteriorPoint, ring: InteriorPoint[]) {
  return ring.slice(0, -1).some((a, i) => {
    const b = ring[i + 1];
    return (
      Math.abs(cross(a, b, p)) < 1e-7 &&
      p[0] >= Math.min(a[0], b[0]) &&
      p[0] <= Math.max(a[0], b[0]) &&
      p[1] >= Math.min(a[1], b[1]) &&
      p[1] <= Math.max(a[1], b[1])
    );
  });
}
function strictlyInside(p: InteriorPoint, ring: InteriorPoint[]) {
  if (onBoundary(p, ring)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function edgesCross(a: InteriorPoint[], b: InteriorPoint[]) {
  return a.slice(0, -1).some((p, i) =>
    b.slice(0, -1).some((r, j) => {
      const q = a[i + 1],
        s = b[j + 1];
      return cross(p, q, r) * cross(p, q, s) < -1e-7 && cross(r, s, p) * cross(r, s, q) < -1e-7;
    }),
  );
}

const declaredAreas = [
  111.66, 47.5, 47.5, 74.81, 74.81, 47.5, 47.5, 74.81, 74.81, 47.5, 69.17, 129.43, 69.48, 254.81,
  32.33,
];

describe("Pavilhão 1 documentary plan", () => {
  it("preserves all fifteen numbered spaces and exactly fourteen sellable identities", () => {
    const numbered = plan.environments.filter((e) => /^\d{2}$/.test(e.code));
    expect(numbered.map((e) => e.code)).toEqual(
      declaredAreas.map((_, i) => String(i + 1).padStart(2, "0")),
    );
    expect(numbered.map((e) => e.declaredAreaM2)).toEqual(declaredAreas);
    expect(plan.pavilionNumber).toBe(1);
    expect(plan.environments.filter((e) => e.kind === "commercial")).toHaveLength(14);
    expect(plan.environments.find((e) => e.code === "15")).toMatchObject({
      kind: "support",
      name: "Banheiros",
    });
    expect(plan.environments.find((e) => e.code === "salon")).toMatchObject({
      kind: "hall",
      declaredAreaM2: null,
    });
  });

  it("keeps each of the five exterior surfaces on its single commercial environment", () => {
    expect(
      plan.environments
        .filter(environmentHasExternalPart)
        .map((e) => e.code)
        .sort(),
    ).toEqual(["04", "05", "08", "09", "12"]);
    for (const environment of plan.environments.filter(environmentHasExternalPart)) {
      expect(environment.parts.map((p) => p.kind)).toEqual(["interior", "external"]);
      expect(environment.kind).toBe("commercial");
      expect(environment.parts[1].id).toBe(`${environment.code}:external`);
    }
  });

  it("has closed, finite nondegenerate geometry and labels inside their own environment", () => {
    const ids = new Set<string>();
    for (const environment of plan.environments) {
      expect(ids.has(environment.id)).toBe(false);
      ids.add(environment.id);
      expect(
        strictlyInside(environment.label, environment.parts[0].polygon),
        environment.code,
      ).toBe(true);
      for (const part of environment.parts) {
        expect(part.polygon[0]).toEqual(part.polygon.at(-1));
        expect(part.polygon.every((p) => p.every(Number.isFinite))).toBe(true);
        const area =
          part.polygon
            .slice(0, -1)
            .reduce(
              (sum, p, i) => sum + p[0] * part.polygon[i + 1][1] - part.polygon[i + 1][0] * p[1],
              0,
            ) / 2;
        expect(Math.abs(area), part.id).toBeGreaterThan(1);
        expect(part.path).toMatch(/^M.+Z$/);
        expect(edgesCross(part.polygon, part.polygon), part.id).toBe(false);
      }
    }
  });

  it("keeps hit surfaces out of neighbouring environments and their linked exteriors", () => {
    const parts = plan.environments.flatMap((e) => e.parts.map((p) => ({ ...p, owner: e.code })));
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i],
          b = parts[j],
          message = `${a.id} overlaps ${b.id}`;
        expect(edgesCross(a.polygon, b.polygon), message).toBe(false);
        expect(
          a.polygon.some((p) => strictlyInside(p, b.polygon)),
          message,
        ).toBe(false);
        expect(
          b.polygon.some((p) => strictlyInside(p, a.polygon)),
          message,
        ).toBe(false);
        // Also catches identical rectangles, whose vertices lie on boundaries.
        const centre: InteriorPoint = [
          a.polygon.slice(0, -1).reduce((sum, p) => sum + p[0], 0) / (a.polygon.length - 1),
          a.polygon.slice(0, -1).reduce((sum, p) => sum + p[1], 0) / (a.polygon.length - 1),
        ];
        if (strictlyInside(centre, a.polygon))
          expect(strictlyInside(centre, b.polygon), message).toBe(false);
      }
  });

  it("preserves the exact wavy separator as a guide, without declaring it a wall", () => {
    expect(plan.architecture.find((e) => e.id === "reception-salon-divider")).toMatchObject({
      kind: "guide",
    });
    const reception = plan.environments.find((e) => e.code === "01")!.parts[0].polygon;
    const hall = plan.environments.find((e) => e.code === "salon")!.parts[0].polygon;
    expect(reception.length).toBeGreaterThan(60);
    expect(reception.slice(2, -1).reverse()).toEqual(hall.slice(2, -3));
  });

  it("accepts only plan environment codes for contextual URL selection", () => {
    expect(isInteriorEnvironmentCode("09")).toBe(true);
    expect(isInteriorEnvironmentCode("salon")).toBe(true);
    for (const value of ["9", "00", "16", "pavilhao14", null, {}, "<script>"])
      expect(isInteriorEnvironmentCode(value)).toBe(false);
  });
});
