import { describe, expect, it } from "vitest";
import type { MapCommercialSpace } from "@/lib/api";
import { resolveMapCommercialLinks, type MapSpaceAssociation } from "./commercial";

const spaces: MapCommercialSpace[] = [
  { id: "uuid-09", edition_id: "edition-a", sector: "externo", commercial_status: "reservado" },
  { id: "uuid-10", edition_id: "edition-a", sector: "externo", commercial_status: "reservado" },
  {
    id: "uuid-09-interno",
    edition_id: "edition-a",
    sector: "pavilhao-8",
    commercial_status: "vendido",
  },
  {
    id: "uuid-outro-ano",
    edition_id: "edition-b",
    sector: "externo",
    commercial_status: "disponivel",
  },
];
const associations: MapSpaceAssociation[] = [
  { editionId: "edition-a", sector: "externo", spaceId: "uuid-09", geometryId: "externo-09-10" },
  { editionId: "edition-a", sector: "externo", spaceId: "uuid-10", geometryId: "externo-09-10" },
  { editionId: "edition-a", sector: "pavilhao-8", spaceId: "uuid-09-interno", geometryId: "p8-09" },
  {
    editionId: "edition-b",
    sector: "externo",
    spaceId: "uuid-outro-ano",
    geometryId: "externo-09-10",
  },
];
const input = {
  editionId: "edition-a",
  spaces,
  associations,
  geometryIds: ["externo-09-10", "p8-09", "externo-11"],
};

describe("commercial territory associations", () => {
  it("never interprets a UUID or an unassociated code as a lot number", () => {
    const resolution = resolveMapCommercialLinks({
      ...input,
      associations: [],
      search: { space: "09" },
    });
    expect(resolution.selectedGeometryId).toBeUndefined();
    expect(resolution.statuses).toEqual({});
    expect(resolution.warning).toContain("associação territorial");
  });

  it("resolves repeated numbers by explicit sector/edition and a grouped envelope once", () => {
    const resolution = resolveMapCommercialLinks({
      ...input,
      search: { space: "uuid-09-interno", deal: "deal-a" },
      deal: {
        id: "deal-a",
        edition_id: "edition-a",
        deal_spaces: [{ space_id: "uuid-09" }, { space_id: "uuid-10" }],
      },
    });
    expect(resolution.selectedGeometryId).toBe("p8-09");
    expect(resolution.highlightedGeometryIds).toEqual(["externo-09-10"]);
    expect(resolution.statuses).toEqual({ "externo-09-10": "reservado", "p8-09": "vendido" });
  });

  it("does not use mappings from a different edition or with a different sector", () => {
    const resolution = resolveMapCommercialLinks({
      ...input,
      associations: associations.map((mapping) => ({ ...mapping, sector: "incorrect" })),
      search: { space: "uuid-outro-ano" },
    });
    expect(resolution.selectedGeometryId).toBeUndefined();
    expect(resolution.statuses).toEqual({});
  });

  it("rejects ambiguous associations and unknown target geometry", () => {
    const resolution = resolveMapCommercialLinks({
      ...input,
      associations: [
        ...associations,
        { ...associations[0], geometryId: "p8-09" },
        { ...associations[1], geometryId: "missing" },
      ],
      search: { space: "uuid-09" },
    });
    expect(resolution.selectedGeometryId).toBeUndefined();
    expect(resolution.statuses["missing"]).toBeUndefined();
  });

  it("keeps a grouped envelope unconfirmed when constituent states differ", () => {
    const resolution = resolveMapCommercialLinks({
      ...input,
      spaces: spaces.map((space) =>
        space.id === "uuid-10" ? { ...space, commercial_status: "vendido" } : space,
      ),
    });
    expect(resolution.statuses["externo-09-10"]).toBeUndefined();
  });

  it("does not retain deal data from an old response or a different edition", () => {
    const resolution = resolveMapCommercialLinks({
      ...input,
      search: { deal: "new-deal" },
      deal: { id: "old-deal", edition_id: "edition-a", deal_spaces: [{ space_id: "uuid-09" }] },
    });
    expect(resolution.highlightedGeometryIds).toEqual([]);
    expect(resolution.warning).toContain("negociação");
  });

  it("applies status links only to confirmed mappings and warns about unknown areas", () => {
    const resolution = resolveMapCommercialLinks({ ...input, search: { status: "reservado" } });
    expect(resolution.filteredGeometryIds).toEqual(["externo-09-10"]);
    expect(resolution.warning).toContain("sem situação confirmada");
    const empty = resolveMapCommercialLinks({
      ...input,
      associations: [],
      search: { status: "disponivel" },
    });
    expect(empty.filteredGeometryIds).toBeUndefined();
    expect(empty.statuses).toEqual({});
  });
});
