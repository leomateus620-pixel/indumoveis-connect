import { describe, expect, it } from "vitest";
import { PAVILION_3_PLAN as plan, pavilion3Neighbor, validatePavilion3Search } from "./pavilion3";
import evidence from "../../../docs/pavilion-3/area-evidence.json";
import { PAVILION_PRESENTATIONS, interiorPavilionNumber } from "./presentation";
import { pavilionDestinationHref } from "./connections";

const lot = (code: number) =>
  plan.environments.find((environment) => environment.code === String(code))!;
const box = (code: number) => {
  const points = lot(code).parts[0].polygon;
  return {
    x: Math.min(...points.map(([x]) => x)),
    y: Math.min(...points.map(([, y]) => y)),
    right: Math.max(...points.map(([x]) => x)),
    bottom: Math.max(...points.map(([, y]) => y)),
  };
};

describe("Pavilhão 3 documentary inventory", () => {
  it("reconciles all source groups to 142 unique 5 m² lots, separately from the pavilion total", () => {
    expect(plan.totalAreaM2).toBe(1155);
    expect(plan.environments.map((e) => e.code)).toEqual(
      Array.from({ length: 142 }, (_, i) => String(i + 1)),
    );
    expect(evidence.groups.flatMap((g) => g.codes).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 142 }, (_, i) => i + 1),
    );
    expect(evidence.groups.reduce((sum, g) => sum + g.totalM2, 0)).toBe(710);
    for (const group of evidence.groups) {
      expect(group.totalM2 / group.codes.length).toBe(5);
      for (const code of group.codes) expect(lot(code).declaredAreaM2).toBe(5);
    }
    for (const environment of plan.environments) {
      expect(environment.parts).toHaveLength(1);
      expect(environment.parts[0].kind).toBe("interior");
      expect(environment.parts[0].polygon[0]).toEqual(environment.parts[0].polygon.at(-1));
      expect(environment.name).toBe(`Lote ${environment.code}`);
    }
  });

  it("preserves all four faces, both halves of aggregated islands and the lateral passage", () => {
    expect(lot(1).label[1]).toBeGreaterThan(lot(38).label[1]);
    expect(lot(39).label[1]).toBeLessThan(lot(71).label[1]);
    expect(lot(72).label[1]).toBeGreaterThan(lot(104).label[1]);
    expect(lot(105).label[1]).toBeLessThan(lot(142).label[1]);
    for (let n = 39; n <= 71; n++) {
      expect(box(n).right).toBe(box(143 - n).x);
      expect(box(n).y).toBe(box(143 - n).y);
      expect(box(n).bottom).toBe(box(143 - n).bottom);
    }
    const passage = plan.architecture.find((a) => a.id === "p3:right-passage")!;
    expect(box(124).bottom).toBeLessThan(passage.labelAt![1]);
    expect(box(125).y).toBeGreaterThan(passage.labelAt![1]);
    for (let a = 1; a <= 142; a++)
      for (let b = a + 1; b <= 142; b++) {
        const x = box(a),
          y = box(b);
        expect(
          Math.min(x.right, y.right) > Math.max(x.x, y.x) &&
            Math.min(x.bottom, y.bottom) > Math.max(x.y, y.y),
          `${a}/${b}`,
        ).toBe(false);
      }
  });

  it("normalizes links and keyboard directions for the vertical plan", () => {
    expect(validatePavilion3Search({ lote: "001" })).toEqual({ lote: "1" });
    expect(validatePavilion3Search({ lote: 142 })).toEqual({ lote: "142" });
    for (const value of [0, 143, -1, 1.5, "1–4", ["1"], {}, null])
      expect(validatePavilion3Search({ lote: value })).toEqual({ lote: undefined });
    expect(pavilion3Neighbor(plan.environments, lot(1), "ArrowUp")?.code).toBe("2");
    expect(pavilion3Neighbor(plan.environments, lot(39), "ArrowRight")?.code).toBe("104");
    expect(pavilion3Neighbor(plan.environments, lot(104), "ArrowDown")?.code).toBe("103");
    expect(pavilion3Neighbor(plan.environments, lot(124), "ArrowDown")?.code).toBe("125");
    expect(interiorPavilionNumber("3")).toBe(3);
    expect(pavilionDestinationHref(3)).toBe("/mapa/pavilhoes/3/interior");
    expect(PAVILION_PRESENTATIONS[3].connections?.[0].destination).toBe(13);
  });
});
