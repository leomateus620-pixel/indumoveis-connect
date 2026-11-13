import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PavilionInteriorPage } from "./PavilionInteriorPage";
import { PAVILION_13_PLAN } from "./pavilion13";
import { PAVILION_1_PLAN } from "./data";
import { saveParkReturn } from "./parkReturn";

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  canMap: true,
  canCommercial: false,
  isAdmin: false,
  plan: { isError: false, isPending: false, data: undefined as unknown, refetch: vi.fn() },
  usePlan: vi.fn(),
  useCommercial: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("@/lib/api", () => ({
  useCan: (module: string) => ({ read: module === "mapa" ? state.canMap : state.canCommercial }),
  useIsAdmin: () => state.isAdmin,
  useMe: () => ({ isError: false, isPending: false }),
  useEdition: () => ({ isError: false, isPending: false, data: { id: "current-edition" } }),
  usePavilionInteriorPlan: (...args: unknown[]) => {
    state.usePlan(...args);
    return state.plan;
  },
  usePavilionInteriorCommercial: (...args: unknown[]) => {
    state.useCommercial(...args);
    return {
      isSuccess: true,
      isError: false,
      data: { "35": { status: "reservado", exhibitor: "Empresa permitida" } },
      refetch: vi.fn(),
    };
  },
  useCommercialLots: () => ({ isError: false, data: [] }),
}));
vi.mock("@/components/app/ui", () => ({ Restricted: () => <p>Acesso restrito</p> }));
vi.mock("./PavilionInterior", () => ({
  PavilionInterior: ({
    commercial,
    selectedCode,
    onBack,
  }: {
    commercial?: unknown;
    selectedCode?: string;
    onBack: () => void;
  }) => (
    <div
      data-testid="inspection"
      data-commercial={JSON.stringify(commercial ?? {})}
      data-selected={selectedCode ?? ""}
    >
      <button onClick={onBack}>Voltar ao parque</button>
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  state.canMap = true;
  state.canCommercial = false;
  state.isAdmin = false;
  state.plan.isError = false;
  state.plan.isPending = false;
  state.plan.data = {
    ...PAVILION_13_PLAN,
    editionId: "current-edition",
    databasePlanId: "plan-13",
    revisionId: "revision-13",
  };
});
afterEach(cleanup);

describe("P13 authenticated inspection boundary", () => {
  it("keeps cached commercial fields out of a map-only inspection and disables that lookup", () => {
    render(<PavilionInteriorPage pavilionNumber={13} selectedCode="35" onSelect={() => {}} />);
    expect(state.usePlan).toHaveBeenCalledWith(true, 13);
    expect(state.useCommercial).toHaveBeenCalledWith(
      "plan-13",
      PAVILION_13_PLAN.revision,
      false,
      13,
    );
    expect(screen.getByTestId("inspection")).toHaveAttribute("data-commercial", "{}");
    expect(screen.getByTestId("inspection")).toHaveAttribute("data-selected", "35");
    expect(screen.queryByText("Empresa permitida")).not.toBeInTheDocument();
  });

  it("passes the exhibitor response to an administrator", () => {
    state.canCommercial = true;
    state.isAdmin = true;
    render(<PavilionInteriorPage pavilionNumber={13} selectedCode="35" onSelect={() => {}} />);
    expect(state.useCommercial).toHaveBeenCalledWith(
      "plan-13",
      PAVILION_13_PLAN.revision,
      true,
      13,
    );
    const data = JSON.parse(screen.getByTestId("inspection").getAttribute("data-commercial")!);
    expect(data).toEqual({ "35": { status: "reservado", exhibitor: "Empresa permitida" } });
  });

  it("does not request or render exhibitor details for a non-admin with Comercial access", () => {
    state.canCommercial = true;
    render(<PavilionInteriorPage pavilionNumber={13} selectedCode="35" onSelect={() => {}} />);
    expect(state.useCommercial).toHaveBeenCalledWith(
      "plan-13",
      PAVILION_13_PLAN.revision,
      false,
      13,
    );
    expect(screen.getByTestId("inspection")).toHaveAttribute("data-commercial", "{}");
  });

  it("rejects a mismatched P1 payload instead of opening the wrong interior", () => {
    state.plan.data = { ...PAVILION_1_PLAN, editionId: "current-edition" };
    render(<PavilionInteriorPage pavilionNumber={13} selectedCode="01" onSelect={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a planta.");
    expect(screen.queryByTestId("inspection")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(state.plan.refetch).toHaveBeenCalledOnce();
  });

  it("does not render an inspection without the map permission", () => {
    state.canMap = false;
    render(<PavilionInteriorPage pavilionNumber={13} onSelect={() => {}} />);
    expect(screen.getByText("Acesso restrito")).toBeInTheDocument();
    expect(screen.queryByTestId("inspection")).not.toBeInTheDocument();
    expect(state.usePlan).toHaveBeenCalledWith(false, 13);
    expect(state.useCommercial).toHaveBeenCalledWith(
      "plan-13",
      PAVILION_13_PLAN.revision,
      false,
      13,
    );
  });

  it("does not reuse the Mostra's context for a direct P13 entry and returns to P13", () => {
    saveParkReturn({
      editionId: "current-edition",
      selectionId: "indumoveis:pavilion:1",
      view: "top",
      orientationFree: false,
      search: { space: "p1-only-space" },
    });
    render(<PavilionInteriorPage pavilionNumber={13} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao parque" }));
    expect(state.navigate).toHaveBeenCalledWith({ to: "/mapa", search: { pavilhao: "13" } });
  });
});
