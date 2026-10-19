import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, PartyPopper, RotateCw, Settings2 } from "lucide-react";
import type { Edition } from "@/lib/api";
import {
  countdownAt,
  formatEditionPeriod,
  formatOpeningLabel,
  nextTickDelay,
  pad2,
  resolveOpening,
  timeZoneShortLabel,
  type CountdownSnapshot,
} from "@/lib/countdown";

const MAX_TIMEOUT = 2_147_000_000;

/** Relógio local: recalcula a partir de Date.now() a cada virada de segundo e ressincroniza ao voltar à aba. */
function useEditionClock(openingAt: number, closingAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
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
  return Math.max(now, Date.now());
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

const ZERO = { days: 0, hours: 0, minutes: 0, seconds: 0 };

function Units({ value }: { value: Pick<CountdownSnapshot, keyof typeof ZERO> }) {
  const units = [
    { label: "dias", value: value.days },
    { label: "horas", value: value.hours },
    { label: "minutos", value: value.minutes },
    { label: "segundos", value: value.seconds },
  ];
  return (
    <div className="portal-count__units" aria-hidden="true">
      {units.map((u) => (
        <div key={u.label} className="portal-count__unit">
          <span className="portal-count__value">
            {/* A chave reinicia a transição apenas no número que mudou. */}
            <span key={u.value} className="portal-count__digits">
              {pad2(u.value)}
            </span>
          </span>
          <span className="portal-count__label">{u.label}</span>
        </div>
      ))}
    </div>
  );
}

function LiveCountdown({
  openingAt,
  closingAt,
  editionName,
}: {
  openingAt: number;
  closingAt: number;
  editionName: string;
}) {
  const now = useEditionClock(openingAt, closingAt);
  const snapshot = countdownAt(now, openingAt, closingAt);

  if (snapshot.phase !== "countdown")
    return (
      <div className="portal-count__live">
        <Units value={ZERO} />
        <p className="portal-count__done" role="status">
          <PartyPopper aria-hidden="true" />
          {snapshot.phase === "open"
            ? `A ${editionName} começou!`
            : `A ${editionName} foi encerrada.`}
        </p>
      </div>
    );

  return (
    <div className="portal-count__live" role="timer" aria-label="Tempo restante para a abertura">
      {/* Texto por minuto para leitores de tela; os segundos não são anunciados. */}
      <p className="sr-only">
        Faltam {plural(snapshot.days, "dia", "dias")}, {plural(snapshot.hours, "hora", "horas")} e{" "}
        {plural(snapshot.minutes, "minuto", "minutos")} para a abertura.
      </p>
      <Units value={snapshot} />
    </div>
  );
}

function Frame({
  title,
  meta,
  children,
  busy,
  compact,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <section
      className="portal-count"
      data-compact={compact || undefined}
      aria-labelledby="portal-count-title"
      aria-busy={busy || undefined}
    >
      <div className="portal-count__head">
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

function Notice({
  title,
  text,
  children,
}: {
  title: string;
  text?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="portal-count__status" role="status">
      <span className="portal-count__status-icon" aria-hidden="true">
        <CalendarClock />
      </span>
      <div className="min-w-0">
        <p className="portal-count__status-title">{title}</p>
        {text && <p className="portal-count__status-text">{text}</p>}
      </div>
      {children}
    </div>
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

  if (isLoading)
    return (
      <Frame title={<span className="portal-skeleton block h-7 w-48" />} busy>
        <span className="sr-only">Carregando a edição</span>
        <div className="portal-count__units" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="portal-count__unit portal-count__unit--skeleton" />
          ))}
        </div>
      </Frame>
    );

  if (isError)
    return (
      <Frame title="Edição indisponível" compact>
        <Notice title="Não foi possível carregar a edição" text="Verifique sua conexão.">
          <button type="button" className="portal-count__action" onClick={onRetry}>
            <RotateCw aria-hidden="true" />
            Tentar novamente
          </button>
        </Notice>
      </Frame>
    );

  if (!edition || schedule.status !== "configured")
    return (
      <Frame title={edition?.name ?? "Nenhuma edição ativa"} compact>
        <Notice
          title="Contagem indisponível"
          text={
            edition
              ? "A data oficial de abertura não está registrada na configuração da edição."
              : "Não há edição ativa configurada no sistema."
          }
        >
          {canConfigure && (
            <Link to="/admin" search={{ aba: "edicao" }} className="portal-count__action">
              <Settings2 aria-hidden="true" />
              Configurar edição
            </Link>
          )}
        </Notice>
      </Frame>
    );

  const period = formatEditionPeriod(edition.starts_on, edition.ends_on);
  return (
    <Frame
      title={edition.name}
      meta={
        <>
          <span className="portal-count__meta-main">
            Abertura oficial{"\u00a0"}—{" "}
            <span className="portal-count__date">
              {formatOpeningLabel(schedule.openingAt, schedule.timeZone)}
            </span>
            <span className="portal-count__tz">
              {" "}
              · {timeZoneShortLabel(schedule.timeZone, schedule.openingAt)}
            </span>
          </span>
          {period && <span className="portal-count__period">Feira de {period}</span>}
        </>
      }
    >
      <LiveCountdown
        openingAt={schedule.openingAt}
        closingAt={schedule.closingAt}
        editionName={edition.name}
      />
    </Frame>
  );
});
