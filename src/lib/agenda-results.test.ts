import { describe, expect, it } from "vitest";
import { agendaMetrics, buildAgendaItems, filterAgendaItems } from "./agenda";

const activity = {
  id: "multi-day",
  title: "Montagem dos estandes",
  start_at: "2026-10-26T08:00:00-03:00",
  end_at: "2026-10-29T18:00:00-03:00",
  all_day: false,
  status: "aberta",
  category_id: "infrastructure",
  activity_categories: { name: "Infraestrutura" },
  activity_assignees: [
    { profile_id: "person-1", is_primary: false, profiles: { full_name: "Ana Silva" } },
  ],
  activity_commissions: [{ commission_id: "operations", commissions: { name: "Operação" } }],
};

describe("Agenda result consistency", () => {
  it("considers a multi-day event overdue only after its last civil day", () => {
    const rows = buildAgendaItems({
      activities: [activity],
      inspections: [],
      installments: [],
      timeZone: "America/Sao_Paulo",
    });
    expect(agendaMetrics(rows, "2026-10-27").overdue).toBe(0);
    expect(agendaMetrics(rows, "2026-10-29").overdue).toBe(0);
    expect(agendaMetrics(rows, "2026-10-30").overdue).toBe(1);
  });

  it("combines search and catalog criteria with direct additional assignment without duplicating a multi-day event", () => {
    const rows = buildAgendaItems({
      activities: [
        activity,
        { ...activity, id: "another-person", activity_assignees: [{ profile_id: "person-2" }] },
        { ...activity, id: "another-commission", activity_commissions: [] },
      ],
      inspections: [
        { id: "inspection-1", kind: "entrega", scheduled_for: "2026-10-27", status: "agendada" },
      ],
      installments: [{ id: "installment-1", number: 1, due_date: "2026-10-27", status: "aberta" }],
      timeZone: "America/Sao_Paulo",
    });
    const filtered = filterAgendaItems(rows, {
      month: "2026-10",
      query: "MONTAGEM",
      status: "minhas",
      assignee: "person-1",
      category: "infrastructure",
      commission: "operations",
    });
    expect(filtered.map((item) => item.key)).toEqual(["multi-day"]);
    expect(filtered[0].endDate).toBe("2026-10-29");
  });
});
