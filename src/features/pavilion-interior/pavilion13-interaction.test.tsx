import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PavilionInterior } from "./PavilionInterior";
import { PAVILION_13_PLAN } from "./pavilion13";
import { PAVILION_8_PLAN } from "./pavilion8";
import { PAVILION_PRESENTATIONS } from "./presentation";

type Props = ComponentProps<typeof PavilionInterior>;
const onSelect = vi.fn();
let mobile = false;
const bounds = (width: number, height = 720): DOMRect => ({
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  width,
  height,
  right: width,
  bottom: height,
  toJSON: () => ({}),
});
function Harness({
  initial,
  plan = PAVILION_13_PLAN,
  commercial,
  onConnect,
}: {
  initial?: string;
  plan?: Props["plan"];
  commercial?: Props["commercial"];
  onConnect?: Props["onConnect"];
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <PavilionInterior
      plan={plan}
      presentation={PAVILION_PRESENTATIONS[13]}
      selectedCode={selected}
      commercial={commercial}
      onConnect={onConnect}
      onBack={() => {}}
      onSelect={(code) => {
        onSelect(code);
        setSelected(code);
      }}
    />
  );
}
const lotPath = (container: HTMLElement, code: string) =>
  container.querySelector(`[data-environment="${code}"] [data-part="interior"]`)!;

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
  vi.spyOn(window, "matchMedia").mockImplementation((media) => ({
    matches: mobile,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return bounds(
      this.classList.contains("arq-sidebar") ? (mobile ? 304 : 272) : mobile ? 390 : 1180,
    );
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Pavilhão 8 lot inspection", () => {
  it("shows the pavilion total separately and omits an existing individual lot area", () => {
    const plan = {
      ...PAVILION_8_PLAN,
      environments: PAVILION_8_PLAN.environments.map((lot) =>
        lot.code === "07" ? { ...lot, declaredAreaM2: 123.45 } : lot,
      ),
    };
    render(
      <PavilionInterior
        plan={plan}
        presentation={PAVILION_PRESENTATIONS[8]}
        selectedCode="07"
        onBack={() => {}}
        onSelect={onSelect}
      />,
    );
    const header = screen
      .getByRole("heading", { name: "Fornecedores e Construção Civil" })
      .closest("header")!;
    expect(within(header).getByText("937,32 m²")).toBeInTheDocument();
    expect(within(header).getByText("Pavilhão 8")).toBeInTheDocument();
    const sidebar = screen.getByRole("complementary", { name: "Informações do lote" });
    expect(within(sidebar).getByRole("heading", { name: "Lote 07" })).toBeInTheDocument();
    expect(sidebar).not.toHaveTextContent(/m²|123,45/);
    expect(within(sidebar).queryByRole("button", { name: "Lote 02" })).not.toBeInTheDocument();
    const drawing = screen.getByRole("group", { name: "Planta interativa do Pavilhão 8" });
    expect(within(drawing).getByRole("link", { name: "Acesso ao Pavilhão 13" })).toHaveAttribute(
      "href",
      "/mapa/pavilhoes/13/interior",
    );
    expect(within(drawing).getByRole("link", { name: "Acesso ao Pavilhão 12" })).toHaveAttribute(
      "href",
      "/mapa?pavilhao=12",
    );
    const entrances = within(drawing).getAllByRole("img", { name: "Entrada" });
    expect(entrances).toHaveLength(2);
    for (const entrance of entrances) {
      expect(entrance).toHaveAttribute("href", "/brand/fornecedores-construcao/entrada.svg");
    }
    expect(within(drawing).getByRole("img", { name: "Saída" })).toHaveAttribute(
      "href",
      "/brand/fornecedores-construcao/saida.svg",
    );
    const lot = plan.environments.find((environment) => environment.code === "07")!;
    expect(within(drawing).getByRole("button", { name: "07 · Lote 07" })).toHaveAttribute(
      "d",
      lot.parts[0].path,
    );
    expect(drawing.querySelector(".arq-p8-structure")).toHaveAttribute("pointer-events", "none");
    expect(drawing.querySelector(".arq-p8-lot-relief")).toHaveAttribute("pointer-events", "none");
    expect([...drawing.querySelectorAll(".arq-plan-label")].map((e) => e.textContent)).toEqual([
      "01",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
    ]);
  });

  it("keeps the camera on close while the router clears the selection", () => {
    const { container } = render(
      <PavilionInterior
        plan={PAVILION_8_PLAN}
        presentation={PAVILION_PRESENTATIONS[8]}
        selectedCode="07"
        onBack={() => {}}
        onSelect={onSelect}
      />,
    );
    const drawing = container.querySelector(".arq-plan > g")!;
    const viewport = screen.getByRole("group", { name: "Planta interativa do Pavilhão 8" });
    fireEvent.keyDown(viewport, { key: "ArrowDown" });
    fireEvent.keyDown(viewport, { key: "ArrowDown" });
    const afterPan = drawing.getAttribute("transform");
    fireEvent.click(screen.getByRole("button", { name: "Fechar painel e seleção" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(drawing).toHaveAttribute("transform", afterPan);
  });
});

describe("Pavilhão 13 lot inspection", () => {
  it("distinguishes dragging a passage marker from opening its destination", () => {
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId: number;
        constructor(type: string, options: PointerEventInit) {
          super(type, options);
          this.pointerId = options.pointerId ?? 1;
        }
      },
    );
    const open = vi.fn();
    const { container } = render(<Harness onConnect={open} />);
    const svg = container.querySelector(".arq-plan")!;
    Object.defineProperties(svg, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => false },
    });
    const left = screen.getByRole("link", { name: "Acesso ao Pavilhão 3" });
    const right = screen.getByRole("link", { name: "Acesso ao Pavilhão 8" });
    fireEvent.pointerDown(left, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 345, clientY: 320, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 345, clientY: 320, pointerId: 1 });
    expect(open).not.toHaveBeenCalled();
    fireEvent.pointerDown(right, { clientX: 700, clientY: 300, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 700, clientY: 300, pointerId: 2 });
    expect(open).toHaveBeenCalledExactlyOnceWith(8);
    fireEvent.click(left, { detail: 0 });
    expect(open).toHaveBeenLastCalledWith(3);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("uses one prominent brand without a duplicate visible title and describes the compact return icon", () => {
    const { container } = render(<Harness />);
    const header = container.querySelector(".arq-header")!;
    expect(header.querySelector(".arq-heading")).not.toBeInTheDocument();
    expect(within(header as HTMLElement).getAllByRole("img")).toHaveLength(1);
    expect(
      within(header as HTMLElement).getByRole("img", { name: "Salão de IMÓVEIS" }),
    ).toHaveClass("arq-signature");
    const heading = within(header as HTMLElement).getByRole("heading", {
      level: 1,
      name: "Salão de Imóveis",
    });
    expect(heading).toHaveClass("arq-sr-only");
    expect(heading.closest(".arq-brand-led")).toBeInTheDocument();
    const back = within(header as HTMLElement).getByRole("button", { name: "Voltar ao parque" });
    expect(back).toHaveClass("arq-back-compact");
    expect(back.querySelector("span.arq-sr-only")).toHaveTextContent("Voltar ao parque");
    expect(back).toHaveAccessibleDescription(/Visualização externa/);
    const tooltipId = back.getAttribute("aria-describedby");
    expect(tooltipId).toBeTruthy();
    const tooltip = document.getElementById(tooltipId!);
    expect(tooltip).toHaveAttribute("role", "tooltip");
    expect(tooltip).toHaveTextContent("Voltar ao parque");
    expect(tooltip).toHaveTextContent("Visualização externa");
  });

  it("offers eighty SVG targets, number search and a compact sector directory", () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll(".arq-environment.is-commercial")).toHaveLength(80);
    expect(container.querySelectorAll(".arq-environment.is-commercial .arq-part")).toHaveLength(80);
    expect(
      container.querySelectorAll(".arq-environment.is-commercial .arq-plan-label"),
    ).toHaveLength(80);
    expect(container.querySelector(".arq-p13-structure")).toHaveAttribute("pointer-events", "none");
    const panel = screen.getByRole("complementary", { name: "Informações do lote" });
    expect(within(panel).getByText("80", { selector: "strong" })).toBeInTheDocument();
    expect(within(panel).getByRole("searchbox", { name: "Buscar lote" })).toBeInTheDocument();
    const directory = within(panel).getByRole("navigation", { name: "Lotes por setor" });
    const sectors = within(directory).getAllByRole("button");
    expect(sectors).toHaveLength(3);
    for (const sector of sectors) expect(sector).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".arq-space-grid")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Salão de IMÓVEIS" })).toHaveAttribute(
      "src",
      "/brand/salao-imoveis/salao-imoveis-compact.svg",
    );
    expect(container.innerHTML).not.toMatch(/arq-design|ARQ &|Salão de Design|Recepção|Banheiros/);

    fireEvent.click(within(directory).getByRole("button", { name: "Ilha central 30–51" }));
    fireEvent.click(within(directory).getByRole("button", { name: "Lote 35" }));
    expect(onSelect).toHaveBeenLastCalledWith("35");
    expect(lotPath(container, "35")).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByRole("heading", { name: "Lote 35" })).toHaveFocus();
  });

  it("uses the shared wayfinding pair and keeps access plaques within the left side of each passage", () => {
    render(<Harness />);
    const plan = within(screen.getByRole("group", { name: "Planta interativa do Pavilhão 13" }));
    for (const [label, asset] of [
      ["Entrada", "entrada.svg"],
      ["Saída", "saida.svg"],
    ]) {
      const signs = plan.getAllByRole("img", { name: label });
      expect(signs).toHaveLength(2);
      for (const sign of signs)
        expect(sign).toHaveAttribute("href", `/brand/pavilion-wayfinding/${asset}`);
    }

    for (const [destination, left, midpoint] of [
      [3, 80, 192],
      [8, 416, 528],
    ]) {
      const plate = plan
        .getByRole("link", { name: `Acesso ao Pavilhão ${destination}` })
        .querySelector("rect")!;
      const x = Number(plate.getAttribute("x"));
      const y = Number(plate.getAttribute("y"));
      expect(x).toBeGreaterThan(left);
      expect(x + Number(plate.getAttribute("width"))).toBeLessThan(midpoint);
      expect(y).toBeGreaterThan(570);
      expect(y + Number(plate.getAttribute("height"))).toBeLessThan(714);
    }
  });

  it("keeps split documentary groups individually selectable with a single changing left panel", () => {
    const { container } = render(<Harness />);
    for (const code of ["01", "18", "35", "63", "66", "70", "80"]) {
      fireEvent.click(lotPath(container, code));
      expect(onSelect).toHaveBeenLastCalledWith(code);
      expect(container.querySelectorAll(".arq-environment.is-selected")).toHaveLength(1);
      expect(container.querySelector(".arq-environment.is-selected")).toHaveAttribute(
        "data-environment",
        code,
      );
      const panel = screen.getByRole("complementary", { name: "Informações do lote" });
      expect(
        within(panel).getByRole("heading", { level: 2, name: `Lote ${code}` }),
      ).toBeInTheDocument();
      expect(within(panel).getByText("Pavilhão 13")).toBeInTheDocument();
      expect(screen.getAllByRole("complementary")).toHaveLength(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(`Lote ${code}`);
    }
  });

  it("locates the first and last lots and reports an invalid number without changing selection", () => {
    const { container } = render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Buscar lote" });
    const submit = () => fireEvent.click(screen.getByRole("button", { name: "Localizar lote" }));
    for (const [query, code] of [
      ["1", "01"],
      ["80", "80"],
    ]) {
      fireEvent.change(input, { target: { value: query } });
      submit();
      expect(onSelect).toHaveBeenLastCalledWith(code);
      expect(input).toHaveValue(code);
      expect(container.querySelector(".is-selected[data-environment]")).toHaveAttribute(
        "data-environment",
        code,
      );
    }
    onSelect.mockClear();
    fireEvent.change(input, { target: { value: "81" } });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um número de 01 a 80.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector(".is-selected[data-environment]")).toHaveAttribute(
      "data-environment",
      "80",
    );
    fireEvent.change(input, { target: { value: "18" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("suppresses existing square metres in panel, zoom labels and live announcements", () => {
    const plan = {
      ...PAVILION_13_PLAN,
      environments: PAVILION_13_PLAN.environments.map((e) => ({ ...e, declaredAreaM2: 123.45 })),
    };
    const { container } = render(<Harness initial="01" plan={plan} />);
    for (const code of ["01", "35", "80"]) {
      fireEvent.click(lotPath(container, code));
      fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
      expect(container.textContent).not.toMatch(
        /123[,.]45|m²|m2|metragem|Área não|Área confirmada/,
      );
      expect(
        [...container.querySelectorAll("[aria-label], [aria-live]")]
          .map((el) => `${el.getAttribute("aria-label") ?? ""} ${el.textContent}`)
          .join(" "),
      ).not.toMatch(/123[,.]45|m²/);
      expect(container.querySelector(".arq-area")).not.toBeInTheDocument();
      expect(container.querySelector(".arq-plan-detail")).not.toBeInTheDocument();
      expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(`Lote ${code}`);
    }
  });

  it("does not infer reserved status or occupants from documentary source metadata", () => {
    const plan = {
      ...PAVILION_13_PLAN,
      source: { ...PAVILION_13_PLAN.source, document: "RESERVADO — Hartmann — Cresol.pdf" },
    };
    const { container } = render(<Harness initial="63" plan={plan} />);
    const panel = screen.getByRole("complementary");
    expect(within(panel).queryByText("Situação comercial")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Expositor")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/reservado|hartmann|cresol|santa rosa|heute|850[,.]5/i);
  });

  it("shows only the selected lot's supplied commercial data and removes it when switching to an unpopulated lot", () => {
    const { container } = render(
      <Harness
        commercial={{
          "35": { status: "em_negociacao", exhibitor: "Expositor autorizado" },
          "80": { status: "vendido", exhibitor: "Outro expositor" },
        }}
      />,
    );
    fireEvent.click(lotPath(container, "35"));
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Em negociação")).toBeInTheDocument();
    expect(within(panel).getByText("Expositor autorizado")).toBeInTheDocument();
    expect(screen.queryByText("Outro expositor")).not.toBeInTheDocument();
    fireEvent.click(lotPath(container, "66"));
    expect(within(panel).queryByText("Situação comercial")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Expositor autorizado")).not.toBeInTheDocument();
  });

  it("lets mobile users collapse and reopen the same selected lot without growing the side list", () => {
    mobile = true;
    render(<Harness initial="70" />);
    expect(screen.getByRole("heading", { level: 2, name: "Lote 70" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver na planta" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lote 70" }));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Lote 70" })).toBeInTheDocument();
    const panel = within(screen.getByRole("complementary"));
    expect(panel.getByRole("button", { name: "Ver na planta" })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Localizar lote" })).toBeInTheDocument();
    const sectors = panel.getByRole("navigation", { name: "Lotes por setor" });
    expect(within(sectors).getAllByRole("button")).toHaveLength(3);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
