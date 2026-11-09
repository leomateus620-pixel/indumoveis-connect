import { describe, expect, it } from "vitest";
import type { InteriorEnvironment } from "./data";
import { PAVILION_12_PLAN as plan } from "./pavilion12";

function bounds(environment: InteriorEnvironment) {
  const points = environment.parts[0].polygon;
  return {
    left: Math.min(...points.map(([x]) => x)),
    right: Math.max(...points.map(([x]) => x)),
    top: Math.min(...points.map(([, y]) => y)),
    bottom: Math.max(...points.map(([, y]) => y)),
  };
}

const rows = [
  { label: "Faixa superior", first: 254, last: 205 },
  { label: "Ilha central superior · fila superior", first: 163, last: 204 },
  { label: "Ilha central superior · fila inferior", first: 162, last: 121 },
  { label: "Ilha central inferior · fila superior", first: 79, last: 120 },
  { label: "Ilha central inferior · fila inferior", first: 78, last: 37 },
  { label: "Faixa inferior", first: 1, last: 36 },
];

function codes(first: number, last: number) {
  return Array.from({ length: Math.abs(last - first) + 1 }, (_, i) =>
    String(first + i * Math.sign(last - first)),
  );
}

const byCode = new Map(plan.environments.map((e) => [e.code, e]));

function lotBounds(code: number) {
  return bounds(byCode.get(String(code))!);
}

describe("Pavilhão 12 documentary geometry", () => {
  it("keeps 254 unpadded commercial identities and only the declared pavilion area", () => {
    expect(plan.pavilionNumber).toBe(12);
    expect(plan.totalAreaM2).toBe(1650);
    expect(plan.environments.map((e) => e.code)).toEqual(codes(1, 254));
    expect(new Set(plan.environments.map((e) => e.id)).size).toBe(254);
    expect(new Set(plan.environments.map((e) => e.functionLabel))).toEqual(
      new Set(rows.map((row) => row.label)),
    );
    for (const environment of plan.environments) {
      expect(environment.id).toBe(`indumoveis:pavilion:12:environment:${environment.code}`);
      expect(environment.name).toBe(`Lote ${environment.code}`);
      expect(environment.kind).toBe("commercial");
      expect(environment.declaredAreaM2).toBeNull();
      expect(environment.parts).toHaveLength(1);
      expect(environment.parts[0].kind).toBe("interior");
    }
  });

  it("preserves the exact left-to-right numbering and positions in all six rows", () => {
    let lastY = -Infinity;
    for (const row of rows) {
      const environments = plan.environments
        .filter((e) => e.functionLabel === row.label)
        .sort((a, b) => a.label[0] - b.label[0]);
      expect(
        environments.map((e) => e.code),
        row.label,
      ).toEqual(codes(row.first, row.last));
      expect(environments.every((e) => e.label[1] > lastY)).toBe(true);
      lastY = Math.max(...environments.map((e) => e.label[1]));
    }
  });

  it("keeps the two halves of each mixed island group independent and aligned", () => {
    for (const [above, below] of [
      ...Array.from({ length: 6 }, (_, i) => [79 + i, 78 - i]),
      ...Array.from({ length: 8 }, (_, i) => [85 + i, 72 - i]),
      ...Array.from({ length: 9 }, (_, i) => [163 + i, 162 - i]),
      ...Array.from({ length: 4 }, (_, i) => [172 + i, 153 - i]),
    ]) {
      const a = lotBounds(above);
      const b = lotBounds(below);
      expect(a.bottom, `${above}/${below}`).toBe(b.top);
      expect(a.left).toBeCloseTo(b.left, 2);
      expect(a.right).toBeCloseTo(b.right, 2);
    }
    // The isolated middle of the upper island has four divisions per row.
    expect(lotBounds(175).right - lotBounds(172).left).toBeCloseTo(56.715, 2);
  });

  it("preserves the entrance opening between lots 22 and 23 and the central circulation", () => {
    const entrance = plan.architecture.find((element) => element.id === "p12:main-entrance")!;
    const [x, y] = entrance.labelAt!;
    expect(lotBounds(22).right).toBeLessThan(x);
    expect(lotBounds(23).left).toBeGreaterThan(x);
    expect(y).toBeGreaterThan(lotBounds(22).top);
    expect(y).toBeLessThan(lotBounds(22).bottom);
    expect(lotBounds(11).right).toBe(lotBounds(12).left);
    expect(lotBounds(78).top).toBeGreaterThan(lotBounds(162).bottom);
    const left = plan.architecture.find((element) => element.id === "p12:left-access")!;
    const right = plan.architecture.find((element) => element.id === "p12:right-access")!;
    expect(left.labelAt![0]).toBeLessThan(lotBounds(79).left);
    expect(right.labelAt![0]).toBeGreaterThan(lotBounds(120).right);
    for (const element of [left, right]) {
      expect(element.labelAt![1]).toBeGreaterThan(lotBounds(162).bottom);
      expect(element.labelAt![1]).toBeLessThan(lotBounds(79).top);
    }
  });

  it("uses closed selectable rectangles within bounds without invading neighbours", () => {
    const boxes = plan.environments.map((environment) => {
      const box = bounds(environment);
      const part = environment.parts[0];
      expect(part.polygon).toEqual([
        [box.left, box.top],
        [box.right, box.top],
        [box.right, box.bottom],
        [box.left, box.bottom],
        [box.left, box.top],
      ]);
      expect(box.left).toBeGreaterThanOrEqual(plan.bounds.minX);
      expect(box.right).toBeLessThanOrEqual(plan.bounds.maxX);
      expect(box.top).toBeGreaterThanOrEqual(plan.bounds.minY);
      expect(box.bottom).toBeLessThanOrEqual(plan.bounds.maxY);
      expect(environment.label[0]).toBeGreaterThan(box.left);
      expect(environment.label[0]).toBeLessThan(box.right);
      expect(environment.label[1]).toBeGreaterThan(box.top);
      expect(environment.label[1]).toBeLessThan(box.bottom);
      return { ...box, code: environment.code };
    });
    const overlaps: string[] = [];
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const overlapX = Math.min(a.right, b.right) > Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
        if (overlapX && overlapY) overlaps.push(`${a.code}/${b.code}`);
      }
    }
    expect(overlaps).toEqual([]);
  });
});
