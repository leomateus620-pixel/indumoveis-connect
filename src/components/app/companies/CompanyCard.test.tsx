import { useState, type AnchorHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyCard } from "./CompanyCard";

const mock = vi.hoisted(() => ({ details: vi.fn() }));
vi.mock("@/lib/api", () => ({ useCompanyParticipation: mock.details, signedUrl: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    params: { id: string };
    search: { edition: string };
    to?: string;
  }) => (
    <a href={`/empresas/${params.id}?edition=${search.edition}`} {...props}>
      {children}
    </a>
  ),
}));
const company = {
  id: "company-1",
  company_id: "company-1",
  participation_id: "participation-1",
  edition_id: "edition-2025",
  trade_name: "Empresa com nome fantasia extenso",
  legal_name: "Razão Social Ltda.",
  area_labels: ["Pavilhão 01", "Área Externa Especial"],
  occupation_count: 2,
  total_area: 72.5,
  module_count: 3,
};
const detail = {
  company: { ...company, tax_id: "12345678000199", phone: "11999999999" },
  participation: {
    snapshot_locked: true,
    registration_snapshot: {
      tax_id: "12345678000199",
      phone: null,
      email: null,
      legal_name: company.legal_name,
      trade_name: company.trade_name,
    },
  },
  contacts: [],
  occupations: [
    { id: "o1", area_label: "Pavilhão 01", module_codes: ["001", "002"], area_total: 36.5 },
    { id: "o2", area_label: "Área Externa Especial", module_codes: ["E01"], area_total: 36 },
  ],
};
function Harness({ canWrite = true }: { canWrite?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <CompanyCard
      company={company}
      editionId="edition-2025"
      expanded={expanded}
      onExpandedChange={setExpanded}
      search={{ edition: "edition-2025" }}
      canWrite={canWrite}
      onEdit={vi.fn()}
    />
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("company card", () => {
  it("keeps only names and areas on the collapsed face, requests details on demand and exposes an accessible expansion", () => {
    mock.details.mockReturnValue({ data: detail, isLoading: false, isError: false });
    render(<Harness />);
    expect(screen.getByText(company.trade_name)).toBeVisible();
    expect(screen.queryByText("12345678000199")).not.toBeInTheDocument();
    expect(screen.queryByText("001")).not.toBeInTheDocument();
    expect(mock.details).toHaveBeenLastCalledWith("company-1", "edition-2025", false);
    const trigger = screen.getByRole("button", { name: `Expandir dados de ${company.trade_name}` });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(mock.details).toHaveBeenLastCalledWith("company-1", "edition-2025", true);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("12345678000199")).toBeVisible();
    expect(screen.getByText("001")).toBeVisible();
    expect(screen.queryByText("11999999999")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ficha completa/ })).toHaveAttribute(
      "href",
      "/empresas/company-1?edition=edition-2025",
    );
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("12345678000199")).not.toBeInTheDocument();
  });

  it("keeps edit actions absent for a read-only profile", () => {
    mock.details.mockReturnValue({ data: detail, isLoading: false, isError: false });
    render(<Harness canWrite={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Expandir dados/ }));
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });
});
