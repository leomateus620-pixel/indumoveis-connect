import { describe, expect, it } from "vitest";
import { dealGuidance, financeSummary, snapshotDiff, splitInstallments } from "./journey";

describe("splitInstallments", () => {
  it("puts the cent remainder on the last installment and sums to the total", () => {
    const p = splitInstallments(100000, 3, "2027-01-31", 1);
    expect(p.map((x) => x.amount_cents)).toEqual([33333, 33333, 33334]);
    expect(p.reduce((a, x) => a + x.amount_cents, 0)).toBe(100000);
  });
  it("clamps due dates to month end", () => {
    expect(splitInstallments(300, 3, "2027-01-31", 1).map((x) => x.due_date)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });
  it("rejects more than 36 installments", () => {
    expect(splitInstallments(100, 37, "2027-01-01", 1)).toEqual([]);
  });
});

describe("financeSummary", () => {
  it("keeps payments of cancelled contracts in received and excludes cancelled installments from forecast", () => {
    const s = financeSummary(
      [
        { status: "assinado", total_cents: 1000 },
        { status: "cancelado", total_cents: 500 },
      ],
      [
        { status: "aberta", amount_cents: 1000, payments: [{ amount_cents: 400 }] },
        { status: "cancelada", amount_cents: 250, payments: [] },
        { status: "aberta", amount_cents: 250, payments: [{ amount_cents: 100 }] },
      ],
    );
    expect(s).toEqual({ contracted: 1000, forecast: 1250, received: 500, open: 750 });
  });
});

describe("snapshotDiff", () => {
  const base = {
    company_id: "c",
    conditions: "",
    total_cents: 10,
    spaces: [{ space_id: "a", price_cents: 10 }],
  };
  it("detects price change", () => {
    expect(
      snapshotDiff(base, {
        ...base,
        total_cents: 20,
        spaces: [{ space_id: "a", price_cents: 20 }],
      }),
    ).toEqual(["Valores dos espaços"]);
  });
  it("is empty when unchanged", () => {
    expect(snapshotDiff(base, base)).toEqual([]);
  });
});

describe("dealGuidance", () => {
  it("asks to register signature when contract issued", () => {
    expect(dealGuidance("reservada", { status: "emitido" }).pend).toContain(
      "Assinatura não registrada",
    );
  });
});
