import { cn } from "@/lib/utils";

type AgendaClockProps = {
  /** Mesmo horário HH:mm exibido ao lado, já convertido para o fuso da edição. */
  time?: string | null;
  className?: string;
};

/** Relógio decorativo: a informação acessível permanece no horário em HTML. */
export function AgendaClock({ time, className }: AgendaClockProps) {
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hour, minute] = time.split(":").map(Number);
  const hourAngle = (hour % 12) * 30 + minute * 0.5;
  const minuteAngle = minute * 6;

  return (
    <svg
      className={cn("agenda-clock", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9.25" />
      <path
        className="agenda-clock-ticks"
        d="M12 4.25v1M19.75 12h-1M12 19.75v-1M4.25 12h1"
        strokeWidth="1.15"
        opacity="0.55"
      />
      <line
        className="agenda-clock-hour"
        x1="12"
        y1="12"
        x2="12"
        y2="7.5"
        strokeWidth="1.9"
        transform={`rotate(${hourAngle} 12 12)`}
      />
      <line
        className="agenda-clock-minute"
        x1="12"
        y1="12"
        x2="12"
        y2="5.75"
        transform={`rotate(${minuteAngle} 12 12)`}
      />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
