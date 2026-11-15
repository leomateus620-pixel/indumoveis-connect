import { describe, expect, it } from "vitest";
import { PAVILION_1_PLAN } from "@/features/pavilion-interior/data";
import { commercialPriceLabel, commercialUnitPrice, type CommercialLot } from "@/lib/commercial";
import { saleLotProblem, saleSelectionTotals } from "./selection";
import { agreedPrices } from "./sale-form";

const prices = [
  450000, 660000, 660000, 1020000, 1020000, 660000, 660000, 1020000, 1020000, 660000, 960000,
  1500000, 960000, 1500000, 450000,
];
const lots: CommercialLot[] = PAVILION_1_PLAN.environments
  .filter((environment) => environment.kind === "commercial")
  .map((environment, index) => ({
    id: environment.id,
    environmentId: environment.id,
    geometryId: null,
    code: environment.code,
    segmentKey: "p1",
    status: "disponivel",
    areaM2: environment.declaredAreaM2,
    areaPending: false,
    pricingState: "priced",
    pricingBasis: "fixed",
    cornerState: null,
    tariffCents: null,
    grossCents: prices[index],
  }));

describe("P1 fixed documentary prices in sales", () => {
  it("selects fifteen spaces without an inferred tariff and totals their documentary prices", () => {
    expect(lots).toHaveLength(15);
    expect(lots.map(saleLotProblem)).toEqual(Array(15).fill(null));
    expect(saleSelectionTotals(lots)).toMatchObject({ pricedCount: 15, tableCents: 13200000 });
    expect(saleSelectionTotals(lots).areaM2).toBeCloseTo(1203.62, 2);
    expect(agreedPrices(lots, {})).toEqual({ overrides: {}, agreedCents: 13200000, issue: null });
  });

  it("uses the table for space 15 and requires a reason for an agreed override", () => {
    const bathroom = lots[14];
    expect(bathroom).toMatchObject({ code: "15", areaM2: 32.33, grossCents: 450000 });
    expect(agreedPrices([bathroom], {})).toMatchObject({ agreedCents: 450000, issue: null });
    expect(
      agreedPrices([bathroom], { [bathroom.id]: { amount: "4.000,00", reason: "" } }).issue,
    ).toBeTruthy();
    expect(
      agreedPrices([bathroom], {
        [bathroom.id]: { amount: "4.000,00", reason: "Condição negociada" },
      }),
    ).toMatchObject({ agreedCents: 400000, issue: null });
  });

  it("blocks P1 without its price while retaining the automobile exception and stock checks", () => {
    const missing = { ...lots[0], pricingState: "no_tariff", grossCents: null };
    expect(saleLotProblem(missing)).toMatch(/aguarda um valor de tabela/);
    expect(saleLotProblem({ ...missing, segmentKey: "automobile" })).toBeNull();
    expect(saleLotProblem({ ...lots[14], status: "reservado" })).toBeTruthy();
    expect(saleLotProblem({ ...lots[14], areaPending: true })).toBeTruthy();
  });

  it("labels fixed prices separately and keeps older per-m² responses compatible", () => {
    expect(commercialPriceLabel(lots[14])).toBe("Preço por espaço");
    expect(commercialUnitPrice(lots[14])).toBe(450000);
    const legacy = { ...lots[0], pricingBasis: undefined, tariffCents: 27000, grossCents: 108000 };
    expect(commercialPriceLabel(legacy)).toBe("Tarifa por m²");
    expect(commercialUnitPrice(legacy)).toBe(27000);
  });
});
