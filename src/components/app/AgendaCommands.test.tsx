import { useState, type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { activeAgendaCriteria, type AgendaSearch } from "@/lib/agenda-search";
import { AgendaCommands } from "./AgendaCommands";
import { AppHeaderProvider, useAppHeaderCommands, useAppHeaderSlot } from "./AppHeaderContext";

const device = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => device.mobile }));

const categories = [
  { id: "infra", name: "Infraestrutura" },
  { id: "comercial", name: "Comercial" },
];
const commissions = [
  { id: "operacao", name: "Operação" },
  { id: "vendas", name: "Vendas" },
];
const people = [
  { id: "p1", full_name: "Ana Pereira", email: "ana@example.test" },
  { id: "p2", full_name: "Bruno Santos", email: "bruno@example.test" },
];

function renderCommands(
  initialSearch: AgendaSearch = {},
  overrides: Partial<ComponentProps<typeof AgendaCommands>> = {},
) {
  const changes = vi.fn();
  const catalog = vi.fn();
  function ControlledWorkspace() {
    const [search, setSearch] = useState(initialSearch);
    return (
      <TooltipProvider delayDuration={0}>
        <AgendaCommands
          search={search}
          view={search.view ?? "timeline"}
          categories={categories}
          commissions={commissions}
          people={people}
          count={7}
          canWrite
          onCatalog={catalog}
          onChange={(patch) => {
            changes(patch);
            setSearch((previous) => ({ ...previous, ...patch }));
          }}
          {...overrides}
        />
        <output data-testid="search-state">{JSON.stringify(search)}</output>
        <button type="button">Fora dos filtros</button>
      </TooltipProvider>
    );
  }
  render(<ControlledWorkspace />);
  return { changes, catalog };
}

const currentSearch = (): AgendaSearch =>
  JSON.parse(screen.getByTestId("search-state").textContent ?? "{}");

