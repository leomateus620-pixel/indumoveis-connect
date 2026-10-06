import { describe, expect, it } from "vitest";
import {
  agendaMetrics,
  dateKeyInZone,
  daysForItem,
  filterAgendaItems,
  type AgendaItem,
} from "./agenda";

const item = (patch: Partial<AgendaItem> = {}): AgendaItem => ({
  key: "a",
  source: "activity",
  title: "Reunião",
  date: "2027-05-14",
  endDate: "2027-05-14",
  startAt: "2027-05-14T12:00:00Z",
  endAt: null,
  allDay: false,
  status: "aberta",
  assigneeIds: ["p1"],
  categoryId: "c1",
  commissionIds: ["m1"],
  searchable: "reunião",
  ...patch,
});

describe("Agenda operacional", () => {
  it("agrupa meia-noite UTC no dia civil de Santa Rosa", () => {
    expect(dateKeyInZone("2027-05-01T00:30:00Z", "America/Sao_Paulo")).toBe("2027-04-30");
  });

  it("expande um intervalo por todos os dias sem duplicar o cadastro", () => {
    expect(daysForItem(item({ date: "2027-05-31", endDate: "2027-06-02" }))).toEqual([
      "2027-05-31",
      "2027-06-01",
      "2027-06-02",
    ]);
  });

  it("Minhas atividades exige atribuição direta", () => {
    const rows = [item(), item({ key: "b", assigneeIds: ["p2"] })];
    expect(
      filterAgendaItems(rows, { month: "2027-05", status: "minhas", assignee: "p1" }).map(
        (x) => x.key,
      ),
    ).toEqual(["a"]);
  });

  it("canceladas não elevam a conclusão", () => {
    const metrics = agendaMetrics(
      [item(), item({ key: "b", status: "concluida" }), item({ key: "c", status: "cancelada" })],
      "2027-05-10",
    );
    expect(metrics.completionRate).toBe(50);
    expect(metrics.completed).toBe(1);
  });

  it("contabiliza atraso e item sem data concretamente", () => {
    const metrics = agendaMetrics(
      [item({ date: "2027-05-01" }), item({ key: "b", date: null })],
      "2027-05-10",
    );
    expect(metrics.overdue).toBe(1);
    expect(metrics.unscheduled).toBe(1);
  });
});
