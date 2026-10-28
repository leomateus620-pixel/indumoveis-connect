import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReuseCompanyDialog } from "./ReuseCompanyDialog";
import type { Edition, CompanyEditionSummary } from "@/lib/api";
import type { ComponentProps } from "react";
import type { CompanyDialog } from "../CompanyDialog";

const queries = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), candidates: vi.fn() }));
vi.mock("@/lib/api", () => ({
  useEditionCompanies: queries.list,
  useCompanyCandidates: queries.candidates,
  useCompanyParticipation: queries.detail,
  signedUrl: vi.fn(),
}));
vi.mock("../CompanyDialog", () => ({
  CompanyDialog: (props: ComponentProps<typeof CompanyDialog>) => (
    <div data-testid="review-company">
      {props.company.id} · destino {props.edition.year} · origem {props.previousEditionName} ·{" "}
      {props.previousOccupations?.[0]?.area_label}
    </div>
  ),
}));
const editions = [
  { id: "2027", year: 2027, is_historical: false, is_active: true },
  { id: "2025", year: 2025, is_historical: true },
  { id: "2023", year: 2023, is_historical: true },
] as Edition[];
const companyRow = (edition: string): CompanyEditionSummary => ({
  id: `company-${edition}`,
  company_id: `company-${edition}`,
  edition_id: edition,
  participation_id: `participation-${edition}`,
  trade_name: `Empresa ${edition}`,
  legal_name: `Empresa ${edition} Ltda`,
  tax_id: "12345678000199",
  area_labels: [],
  occupation_count: 1,
  total_area: 36,
  module_count: 1,
});
beforeEach(() => {
  queries.candidates.mockReturnValue({
    data: [companyRow("global")],
    isLoading: false,
    isError: false,
  });
  queries.list.mockImplementation((edition: string) => ({
    data: [companyRow(edition)],
    isLoading: false,
    isError: false,
  }));
  queries.detail.mockImplementation((companyId: string, edition: string, enabled: boolean) => ({
    data: enabled
      ? {
          company: { id: companyId },
          contacts: [],
          occupations: [{ area_label: `Área ${edition}` }],
        }
      : undefined,
    isLoading: false,
    isError: false,
  }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("reuse company source and target", () => {
  it("loads the chosen source while passing the target edition to the review form", () => {
    render(
      <ReuseCompanyDialog
        open
        onOpenChange={vi.fn()}
        edition={editions[0]}
        editions={editions}
        participants={[]}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("2025");
    expect(queries.candidates).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2023" } });
    fireEvent.click(screen.getByRole("button", { name: /Empresa 2023/ }));
    expect(queries.detail).toHaveBeenLastCalledWith("company-2023", "2023", true);
    expect(screen.getByTestId("review-company")).toHaveTextContent(
      "company-2023 · destino 2027 · origem 2023 · Área 2023",
    );
  });
  it("opens an existing target participation directly instead of presenting a duplicate creation", () => {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ReuseCompanyDialog
        open
        onOpenChange={onOpenChange}
        edition={editions[0]}
        editions={editions}
        participants={[{ ...companyRow("2025"), edition_id: "2027" }]}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Empresa 2025/ }));
    expect(onSaved).toHaveBeenCalledWith("company-2025");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId("review-company")).not.toBeInTheDocument();
  });
  it("loads global candidates only on demand and reviews them against the target edition without copying occupations", () => {
    render(
      <ReuseCompanyDialog
        open
        onOpenChange={vi.fn()}
        edition={editions[0]}
        editions={editions}
        participants={[]}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "global" } });
    expect(queries.candidates).toHaveBeenLastCalledWith(true);
    expect(queries.list).toHaveBeenLastCalledWith(undefined, false);
    fireEvent.click(screen.getByRole("button", { name: /Empresa global/ }));
    expect(queries.detail).toHaveBeenLastCalledWith("company-global", "2027", true);
    expect(screen.getByTestId("review-company")).toHaveTextContent("company-global · destino 2027");
    expect(screen.getByTestId("review-company")).not.toHaveTextContent("Área 2027");
  });

  it("opens a global company already participating in the target even when the summary was stale", () => {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    queries.detail.mockImplementation((companyId: string, _edition: string, enabled: boolean) => ({
      data: enabled
        ? {
            company: { id: companyId },
            participation: { id: "existing-target" },
            contacts: [],
            occupations: [],
          }
        : undefined,
      isLoading: false,
      isError: false,
    }));
    render(
      <ReuseCompanyDialog
        open
        onOpenChange={onOpenChange}
        edition={editions[0]}
        editions={editions}
        participants={[]}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "global" } });
    fireEvent.click(screen.getByRole("button", { name: /Empresa global/ }));
    expect(onSaved).toHaveBeenCalledWith("company-global");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId("review-company")).not.toBeInTheDocument();
  });

  it("keeps the global register available when only the target edition exists", () => {
    render(
      <ReuseCompanyDialog
        open
        onOpenChange={vi.fn()}
        edition={editions[0]}
        editions={[editions[0]]}
        participants={[]}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("global");
    expect(screen.getByRole("option", { name: "Cadastro geral" })).toBeVisible();
    expect(queries.candidates).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: /Empresa global/ })).toBeVisible();
  });
});
