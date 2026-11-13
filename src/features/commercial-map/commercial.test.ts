import { describe, expect, it } from "vitest";
import type { CommercialLot } from "@/lib/commercial";
import { resolvePersistedMapLots } from "./commercial";

const exteriorId = (code: string) => `indumoveis:external:lot:${code}`;
const lot = (code: string, overrides: Partial<CommercialLot> = {}): CommercialLot => ({
  id: `uuid-${code}`,
  code,
  segmentKey: "external",
  environmentId: null,
  geometryId: exteriorId(code),
  areaM2: 227,
  areaPending: false,
  status: "disponivel",
  pricingState: "priced",
  cornerState: "regular",
  ...overrides,
});
const geometryIds = ["09", "10", "36", "37", "49"].map(exteriorId);
const lots = [
  lot("09", { status: "reservado" }),
  lot("10", { status: "em_negociacao" }),
  lot("36", { status: "vendido" }),
  lot("37"),
  lot("49", { segmentKey: "automobile", pricingState: "no_tariff" }),
];

describe("persisted external lot links", () => {
  it("selects each lot by its persisted UUID and highlights only the requested status", () => {
    const result = resolvePersistedMapLots("edition-a", lots, geometryIds, {
      space: "uuid-37",
      status: "vendido",
    });
    expect(result.selectedGeometryId).toBe(exteriorId("37"));
    expect(result.filteredGeometryIds).toEqual([exteriorId("36")]);
    expect(result.statuses[exteriorId("09")]).toBe("reservado");
    expect(result.statuses[exteriorId("10")]).toBe("em_negociacao");
    expect(result.lotsByGeometry.get(exteriorId("49"))?.pricingState).toBe("no_tariff");
    expect(result.warning).toBeUndefined();
  });

  it("rejects reused numbers, retired geometry, and conflicting UUIDs", () => {
    const result = resolvePersistedMapLots(
      "edition-a",
      [
        ...lots,
        lot("09", { id: "uuid-interior", segmentKey: "p8" }),
        lot("69"),
        lot("10", { id: "duplicate-link" }),
      ],
      geometryIds,
      { space: "09" },
    );
    expect(result.selectedGeometryId).toBeUndefined();
    expect(result.warning).toContain("associação territorial");
    expect(result.statuses[exteriorId("09")]).toBe("reservado");
    expect(result.statuses[exteriorId("10")]).toBeUndefined();
    expect(result.statuses[exteriorId("69")]).toBeUndefined();
  });

  it("never resolves deals from a different edition", () => {
    const search = { deal: "deal-a" };
    const deal = {
      id: "deal-a",
      edition_id: "edition-b",
      deal_spaces: [{ space_id: "uuid-09" }, { space_id: "uuid-10" }],
    };
    expect(
      resolvePersistedMapLots("edition-a", lots, geometryIds, search, deal).highlightedGeometryIds,
    ).toEqual([]);
    expect(
      resolvePersistedMapLots("edition-b", lots, geometryIds, search, deal).highlightedGeometryIds,
    ).toEqual([exteriorId("09"), exteriorId("10")]);
  });
});
