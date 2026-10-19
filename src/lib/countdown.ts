// Contagem para a abertura da edição. Datas da edição são civis (starts_on/ends_on);
// o instante só existe quando o horário oficial (opening_time) está configurado.

export type EditionSchedule = {
  starts_on?: string | null;
  ends_on?: string | null;
  timezone?: string | null;
  opening_time?: string | null;
};

export type OpeningSchedule =
  | { status: "unconfigured" }
  | { status: "invalid" }
  | { status: "configured"; openingAt: number; closingAt: number; timeZone: string };

export type CountdownPhase = "countdown" | "open" | "closed";

export type CountdownSnapshot = {
  phase: CountdownPhase;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?/;
const DAY = 86_400;

function parseDate(value: string | null | undefined) {
  const m = value ? DATE_RE.exec(value) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d)
    return null;
  return { y, mo, d };
}

function parseTime(value: string | null | undefined) {
  const m = value ? TIME_RE.exec(value) : null;
  if (!m) return null;
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  return { h, mi, s };
}

function offsetMs(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

/** Instante UTC de uma data/hora civil no fuso informado; null se o fuso for inválido. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): number | null {
  const d = parseDate(date);
  const t = parseTime(time);
  if (!d || !t) return null;
  try {
    const wall = Date.UTC(d.y, d.mo - 1, d.d, t.h, t.mi, t.s);
    let ts = wall - offsetMs(wall, timeZone);
    const corrected = offsetMs(ts, timeZone);
    if (wall - ts !== corrected) ts = wall - corrected;
    return ts;
  } catch {
    return null;
  }
}

function nextCivilDay(date: string) {
  const d = parseDate(date)!;
  return new Date(Date.UTC(d.y, d.mo - 1, d.d + 1)).toISOString().slice(0, 10);
}

export function resolveOpening(edition: EditionSchedule | null | undefined): OpeningSchedule {
  if (!edition?.starts_on || !edition.opening_time) return { status: "unconfigured" };
  const timeZone = edition.timezone || "America/Sao_Paulo";
  const openingAt = zonedTimeToUtc(edition.starts_on, edition.opening_time, timeZone);
  const endDate =
    edition.ends_on && parseDate(edition.ends_on) ? edition.ends_on : edition.starts_on;
  const closingAt = zonedTimeToUtc(nextCivilDay(endDate), "00:00", timeZone);
  if (openingAt === null || closingAt === null || closingAt <= openingAt)
    return { status: "invalid" };
  return { status: "configured", openingAt, closingAt, timeZone };
}

export function countdownAt(now: number, openingAt: number, closingAt: number): CountdownSnapshot {
  if (now >= closingAt) return { phase: "closed", days: 0, hours: 0, minutes: 0, seconds: 0 };
  if (now >= openingAt) return { phase: "open", days: 0, hours: 0, minutes: 0, seconds: 0 };
  // Arredonda para cima: o visor chega a 00:00:00 exatamente no instante de abertura.
  const total = Math.ceil((openingAt - now) / 1000);
  return {
    phase: "countdown",
    days: Math.floor(total / DAY),
    hours: Math.floor((total % DAY) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Espera até a próxima virada de segundo do relógio, sem acumular desvio. */
export function nextTickDelay(now: number) {
  return 1000 - (((now % 1000) + 1000) % 1000) + 12;
}

export function formatOpeningLabel(openingAt: number, timeZone: string) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(openingAt);
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(openingAt);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${date}, às ${hour}h${minute === "00" ? "" : minute}`;
}

export function timeZoneLabel(timeZone: string, at: number) {
  try {
    const name = new Intl.DateTimeFormat("pt-BR", { timeZone, timeZoneName: "long" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return name ?? timeZone;
  } catch {
    return timeZone;
  }
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "14 a 23 de maio de 2027" a partir das datas civis da edição. */
export function formatEditionPeriod(startsOn?: string | null, endsOn?: string | null) {
  const s = parseDate(startsOn);
  if (!s) return null;
  const e = parseDate(endsOn);
  const full = (x: { y: number; mo: number; d: number }) =>
    `${x.d} de ${MONTHS[x.mo - 1]} de ${x.y}`;
  if (!e || (e.y === s.y && e.mo === s.mo && e.d === s.d)) return full(s);
  if (e.y === s.y && e.mo === s.mo) return `${s.d} a ${full(e)}`;
  if (e.y === s.y) return `${s.d} de ${MONTHS[s.mo - 1]} a ${full(e)}`;
  return `${full(s)} a ${full(e)}`;
}

export function pad2(value: number) {
  return String(value).padStart(2, "0");
}