function openFilters() {
  const trigger = screen.getByRole("button", { name: /^Filtros/ });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("Agenda contextual commands", () => {
  beforeEach(() => {
    device.mobile = false;
  });

  it("keeps search and labelled filters controlled by the supplied criteria", () => {
    const { changes } = renderCommands({ q: "montagem", category: "infra" });
    expect(screen.getByRole("searchbox", { name: "Buscar na Agenda" })).toHaveValue("montagem");
    openFilters();
    const filters = screen.getByRole("dialog");
    expect(within(filters).getByRole("status")).toHaveTextContent("7 resultados");
    expect(within(filters).getByLabelText("Categoria")).toHaveValue("infra");
    fireEvent.change(within(filters).getByLabelText("Comissão"), {
      target: { value: "operacao" },
    });
    fireEvent.change(within(filters).getByLabelText("Responsável"), {
      target: { value: "p2" },
    });
    expect(changes).toHaveBeenCalledWith({ commission: "operacao" });
    expect(changes).toHaveBeenCalledWith({ assignee: "p2" });
    expect(currentSearch()).toEqual({
      q: "montagem",
      category: "infra",
      commission: "operacao",
      assignee: "p2",
    });
    expect(screen.getByRole("button", { name: "Filtros: 4 critérios ativos" })).toBeVisible();
    const summary = within(filters).getByLabelText("Critérios selecionados");
    expect(summary).toHaveTextContent("Busca: montagem");
    expect(summary).toHaveTextContent("Infraestrutura");
    expect(summary).toHaveTextContent("Operação");
    expect(summary).toHaveTextContent("Bruno Santos");
  });

  it("disables the previous assignee when Minhas atividades becomes effective", () => {
    renderCommands({ category: "infra", assignee: "p2" });
    openFilters();
    const filters = screen.getByRole("dialog");
    fireEvent.change(within(filters).getByLabelText("Situação"), {
      target: { value: "minhas" },
    });
    const assignee = within(filters).getByLabelText("Responsável");
    expect(assignee).toBeDisabled();
    expect(assignee).toHaveValue("");
    expect(within(filters).getByRole("option", { name: "Atribuídas a você" })).toBeVisible();
    expect(currentSearch().assignee).toBe("p2");
    expect(currentSearch().status).toBe("minhas");
    expect(activeAgendaCriteria(currentSearch())).toBe(2);
    const summary = within(filters).getByLabelText("Critérios selecionados");
    expect(summary).toHaveTextContent("Minhas atividades");
    expect(summary).not.toHaveTextContent("Bruno Santos");
    expect(screen.getByRole("button", { name: "Filtros: 2 critérios ativos" })).toBeVisible();
  });

  it("changes only the view while preserving every compatible URL criterion", () => {
    const initial: AgendaSearch = {
      view: "timeline",
      month: "2026-10",
      q: "montagem",
      status: "aberta",
      category: "infra",
      commission: "operacao",
      assignee: "p1",
      activity: "a1",
      day: "2026-10-27",
    };
    const { changes } = renderCommands(initial);
    fireEvent.click(screen.getByRole("button", { name: "Calendário" }));
    expect(changes).toHaveBeenLastCalledWith({ view: "calendar" });
    expect(currentSearch()).toEqual({ ...initial, view: "calendar" });
    expect(screen.getByRole("button", { name: "Calendário" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Linha do tempo" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clears effective criteria without losing navigation or the selected activity", () => {
    renderCommands({
      view: "panel",
      month: "2026-10",
      day: "2026-10-27",
      activity: "a1",
      q: "montagem",
      status: "aberta",
      category: "infra",
      commission: "operacao",
      assignee: "p1",
    });
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(currentSearch()).toEqual({
      view: "panel",
      month: "2026-10",
      day: "2026-10-27",
      activity: "a1",
    });
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Filtros da Agenda" })).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Buscar na Agenda" })).toHaveValue("");
  });

  it("keeps catalog configuration behind write permission", () => {
    renderCommands({}, { canWrite: false });
    expect(
      screen.queryByRole("button", { name: "Configurar categorias e comissões" }),
    ).not.toBeInTheDocument();
  });

  it("opens the authorized catalog action", () => {
    const { catalog } = renderCommands();
    fireEvent.click(screen.getByRole("button", { name: "Configurar categorias e comissões" }));
    expect(catalog).toHaveBeenCalledOnce();
  });

  it("closes the desktop popover with Escape and restores its trigger focus", async () => {
    renderCommands();
    const trigger = openFilters();
    const filters = screen.getByRole("dialog");
    expect(filters).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(filters, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("uses a mobile dialog that contains focus and restores it on Escape", async () => {
    device.mobile = true;
    renderCommands({ status: "aberta" });
    const outside = screen.getByRole("button", { name: "Fora dos filtros" });
    const trigger = openFilters();
    const filters = screen.getByRole("dialog", { name: "Filtros da Agenda" });
    expect(filters).toHaveAttribute("aria-describedby");
    expect(filters).toContainElement(document.activeElement as HTMLElement);
    act(() => outside.focus());
    expect(filters).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(filters, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("reveals mobile search without replacing the current criteria", () => {
    device.mobile = true;
    renderCommands({ category: "infra", month: "2026-10" });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buscar na Agenda" }));
    const input = screen.getByRole("searchbox", { name: "Buscar na Agenda" });
    input.focus();
    fireEvent.change(input, { target: { value: "reunião" } });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("reunião");
    expect(currentSearch()).toEqual({
      category: "infra",
      month: "2026-10",
      q: "reunião",
    });
    expect(screen.getByRole("button", { name: "Pesquisa ativa: reunião" })).toBeVisible();
  });

  it("preserves the search node and focus as URL changes update the AppShell slot", () => {
    let pageRenders = 0;
    function HeaderSlot() {
      const slot = useAppHeaderSlot("/agenda");
      return <header>{slot?.commands}</header>;
    }
    function AgendaPage() {
      pageRenders++;
      const [search, setSearch] = useState<AgendaSearch>({ month: "2026-10" });
      useAppHeaderCommands({
        route: "/agenda",
        commands: (
          <AgendaCommands
            search={search}
            view={search.view ?? "timeline"}
            categories={categories}
            commissions={commissions}
            people={people}
            count={7}
            canWrite
            onCatalog={() => {}}
            onChange={(patch) => setSearch((previous) => ({ ...previous, ...patch }))}
          />
        ),
      });
      return <p data-testid="rendered-query">{search.q}</p>;
    }
    render(
      <TooltipProvider>
        <AppHeaderProvider>
          <HeaderSlot />
          <AgendaPage />
        </AppHeaderProvider>
      </TooltipProvider>,
    );
    const input = screen.getByRole("searchbox", { name: "Buscar na Agenda" });
    input.focus();
    fireEvent.change(input, { target: { value: "Mon" } });
    fireEvent.change(input, { target: { value: "Montagem" } });
    expect(screen.getByRole("searchbox", { name: "Buscar na Agenda" })).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.getByTestId("rendered-query")).toHaveTextContent("Montagem");
    expect(pageRenders).toBe(3);
  });
});
