export type AgendaView = "timeline" | "panel" | "calendar";
export type AgendaSearch = {
  view?: AgendaView;
  month?: string;
  q?: string;
  status?: string;
  category?: string;
  commission?: string;
  assignee?: string;
  activity?: string;
  day?: string;
};

export function validateAgendaSearch(search: Record<string, unknown>): AgendaSearch {
  const string = (key: string) =>
    typeof search[key] === "string" ? (search[key] as string) : undefined;
  return {
    view: ["timeline", "panel", "calendar"].includes(String(search.view))
      ? (search.view as AgendaView)
      : undefined,
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(search.month)) ? String(search.month) : undefined,
    q: string("q"),
    status: ["todas", "aberta", "minhas", "concluida", "cancelada"].includes(String(search.status))
      ? string("status")
      : undefined,
    category: string("category"),
    commission: string("commission"),
    assignee: string("assignee"),
    activity: string("activity"),
    day: isCivilDate(search.day) ? search.day : undefined,
  };
}

export function activeAgendaCriteria(search: AgendaSearch) {
  return [
    search.q?.trim(),
    search.status && search.status !== "todas" ? search.status : undefined,
    search.category,
    search.commission,
    search.status !== "minhas" ? search.assignee : undefined,
  ].filter(Boolean).length;
}

/** Clear criteria only: navigation, selected day and open activity retain their context. */
export const clearedAgendaCriteria = {
  q: undefined,
  status: undefined,
  category: undefined,
  commission: undefined,
  assignee: undefined,
};

function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
