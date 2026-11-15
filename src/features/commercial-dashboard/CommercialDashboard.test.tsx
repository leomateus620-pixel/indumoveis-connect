import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommercialAggregate, CommercialLot, CommercialOverview } from "@/lib/commercial";
import { CommercialDashboard } from "./CommercialDashboard";

const api = vi.hoisted(() => ({
  useMe: vi.fn(),
  useEdition: vi.fn(),
  useCommercialOverview: vi.fn(),
  useCommercialDetails: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const populated: CommercialAggregate = {
  total: 2,
  sold: 1,
  available: 1,
  reserved: 0,
  blocked: 0,
  negotiating: 0,
  soldPercent: 50,
  knownAreaM2: 4,
  areaKnownCount: 1,
  soldAreaM2: 4,
  soldAreaKnownCount: 1,
  soldAreaPercent: 100,
  grossCents: 108000,
  pricedCount: 1,
  availableGrossCents: null,
  availablePricedCount: 0,
};
const empty: CommercialAggregate = {
  total: 0,
  sold: 0,
  available: 0,
  reserved: 0,
  blocked: 0,
  negotiating: 0,
  soldPercent: null,
  knownAreaM2: null,
  areaKnownCount: 0,
  soldAreaM2: null,
  soldAreaKnownCount: 0,
  soldAreaPercent: null,
};

const lot: CommercialLot = {
  id: "11111111-1111-4111-8111-111111111111",
  segmentKey: "p12",
  code: "1",
  environmentId: null,
  geometryId: null,
  status: "vendido",
  areaM2: 4,
  areaPending: false,
  pricingState: "priced",
  cornerState: null,
  tariffCents: 27000,
  grossCents: 108000,
};

function stub(financial: boolean, admin = true) {
  const overview: CommercialOverview = {
    financial,
    activity: true,
    overall: populated,
    segments: [
      { key: "p3", pavilionNumber: 3, label: "Pavilhão 3", description: "Fornecedores", ...empty },
      { key: "p12", pavilionNumber: 12, label: "Pavilhão 12", description: "Móveis", ...populated },
    ],
  };
  api.useMe.mockReturnValue({
    data: {
      roles: admin ? ["admin"] : ["comercial", "financeiro"],
      perms: { mapa: { read: true }, comercial: { read: true }, financeiro: { read: financial } },
    },
    isSuccess: true,
  });
  api.useEdition.mockReturnValue({ data: { name: "Indumóveis 2027" }, isSuccess: true });
  api.useCommercialOverview.mockReturnValue({ data: overview });
  api.useCommercialDetails.mockReturnValue({
    data: {
      lots: [lot],
      events: [],
      totals: financial
        ? { contractedCents: null, negotiatingCents: null, openCents: null, receivedCents: null }
        : null,
    },
  });
}

describe("commercial dashboard", () => {
  it("shows P1's complete fixed-price potential and documentary lot prices", () => {
    stub(true);
    const p1 = {
      ...populated,
      total: 15,
      sold: 0,
      available: 15,
      pricedCount: 15,
      availablePricedCount: 15,
      grossCents: 13200000,
      availableGrossCents: 13200000,
      knownAreaM2: 1203.62,
      areaKnownCount: 15,
    };
    api.useCommercialOverview.mockReturnValue({
      data: {
        financial: true,
        activity: true,
        overall: p1,
        segments: [
          { ...p1, key: "p1", pavilionNumber: 1, label: "Pavilhão 1", description: "ARQ & DESIGN" },
        ],
      },
    });
    api.useCommercialDetails.mockReturnValue({
      data: {
        events: [],
        totals: null,
        lots: [
          {
            ...lot,
            segmentKey: "p1",
            code: "15",
            areaM2: 32.33,
            pricingBasis: "fixed",
            tariffCents: null,
            grossCents: 450000,
          },
        ],
      },
    });
    render(<CommercialDashboard search={{ segmento: "p1" }} onSearch={vi.fn()} />);
    expect(screen.getAllByText(/132\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("15 lotes com preço de tabela").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Preço por espaço").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\.500,00/).length).toBeGreaterThan(0);
  });
  it("does not show cached dashboard data to a non-admin with both module grants", () => {
    stub(true, false);
    render(<CommercialDashboard search={{}} onSearch={vi.fn()} />);
    expect(screen.queryByText("50%")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Potencial de tabela" })).toBeNull();
    expect(api.useCommercialOverview).toHaveBeenLastCalledWith(false);
  });
  it("shows partial prices and no percentage for a segment without inventory", () => {
    stub(true);
    const onSearch = vi.fn();
    const { rerender } = render(<CommercialDashboard search={{}} onSearch={onSearch} />);
    expect(screen.getByText("Parcial · 1 de 2 lotes com preço de tabela")).toBeVisible();
    expect(screen.getByText("50%", { selector: ".cd-ring-value strong" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Pavilhão 3.*sem inventário/i }));
    expect(onSearch).toHaveBeenCalledWith({ segmento: "p3", lote: undefined });
    rerender(<CommercialDashboard search={{ segmento: "p3" }} onSearch={onSearch} />);
    expect(screen.getByText("—", { selector: ".cd-ring-value strong" })).toBeVisible();
  });

  it("shows status counts and removes price columns without financial access", () => {
    stub(false);
    render(<CommercialDashboard search={{}} onSearch={vi.fn()} />);
    const status = screen.getByRole("list", { name: "Filtrar lotes por situação comercial" });
    expect(within(status).getByRole("button", { name: "Vendidos 1" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Potencial de tabela" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Movimentação comercial" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Área confirmada" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Preço de referência" })).toBeNull();
    expect(screen.queryByText(/1\.080,00/)).toBeNull();
  });
});
