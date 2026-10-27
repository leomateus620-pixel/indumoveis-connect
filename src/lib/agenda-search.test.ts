import { describe, expect, it } from "vitest";
import {
  activeAgendaCriteria,
  clearedAgendaCriteria,
  validateAgendaSearch,
  type AgendaSearch,
} from "./agenda-search";

describe("Agenda search state", () => {
  it("preserves all supported URL parameters without introducing local defaults", () => {
    const search = Object.fromEntries(
      new URL(
        "https://example.test/agenda?view=calendar&month=2026-10&q=montagem&status=aberta&category=infra&commission=operacao&assignee=p2&activity=a1&day=2026-10-27",
      ).searchParams,
    );
    expect(validateAgendaSearch(search)).toEqual(search);
    expect(activeAgendaCriteria(validateAgendaSearch(search))).toBe(5);
    expect(activeAgendaCriteria(validateAgendaSearch({}))).toBe(0);
  });

  it("rejects malformed navigation values and non-string criteria", () => {
    const search = validateAgendaSearch({
      view: "unknown",
      month: "2026-13",
      day: "2026-10-40",
      q: 123,
      status: null,
      category: ["infra"],
      commission: { id: "operacao" },
      assignee: false,
      activity: 8,
    });
    expect(Object.values(search).every((value) => value === undefined)).toBe(true);
    expect(validateAgendaSearch({ month: "2026-1", day: "2026-1-05" }).month).toBeUndefined();
    for (const day of ["2026-02-29", "2026-04-31", "2026-10-00"])
      expect(validateAgendaSearch({ day }).day).toBeUndefined();
    expect(validateAgendaSearch({ day: "2028-02-29" }).day).toBe("2028-02-29");
    expect(validateAgendaSearch({ status: "inventado" }).status).toBeUndefined();
  });

  it("counts only effective criteria while Minhas atividades overrides an older assignee", () => {
    const search: AgendaSearch = {
      q: "  ",
      status: "minhas",
      category: "infra",
      assignee: "previous-person",
      view: "calendar",
      month: "2026-10",
      activity: "a1",
      day: "2026-10-27",
    };
    expect(activeAgendaCriteria(search)).toBe(2);
    expect(activeAgendaCriteria({ ...search, status: "todas" })).toBe(2);
    expect(activeAgendaCriteria({ ...search, status: "aberta" })).toBe(3);
  });

  it("clears criteria while preserving the current view, month, day and activity", () => {
    const current: AgendaSearch = {
      view: "panel",
      month: "2026-10",
      day: "2026-10-27",
      activity: "a1",
      q: "montagem",
      status: "aberta",
      category: "infra",
      commission: "operacao",
      assignee: "p2",
    };
    const cleared = { ...current, ...clearedAgendaCriteria };
    expect(cleared).toMatchObject({
      view: "panel",
      month: "2026-10",
      day: "2026-10-27",
      activity: "a1",
    });
    expect(activeAgendaCriteria(cleared)).toBe(0);
    expect(cleared.q).toBeUndefined();
    expect(cleared.status).toBeUndefined();
    expect(cleared.category).toBeUndefined();
    expect(cleared.commission).toBeUndefined();
    expect(cleared.assignee).toBeUndefined();
  });
});
