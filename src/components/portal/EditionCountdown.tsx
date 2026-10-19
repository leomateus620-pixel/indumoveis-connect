import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, CalendarClock, CalendarDays, RotateCw } from "lucide-react";
import type { Edition } from "@/lib/api";
import {
  countdownAt,
  formatEditionPeriod,
  formatOpeningLabel,
  nextTickDelay,
  pad2,
  resolveOpening,
  timeZoneLabel,
  type CountdownSnapshot,
} from "@/lib/countdown";

const MAX_TIMEOUT = 2_147_000_000;

/** Relógio local: recalcula a partir de Date.now() a cada virada de segundo, pausa em abas ocultas. */
function useEditionClock(openingAt?: number, closingAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (openingAt === undefined || closingAt === undefined) return;
    let timer: number | undefined;
    const sync = () => {
      window.clearTimeout(timer);
      const t = Date.now();
      setNow(t);
      if (document.visibilityState === "hidden") return;
      const phase = countdownAt(t, openingAt, closingAt).phase;
      if (phase === "countdown") timer = window.setTimeout(sync, nextTickDelay(t));
      else if (phase === "open")
        timer = window.setTimeout(sync, Math.min(MAX_TIMEOUT, closingAt - t + 12));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [openingAt, closingAt]);
  // Antes do primeiro tique após a edição chegar, o estado ainda guarda o instante de montagem.
  return openingAt === undefined ? now : Math.max(now, Date.now());
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function Units({ snapshot }: { snapshot: CountdownSnapshot }) {
  const units = [
    { label: "Dias", value: pad2(snapshot.days) },
    { label: "Horas", value: pad2(snapshot.hours) },
    { label: "Min", value: pad2(snapshot.minutes) },
    { label: "Seg", value: pad2(snapshot.seconds) },
  ];
  return (
    <div role="timer" aria-label="Tempo restante para a abertura">
      {/* Texto por minuto para leitores de tela; os segundos não são anunciados. */}
      <p className="sr-only">
        Faltam {plural(snapshot.days, "dia", "dias")}, {plural(snapshot.hours, "hora", "horas")} e{" "}
        {plural(snapshot.minutes, "minuto", "minutos")} para a abertura.
      </p>
      <div className="portal-count__units" aria-hidden="true">
        {units.map((u) => (
          <div key={u.label} className="portal-count__unit">
            <span className="portal-count__value">{u.value}</span>
            <span className="portal-count__label">{u.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Status({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="portal-count__status" role="status">
      <span className="portal-count__status-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="portal-count__status-title">{title}</p>
        {text && <p className="portal-count__status-text">{text}</p>}
        {children}
      </div>
    </div>
  );
}

function Frame({
  title,
  meta,
  children,
  busy,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <section
      className="portal-count"
      aria-labelledby="portal-count-title"
      aria-busy={busy || undefined}
    >
      <div>
        <p className="portal-count__eyebrow">Contagem regressiva</p>
        <h2 id="portal-count-title" className="portal-count__title">
          {title}
        </h2>
        {meta && <p className="portal-count__meta">{meta}</p>}
      </div>
      {children}
    </section>
  );
}

type Props = {
  edition: Edition | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canConfigure: boolean;
};

export const EditionCountdown = memo(function EditionCountdown({
  edition,
  isLoading,
  isError,
  onRetry,
  canConfigure,
}: Props) {
  const schedule = useMemo(() => resolveOpening(edition), [edition]);
  const configured = schedule.status === "configured" ? schedule : null;
  const now = useEditionClock(configured?.openingAt, configured?.closingAt);

  if (isLoading)
    return (
      <Frame title={<span className="sr-only">Carregando edição</span>} busy>
        <div className="space-y-2" aria-hidden="true">
          <div className="portal-skeleton h-6 w-2/3" />
          <div className="portal-skeleton h-4 w-1/2" />
          <div className="portal-skeleton mt-3 h-[4.5rem] w-full" />
        </div>
      </Frame>
    );

  if (isError)
    return (
      <Frame title="Edição indisponível">
        <Status
          icon={<CalendarClock />}
          title="Não foi possível carregar a edição"
          text="Verifique sua conexão e tente novamente."
        >
          <button type="button" className="portal-count__retry mt-3" onClick={onRetry}>
            <RotateCw className="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" />
            Tentar novamente
          </button>
        </Status>
      </Frame>
    );

  if (!edition)
    return (
      <Frame title="Nenhuma edição configurada">
        <Status icon={<CalendarClock />} title="Data de abertura a confirmar" />
      </Frame>
    );

  const period = formatEditionPeriod(edition.starts_on, edition.ends_on);
  const periodMeta = period && (
    <>
      <CalendarDays aria-hidden="true" />
      <span>
        Período da edição: <strong>{period}</strong>
      </span>
    </>
  );

  if (!configured)
    return (
      <Frame title={edition.name} meta={periodMeta}>
        <Status
          icon={<CalendarClock />}
          title="Data de abertura a confirmar"
          text={
            schedule.status === "invalid" && canConfigure
              ? "O horário configurado não pôde ser interpretado."
              : "A contagem começa assim que o horário oficial for definido."
          }
        >
          {canConfigure && (
            <Link to="/admin" search={{ aba: "edicao" }} className="portal-count__config mt-1">
              Definir horário oficial
            </Link>
          )}
        </Status>
      </Frame>
    );

  const snapshot = countdownAt(now, configured.openingAt, configured.closingAt);

  if (snapshot.phase === "open")
    return (
      <Frame title={edition.name} meta={periodMeta}>
        <Status
          icon={<CalendarCheck />}
          title="Feira em andamento"
          text="A edição está oficialmente aberta."
        />
      </Frame>
    );

  if (snapshot.phase === "closed")
    return (
      <Frame title={edition.name} meta={periodMeta}>
        <Status icon={<CalendarCheck />} title="Edição encerrada" />
      </Frame>
    );

  return (
    <Frame
      title={edition.name}
      meta={
        <>
          <CalendarDays aria-hidden="true" />
          <span>
            Abertura em{" "}
            <strong>{formatOpeningLabel(configured.openingAt, configured.timeZone)}</strong>
            <span className="text-[0.8125rem]">
              {" "}
              · {timeZoneLabel(configured.timeZone, configured.openingAt)}
            </span>
          </span>
        </>
      }
    >
      <Units snapshot={snapshot} />
    </Frame>
  );
});
