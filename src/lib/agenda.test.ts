import { describe, expect, it } from "vitest";
import {
  agendaMetrics,
  dateKeyInZone,
  daysForItem,
  filterAgendaItems,
  groupAgendaItemsAcrossDays,
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
      [
        item({ date: "2027-05-01", endDate: "2027-05-01" }),
        item({ key: "b", date: null, endDate: null }),
      ],
      "2027-05-10",
    );
    expect(metrics.overdue).toBe(1);
    expect(metrics.unscheduled).toBe(1);
  });

  it("considera a data final de eventos de vários dias ao contabilizar atraso", () => {
    const rows = [
      item({ key: "em-curso", date: "2027-05-01", endDate: "2027-05-10" }),
      item({ key: "vencido", date: "2027-04-30", endDate: "2027-05-01" }),
      item({
        key: "concluido",
        date: "2027-05-01",
        endDate: "2027-05-01",
        status: "concluida",
      }),
      item({
        key: "cancelado",
        date: "2027-05-01",
        endDate: "2027-05-01",
        status: "cancelada",
      }),
    ];
    // O evento ainda está em curso no próprio dia de encerramento.
    expect(agendaMetrics(rows, "2027-05-10").overdue).toBe(1);
    expect(agendaMetrics(rows, "2027-05-11").overdue).toBe(2);
  });

  it("combina todos os critérios e mantém o mesmo evento entre meses e apresentações", () => {
    const matching = item({
      key: "montagem",
      title: "Montagem dos estandes",
      searchable: "montagem dos estandes pavilhão principal operação",
      date: "2027-05-31",
      endDate: "2027-06-02",
      startAt: "2027-05-31T12:00:00Z",
      endAt: "2027-06-02T20:00:00Z",
    });
    const rows = [
      matching,
      { ...matching, key: "outra-categoria", categoryId: "c2" },
      { ...matching, key: "outra-comissao", commissionIds: ["m2"] },
      { ...matching, key: "outra-pessoa", assigneeIds: ["p2"] },
      { ...matching, key: "concluido", status: "concluida" },
      { ...matching, key: "outro-local", searchable: "montagem recepção" },
    ];
    const criteria = {
      query: " PAVILHÃO ",
      status: "aberta",
      category: "c1",
      commission: "m1",
      assignee: "p1",
    };
    const may = filterAgendaItems(rows, { ...criteria, month: "2027-05" });
    const june = filterAgendaItems(rows, { ...criteria, month: "2027-06" });
    expect(may).toEqual([matching]);
    expect(june).toEqual([matching]);
    expect(may[0]).toBe(june[0]);
    expect(filterAgendaItems(rows, { ...criteria, month: "2027-07" })).toEqual([]);

    // O calendário distribui referências por dia; timeline e painel continuam
    // recebendo o único registro original, com programação e duração intactas.
    const calendar = groupAgendaItemsAcrossDays(june);
    expect(Object.keys(calendar)).toEqual(["2027-05-31", "2027-06-01", "2027-06-02"]);
    for (const events of Object.values(calendar)) {
      expect(events).toHaveLength(1);
      expect(events[0]).toBe(matching);
    }
    expect(june).toHaveLength(1);
    expect(june[0]).toMatchObject({
      date: "2027-05-31",
      endDate: "2027-06-02",
      startAt: "2027-05-31T12:00:00Z",
      endAt: "2027-06-02T20:00:00Z",
    });
    expect(agendaMetrics(june, "2027-06-01").open).toBe(1);
  });

  it("preserva itens sem data no recorte filtrado sem criar dias artificiais", () => {
    const unscheduled = item({
      key: "sem-data",
      date: null,
      endDate: null,
      startAt: null,
      endAt: null,
    });
    const filtered = filterAgendaItems([unscheduled], {
      month: "2027-06",
      query: "Reunião",
      category: "c1",
      commission: "m1",
      assignee: "p1",
    });
    expect(filtered).toEqual([unscheduled]);
    expect(groupAgendaItemsAcrossDays(filtered)).toEqual({});
    expect(agendaMetrics(filtered, "2027-06-01")).toMatchObject({
      open: 1,
      unscheduled: 1,
      overdue: 0,
    });
  });
});
