import { describe, expect, it } from "vitest";
import {
  PAVILION_13_PLAN as plan,
  PAVILION_13_MODULE_SIZE,
  PAVILION_13_SPLIT_GROUPS,
} from "./pavilion13";
import type { InteriorEnvironment } from "./data";

function bounds(environment: InteriorEnvironment) {
  const points = environment.parts[0].polygon;
  return {
    minX: Math.min(...points.map((p) => p[0])),
    maxX: Math.max(...points.map((p) => p[0])),
    minY: Math.min(...points.map((p) => p[1])),
    maxY: Math.max(...points.map((p) => p[1])),
  };
}
function columnAt(x: number) {
  return plan.environments
    .filter((e) => bounds(e).minX === x)
    .sort((a, b) => a.label[1] - b.label[1]);
}
const code = (n: number) => String(n).padStart(2, "0");
const sequence = (start: number, end: number, step: number) =>
  Array.from({ length: Math.abs(end - start) + 1 }, (_, i) => code(start + i * step));

describe("Pavilhão 13 uniform schematic", () => {
  it("keeps eighty separate numbered commercial identities with no inferred areas", () => {
    expect(plan.pavilionNumber).toBe(13);
    expect(plan.revision).toBe(2);
    expect(plan.environments.map((e) => e.code)).toEqual(sequence(1, 80, 1));
    expect(new Set(plan.environments.map((e) => e.id)).size).toBe(80);
    for (const environment of plan.environments) {
      expect(environment.id).toBe(`indumoveis:pavilion:13:environment:${environment.code}`);
      expect(environment.name).toBe(`Lote ${environment.code}`);
      expect(environment.kind).toBe("commercial");
      expect(environment.declaredAreaM2).toBeNull();
      expect(environment.parts).toHaveLength(1);
      expect(environment.parts[0].kind).toBe("interior");
    }
  });

  it("gives all eighty selectable modules exactly the same presentation dimensions", () => {
    for (const environment of plan.environments) {
      const b = bounds(environment),
        ring = environment.parts[0].polygon;
      expect(b.maxX - b.minX, environment.code).toBe(PAVILION_13_MODULE_SIZE.width);
      expect(b.maxY - b.minY, environment.code).toBe(PAVILION_13_MODULE_SIZE.height);
      expect(ring).toHaveLength(5);
      expect(ring[0]).toEqual(ring[4]);
      expect(ring.every((point) => point.every(Number.isFinite))).toBe(true);
      expect(environment.label).toEqual([(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]);
    }
  });

  it("preserves the documentary top-to-bottom ordering in all three columns", () => {
    expect(columnAt(528).map((e) => e.code)).toEqual([
      ...sequence(29, 15, -1),
      ...sequence(14, 1, -1),
    ]);
    expect(columnAt(304).map((e) => e.code)).toEqual(sequence(51, 30, -1));
    expect(columnAt(80).map((e) => e.code)).toEqual([
      ...sequence(52, 66, 1),
      ...sequence(67, 80, 1),
    ]);
    expect([columnAt(528).length, columnAt(304).length, columnAt(80).length]).toEqual([29, 22, 29]);
  });

  it("opens only the two lateral block passages and keeps the central island continuous", () => {
    const byCode = new Map(plan.environments.map((e) => [e.code, e]));
    const gapRight = bounds(byCode.get("14")!).minY - bounds(byCode.get("15")!).maxY;
    const gapLeft = bounds(byCode.get("67")!).minY - bounds(byCode.get("66")!).maxY;
    expect(gapRight).toBe(144);
    expect(gapLeft).toBe(gapRight);
    const center = columnAt(304);
    for (let i = 1; i < center.length; i++)
      expect(bounds(center[i]).minY).toBe(bounds(center[i - 1]).maxY);
    // The center crosses the lateral passage without acquiring a break or a new lot.
    const passageCenterY = (bounds(byCode.get("15")!).maxY + bounds(byCode.get("14")!).minY) / 2;
    expect(
      center.some((e) => bounds(e).minY <= passageCenterY && bounds(e).maxY >= passageCenterY),
    ).toBe(true);
  });

  it("splits every documentary aggregate into independent full-size selectable modules", () => {
    expect(PAVILION_13_SPLIT_GROUPS).toEqual([
      ["01", "02", "03", "04"],
      ["10", "11", "12", "13", "14"],
      ["15", "16", "17", "18"],
      ["30", "31", "32", "33", "34", "35"],
      ["63", "64", "65", "66"],
      ["67", "68", "69", "70"],
    ]);
    for (const group of PAVILION_13_SPLIT_GROUPS) {
      const members = group.map((c) => plan.environments.find((e) => e.code === c)!);
      expect(new Set(members.map((e) => e.parts[0].id)).size).toBe(group.length);
      const ordered = members.sort((a, b) => a.label[1] - b.label[1]);
      for (let i = 1; i < ordered.length; i++)
        expect(bounds(ordered[i]).minY).toBe(bounds(ordered[i - 1]).maxY);
    }
  });

  it("keeps selectable modules within the plan and out of their neighbours", () => {
    for (const environment of plan.environments) {
      const b = bounds(environment);
      expect(b.minX).toBeGreaterThanOrEqual(plan.bounds.minX);
      expect(b.maxX).toBeLessThanOrEqual(plan.bounds.maxX);
      expect(b.minY).toBeGreaterThanOrEqual(plan.bounds.minY);
      expect(b.maxY).toBeLessThanOrEqual(plan.bounds.maxY);
    }
    for (let i = 0; i < plan.environments.length; i++)
      for (let j = i + 1; j < plan.environments.length; j++) {
        const a = bounds(plan.environments[i]),
          b = bounds(plan.environments[j]);
        const overlapWidth = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
        const overlapHeight = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
        expect(
          overlapWidth * overlapHeight,
          `${plan.environments[i].code}/${plan.environments[j].code}`,
        ).toBe(0);
      }
  });

  it("places the entrance below the modules and the rear above them without importing source occupants", () => {
    const entrance = plan.architecture.find((e) => e.id === "p13:main-entrance")!;
    const rear = plan.architecture.find((e) => e.id === "p13:rear-label")!;
    expect(entrance.labelAt![1]).toBeGreaterThan(
      Math.max(...plan.environments.map((e) => bounds(e).maxY)),
    );
    expect(rear.labelAt![1]).toBeLessThan(
      Math.min(...plan.environments.map((e) => bounds(e).minY)),
    );
    const runtime = JSON.stringify(plan).toLocaleLowerCase("pt-BR");
    for (const privateSourceToken of [
      "reservado",
      "santa rosa",
      "hartmann",
      "heute",
      "aero",
      "mws",
      "cresol",
      "850.5",
      "850,5",
    ])
      expect(runtime).not.toContain(privateSourceToken);
    expect(plan.source.coordinateSystem).toContain("schematic");
    expect(plan.source.sha256).toBe(
      "5d33bd55d353021ba18f6e3cc6114544723f8ed292b149e0aab628625187ef67",
    );
  });
});
