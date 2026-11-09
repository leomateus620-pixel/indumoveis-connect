import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pavilion13LotDirectory } from "./Pavilion13LotDirectory";
import { PAVILION_13_PLAN } from "./pavilion13";

afterEach(cleanup);

describe("Salão de Imóveis lot directory", () => {
  it("offers all 80 lots by sector with one group open at a time", () => {
    render(
      <Pavilion13LotDirectory environments={PAVILION_13_PLAN.environments} onSelect={vi.fn()} />,
    );
    const directory = within(screen.getByRole("navigation", { name: "Lotes por setor" }));
    expect(directory.queryByRole("group")).not.toBeInTheDocument();

    for (const [label, start, count] of [
      ["Esquerda 52–80", 52, 29],
      ["Ilha central 30–51", 30, 22],
      ["Direita 01–29", 1, 29],
    ] as const) {
      const toggle = directory.getByRole("button", { name: label });
      fireEvent.click(toggle);

      const group = directory.getByRole("group", { name: label });
      expect(group.id).toBe(toggle.getAttribute("aria-controls"));
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(directory.getAllByRole("group")).toHaveLength(1);
      expect(
        within(group)
          .getAllByRole("button")
          .map((button) => button.textContent),
      ).toEqual(Array.from({ length: count }, (_, i) => String(start + i).padStart(2, "0")));
    }
  });

  it("selects a real lot from the revision and marks the current lot", () => {
    const environments = PAVILION_13_PLAN.environments.filter((lot) => lot.code === "63");
    const onSelect = vi.fn();
    const { rerender } = render(
      <Pavilion13LotDirectory environments={environments} onSelect={onSelect} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Esquerda 63" }));
    const lot = screen.getByRole("button", { name: "Lote 63" });
    expect(lot).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(lot);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("63");

    rerender(
      <Pavilion13LotDirectory environments={environments} selectedCode="63" onSelect={onSelect} />,
    );
    expect(lot).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Esquerda 63" }));
    expect(screen.queryByRole("button", { name: "Lote 63" })).not.toBeInTheDocument();
  });
});
