/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately generic query builder double. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  queries: [] as any[],
  calls: [] as any[],
  editionId: "active-edition",
  revisionId: "revision-13",
  commercialRead: true,
  mapRead: true,
  response: null as any,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: any) => {
    state.queries.push(options);
    const name = options.queryKey[1];
    if (name === "edition") return { data: { id: state.editionId } };
    if (name === "me")
      return {
        data: {
          id: "profile-1",
          roles: state.commercialRead ? ["admin"] : ["consulta"],
          perms: {
            mapa: { read: state.mapRead },
            comercial: { read: state.commercialRead },
            empresas: { read: false },
          },
        },
      };
    if (name === "pavilion-interior-current")
      return { data: { id: state.revisionId, revision: 1 }, refetch: vi.fn() };
    return { refetch: vi.fn() };
  },
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "then"
          ? (resolve: any) => resolve({ data: state.response, error: null })
          : (...args: any[]) => {
              state.calls.push([key, ...args]);
              return chain;
            },
    },
  );
  return { supabase: chain };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { usePavilionInteriorCommercial, usePavilionInteriorPlan } from "./api";

beforeEach(() => {
  state.queries = [];
  state.calls = [];
  state.editionId = "active-edition";
  state.revisionId = "revision-13";
  state.mapRead = state.commercialRead = true;
  state.response = null;
});
const payloadQuery = () =>
  [...state.queries].reverse().find((q) => q.queryKey[1] === "pavilion-interior");

describe("pavilion data isolation", () => {
  it("keeps P1 defaults and separates P13 payload and current-revision caches", async () => {
    usePavilionInteriorPlan();
    const p1 = payloadQuery();
    const p1Current = [...state.queries]
      .reverse()
      .find((q) => q.queryKey[1] === "pavilion-interior-current");
    usePavilionInteriorPlan(true, 13);
    const p13 = payloadQuery();
    const p13Current = [...state.queries]
      .reverse()
      .find((q) => q.queryKey[1] === "pavilion-interior-current");
    expect(p13.queryKey).not.toEqual(p1.queryKey);
    expect(p13Current.queryKey).not.toEqual(p1Current.queryKey);
    await p1.queryFn({ signal: undefined });
    await p13.queryFn({ signal: undefined });
    expect(state.calls.filter(([method]) => method === "rpc")).toEqual([
      [
        "rpc",
        "get_pavilion_interior",
        { p_edition_id: "active-edition", p_pavilion_number: 1, p_revision: 1 },
      ],
      [
        "rpc",
        "get_pavilion_interior",
        { p_edition_id: "active-edition", p_pavilion_number: 13, p_revision: 1 },
      ],
    ]);
  });

  it.each([
    { editionId: "other-edition", revisionId: "revision-13", pavilionNumber: 13 },
    { editionId: "active-edition", revisionId: "other-revision", pavilionNumber: 13 },
    { editionId: "active-edition", revisionId: "revision-13", pavilionNumber: 1 },
  ])("rejects a payload from another edition, revision or pavilion", async (response) => {
    usePavilionInteriorPlan(true, 13);
    state.response = response;
    await expect(payloadQuery().queryFn({ signal: undefined })).rejects.toThrow(
      "A planta não pertence",
    );
  });

  it("scopes commercial data to the pavilion and never enables it for map-only users", async () => {
    usePavilionInteriorCommercial("p13-plan", 1, true, 13);
    const q13 = state.queries.at(-1);
    expect(q13.enabled).toBe(true);
    await q13.queryFn({ signal: undefined });
    expect(state.calls).toContainEqual([
      "rpc",
      "get_pavilion_interior_commercial",
      {
        p_edition_id: "active-edition",
        p_floor_plan_id: "p13-plan",
        p_revision: 1,
        p_pavilion_number: 13,
      },
    ]);
    usePavilionInteriorCommercial("p13-plan", 1);
    expect(state.queries.at(-1).queryKey).not.toEqual(q13.queryKey);
    state.commercialRead = false;
    usePavilionInteriorCommercial("p13-plan", 1, true, 13);
    expect(state.queries.at(-1).enabled).toBe(false);
    state.mapRead = false;
    usePavilionInteriorPlan(true, 13);
    expect(payloadQuery().enabled).toBe(false);
  });
});
