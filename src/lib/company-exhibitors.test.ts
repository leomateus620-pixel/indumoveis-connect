import { describe, expect, it } from "vitest";
import {
  companyAddress,
  matchesCompanySearch,
  occupationTotals,
  participationIdentity,
  validateCompanySearch,
} from "./company-exhibitors";

describe("edition-specific company presentation", () => {
  it("keeps missing historical contacts and addresses missing after current registration changes", () => {
    const company = {
      legal_name: "Cadastro atual 2027",
      phone: "999999999",
      email: "new@example.com",
      street: "Rua Nova",
    };
    const registration_snapshot = {
      legal_name: "Empresa em 2025",
      phone: null,
      email: null,
      street: null,
    };
    expect(
      participationIdentity({
        company,
        participation: { snapshot_locked: true, registration_snapshot },
      }),
    ).toEqual(registration_snapshot);
    expect(
      companyAddress(
        participationIdentity({
          company,
          participation: { snapshot_locked: true, registration_snapshot },
        }),
      ),
    ).toBe("");
    expect(
      participationIdentity({
        company,
        participation: { snapshot_locked: false, registration_snapshot },
      }),
    ).toEqual(company);
  });

  it("counts identifiers by occurrence and sums the informed row areas without multiplying", () => {
    expect(
      occupationTotals([
        { area_label: "Pavilhão 01", module_codes: ["001", "002", "001"], area_total: "36.67" },
        { area_label: "Área Externa", module_codes: ["001"], area_total: "18.30" },
        { area_label: "Suprimentos", module_codes: [], area_total: 0 },
      ]),
    ).toEqual({ modules: 4, area: 54.97 });
  });

  it("sums four-decimal areas before display rounding and distinguishes unknown from zero", () => {
    expect(
      occupationTotals([
        { area_label: "A", module_codes: ["1"], area_total: "0.004" },
        { area_label: "B", module_codes: ["2"], area_total: "0.004" },
      ]),
    ).toEqual({ modules: 2, area: 0.008 });
    expect(occupationTotals([{ area_label: "A", module_codes: ["1"], area_total: null }])).toEqual({
      modules: 1,
      area: null,
    });
    expect(occupationTotals([])).toEqual({ modules: 0, area: 0 });
  });

  it("searches masked documents but does not treat digits inside a company name as a document search", () => {
    const company = { trade_name: "Móveis Silva", tax_id: "12345678000199" };
    expect(matchesCompanySearch(company, "12.345.678/0001-99")).toBe(true);
    expect(matchesCompanySearch(company, "moveis")).toBe(true);
    expect(matchesCompanySearch(company, "Empresa 1")).toBe(false);
  });

  it("preserves edition, filters and expansion through detail navigation, and rejects arbitrary identifiers", () => {
    const edition = "49af7d79-9bef-4981-9ecd-ddf64928036e";
    const id = "12345678-1234-4234-8234-123456789012";
    expect(
      validateCompanySearch({
        edition,
        q: "Móveis",
        area: "Mostra Arq&Design",
        expanded: `${id},invalid`,
      }),
    ).toEqual({ edition, q: "Móveis", area: "Mostra Arq&Design", expanded: id });
    expect(validateCompanySearch({ edition: "2025", q: 17 })).toEqual({
      edition: undefined,
      q: undefined,
      expanded: undefined,
      area: undefined,
    });
  });
});
