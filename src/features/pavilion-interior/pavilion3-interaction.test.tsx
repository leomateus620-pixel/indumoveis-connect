import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Pavilion3Experience } from "./Pavilion3Experience";
import { PAVILION_3_PLAN } from "./pavilion3";
import type { CommercialLot } from "@/lib/commercial";

vi.mock("./Pavilion3Scene", () => ({
  default: ({ onUnavailable }: { onUnavailable: () => void }) => (
    <button onClick={onUnavailable}>Simular perda do 3D</button>
  ),
}));

const lots = new Map(
  PAVILION_3_PLAN.environments.map((e) => [
    e.id,
    {
      id: `stock-${e.code}`,
      code: e.code,
      environmentId: e.id,
      geometryId: null,
      segmentKey: "p3",
      areaM2: 5,
      areaPending: false,
      status: "disponivel",
      pricingState: "priced",
      pricingBasis: "per_m2",
      cornerState: null,
      tariffCents: 26500,
      grossCents: 132500,
    } satisfies CommercialLot,
  ]),
);
function Harness() {
  const [code, select] = useState<string>();
  return (
    <Pavilion3Experience
      plan={PAVILION_3_PLAN}
      selectedCode={code}
      onSelect={select}
      onBack={() => {}}
      lotsByEnvironment={lots}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1140,
    height: 740,
  } as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("P3 individual navigation and commercial detail", () => {
  it("finds lot 142, exposes its individual area and tariff, and rejects grouped or out-of-range input", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Planta" }));
    const input = screen.getByRole("searchbox", { name: "Buscar lote" });
    for (const value of ["143", "1–4"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Localizar lote" }));
      expect(screen.getByRole("alert")).toHaveTextContent("1 a 142");
    }
    fireEvent.change(input, { target: { value: "142" } });
    fireEvent.click(screen.getByRole("button", { name: "Localizar lote" }));
    expect(screen.getByRole("heading", { name: "Lote 142" })).toHaveFocus();
    const panel = screen.getByRole("complementary", { name: "Informações do lote" });
    expect(panel).toHaveTextContent("5,00 m²");
    expect(panel).toHaveTextContent("265,00");
    expect(panel).toHaveTextContent("1.325,00");
    const drawing = container.querySelector(".p3-plan-view > g")!;
    const before = drawing.getAttribute("transform");
    fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
    expect(drawing.getAttribute("transform")).not.toBe(before);
    expect(screen.getByRole("button", { name: "Lote 142" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("offers 142 separate hit targets, a single tab stop and vertical keyboard movement", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Planta" }));
    const plan = within(screen.getByRole("group", { name: "Planta interativa do Pavilhão 3" }));
    const buttons = plan.getAllByRole("button");
    expect(buttons).toHaveLength(142);
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    const first = plan.getByRole("button", { name: "Lote 1" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    const second = plan.getByRole("button", { name: "Lote 2" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Enter" });
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(plan.getByRole("link", { name: "Acesso ao Pavilhão 13" })).toHaveAttribute(
      "href",
      "/mapa/pavilhoes/13/interior",
    );
    fireEvent.keyDown(second, { key: "Escape" });
    expect(second).toHaveAttribute("aria-pressed", "false");
  });
});

describe("P3 immersive explorer", () => {
  it("opens mobile navigation on demand and keeps the sectors open when returning from a lot", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<Harness />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Explorar lotes" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar lote" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Localizar lote" }));
    expect(screen.getByRole("heading", { name: "Lote 1" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Todos os setores" }));
    expect(screen.getByRole("navigation", { name: "Lotes por setor" })).toBeVisible();
  });

  it("defaults to perspective, exposes individual lots by sector, and advances without merging them", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Perspectiva" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /C Ilha central/ }));
    const directory = within(screen.getByRole("navigation", { name: "Lotes por setor" }));
    expect(directory.getAllByRole("button", { name: /^Localizar lote/ })).toHaveLength(33);
    fireEvent.click(directory.getByRole("button", { name: "Localizar lote 104" }));
    expect(screen.getByRole("heading", { name: "Lote 104" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Próximo lote" }));
    expect(screen.getByRole("heading", { name: "Lote 105" })).toHaveTextContent("105");
    expect(screen.getByRole("complementary")).toHaveTextContent("5,00 m²");
    fireEvent.click(screen.getByRole("button", { name: "Todos os setores" }));
    expect(screen.getByRole("navigation", { name: "Lotes por setor" })).toBeVisible();
  });

  it("falls back to the complete interactive plan after WebGL/context loss", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Simular perda do 3D" }));
    expect(screen.getByRole("button", { name: "Perspectiva" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Planta" })).toHaveAttribute("aria-pressed", "true");
    expect(
      within(screen.getByRole("group", { name: "Planta interativa do Pavilhão 3" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(142);
    expect(screen.getByRole("status")).toHaveTextContent("3D indisponível");
  });

  it("keeps unknown commercial data unknown and offers a retry", () => {
    const retry = vi.fn();
    render(
      <Pavilion3Experience
        plan={PAVILION_3_PLAN}
        selectedCode="1"
        onSelect={() => {}}
        onBack={() => {}}
        commercialError
        onRetryCommercial={retry}
      />,
    );
    const panel = screen.getByRole("complementary");
    expect(panel).toHaveTextContent("5,00 m²");
    expect(panel).not.toHaveTextContent("Disponível");
    expect(panel).not.toHaveTextContent("1.325");
    expect(screen.getByRole("button", { name: "Lote anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
