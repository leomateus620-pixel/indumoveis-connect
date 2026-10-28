/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately generic query-builder test double. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  queries: [] as any[],
  calls: [] as any[],
  permitted: true,
  rows: [] as any[],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: any) => {
    state.queries.push(options);
    return options.queryKey[1] === "me"
      ? {
          data: {
            perms: Object.fromEntries(
              ["empresas", "comercial", "contratos", "agenda"].map((module) => [
                module,
                { read: state.permitted },
              ]),
            ),
          },
        }
      : { data: undefined };
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
          ? (resolve: any) => resolve({ data: state.rows, error: null })
          : (...args: any[]) => {
              state.calls.push([key, ...args]);
              return chain;
            },
    },
  );
  return { supabase: chain };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import {
  api,
  useCompanyActivities,
  useCompanyCandidates,
  useCompanyContracts,
  useCompanyDeals,
  useCompanyParticipation,
  useEditionCompanies,
  useEntityDocuments,
} from "./api";

beforeEach(() => {
  state.queries = [];
  state.calls = [];
  state.rows = [];
  state.permitted = true;
});
const lastQuery = () => state.queries.at(-1);

describe("company edition data boundaries", () => {
  it("loads only lean global candidate fields when explicitly requested, respecting company read access", async () => {
    useCompanyCandidates();
    expect(lastQuery().enabled).toBe(false);
    expect(state.calls).toEqual([]);
    useCompanyCandidates(true);
    expect(lastQuery().enabled).toBe(true);
    await lastQuery().queryFn({ signal: undefined });
    expect(state.calls).toContainEqual(["from", "companies"]);
    expect(state.calls).toContainEqual(["select", "id,trade_name,legal_name,tax_id,city,state"]);
    expect(state.calls.filter(([name]) => name === "from")).toHaveLength(1);
    state.permitted = false;
    useCompanyCandidates(true);
    expect(lastQuery().enabled).toBe(false);
  });

  it("loads only the summary view for the selected edition", async () => {
    state.rows = [{ id: "company", area_labels: ["Área Externa"] }];
    useEditionCompanies("historical-edition");
    expect(lastQuery().queryKey).toContain("historical-edition");
    const rows = await lastQuery().queryFn({ signal: undefined });
    expect(rows[0].company_id).toBe("company");
    expect(state.calls).toContainEqual(["from", "company_exhibitors_v"]);
    expect(state.calls).toContainEqual(["eq", "edition_id", "historical-edition"]);
    expect(state.calls.filter(([name]) => name === "from")).toHaveLength(1);
  });

  it("does not enable detail requests for a collapsed card or denied access", () => {
    useCompanyParticipation("company", "2025", false);
    expect(lastQuery().enabled).toBe(false);
    state.permitted = false;
    useCompanyParticipation("company", "2025", true);
    expect(lastQuery().enabled).toBe(false);
    useEditionCompanies("2025");
    expect(lastQuery().enabled).toBe(false);
    expect(state.calls).toEqual([]);
  });

  it("keeps separate cached details across editions and loads through the permission checked RPC", async () => {
    useCompanyParticipation("company", "2025", true);
    const before = lastQuery().queryKey;
    await lastQuery().queryFn({ signal: undefined });
    expect(state.calls).toContainEqual([
      "rpc",
      "get_company_participation",
      { p_company_id: "company", p_edition_id: "2025" },
    ]);
    useCompanyParticipation("company", "2027", true);
    expect(lastQuery().queryKey).not.toEqual(before);
    expect(lastQuery().gcTime).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it.each([useCompanyDeals, useCompanyContracts, useCompanyActivities])(
    "scopes related records by company and edition",
    async (hook) => {
      hook("company", "2025", true);
      await lastQuery().queryFn();
      expect(state.calls).toContainEqual(["eq", "edition_id", "2025"]);
      expect(state.calls).toContainEqual([
        "eq",
        hook === useCompanyActivities ? "related_id" : "company_id",
        "company",
      ]);
      state.permitted = false;
      hook("company", "2027", true);
      expect(lastQuery().enabled).toBe(false);
    },
  );

  it("filters company documents by the requested edition", async () => {
    state.rows = { rows: [] } as any;
    useEntityDocuments("company", "company", "2025");
    await lastQuery().queryFn();
    const args = state.calls.find(([name]) => name === "rpc")[2];
    expect(args).toMatchObject({
      p_scope: "edition",
      p_edition_id: "2025",
      p_entity_id: "company",
    });
  });

  it("uses one atomic RPC for identity, participation and occupations with concurrency tokens", async () => {
    await api.saveCompanyParticipation({
      companyId: "company",
      editionId: "2027",
      company: { city: "Nova cidade" },
      occupations: [],
      expectedCompanyUpdatedAt: "2026-10-28T00:00:00Z",
      expectedParticipationVersion: 2,
      idempotencyKey: "request-key",
    });
    expect(state.calls).toEqual([
      [
        "rpc",
        "save_company_participation",
        {
          p_company_id: "company",
          p_edition_id: "2027",
          p_company: { city: "Nova cidade" },
          p_occupations: [],
          p_expected_company_updated_at: "2026-10-28T00:00:00Z",
          p_expected_participation_version: 2,
          p_idempotency_key: "request-key",
        },
      ],
    ]);
  });
});
