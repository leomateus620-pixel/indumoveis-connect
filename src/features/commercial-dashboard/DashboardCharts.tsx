import type { CSSProperties } from "react";
import { formatCommercialPercent as percent } from "@/lib/commercial";
import { count, statusSeries } from "./presentation";
import { ArrowUpRight, ChartNoAxesColumn, History } from "lucide-react";
import { SPACE_STATUS, fmtDate } from "@/lib/format";
import type {
  CommercialAggregate,
  CommercialLotStatus,
  CommercialSalesEvent,
  CommercialSegmentAggregate,
} from "@/lib/commercial";

export function StatusDot({ status }: { status: CommercialLotStatus }) {
  return <span className="cd-dot" data-status={status} aria-hidden="true" />;
}

export function SalesRing({ aggregate }: { aggregate: CommercialAggregate }) {
  return (
    <div className="cd-ring">
      <div
        className="cd-ring-track"
        style={{ "--cd-progress": `${aggregate.soldPercent ?? 0}%` } as CSSProperties}
        aria-hidden="true"
      />
      <div className="cd-ring-value">
        <strong>{percent(aggregate.soldPercent)}</strong>
        <span>dos lotes vendidos</span>
      </div>
    </div>
  );
}

export function StatusBar({ aggregate }: { aggregate: CommercialAggregate }) {
  if (aggregate.total === 0) return null;
  return (
    <span className="cd-status-bar" aria-hidden="true">
      {statusSeries.map(({ field, status }) =>
        aggregate[field] > 0 ? (
          <span key={status} data-status={status} style={{ flexGrow: aggregate[field] }} />
        ) : null,
      )}
    </span>
  );
}

export function SegmentComparison({
  segments,
  onSelect,
}: {
  segments: CommercialSegmentAggregate[];
  onSelect: (segment: CommercialSegmentAggregate) => void;
}) {
  const comparable = segments.filter((segment) => segment.total > 0);
  return (
    <section className="cd-panel cd-chart-panel" aria-labelledby="cd-comparison-title">
      <div className="cd-chart-heading">
        <ChartNoAxesColumn size={17} aria-hidden="true" />
        <div>
          <h2 id="cd-comparison-title">Comparação entre segmentos</h2>
          <p>Distribuição por quantidade de lotes</p>
        </div>
      </div>
      {comparable.length ? (
        <ul className="cd-comparison-list">
          {comparable.map((segment) => (
            <li key={segment.key}>
              <button
                type="button"
                onClick={() => onSelect(segment)}
                className="cd-comparison-row"
                aria-label={`${segment.label}, ${percent(segment.soldPercent)} vendidos, ${count(segment.sold)} de ${count(segment.total)}. Ver lotes`}
              >
                <span>{segment.label}</span>
                <StatusBar aggregate={segment} />
                <strong>{percent(segment.soldPercent)}</strong>
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cd-chart-empty">Aguardando inventário comercial.</p>
      )}
    </section>
  );
}

const shortMonth = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const longMonth = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthsFromEvents(events: CommercialSalesEvent[]) {
  const periods = new Map<string, { signed: number; cancelled: number }>();
  for (const event of events) {
    const key = event.date.slice(0, 7);
    const period = periods.get(key) ?? { signed: 0, cancelled: 0 };
    period.signed += event.signed;
    period.cancelled += event.cancelled;
    periods.set(key, period);
  }
  if (periods.size === 0) return [];
  const keys = [...periods.keys()].sort();
  const month = new Date(`${keys.at(-1)}-01T12:00:00Z`);
  const visibleMonths: Array<[string, { signed: number; cancelled: number }]> = [];
  for (let i = 0; i < 12; i++) {
    const key = month.toISOString().slice(0, 7);
    if (key < keys[0]) break;
    visibleMonths.unshift([key, periods.get(key) ?? { signed: 0, cancelled: 0 }]);
    month.setUTCMonth(month.getUTCMonth() - 1);
  }
  return visibleMonths;
}

export function SalesHistory({ events }: { events: CommercialSalesEvent[] }) {
  const visibleMonths = monthsFromEvents(events);
  const max = Math.max(
    1,
    ...visibleMonths.map(([, period]) => Math.max(period.signed, period.cancelled)),
  );
  return (
    <section className="cd-panel cd-chart-panel" aria-labelledby="cd-history-title">
      <div className="cd-chart-heading">
        <History size={17} aria-hidden="true" />
        <div>
          <h2 id="cd-history-title">Evolução das vendas</h2>
          <p>Lotes com assinatura ou cancelamento registrado</p>
        </div>
      </div>
      {visibleMonths.length ? (
        <>
          <ul className="cd-history-bars" aria-label="Eventos de venda agrupados por mês">
            {visibleMonths.map(([key, period]) => {
              const monthDate = new Date(`${key}-01T12:00:00Z`);
              return (
                <li key={key}>
                  <div
                    className="cd-history-column"
                    role="img"
                    aria-label={`${longMonth.format(monthDate)}, ${count(period.signed)} lotes com assinatura e ${count(period.cancelled)} lotes com cancelamento`}
                    title={`${count(period.signed)} lotes com assinatura · ${count(period.cancelled)} lotes com cancelamento`}
                  >
                    <span
                      className="cd-history-signed"
                      style={{ height: `${(period.signed / max) * 100}%` }}
                    />
                    <span
                      className="cd-history-cancelled"
                      style={{ height: `${(period.cancelled / max) * 100}%` }}
                    />
                  </div>
                  <span>{shortMonth.format(monthDate)}</span>
                </li>
              );
            })}
          </ul>
          <div className="cd-history-key">
            <span>
              <i className="cd-history-signed" /> Lotes com assinatura
            </span>
            <span>
              <i className="cd-history-cancelled" /> Lotes com cancelamento
            </span>
          </div>
          <details className="cd-history-details">
            <summary>Ver histórico por data</summary>
            <div className="cd-history-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Lotes com assinatura</th>
                    <th scope="col">Lotes com cancelamento</th>
                  </tr>
                </thead>
                <tbody>
                  {[...events]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((event) => (
                      <tr key={event.date}>
                        <th scope="row">{fmtDate(event.date)}</th>
                        <td>{count(event.signed)}</td>
                        <td>{count(event.cancelled)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="cd-chart-empty">Nenhum evento de venda registrado no recorte.</p>
      )}
    </section>
  );
}

export function StatusLegend({
  aggregate,
  selected,
  onSelect,
}: {
  aggregate: CommercialAggregate;
  selected?: CommercialLotStatus;
  onSelect: (status: CommercialLotStatus) => void;
}) {
  return (
    <ul className="cd-status-legend" aria-label="Filtrar lotes por situação comercial">
      {statusSeries.map(({ status, field, label }) => (
        <li key={status}>
          <button
            type="button"
            aria-pressed={selected === status}
            onClick={() => onSelect(status)}
            disabled={aggregate.total === 0}
          >
            <StatusDot status={status} />
            <span>{label}</span>
            <strong>{aggregate.total > 0 ? count(aggregate[field]) : "—"}</strong>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function StatusCounts({ aggregate }: { aggregate: CommercialAggregate }) {
  return (
    <span className="cd-segment-status" role="list" aria-label="Lotes por situação">
      {statusSeries.map(({ field, status }) => (
        <span
          role="listitem"
          key={status}
          title={`${SPACE_STATUS[status].label}: ${count(aggregate[field])}`}
        >
          <StatusDot status={status} />
          <span className="sr-only">{SPACE_STATUS[status].label}: </span>
          {count(aggregate[field])}
        </span>
      ))}
    </span>
  );
}
