import { describe, expect, it } from "vitest";
import { ENTITIES } from "./data/territory";
import { searchEntities, searchLandmarks } from "./search";
import { PERMANENT_PARK_LANDMARKS } from "./permanentParkLayout";

describe("territorial search", () => {
  it("normalizes accents, spaces and leading zeroes without changing group identity", () => {
    const a = searchEntities(ENTITIES, " 09 ").filter((e) => e.kind === "lot");
    const b = searchEntities(ENTITIES, "9").filter((e) => e.kind === "lot");
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(a).toHaveLength(1);
    expect(a[0].numbers).toContain(10);
    expect(searchEntities(ENTITIES, "avenida dos imigrantes").some((e) => e.kind === "road")).toBe(
      true,
    );
    expect(searchEntities(ENTITIES, "pavilhao 1").some((e) => e.kind === "pavilion")).toBe(true);
  });
  it("honors location scope and returns exact members of discontinuous groups", () => {
    const grouped = searchEntities(ENTITIES, "49").find((e) => e.kind === "lot")!;
    expect(searchEntities(ENTITIES, "35", grouped.location).map((e) => e.id)).toContain(grouped.id);
    expect(searchEntities(ENTITIES, "48").find((e) => e.kind === "lot")?.id).not.toBe(grouped.id);
    expect(searchEntities(ENTITIES, "49", "a different location")).toHaveLength(0);
  });
  it("finds permanent structures without treating them as numbered commercial lots", () => {
    expect(searchLandmarks(PERMANENT_PARK_LANDMARKS, "etnia alema").map((item) => item.id)).toEqual(
      ["etnia-alema"],
    );
    expect(searchLandmarks(PERMANENT_PARK_LANDMARKS, "arena")[0]?.id).toBe("arena");
    expect(searchLandmarks(PERMANENT_PARK_LANDMARKS, "3")).toEqual([]);
    expect(searchLandmarks(PERMANENT_PARK_LANDMARKS, "07").map((item) => item.id)).toEqual([
      "pavilhao-7",
    ]);
    for (const number of ["6", "10", "11"])
      expect(searchLandmarks(PERMANENT_PARK_LANDMARKS, number).map((item) => item.id)).toEqual([
        "pavilhoes-6-10-11",
      ]);
    expect(searchLandmarks(PERMANENT_PARK_LANDMARKS, "9")[0]?.id).toBe("pavilhao-9");
    // Commercial lot 7 and contextual pavilion 7 remain separate results.
    expect(searchEntities(ENTITIES, "7").some((entity) => entity.kind === "lot")).toBe(true);
    expect(searchLandmarks(PERMANENT_PARK_LANDMARKS, "arena", "outro setor")).toEqual([]);
    expect(ENTITIES.some((entity) => entity.id === "arena")).toBe(false);
  });
});
