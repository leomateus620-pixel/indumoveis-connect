import { describe, expect, it } from "vitest";
import { ENTITIES } from "./data/territory";
import { searchEntities } from "./search";

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
});
