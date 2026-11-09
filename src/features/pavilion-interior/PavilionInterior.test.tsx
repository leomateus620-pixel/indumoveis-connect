import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PavilionInterior } from "./PavilionInterior";
import { PAVILION_1_PLAN } from "./data";

type Props = ComponentProps<typeof PavilionInterior>;
const onSelect = vi.fn(),
  onBack = vi.fn();
let mobile = false;
const rect = (width: number, height: number, left = 0, top = 0): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  toJSON: () => ({}),
});
function Harness({ initial, commercial }: { initial?: string; commercial?: Props["commercial"] }) {
  const [selected, setSelected] = useState(initial);
  return (
    <PavilionInterior
      plan={PAVILION_1_PLAN}
      selectedCode={selected}
      commercial={commercial}
      onBack={onBack}
      onSelect={(code) => {
        onSelect(code);
        setSelected(code);
      }}
    />
  );
}
function getDrawing(container: HTMLElement) {
  return container.querySelector("svg.arq-plan > g")!;
}
function readCamera(container: HTMLElement) {
  const transform = getDrawing(container).getAttribute("transform")!;
  const match = /translate\(([-\d.e+]+) ([-\d.e+]+)\) scale\(([-\d.e+]+)\)/.exec(transform)!;
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}
function path(container: HTMLElement, code: string, part = "interior") {
  return container.querySelector(`[data-environment="${code}"] [data-part="${part}"]`)!;
}
beforeEach(() => {
  vi.clearAllMocks();
  mobile = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, options: PointerEventInit = {}) {
        super(type, options);
        this.pointerId = options.pointerId ?? 1;
        this.pointerType = options.pointerType ?? "mouse";
      }
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("arq-sidebar")) return rect(mobile ? 226 : 272, 650);
    if (mobile && this.classList.contains("arq-view-controls")) return rect(54, 142, 322, 486);
    return rect(mobile ? 390 : 1100, 650);
  });
  Object.defineProperties(SVGElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Mostra pavilion interaction", () => {
  it("shows the gallery signature while keeping the full title and return action accessible", () => {
    const { container } = render(<Harness />);
    const header = within(container.querySelector(".arq-header")!);
    expect(header.getByRole("heading", { level: 1, name: "Mostra ARQ & Design" })).toHaveClass(
      "arq-sr-only",
    );
    expect(header.getByRole("img", { name: "ARQ & Design Indumóveis" })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "Voltar ao parque" })).toHaveAccessibleDescription(
      /Visualização externa/,
    );
  });

  it("shows fifteen numbered choices and a single contextual left panel", () => {
    const { container } = render(<Harness />);
    const panel = screen.getByRole("complementary", { name: "Informações do ambiente" });
    expect(within(panel).getByText("espaços comerciais")).toBeInTheDocument();
    expect(within(panel).getByText("14", { selector: "strong" })).toBeInTheDocument();
    const choices = within(panel).getByRole("navigation", { name: "Selecionar ambiente" });
    expect(
      within(choices)
        .getAllByRole("button")
        .filter((button) => /^\d{2}$/.test(button.textContent ?? "")),
    ).toHaveLength(15);
    expect(container.querySelectorAll(".arq-environment.is-commercial")).toHaveLength(14);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
  });

  it("selects either part of space09 as one identity and highlights both with one panel", () => {
    const { container } = render(<Harness />);
    fireEvent.click(path(container, "09", "external"));
    expect(onSelect).toHaveBeenLastCalledWith("09");
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByRole("heading", { level: 2, name: "Espaço 09" })).toBeInTheDocument();
    expect(within(panel).getByText("74,81 m²")).toBeInTheDocument();
    expect(within(panel).getByText("Área externa vinculada")).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-environment="09"] [aria-pressed="true"]'),
    ).toHaveLength(2);
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
    fireEvent.click(path(container, "12"));
    expect(within(panel).getByRole("heading", { level: 2, name: "Espaço 12" })).toBeInTheDocument();
    expect(within(panel).getByText("129,43 m²")).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-environment="09"] [aria-pressed="true"]'),
    ).toHaveLength(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows commercial information only when supplied for a commercial environment", () => {
    const { container } = render(
      <Harness
        commercial={{
          "02": { status: "disponivel", exhibitor: "Expositor real" },
          "15": { status: "disponivel", exhibitor: "Must not display" },
          salon: { status: "disponivel", exhibitor: "Must not display" },
        }}
      />,
    );
    fireEvent.click(path(container, "03"));
    const panel = screen.getByRole("complementary");
    expect(within(panel).queryByText("Situação comercial")).not.toBeInTheDocument();
    fireEvent.click(path(container, "02"));
    expect(within(panel).getByText("Expositor real")).toBeInTheDocument();
    expect(within(panel).getByText("Situação comercial")).toBeInTheDocument();
    fireEvent.click(path(container, "15"));
    expect(within(panel).getByRole("heading", { level: 2, name: "Banheiros" })).toBeInTheDocument();
    expect(within(panel).getByText("32,33 m²")).toBeInTheDocument();
    expect(within(panel).queryByText("Situação comercial")).not.toBeInTheDocument();
    expect(screen.queryByText("Must not display")).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Salão de Design" }));
    expect(
      within(panel).getByRole("heading", { level: 2, name: "Salão de Design" }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Área")).not.toBeInTheDocument();
    expect(within(panel).queryByText(/m²/)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/confirmada|arquivo|geometria/i)).not.toBeInTheDocument();
  });

  it("supports keyboard selection and clearing without changing the current camera", () => {
    const { container } = render(<Harness />);
    const plan = screen.getByRole("group", { name: "Planta interativa do Pavilhão 1" });
    fireEvent.keyDown(plan, { key: "+" });
    fireEvent.keyDown(plan, { key: "ArrowLeft" });
    const before = readCamera(container);
    const space = path(container, "07");
    fireEvent.keyDown(space, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("07");
    expect(readCamera(container)).toEqual(before);
    onSelect.mockClear();
    fireEvent.keyDown(plan, { key: "Escape" });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(container.querySelector(".arq-environment.is-selected")).not.toBeInTheDocument();
    expect(readCamera(container)).toEqual(before);
  });

  it("clears selection with Escape while an environment path has keyboard focus", () => {
    const { container } = render(<Harness initial="09" />);
    const selected = path(container, "09");
    (selected as SVGElement).focus();
    expect(selected).toHaveFocus();
    fireEvent.keyDown(selected, { key: "Escape" });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(container.querySelector(".arq-environment.is-selected")).not.toBeInTheDocument();
  });

  it("draws the selection line on the exact hall or linked room paths", () => {
    const { container } = render(<Harness />);
    const selection = () => container.querySelector(".arq-p1-selection")!;
    const contours = () =>
      [...selection().querySelectorAll("path")].map((part) => part.getAttribute("d"));

    fireEvent.click(path(container, "salon"));
    expect(selection()).toHaveAttribute("pointer-events", "none");
    expect(contours()).toEqual([path(container, "salon").getAttribute("d")]);

    fireEvent.click(path(container, "12", "external"));
    expect(contours()).toEqual([
      path(container, "12").getAttribute("d"),
      path(container, "12", "external").getAttribute("d"),
    ]);
  });

  it("does not select an environment after a cancelled pointer gesture", () => {
    const { container } = render(<Harness />);
    const space = path(container, "11");
    fireEvent.pointerDown(space, { pointerId: 4, button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerCancel(space, { pointerId: 4, clientX: 400, clientY: 300 });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(space, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("11");
  });

  it("distinguishes a drag from a tap and moves the complete drawing together", () => {
    const { container } = render(<Harness />);
    const space = path(container, "10");
    const before = readCamera(container);
    fireEvent.pointerDown(space, { pointerId: 1, button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(space, { pointerId: 1, clientX: 460, clientY: 330 });
    fireEvent.pointerUp(space, { pointerId: 1, clientX: 460, clientY: 330 });
    expect(onSelect).not.toHaveBeenCalled();
    const after = readCamera(container);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
    expect(after.scale).toBe(before.scale);
    expect(container.querySelectorAll(".arq-environment[transform]")).toHaveLength(0);
    fireEvent.pointerDown(space, { pointerId: 2, button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(space, { pointerId: 2, clientX: 402, clientY: 301 });
    fireEvent.pointerUp(space, { pointerId: 2, clientX: 402, clientY: 301 });
    expect(onSelect).toHaveBeenLastCalledWith("10");
  });

  it("handles cursor zoom, pinch and fit without adding browser history entries", () => {
    const push = vi.spyOn(history, "pushState");
    const { container } = render(<Harness />);
    const plan = screen.getByRole("group", { name: "Planta interativa do Pavilhão 1" });
    const initial = readCamera(container);
    fireEvent.wheel(plan, { deltaY: -100, clientX: 750, clientY: 300 });
    expect(readCamera(container).scale).toBeGreaterThan(initial.scale);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar à tela" }));
    expect(readCamera(container)).toEqual(initial);
    fireEvent.pointerDown(plan, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 400,
      clientY: 300,
    });
    fireEvent.pointerDown(plan, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 600,
      clientY: 300,
    });
    fireEvent.pointerMove(plan, { pointerId: 2, pointerType: "touch", clientX: 700, clientY: 300 });
    fireEvent.pointerUp(plan, { pointerId: 1, pointerType: "touch", clientX: 400, clientY: 300 });
    fireEvent.pointerUp(plan, { pointerId: 2, pointerType: "touch", clientX: 700, clientY: 300 });
    expect(readCamera(container).scale).toBeGreaterThan(initial.scale);
    expect(onSelect).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("collapses and reopens the mobile left panel while retaining the selected environment", () => {
    mobile = true;
    const { container } = render(<Harness initial="12" />);
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("129,43 m²")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Ver na planta" }));
    expect(panel).not.toBeVisible();
    expect(path(container, "12")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "12 · Espaço 12" })
        .find((element) => element instanceof HTMLButtonElement)!,
    );
    expect(panel).toBeVisible();
    expect(within(panel).getByRole("heading", { name: "Espaço 12" })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps the selected leftmost environment visible beside the mobile panel", () => {
    mobile = true;
    const { container } = render(<Harness initial="14" />);
    const label = PAVILION_1_PLAN.environments.find(
      (environment) => environment.code === "14",
    )!.label;
    const camera = readCamera(container);
    const selectedScreenX = label[0] * camera.scale + camera.x;
    expect(selectedScreenX).toBeGreaterThan(226);
    expect(selectedScreenX).toBeLessThan(390);
  });

  it("reveals a selected label above the mobile controls while preserving the current zoom", () => {
    mobile = true;
    const { container } = render(<Harness />);
    const plan = screen.getByRole("group", { name: "Planta interativa do Pavilhão 1" });
    fireEvent.keyDown(plan, { key: "ArrowLeft" });
    for (let step = 0; step < 6; step++) fireEvent.keyDown(plan, { key: "ArrowUp" });
    const before = readCamera(container);
    const [x, y] = PAVILION_1_PLAN.environments.find(({ code }) => code === "01")!.label;
    expect(x * before.scale + before.x).toBeGreaterThan(322);
    expect(y * before.scale + before.y).toBeGreaterThan(486);

    fireEvent.click(path(container, "01"));
    const after = readCamera(container);
    expect(after.scale).toBe(before.scale);
    expect(y * after.scale + after.y).toBeLessThan(486);
  });

  it("returns to the park through the dedicated back action", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao parque" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
