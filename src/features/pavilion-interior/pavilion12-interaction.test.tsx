import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PavilionInterior } from "./PavilionInterior";
import { PAVILION_12_PLAN } from "./pavilion12";
import { PAVILION_PRESENTATIONS } from "./presentation";

function Harness({ initial }: { initial?: string }) {
  const [code, select] = useState(initial);
  return (
    <PavilionInterior
      plan={PAVILION_12_PLAN}
      presentation={PAVILION_PRESENTATIONS[12]}
      selectedCode={code}
      onSelect={select}
      onBack={() => {}}
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
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, options: PointerEventInit = {}) {
        super(type, options);
        this.pointerId = options.pointerId ?? 1;
        this.pointerType = options.pointerType ?? "touch";
      }
    },
  );
  Object.defineProperties(SVGElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
  });
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

describe("Pavilhão 12 lot inspection", () => {
  it("finds an individual lot and zooms to it only on explicit request", () => {
    const { container } = render(<Harness />);
    const drawing = container.querySelector(".arq-plan > g")!;
    const initial = drawing.getAttribute("transform");
    const panel = screen.getByRole("complementary", { name: "Informações do lote" });
    const search = within(panel).getByRole("searchbox", { name: "Buscar lote" });
    fireEvent.change(search, { target: { value: "255" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Localizar lote" }));
    expect(within(panel).getByRole("alert")).toHaveTextContent("Informe um número de 1 a 254.");
    fireEvent.change(search, { target: { value: "172" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Localizar lote" }));
    expect(within(panel).getByRole("heading", { name: "Lote 172" })).toHaveFocus();
    expect(within(panel).getByText(/Ilha central superior/)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/m²|metragem|disponível/i);
    expect(screen.getByText("1.650 m²")).toBeInTheDocument();
    const lot = screen.getByRole("button", { name: "Lote 172" });
    expect(lot).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".arq-p12-selection path")).toHaveAttribute(
      "d",
      lot.getAttribute("d"),
    );
    expect(drawing.getAttribute("transform")).toBe(initial);
    fireEvent.click(within(panel).getByRole("button", { name: "Localizar na planta" }));
    expect(drawing.getAttribute("transform")).not.toBe(initial);
    expect(lot).toHaveAttribute("aria-pressed", "true");
  });

  it("offers every lot through one keyboard stop and follows the physical row directions", () => {
    render(<Harness initial="172" />);
    const plan = within(screen.getByRole("group", { name: "Planta interativa do Pavilhão 12" }));
    const lots = plan.getAllByRole("button");
    expect(lots).toHaveLength(254);
    expect(lots.filter((lot) => lot.getAttribute("tabindex") === "0")).toHaveLength(1);
    const lot172 = plan.getByRole("button", { name: "Lote 172" });
    expect(lot172).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(lot172, { key: "ArrowRight" });
    const lot173 = plan.getByRole("button", { name: "Lote 173" });
    expect(lot173).toHaveFocus();
    fireEvent.keyDown(lot173, { key: "ArrowDown" });
    const lot152 = plan.getByRole("button", { name: "Lote 152" });
    expect(lot152).toHaveFocus();
    fireEvent.keyDown(lot152, { key: "Enter" });
    expect(lot152).toHaveAttribute("aria-pressed", "true");
    expect(lot172).toHaveAttribute("aria-pressed", "false");
  });

  it("zooms the drawing with a two-finger gesture and selects only on a subsequent tap", () => {
    const { container } = render(<Harness initial="172" />);
    const drawing = container.querySelector(".arq-plan > g")!;
    const lot172 = screen.getByRole("button", { name: "Lote 172" });
    const lot173 = screen.getByRole("button", { name: "Lote 173" });
    const initial = drawing.getAttribute("transform");
    const first = { pointerId: 1, clientX: 400, clientY: 300 };
    const second = { pointerId: 2, clientX: 500, clientY: 300 };
    fireEvent.pointerDown(lot173, first);
    fireEvent.pointerDown(lot172, second);
    fireEvent.pointerMove(lot172, { ...second, clientX: 550 });
    fireEvent.pointerUp(lot172, second);
    fireEvent.pointerUp(lot173, first);
    expect(drawing.getAttribute("transform")).not.toBe(initial);
    expect(lot172).toHaveAttribute("aria-pressed", "true");
    expect(lot173).toHaveAttribute("aria-pressed", "false");

    fireEvent.pointerDown(lot173, first);
    fireEvent.pointerUp(lot173, first);
    expect(lot173).toHaveAttribute("aria-pressed", "true");
  });
});
