import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, PartyPopper, RotateCw, Settings2 } from "lucide-react";
import type { Edition } from "@/lib/api";
import {
  countdownAt,
  formatEditionPeriod,
  formatOpeningTime,
  nextTickDelay,
  pad2,
  resolveOpening,
  timeZoneShortLabel,
  type CountdownSnapshot,
} from "@/lib/countdown";

const MAX_TIMEOUT = 2_147_000_000;
const REVEAL_MS = 1400;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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

/**
 * Revelação única ao entrar na área visível. O conteúdo só é ocultado depois que o
 * observador existe; sem ele, ou com movimento reduzido, o card aparece pronto.
 */
function useRevealOnce(ref: RefObject<HTMLElement | null>) {
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number | undefined;
    el.dataset.reveal = "wait";
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        el.dataset.reveal = "play";
        timer = window.setTimeout(() => delete el.dataset.reveal, REVEAL_MS);
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      delete el.dataset.reveal;
    };
  }, []);
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

const ZERO = { days: 0, hours: 0, minutes: 0, seconds: 0 };

const Unit = memo(function Unit({
  label,
  value,
  primary,
  index,
}: {
  label: string;
  value: number;
  primary?: boolean;
  index: number;
}) {
  return (
    <div
      className="portal-count__unit"
      data-primary={primary || undefined}
      style={{ "--i": index } as CSSProperties}
    >
      <span className="portal-count__value">
        {/* A chave reinicia a transição apenas no número que mudou. */}
        <span key={value} className="portal-count__digits">
          {pad2(value)}
        </span>
      </span>
      <span className="portal-count__label">{label}</span>
    </div>
  );
});

