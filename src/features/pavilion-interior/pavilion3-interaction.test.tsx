import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PavilionInterior } from "./PavilionInterior";
import { PAVILION_3_PLAN } from "./pavilion3";
import { PAVILION_PRESENTATIONS } from "./presentation";
import type { CommercialLot } from "@/lib/commercial";

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
    <PavilionInterior
      plan={PAVILION_3_PLAN}
      presentation={PAVILION_PRESENTATIONS[3]}
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
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
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
    const drawing = container.querySelector(".arq-plan > g")!;
    const before = drawing.getAttribute("transform");
    fireEvent.click(screen.getByRole("button", { name: "Localizar na planta" }));
    expect(drawing.getAttribute("transform")).not.toBe(before);
    expect(screen.getByRole("button", { name: "Lote 142" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("offers 142 separate hit targets, a single tab stop and vertical keyboard movement", () => {
    render(<Harness />);
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
