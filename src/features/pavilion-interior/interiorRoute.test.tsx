import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Route } from "@/routes/_authenticated/mapa.pavilhoes.1.interior";

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  me: { isError: false, isPending: false, refetch: vi.fn() },
  edition: {
    isError: false,
    isPending: false,
    data: { id: "current-edition" } as { id: string } | undefined,
    refetch: vi.fn(),
  },
  plan: { isError: false, isPending: true, data: undefined, refetch: vi.fn() },
  commercial: { isSuccess: false, isError: false, data: undefined, refetch: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    fullPath: "/mapa/pavilhoes/1/interior",
    useSearch: () => ({}),
  }),
  useNavigate: () => state.navigate,
}));
vi.mock("@/lib/api", () => ({
  useCan: () => ({ read: true }),
  useMe: () => state.me,
  useEdition: () => state.edition,
  usePavilionInteriorPlan: () => state.plan,
  usePavilionInteriorCommercial: () => state.commercial,
  useCommercialLots: () => ({ isError: false, data: [] }),
}));
vi.mock("@/components/app/ui", () => ({ Restricted: () => <p>Acesso restrito</p> }));
vi.mock("./PavilionInterior", () => ({ PavilionInterior: () => <div>Planta</div> }));
const InteriorPage = Route.options.component as ComponentType;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state.me, { isError: false, isPending: false });
  Object.assign(state.edition, {
    isError: false,
    isPending: false,
    data: { id: "current-edition" },
  });
  Object.assign(state.plan, { isError: false, isPending: true, data: undefined });
});
afterEach(cleanup);

describe("interior route loading failures", () => {
  it.each(["profile error", "edition error", "missing active edition"])(
    "offers recovery instead of an endless plan spinner after %s",
    (failure) => {
      if (failure === "profile error") state.me.isError = true;
      else if (failure === "edition error") state.edition.isError = true;
      else state.edition.data = undefined;
      // The dependent plan query remains pending because its prerequisite failed.
      render(<InteriorPage />);
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a Mostra.");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      expect(state.me.refetch).toHaveBeenCalledOnce();
      expect(state.edition.refetch).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Voltar ao parque" }));
      expect(state.navigate).toHaveBeenCalledWith({ to: "/mapa", search: { pavilhao: "1" } });
    },
  );

  it("retries a failed plan query after edition and profile loaded successfully", () => {
    state.plan.isPending = false;
    state.plan.isError = true;
    render(<InteriorPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a planta.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(state.plan.refetch).toHaveBeenCalledOnce();
    expect(state.me.refetch).not.toHaveBeenCalled();
    expect(state.edition.refetch).not.toHaveBeenCalled();
  });
});
