import generatedPlan from "./pavilion3.generated.json";
import type { InteriorEnvironment, PavilionPlan } from "./data";

export const PAVILION_3_PLAN = generatedPlan as PavilionPlan;

export function normalizePavilion3LotCode(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  if (!/^\d{1,3}$/.test(text)) return undefined;
  const number = Number(text);
  return number >= 1 && number <= 142 ? String(number) : undefined;
}

export function validatePavilion3Search(search: Record<string, unknown>): { lote?: string } {
  return { lote: normalizePavilion3LotCode(search.lote) };
}

/** P3 has vertical faces; navigate spatially, including across the lateral passage. */
export function pavilion3Neighbor(
  lots: readonly InteriorEnvironment[],
  current: InteriorEnvironment,
  key: string,
) {
  const axis = key === "ArrowLeft" || key === "ArrowRight" ? 0 : 1;
  const other = axis === 0 ? 1 : 0;
  const sign = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  return lots
    .filter(
      (lot) => lot.kind === "commercial" && sign * (lot.label[axis] - current.label[axis]) > 0.1,
    )
    .sort((a, b) => {
      const score = (lot: InteriorEnvironment) =>
        Math.abs(lot.label[axis] - current.label[axis]) +
        8 * Math.abs(lot.label[other] - current.label[other]);
      return score(a) - score(b);
    })[0];
}
