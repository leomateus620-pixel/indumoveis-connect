import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function renderCountdown() {
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
