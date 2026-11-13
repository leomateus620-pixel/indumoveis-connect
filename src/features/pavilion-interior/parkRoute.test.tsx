import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Route } from "@/routes/_authenticated/_app/mapa";
import { pavilionDestinationHref } from "./connections";
import { saveParkReturn } from "./parkReturn";

const state = vi.hoisted(() => ({
  navigate: vi.fn<(options: unknown) => Promise<void>>(() => Promise.resolve()),
  search: {
    pavilhao: "13",
    status: "disponivel",
    space: "previous-external-space",
    deal: "existing-deal",
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => state.search }),
  useNavigate: () => state.navigate,
}));
vi.mock("@/lib/api", () => ({
  useCan: () => ({ read: true }),
  useEditionId: () => "active-edition",
  useCommercialLots: () => ({ isError: false, isLoading: false, data: [] }),
  useCommercialOverview: () => ({ data: undefined }),
  useMapDealSpaces: () => ({ isError: false, data: undefined }),
}));
vi.mock("@/features/commercial-map/commercial", () => ({
  resolvePersistedMapLots: () => ({
    statuses: {},
    filteredGeometryIds: [],
    highlightedGeometryIds: [],
    selectedGeometryId: undefined,
  }),
}));
vi.mock("@/components/app/ui", () => ({ Restricted: () => <p>Acesso restrito</p> }));
vi.mock("@/features/commercial-map/CommercialMapWorkspace", () => ({
  CommercialMapWorkspace: ({
    onOpenInterior,
    initialPavilionNumber,
    restorePark,
  }: {
    onOpenInterior: (pavilion: 1 | 8 | 12 | 13) => void;
    initialPavilionNumber?: number;
    restorePark: boolean;
  }) => (
    <>
      <output aria-label="Pavilhão enquadrado" data-restore-park={restorePark}>
        {initialPavilionNumber}
      </output>
      <button onClick={() => onOpenInterior(1)}>Abrir Pavilhão 1</button>
      <button onClick={() => onOpenInterior(8)}>Abrir Pavilhão 8</button>
      <button onClick={() => onOpenInterior(12)}>Abrir Pavilhão 12</button>
      <button onClick={() => onOpenInterior(13)}>Abrir Pavilhão 13</button>
    </>
  ),
}));
const MapPage = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  state.navigate.mockImplementation(() => Promise.resolve());
  sessionStorage.clear();
});
afterEach(cleanup);

describe("park destinations of the lateral connections", () => {
  it.each([3] as const)("accepts a connection URL and focuses Pavilhão %s", (destination) => {
    const url = new URL(pavilionDestinationHref(destination), "https://indumoveis.example");
    const rawSearch = Object.fromEntries(url.searchParams);
    const validate = Route.options.validateSearch as (search: Record<string, unknown>) => {
      pavilhao?: string;
    };
    const search = validate(rawSearch);
    expect(search.pavilhao).toBe(String(destination));

    saveParkReturn({
      editionId: "active-edition",
      selectionId: "indumoveis:pavilion:13",
      camera: { kind: "2d", x: 40, y: 52, width: 16, height: 19 },
      view: "top",
      orientationFree: false,
      search: state.search,
    });
    state.search.pavilhao = search.pavilhao!;
    render(<MapPage />);
    const target = screen.getByLabelText("Pavilhão enquadrado");
    expect(target).toHaveTextContent(String(destination));
    expect(target).toHaveAttribute("data-restore-park", "false");
  });
});

describe("park history before opening another pavilion", () => {
  it.each([
    { previous: "13", next: 1 },
    { previous: "1", next: 13 },
    { previous: "13", next: 8 },
    { previous: "8", next: 12 },
  ] as const)(
    "replaces the stale P$previous park context with P$next before pushing its interior",
    async ({ previous, next }) => {
      state.search.pavilhao = previous;
      render(<MapPage />);
      fireEvent.click(screen.getByRole("button", { name: `Abrir Pavilhão ${next}` }));
      await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(2));
      const [replace, enter] = state.navigate.mock.calls.map((call) => call[0]) as unknown as [
        {
          to: string;
          replace: boolean;
          search: (current: typeof state.search) => typeof state.search;
        },
        { to: string; replace?: boolean },
      ];
      expect(replace.to).toBe(".");
      expect(replace.replace).toBe(true);
      expect(replace.search(state.search)).toEqual({ ...state.search, pavilhao: String(next) });
      expect(enter).toEqual({ to: `/mapa/pavilhoes/${next}/interior` });
      expect(enter.replace).toBeUndefined();
    },
  );

  it("waits for the park history replacement before pushing the interior route", async () => {
    let finishReplacement!: () => void;
    state.navigate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishReplacement = resolve;
        }),
    );
    render(<MapPage />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir Pavilhão 13" }));
    expect(state.navigate).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishReplacement();
    });
    expect(state.navigate).toHaveBeenCalledTimes(2);
  });
});
