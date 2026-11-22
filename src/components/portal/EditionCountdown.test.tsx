import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Edition } from "@/lib/api";
import { EditionCountdown } from "./EditionCountdown";

const openingAt = Date.parse("2027-05-14T15:00:00-03:00");
const closingAt = Date.parse("2027-05-24T00:00:00-03:00");
const edition: Edition = {
  id: "official-edition",
  name: "Indumóveis 2027",
  year: 2027,
  starts_on: "2027-05-14",
  ends_on: "2027-05-23",
  opening_time: "15:00:00",
  timezone: "America/Sao_Paulo",
  venue: null,
  is_active: true,
  reservation_hold_days: null,
  reservation_expiry_action: null,
  contract_template: null,
};

function renderCountdown(props: Partial<ComponentProps<typeof EditionCountdown>> = {}) {
  const retry = vi.fn();
  return {
    retry,
    ...render(
      <EditionCountdown
        edition={edition}
        isLoading={false}
        isError={false}
        onRetry={retry}
        canConfigure={false}
        {...props}
      />,
    ),
  };
}

function displayedUnits(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll(".portal-count__digits"),
    (node) => node.textContent,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the portal's official edition clock", () => {
  it("renders the persisted 15h schedule and still counts five hours at 10h Brasília", () => {
    vi.setSystemTime(new Date("2027-05-14T10:00:00-03:00"));
    const { container } = renderCountdown();
    expect(screen.getByRole("timer", { name: "Tempo restante para a abertura" })).toHaveTextContent(
      "Faltam 0 dias, 5 horas e 0 minutos para a abertura.",
    );
    expect(displayedUnits(container)).toEqual(["00", "05", "00", "00"]);
    expect(container.querySelector(".portal-count__period")).toHaveTextContent(
      "14 a 23 de maio de 2027",
    );
    expect(container.querySelector(".portal-count__meta")).toHaveTextContent(
      "Abertura às 15h · Brasília",
    );
  });

  it("ticks locally through the official opening without requesting the edition again", () => {
    vi.setSystemTime(openingAt - 2000);
    const { container, retry } = renderCountdown();
    expect(displayedUnits(container)).toEqual(["00", "00", "00", "02"]);
    act(() => vi.advanceTimersByTime(1012));
    expect(displayedUnits(container)).toEqual(["00", "00", "00", "01"]);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("A Indumóveis 2027 começou!");
    expect(displayedUnits(container)).toEqual(["00", "00", "00", "00"]);
    expect(retry).not.toHaveBeenCalled();
  });

  it("resynchronizes on return from a hidden tab instead of replaying missed seconds", () => {
    vi.setSystemTime(openingAt - 60_000);
    const { container } = renderCountdown();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(120_000));
    // A hidden document suspends visual ticks until it becomes visible again.
    expect(displayedUnits(container)).toEqual(["00", "00", "01", "00"]);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByRole("status")).toHaveTextContent("A Indumóveis 2027 começou!");
    expect(displayedUnits(container)).toEqual(["00", "00", "00", "00"]);
  });

  it("resynchronizes a restored page at opening and after the last edition day", () => {
    vi.setSystemTime(openingAt - 60_000);
    renderCountdown();
    vi.setSystemTime(openingAt);
    fireEvent(window, new Event("pageshow"));
    expect(screen.getByRole("status")).toHaveTextContent("A Indumóveis 2027 começou!");
    vi.setSystemTime(closingAt);
    fireEvent(window, new Event("pageshow"));
    expect(screen.getByRole("status")).toHaveTextContent("A Indumóveis 2027 foi encerrada.");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("changes from open to closed at the end of the final civil day", () => {
    vi.setSystemTime(closingAt - 1000);
    renderCountdown();
    expect(screen.getByRole("status")).toHaveTextContent("A Indumóveis 2027 começou!");
    act(() => vi.advanceTimersByTime(1012));
    expect(screen.getByRole("status")).toHaveTextContent("A Indumóveis 2027 foi encerrada.");
  });
});

const openLabel = "Ver em tela cheia";
const dialogLabel = "Contagem oficial · Indumóveis 2027";
const timerLabel = "Tempo restante para a abertura";

function openPresentation(name = dialogLabel) {
  const trigger = screen.getByRole("button", { name: openLabel });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog", { name }) };
}

