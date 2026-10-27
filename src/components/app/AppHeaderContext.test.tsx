import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DestinationPath } from "@/lib/navigation";
import { AppHeaderProvider, useAppHeaderCommands, useAppHeaderSlot } from "./AppHeaderContext";

function Header({ route = "/agenda" }: { route?: DestinationPath }) {
  const slot = useAppHeaderSlot(route);
  return <header data-testid="header-slot">{slot?.commands}</header>;
}

function Page({ label }: { label: string }) {
  useAppHeaderCommands({ route: "/agenda", commands: <button>{label}</button> });
  return <p>Eventos da agenda</p>;
}

describe("contextual AppShell header", () => {
  it("updates the commands without causing a page render loop", () => {
    let renders = 0;
    function StatefulPage() {
      renders++;
      const [value, setValue] = useState("Linha do tempo");
      useAppHeaderCommands({
        route: "/agenda",
        commands: <button onClick={() => setValue("Calendário")}>{value}</button>,
      });
      return <p>Conteúdo preservado</p>;
    }
    render(
      <AppHeaderProvider>
        <Header />
        <StatefulPage />
      </AppHeaderProvider>,
    );
    expect(renders).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Linha do tempo" }));
    expect(screen.getByRole("button", { name: "Calendário" })).toBeVisible();
    expect(screen.getByText("Conteúdo preservado")).toBeVisible();
    expect(renders).toBe(2);
  });

  it("clears commands when their page unmounts", () => {
    function Workspace() {
      const [open, setOpen] = useState(true);
      return (
        <AppHeaderProvider>
          <Header />
          <button onClick={() => setOpen(false)}>Sair da Agenda</button>
          {open && <Page label="Filtrar atividades" />}
        </AppHeaderProvider>
      );
    }
    render(<Workspace />);
    expect(screen.getByRole("button", { name: "Filtrar atividades" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sair da Agenda" }));
    expect(screen.getByTestId("header-slot")).toBeEmptyDOMElement();
  });

  it("preserves focus while controlled contextual commands update", () => {
    function SearchPage() {
      const [query, setQuery] = useState("");
      useAppHeaderCommands({
        route: "/agenda",
        commands: (
          <input
            aria-label="Pesquisar agenda"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        ),
      });
      return <p>{query}</p>;
    }
    render(
      <AppHeaderProvider>
        <Header />
        <SearchPage />
      </AppHeaderProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Pesquisar agenda" });
    input.focus();
    fireEvent.change(input, { target: { value: "Montagem" } });
    expect(screen.getByRole("textbox", { name: "Pesquisar agenda" })).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Montagem");
  });

  it("does not expose previous commands while another route is current", () => {
    render(
      <AppHeaderProvider>
        <Header route="/financeiro" />
        <Page label="Comandos da Agenda" />
      </AppHeaderProvider>,
    );
    expect(screen.getByTestId("header-slot")).toBeEmptyDOMElement();
  });

  it("does not clear a newer registration when an older owner leaves", () => {
    function Commands({ label }: { label: string }) {
      useAppHeaderCommands({ route: "/agenda", commands: label });
      return null;
    }
    function Workspace() {
      const [old, setOld] = useState(true);
      return (
        <AppHeaderProvider>
          <Header />
          {old && <Commands label="Antigo" />}
          <Commands label="Atual" />
          <button onClick={() => setOld(false)}>Remover antigo</button>
        </AppHeaderProvider>
      );
    }
    render(<Workspace />);
    expect(screen.getByTestId("header-slot")).toHaveTextContent("Atual");
    fireEvent.click(screen.getByRole("button", { name: "Remover antigo" }));
    expect(screen.getByTestId("header-slot")).toHaveTextContent("Atual");
  });
});
