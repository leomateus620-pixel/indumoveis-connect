import type { AgendaItem } from "./agenda";

export type AgendaTemporalState =
  "today" | "tomorrow" | "ongoing" | "past" | "future" | "unscheduled";

/**
 * Uses the edition's civil date keys, independently of the activity's status.
 * The caller can combine this state with completed/cancelled presentation.
 */
export function agendaTemporalState(
  item: Pick<AgendaItem, "date" | "endDate">,
  today: string,
): AgendaTemporalState {
  if (!item.date) return "unscheduled";

  const end = item.endDate ?? item.date;
  if (item.date < today && end >= today) return "ongoing";
  if (item.date === today) return "today";

  // UTC arithmetic advances a civil day across month/year and DST boundaries.
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (item.date === tomorrow.toISOString().slice(0, 10)) return "tomorrow";

  if (end < today) return "past";
  return "future";
}
