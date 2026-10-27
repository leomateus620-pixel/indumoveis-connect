import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { NAV_CATEGORIES } from "@/lib/navigation";
import { PortalCategoryCard } from "./PortalCategoryCard";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.mobile }));
vi.mock("@tanstack/react-router", () => ({
  Link: forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<"a"> & { to: string }>(
    function TestLink({ to, ...props }, ref) {
      return <a ref={ref} href={to} {...props} />;
    },
  ),
}));

const mapCategory = NAV_CATEGORIES.find((category) => category.id === "mapa")!;
const administration = NAV_CATEGORIES.find((category) => category.id === "administracao")!;

beforeEach(() => {
  viewport.mobile = false;
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("portal destination selection", () => {
  it("omits a category without permitted destinations", () => {
    const { container } = render(
      <PortalCategoryCard category={administration} destinations={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("opens a single permitted destination directly and identifies it in the footer", () => {
    const prewarm = vi.fn();
    const destination = { ...mapCategory.destinations[1], prewarm };
    const { container } = render(
      <PortalCategoryCard category={mapCategory} destinations={[destination]} />,
    );
    const link = screen.getByRole("link", {
      name: "Abrir comercialização: Mapa Comercial — Comercialização",
    });
    expect(link).toHaveAttribute("href", "/comercializacao");
    expect(container.querySelector(".portal-card__foot")).toHaveTextContent(
      /^Abrir comercialização$/,
    );
    expect(container.querySelector(".portal-card__chips")).toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(prewarm).not.toHaveBeenCalled();
    fireEvent.focus(link);
    expect(prewarm).toHaveBeenCalledOnce();
  });

  it("portals only permitted options outside the card and restores focus after Escape", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const permitted = administration.destinations.slice(0, 2);
    render(<PortalCategoryCard category={administration} destinations={[...permitted]} />);
    const trigger = screen.getByRole("button", { name: "Ver 2 opções de Administração" });
    const cardContent = trigger.innerHTML;
    fireEvent.click(trigger);
    const selector = await screen.findByRole("dialog", { name: "Administração" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger.innerHTML).toBe(cardContent);
    expect(trigger).not.toContainElement(selector);
    expect(
      within(selector)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/dashboard", "/documentos"]);
    expect(within(selector).queryByText("Contratos")).not.toBeInTheDocument();
    expect(within(selector).queryByText("Configurações")).not.toBeInTheDocument();
    const firstLink = within(selector).getByRole("link", { name: "Dashboard" });
    await waitFor(() => expect(firstLink).toHaveFocus());
    const openingFocus = focus.mock.contexts.indexOf(firstLink);
    expect(focus.mock.calls[openingFocus]).toEqual([{ preventScroll: true }]);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    const closingFocus = focus.mock.contexts.lastIndexOf(trigger);
    expect(focus.mock.calls[closingFocus]).toEqual([{ preventScroll: true }]);
    expect(trigger.innerHTML).toBe(cardContent);
  });

  it("closes the anchored selector on an outside pointer and returns focus to its card", async () => {
    render(
      <>
        <PortalCategoryCard
          category={administration}
          destinations={[...administration.destinations]}
        />
        <button type="button">Fora da seleção</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Ver 4 opções de Administração" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Administração" });
    // DismissableLayer installs its document pointer listener after the opening event.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Fora da seleção" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Fora da seleção" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("uses a modal mobile dialog that contains focus and restores it on close", async () => {
    viewport.mobile = true;
    render(
      <>
        <PortalCategoryCard
          category={administration}
          destinations={[...administration.destinations]}
        />
        <button type="button">Fora da seleção</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Ver 4 opções de Administração" });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Administração" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Escolha a área que deseja acessar.");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    act(() => screen.getByRole("button", { name: "Fora da seleção", hidden: true }).focus());
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar destinos" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("preserves a usable selector and focus when the breakpoint changes while open", async () => {
    const { rerender } = render(
      <PortalCategoryCard
        category={administration}
        destinations={[...administration.destinations]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver 4 opções de Administração" }));
    await screen.findByRole("dialog", { name: "Administração" });
    viewport.mobile = true;
    rerender(
      <PortalCategoryCard
        category={administration}
        destinations={[...administration.destinations]}
      />,
    );
    const modal = await screen.findByRole("dialog", { name: "Administração" });
    expect(modal).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(modal.contains(document.activeElement)).toBe(true));
    viewport.mobile = false;
    rerender(
      <PortalCategoryCard
        category={administration}
        destinations={[...administration.destinations]}
      />,
    );
    const popover = await screen.findByRole("dialog", { name: "Administração" });
    await waitFor(() => expect(popover.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ver 4 opções de Administração" })).toHaveFocus(),
    );
  });
});
