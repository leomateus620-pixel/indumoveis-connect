import { describe, expect, it } from "vitest";
import { agendaTemporalState, type AgendaTemporalState } from "./agenda-presentation";

describe("agendaTemporalState", () => {
  it.each<{
    label: string;
    today: string;
    date: string | null;
    endDate: string | null;
    expected: AgendaTemporalState;
  }>([
    {
      label: "an undated activity",
      today: "2026-10-27",
      date: null,
      endDate: null,
      expected: "unscheduled",
    },
    {
      label: "an undated activity with only an end date",
      today: "2026-10-27",
      date: null,
      endDate: "2026-10-28",
      expected: "unscheduled",
    },
    {
      label: "a single day today",
      today: "2026-10-27",
      date: "2026-10-27",
      endDate: null,
      expected: "today",
    },
    {
      label: "a multi-day activity beginning today",
      today: "2026-10-27",
      date: "2026-10-27",
      endDate: "2026-10-30",
      expected: "today",
    },
    {
      label: "a multi-day activity spanning today",
      today: "2026-10-27",
      date: "2026-10-26",
      endDate: "2026-10-30",
      expected: "ongoing",
    },
    {
      label: "a multi-day activity ending today",
      today: "2026-10-27",
      date: "2026-10-26",
      endDate: "2026-10-27",
      expected: "ongoing",
    },
    {
      label: "a multi-day activity ending yesterday",
      today: "2026-10-27",
      date: "2026-10-24",
      endDate: "2026-10-26",
      expected: "past",
    },
    {
      label: "a past activity without an end date",
      today: "2026-10-27",
      date: "2026-10-26",
      endDate: null,
      expected: "past",
    },
    {
      label: "an activity beginning tomorrow",
      today: "2026-10-27",
      date: "2026-10-28",
      endDate: "2026-10-30",
      expected: "tomorrow",
    },
    {
      label: "a later future activity",
      today: "2026-10-27",
      date: "2026-10-29",
      endDate: null,
      expected: "future",
    },
    {
      label: "tomorrow across a month boundary",
      today: "2026-10-31",
      date: "2026-11-01",
      endDate: null,
      expected: "tomorrow",
    },
    {
      label: "tomorrow across a year boundary",
      today: "2026-12-31",
      date: "2027-01-01",
      endDate: null,
      expected: "tomorrow",
    },
    {
      label: "an interval spanning a year boundary",
      today: "2027-01-01",
      date: "2026-12-30",
      endDate: "2027-01-02",
      expected: "ongoing",
    },
    {
      label: "tomorrow on leap day",
      today: "2028-02-28",
      date: "2028-02-29",
      endDate: null,
      expected: "tomorrow",
    },
    {
      label: "tomorrow after leap day",
      today: "2028-02-29",
      date: "2028-03-01",
      endDate: null,
      expected: "tomorrow",
    },
    {
      label: "tomorrow at a historical São Paulo DST change",
      today: "2018-11-03",
      date: "2018-11-04",
      endDate: null,
      expected: "tomorrow",
    },
  ])("classifies $label", ({ today, date, endDate, expected }) => {
    expect(agendaTemporalState({ date, endDate }, today)).toBe(expected);
  });

  it.each(["aberta", "concluida", "cancelada"])(
    "does not replace the persisted %s status with its temporal state",
    (status) => {
      const item = { date: "2026-10-27", endDate: "2026-10-28", status };
      expect(agendaTemporalState(item, "2026-10-27")).toBe("today");
      expect(item.status).toBe(status);
    },
  );
});