function Units({ value }: { value: Pick<CountdownSnapshot, keyof typeof ZERO> }) {
  return (
    <div className="portal-count__units" aria-hidden="true">
      <Unit index={0} label="dias" value={value.days} primary />
      <Unit index={1} label="horas" value={value.hours} />
      <Unit index={2} label="minutos" value={value.minutes} />
      <Unit index={3} label="segundos" value={value.seconds} />
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

/** "Indumóveis 2027" vira assinatura tipográfica: marca + ano espaçado, como na logo. */
function Signature({ name }: { name: string }) {
  const m = /^(.*\S)\s+(\d{4})$/.exec(name.trim());
  if (!m) return <span className="portal-count__brand">{name}</span>;
  return (
    <>
      <span className="portal-count__brand">{m[1]}</span>{" "}
      <span className="portal-count__year">{m[2]}</span>
    </>
  );
}

/** Ambiente de exposição: parede de fundo, teto, paredes laterais e sanca iluminada. */
const Scene = memo(function Scene() {
  return (
    <div className="portal-count__scene" aria-hidden="true">
      <span className="portal-count__wall" />
      <span className="portal-count__ceil" />
      <span className="portal-count__cove" />
      <span className="portal-count__side portal-count__side--l" />
      <span className="portal-count__side portal-count__side--r" />
      <svg className="portal-count__lamp" viewBox="0 0 64 150" focusable="false">
        <defs>
          <radialGradient id="pc-lamp-glow" cx="50%" cy="0%" r="100%">
            <stop offset="0" stopColor="oklch(0.92 0.05 70)" stopOpacity="0.32" />
            <stop offset="1" stopColor="oklch(0.92 0.05 70)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pc-lamp-shade" x1="0" x2="1">
            <stop offset="0" stopColor="oklch(0.74 0.028 80)" />
            <stop offset="1" stopColor="oklch(0.52 0.024 75)" />
          </linearGradient>
        </defs>
        <path d="M32 74 L-4 150 H68 Z" fill="url(#pc-lamp-glow)" />
        <path d="M32 0 V56" stroke="oklch(0.7 0.02 80 / 0.6)" strokeWidth="1" />
        <path d="M16 74 A16 18 0 0 1 48 74 Z" fill="url(#pc-lamp-shade)" />
        <ellipse cx="32" cy="74" rx="11" ry="1.6" fill="oklch(0.97 0.03 75)" />
      </svg>
    </div>
  );
});

/** Peças sobre o piso: nicho em arco com poltrona à esquerda, mesa lateral à direita. */
const FloorProps = memo(function FloorProps() {
  return (
    <>
      <svg
        className="portal-count__prop portal-count__prop--arch"
        viewBox="0 0 80 150"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="pc-arch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.2 0.035 352)" />
            <stop offset="1" stopColor="oklch(0.27 0.042 350)" />
          </linearGradient>
        </defs>
        <path d="M0 150V40A40 40 0 0 1 80 40V150Z" fill="url(#pc-arch)" />
        <path
          d="M1 150V40A39 39 0 0 1 40 1"
          fill="none"
          stroke="oklch(0.12 0.03 352 / 0.7)"
          strokeWidth="2"
        />
        <path
          d="M40 1A39 39 0 0 1 79 40V150"
          fill="none"
          stroke="oklch(1 0 0 / 0.1)"
          strokeWidth="1"
        />
      </svg>
      <svg
        className="portal-count__prop portal-count__prop--chair"
        viewBox="0 0 120 108"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="pc-shell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="oklch(0.5 0.07 352)" />
            <stop offset="1" stopColor="oklch(0.34 0.055 350)" />
          </linearGradient>
          <radialGradient id="pc-contact" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="oklch(0.1 0.03 352)" stopOpacity="0.7" />
            <stop offset="1" stopColor="oklch(0.1 0.03 352)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="62" cy="103" rx="54" ry="5" fill="url(#pc-contact)" />
        <path
          d="M40 70L28 102M86 70L98 102M58 70L54 101"
          stroke="oklch(0.66 0.026 78)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M14 16C9 40 14 64 32 71H94C102 71 106 64 103 57L99 52C80 57 52 57 41 49C31 41 28 26 30 15C27 8 17 8 14 16Z"
          fill="url(#pc-shell)"
        />
        <path
          d="M15 17C11 38 15 60 31 68"
          fill="none"
          stroke="oklch(1 0 0 / 0.18)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="portal-count__prop portal-count__prop--table"
        viewBox="0 0 72 112"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="pc-metal" x1="0" x2="1">
            <stop offset="0" stopColor="oklch(0.74 0.026 80)" />
            <stop offset="1" stopColor="oklch(0.54 0.024 75)" />
          </linearGradient>
          <linearGradient id="pc-vase" x1="0" x2="1">
            <stop offset="0" stopColor="oklch(0.5 0.06 350)" />
            <stop offset="1" stopColor="oklch(0.33 0.05 350)" />
          </linearGradient>
          <radialGradient id="pc-contact-t" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="oklch(0.1 0.03 352)" stopOpacity="0.7" />
            <stop offset="1" stopColor="oklch(0.1 0.03 352)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="36" cy="108" rx="30" ry="3.6" fill="url(#pc-contact-t)" />
        <path d="M30 20C34 10 40 4 46 0" fill="none" stroke="oklch(0.6 0.03 120 / 0.7)" />
        <circle cx="46" cy="1.6" r="2.2" fill="var(--brand-red)" />
        <path d="M28 46C22 38 26 26 32 22H40C46 26 50 38 44 46Z" fill="url(#pc-vase)" />
        <rect x="6" y="46" width="60" height="4.5" rx="2.25" fill="url(#pc-metal)" />
        <rect x="34" y="50" width="4" height="54" fill="oklch(0.56 0.024 75)" />
        <ellipse cx="36" cy="105" rx="14" ry="2.6" fill="url(#pc-metal)" />
      </svg>
    </>
  );
});

/** Piso em perspectiva: linhas convergentes para o centro da parede de fundo. */
const FloorLines = memo(function FloorLines() {
  const lines = [-3, -2, -1, 0, 1, 2, 3].map((i) => {
    const front = 50 + i * 16;
    const back = 50 + i * 12.5;
    return <line key={i} x1={back} y1="0" x2={front} y2="100" />;
  });
  return (
    <svg
      className="portal-count__floor-lines"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {lines}
    </svg>
  );
});

function Frame({
  title,
  children,
  foot,
  busy,
  compact,
}: {
  title: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  busy?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useRevealOnce(ref);
  return (
    <section
      ref={ref}
      className="portal-count"
      data-compact={compact || undefined}
      aria-labelledby="portal-count-title"
      aria-busy={busy || undefined}
    >
      <Scene />
      <div className="portal-count__head">
        <h2 id="portal-count-title" className="portal-count__title">
          {title}
        </h2>
      </div>
      {children}
      <div className="portal-count__foot">
        <FloorLines />
        {!compact && <FloorProps />}
        {foot}
      </div>
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
    <div className="portal-count__live">
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
      <Frame
        title={<span className="portal-skeleton block h-8 w-56" />}
        busy
        foot={<span className="portal-skeleton block h-6 w-52" />}
      >
        <span className="sr-only">Carregando a edição</span>
        <div className="portal-count__live">
          <div className="portal-count__units" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="portal-count__unit portal-count__unit--skeleton" />
            ))}
          </div>
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
      <Frame title={edition ? <Signature name={edition.name} /> : "Nenhuma edição ativa"} compact>
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
      title={<Signature name={edition.name} />}
      foot={
        <>
          {period && <p className="portal-count__period">{period}</p>}
          <p className="portal-count__meta">
            Abertura às{" "}
            <span className="portal-count__nowrap">
              {formatOpeningTime(schedule.openingAt, schedule.timeZone)}
            </span>{" "}
            <span className="portal-count__nowrap">
              · {timeZoneShortLabel(schedule.timeZone, schedule.openingAt)}
            </span>
          </p>
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
