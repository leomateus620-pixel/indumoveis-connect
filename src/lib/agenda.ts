/* eslint-disable @typescript-eslint/no-explicit-any */
export const AGENDA_TIME_ZONE = "America/Sao_Paulo";

export type AgendaSource = "activity" | "inspection" | "installment";

export type AgendaItem = {
  key: string;
  source: AgendaSource;
  title: string;
  date: string | null;
  endDate: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  status: string;
  assigneeIds: string[];
  categoryId: string | null;
  commissionIds: string[];
  searchable: string;
  activity?: Record<string, any>;
  link?: { type: string; id: string };
};

const parts = (value: Date | string, timeZone: string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
};

export function dateKeyInZone(value: Date | string, timeZone = AGENDA_TIME_ZONE) {
  const p = parts(value, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localInputInZone(value: string | null | undefined, timeZone = AGENDA_TIME_ZONE) {
  if (!value) return "";
  const p = parts(value, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function timeInZone(value: string | null, timeZone = AGENDA_TIME_ZONE) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function monthKeyInZone(value = new Date(), timeZone = AGENDA_TIME_ZONE) {
  return dateKeyInZone(value, timeZone).slice(0, 7);
}

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0));
  return { start, end: endDate.toISOString().slice(0, 10) };
}

export function daysForItem(item: AgendaItem) {
  if (!item.date) return [];
  const end = item.endDate && item.endDate >= item.date ? item.endDate : item.date;
  const out: string[] = [];
  const cursor = new Date(`${item.date}T12:00:00Z`);
  const finish = new Date(`${end}T12:00:00Z`);
  while (cursor <= finish && out.length < 370) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function buildAgendaItems({
  activities,
  inspections,
  installments,
  timeZone,
}: {
  activities: any[];
  inspections: any[];
  installments: any[];
  timeZone: string;
}): AgendaItem[] {
  return [
    ...activities.map((activity) => {
      const assignees = activity.activity_assignees ?? [];
      const commissions = activity.activity_commissions ?? [];
      const category = activity.activity_categories?.name ?? "";
      const people = assignees.map(
        (row: any) => row.profiles?.full_name || row.profiles?.email || "",
      );
      const commissionNames = commissions.map((row: any) => row.commissions?.name || "");
      return {
        key: activity.id,
        source: "activity" as const,
        title: activity.title,
        date: activity.start_at ? dateKeyInZone(activity.start_at, timeZone) : null,
        endDate: activity.end_at ? dateKeyInZone(activity.end_at, timeZone) : null,
        startAt: activity.start_at,
        endAt: activity.end_at,
        allDay: activity.all_day,
        status: activity.status,
        assigneeIds: assignees.map((row: any) => row.profile_id),
        categoryId: activity.category_id,
        commissionIds: commissions.map((row: any) => row.commission_id),
        searchable: [
          activity.title,
          activity.description,
          activity.location,
          category,
          ...people,
          ...commissionNames,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR"),
        activity,
        link:
          activity.related_type && activity.related_id
            ? { type: activity.related_type, id: activity.related_id }
            : undefined,
      };
    }),
    ...inspections
      .filter((item) => item.scheduled_for)
      .map((item) => ({
        key: `inspection-${item.id}`,
        source: "inspection" as const,
        title: `Vistoria de ${item.kind === "entrega" ? "entrega" : "devolução"} · ${item.spaces?.code ?? "espaço"}`,
        date: item.scheduled_for,
        endDate: item.scheduled_for,
        startAt: null,
        endAt: null,
        allDay: true,
        status: item.status,
        assigneeIds: item.inspector_id ? [item.inspector_id] : [],
        categoryId: null,
        commissionIds: [],
        searchable: `vistoria ${item.kind} ${item.spaces?.code ?? ""}`.toLocaleLowerCase("pt-BR"),
        link: { type: "inspection", id: item.id },
      })),
    ...installments.map((item) => ({
      key: `installment-${item.id}`,
      source: "installment" as const,
      title: `Vencimento ${item.number}ª parcela · ${item.contracts?.companies?.trade_name ?? "Contrato"}`,
      date: item.due_date,
      endDate: item.due_date,
      startAt: null,
      endAt: null,
      allDay: true,
      status: item.status,
      assigneeIds: [],
      categoryId: null,
      commissionIds: [],
      searchable:
        `vencimento parcela ${item.contracts?.companies?.trade_name ?? ""} ${item.contracts?.number ?? ""}`.toLocaleLowerCase(
          "pt-BR",
        ),
      link: { type: "installment", id: item.id },
    })),
  ].sort((a, b) =>
    (a.startAt ?? `${a.date ?? "9999"}T23:59`).localeCompare(
      b.startAt ?? `${b.date ?? "9999"}T23:59`,
    ),
  );
}

export type AgendaFilters = {
  month: string;
  query?: string;
  status?: string;
  category?: string;
  commission?: string;
  assignee?: string;
};

export function filterAgendaItems(items: AgendaItem[], filters: AgendaFilters) {
  const bounds = monthBounds(filters.month);
  const query = filters.query?.trim().toLocaleLowerCase("pt-BR") ?? "";
  return items.filter((item) => {
    if (item.date && ((item.endDate ?? item.date) < bounds.start || item.date > bounds.end))
      return false;
    if (query && !item.searchable.includes(query)) return false;
    if (filters.status && filters.status !== "todas") {
      if (filters.status === "minhas") {
        if (!filters.assignee || !item.assigneeIds.includes(filters.assignee)) return false;
      } else if (item.status !== filters.status) return false;
    }
    if (filters.category && item.categoryId !== filters.category) return false;
    if (filters.commission && !item.commissionIds.includes(filters.commission)) return false;
    if (
      filters.assignee &&
      filters.status !== "minhas" &&
      !item.assigneeIds.includes(filters.assignee)
    )
      return false;
    return true;
  });
}

export function agendaMetrics(items: AgendaItem[], today: string) {
  const activities = items.filter((item) => item.source === "activity");
  const open = activities.filter((item) => item.status === "aberta");
  const completed = activities.filter((item) => item.status === "concluida");
  const denominator = open.length + completed.length;
  return {
    upcoming: open.filter((item) => item.date && item.date >= today).length,
    open: open.length,
    overdue: open.filter((item) => item.date && item.date < today).length,
    completed: completed.length,
    completionRate: denominator ? Math.round((completed.length / denominator) * 100) : 0,
    unscheduled: open.filter((item) => !item.date).length,
  };
}

export function groupAgendaItemsByDate(items: AgendaItem[]) {
  return items.reduce<Record<string, AgendaItem[]>>((groups, item) => {
    if (!item.date) return groups;
    (groups[item.date] ??= []).push(item);
    return groups;
  }, {});
}

export function groupAgendaItemsAcrossDays(items: AgendaItem[]) {
  return items.reduce<Record<string, AgendaItem[]>>((groups, item) => {
    for (const date of daysForItem(item)) (groups[date] ??= []).push(item);
    return groups;
  }, {});
}