describe("the immersive presentation of the official countdown", () => {
  it.each([
    { isLoading: true },
    { isError: true },
    { edition: null },
    { edition: { ...edition, is_active: false } },
    { edition: { ...edition, opening_time: null } },
  ])("only offers a presentation when there is an official schedule (%j)", (props) => {
    renderCountdown(props);
    expect(screen.queryByRole("button", { name: openLabel })).not.toBeInTheDocument();
  });

  it("presents the active edition's own dates, local opening time and countdown", () => {
    vi.setSystemTime(new Date("2028-08-10T16:29:19-03:00"));
    renderCountdown({
      edition: {
        ...edition,
        name: "Indumóveis 2028",
        year: 2028,
        starts_on: "2028-08-10",
        ends_on: "2028-08-12",
        opening_time: "16:30:00",
      },
    });
    const { dialog } = openPresentation("Contagem oficial · Indumóveis 2028");
    expect(dialog).toHaveTextContent("10 a 12 de agosto de 2028");
    expect(dialog).toHaveTextContent("16h30");
    const timer = within(dialog).getByRole("timer");
    expect(within(timer).getByText("41")).toBeInTheDocument();
  });

  it("keeps the clock live, traps focus on the single exit control and restores focus on Escape", async () => {
    vi.setSystemTime(openingAt - 41_000);
    const { container, retry } = renderCountdown();
    const { trigger, dialog } = openPresentation();
    expect(container).not.toContainElement(dialog);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const exit = within(dialog).getByRole("button", { name: "Voltar ao portal" });
    expect(within(dialog).getAllByRole("button")).toEqual([exit]);
    expect(exit).toHaveTextContent(/^$/);
    expect(exit).toHaveFocus();
    expect(fireEvent.keyDown(exit, { key: "Tab" })).toBe(false);
    expect(fireEvent.keyDown(exit, { key: "Tab", shiftKey: true })).toBe(false);
    act(() => trigger.focus());
    expect(exit).toHaveFocus();
    const timer = within(dialog).getByRole("timer", { name: timerLabel });
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(within(timer).getByText("41")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1012));
    expect(within(timer).getByText("40")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await act(() => vi.advanceTimersByTimeAsync(32));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(displayedUnits(container)).toEqual(["00", "00", "00", "40"]);
    expect(retry).not.toHaveBeenCalled();
  });

  it("keeps the edition's open and closed states in the presentation across page restoration", () => {
    vi.setSystemTime(openingAt - 1000);
    renderCountdown();
    const { dialog } = openPresentation();
    expect(within(dialog).getByRole("timer")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1012));
    expect(within(dialog).queryByRole("timer")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(/começou|aberta|em andamento/i);
    vi.setSystemTime(closingAt);
    fireEvent(window, new Event("pageshow"));
    expect(within(dialog).getByRole("status")).toHaveTextContent(/encerrad/i);
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar ao portal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("A Indumóveis 2027 foi encerrada.");
  });

  it("continues to count with reduced motion and resynchronizes the presentation on tab return", () => {
    const defaultMatchMedia = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      ...defaultMatchMedia(query),
      matches: query === "(prefers-reduced-motion: reduce)",
    }));

    vi.setSystemTime(openingAt - 41_000);
    renderCountdown();
    const { dialog } = openPresentation();
    const timer = within(dialog).getByRole("timer");
    act(() => vi.advanceTimersByTime(1012));
    expect(within(timer).getByText("40")).toBeInTheDocument();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(dialog).toHaveAttribute("data-hidden", "true");
    act(() => vi.advanceTimersByTime(10_000));
    expect(within(timer).getByText("40")).toBeInTheDocument();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(dialog).not.toHaveAttribute("data-hidden", "true");
    expect(within(timer).getByText("30")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
  });
});

describe("browser fullscreen integration", () => {
  let fullscreenElement: Element | null;
  function setFullscreenElement(element: Element | null) {
    fullscreenElement = element;
    document.dispatchEvent(new Event("fullscreenchange"));
  }
  const requestFullscreen = vi.fn(function (this: Element) {
    return Promise.resolve().then(() => setFullscreenElement(this));
  });
  const exitFullscreen = vi.fn(() => Promise.resolve().then(() => setFullscreenElement(null)));

  beforeEach(() => {
    vi.setSystemTime(openingAt - 41_000);
    fullscreenElement = null;
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperties(document, {
      fullscreenEnabled: { configurable: true, value: true },
      fullscreenElement: { configurable: true, get: () => fullscreenElement },
      exitFullscreen: { configurable: true, value: exitFullscreen },
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "requestFullscreen");
    Reflect.deleteProperty(document, "fullscreenEnabled");
    Reflect.deleteProperty(document, "fullscreenElement");
    Reflect.deleteProperty(document, "exitFullscreen");
    requestFullscreen.mockClear();
    exitFullscreen.mockClear();
  });

  it("requests fullscreen on the dialog and returns to the opener after the browser exits", async () => {
    renderCountdown();
    const { trigger, dialog } = openPresentation();
    expect(requestFullscreen).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(document.fullscreenElement).toBe(dialog);
    await act(async () => setFullscreenElement(null));
    await act(() => vi.advanceTimersByTimeAsync(32));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("exits native fullscreen from the presentation's own return button", async () => {
    renderCountdown();
    const { trigger, dialog } = openPresentation();
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar ao portal" }));
    await act(() => vi.advanceTimersByTimeAsync(32));
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(document.fullscreenElement).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the dialog usable when the browser refuses fullscreen", async () => {
    requestFullscreen.mockRejectedValueOnce(new Error("Fullscreen denied"));
    renderCountdown();
    const { dialog } = openPresentation();
    await act(() => vi.advanceTimersByTimeAsync(1012));
    expect(document.fullscreenElement).toBeNull();
    const timer = within(dialog).getByRole("timer");
    expect(within(timer).getByText("40")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar ao portal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});
