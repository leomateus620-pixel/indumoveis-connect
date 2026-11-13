import type { ReactNode } from "react";
import { ArrowRight, Building2, CarFront, Layers3, Map, Ruler, Wallet } from "lucide-react";
import { ErrorBox, NativeSelect, PageHeader, Restricted } from "@/components/app/ui";
import { useCommercialDetails, useCommercialOverview, useEdition, useMe } from "@/lib/api";
import type {
  CommercialAggregate,
  CommercialFinancialTotals,
  CommercialLotStatus,
  CommercialSegmentAggregate,
  CommercialSegmentKey,
} from "@/lib/commercial";
import { formatCommercialPercent as percent } from "@/lib/commercial";
import { count, statusSeries } from "./presentation";
import { area, brl } from "@/lib/format";
import type { CommercialDashboardSearch } from "@/routes/_authenticated/_app/dashboard-comercial";
import {
  SalesHistory,
  SalesRing,
  SegmentComparison,
  StatusBar,
  StatusCounts,
  StatusLegend,
} from "./DashboardCharts";
import { DashboardLots } from "./DashboardLots";
import "./commercial-dashboard.css";

function coverage(known: number, total: number, kind: string) {
  if (!total) return "Sem lotes no recorte";
  if (!known) return `Sem ${kind} confirmada`;
  if (known === total) return `${count(total)} lotes com ${kind}`;
  return `Parcial · ${count(known)} de ${count(total)} lotes com ${kind}`;
}

function Metric({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="cd-metric">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </dd>
    </div>
  );
}

function Overview({
  aggregate,
  title,
  financial,
  selectedStatus,
  onStatus,
}: {
  aggregate: CommercialAggregate;
  title: string;
  financial: boolean;
  selectedStatus?: CommercialLotStatus;
  onStatus: (status: CommercialLotStatus) => void;
}) {
  return (
    <section aria-labelledby="cd-overview-title" className="cd-overview">
      <div className="cd-panel cd-overview-main">
        <div className="cd-overview-title">
          <h2 id="cd-overview-title">{title}</h2>
          <span className="cd-inventory-label">
            <Layers3 size={14} aria-hidden="true" />{" "}
            {aggregate.total > 0
              ? `${count(aggregate.total)} lotes comerciais`
              : "Inventário pendente"}
          </span>
        </div>
        <div className="cd-overview-layout">
          <div className="cd-overview-progress">
            <SalesRing aggregate={aggregate} />
            <p>
              {aggregate.total > 0
                ? `${count(aggregate.sold)} de ${count(aggregate.total)} lotes vendidos`
                : "Sem inventário comercial"}
            </p>
          </div>
          <div className="cd-overview-distribution">
            <h3>Situação dos lotes</h3>
            <StatusLegend aggregate={aggregate} selected={selectedStatus} onSelect={onStatus} />
          </div>
        </div>
        <StatusBar aggregate={aggregate} />
      </div>
      <div className="cd-overview-side">
        <div className="cd-panel cd-metrics-panel">
          <h3>
            <Ruler size={17} aria-hidden="true" /> Área comercial
          </h3>
          <dl className="cd-metric-grid">
            <Metric
              label="Área conhecida"
              value={area(aggregate.knownAreaM2)}
              note={coverage(aggregate.areaKnownCount, aggregate.total, "metragem")}
            />
            <Metric
              label="Área vendida"
              value={area(aggregate.soldAreaM2)}
              note={
                aggregate.soldAreaPercent == null
                  ? coverage(aggregate.soldAreaKnownCount, aggregate.sold, "metragem")
                  : `${percent(aggregate.soldAreaPercent)} da área conhecida${aggregate.areaKnownCount < aggregate.total || aggregate.soldAreaKnownCount < aggregate.sold ? " · Parcial" : ""}`
              }
            />
          </dl>
        </div>
        {financial && (
          <div className="cd-panel cd-metrics-panel cd-pricing-panel">
            <h3>
              <Wallet size={17} aria-hidden="true" /> Potencial de tabela
            </h3>
            <dl className="cd-metric-grid">
              <Metric
                label="Potencial bruto conhecido"
                value={brl(aggregate.grossCents)}
                note={coverage(aggregate.pricedCount ?? 0, aggregate.total, "tarifa")}
              />
              <Metric
                label="Disponíveis com preço"
                value={brl(aggregate.availableGrossCents)}
                note={coverage(aggregate.availablePricedCount ?? 0, aggregate.available, "tarifa")}
              />
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

function FinancialSummary({ totals }: { totals: CommercialFinancialTotals }) {
  return (
    <section className="cd-panel cd-financial" aria-labelledby="cd-financial-title">
      <h2 id="cd-financial-title">Movimentação comercial</h2>
      <dl>
        <Metric label="Valor contratado" value={brl(totals.contractedCents)} />
        <Metric label="Valores em negociação" value={brl(totals.negotiatingCents)} />
        <Metric label="Recebido" value={brl(totals.receivedCents)} />
        <Metric label="Em aberto" value={brl(totals.openCents)} />
      </dl>
      {!!totals.mixedDealsExcluded && (
        <p className="cd-financial-note">
          Subtotal parcial. {count(totals.mixedDealsExcluded)}{" "}
          {totals.mixedDealsExcluded === 1 ? "negociação aparece" : "negociações aparecem"} apenas
          na visão geral por envolver mais de um segmento.
        </p>
      )}
    </section>
  );
}

function SegmentCard({
  segment,
  selected,
  onSelect,
}: {
  segment: CommercialSegmentAggregate;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = segment.pavilionNumber ? Building2 : segment.key === "automobile" ? CarFront : Map;
  return (
    <button
      type="button"
      className="cd-panel cd-segment"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="cd-segment-heading">
        <span className="cd-segment-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
        <strong>{segment.label}</strong>
        <ArrowRight className="cd-segment-arrow" size={16} aria-hidden="true" />
      </span>
      {segment.description && <span className="cd-segment-description">{segment.description}</span>}
      {segment.total > 0 ? (
        <>
          <span className="cd-segment-sales">
            <strong>{percent(segment.soldPercent)}</strong>
            <span>
              {count(segment.sold)} de {count(segment.total)} vendidos
            </span>
          </span>
          <StatusBar aggregate={segment} />
          <StatusCounts aggregate={segment} />
        </>
      ) : (
        <span className="cd-segment-no-inventory">
          <strong>—</strong>
          <span>Sem inventário comercial</span>
        </span>
      )}
    </button>
  );
}

function DashboardLoading() {
  return (
    <div className="cd-loading" role="status" aria-label="Carregando indicadores comerciais">
      <span className="sr-only">Carregando indicadores comerciais</span>
      <span className="cd-panel cd-loading-block" />
      <span className="cd-panel cd-loading-block" />
    </div>
  );
}

export function CommercialDashboard({
  search,
  onSearch,
}: {
  search: CommercialDashboardSearch;
  onSearch: (patch: Partial<CommercialDashboardSearch>, replace?: boolean) => void;
}) {
  const me = useMe();
  const edition = useEdition();
  const allowed = !!(me.data?.perms.mapa?.read && me.data?.perms.comercial?.read);
  const overview = useCommercialOverview(allowed);
  const details = useCommercialDetails(search.segmento, allowed);
  const snapshot = overview.data;
  const segments = snapshot?.segments ?? [];
  const segment = segments.find(({ key }) => key === search.segmento);
  const aggregate = segment ?? snapshot?.overall;
  const financial = !!(snapshot?.financial && me.data?.perms.financeiro?.read);
  const showFinancial = financial && details.data?.totals;

  function selectSegment(segmento?: CommercialSegmentKey) {
    onSearch({ segmento, lote: undefined });
  }
  function selectStatus(situacao?: CommercialLotStatus) {
    onSearch({ situacao, lote: undefined });
  }

  return (
    <>
      <PageHeader
        title="Dashboard Comercial"
        subtitle={edition.data?.name}
        actions={
          allowed && (
            <a className="cd-jump" href="#lotes-comerciais">
              Ver lotes <ArrowRight size={16} aria-hidden="true" />
            </a>
          )
        }
      />
      {me.isError && <ErrorBox error={me.error} onRetry={() => void me.refetch()} />}
      {me.isSuccess && !allowed && <Restricted />}
      {allowed && edition.isError && (
        <ErrorBox error={edition.error} onRetry={() => void edition.refetch()} />
      )}
      {allowed && edition.isSuccess && !edition.data && (
        <Restricted text="Nenhuma edição foi cadastrada." />
      )}
      {allowed && overview.isError && !snapshot && (
        <ErrorBox error={overview.error} onRetry={() => void overview.refetch()} />
      )}
      {(me.isPending ||
        (allowed && (edition.isPending || (!!edition.data && overview.isPending)))) && (
        <DashboardLoading />
      )}
      {allowed && snapshot && aggregate && (
        <div className="cd-page">
          <div className="cd-filters" aria-label="Filtros do dashboard" role="group">
            <div>
              <label htmlFor="cd-segment-filter">Segmento</label>
              <NativeSelect
                id="cd-segment-filter"
                value={search.segmento ?? ""}
                onChange={(event) =>
                  selectSegment(segments.find(({ key }) => key === event.target.value)?.key)
                }
              >
                <option value="">Todos os segmentos</option>
                {segments.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <label htmlFor="cd-status-filter">Situação dos lotes</label>
              <NativeSelect
                id="cd-status-filter"
                value={search.situacao ?? ""}
                onChange={(event) =>
                  selectStatus(
                    statusSeries.find(({ status }) => status === event.target.value)?.status,
                  )
                }
              >
                <option value="">Todas as situações</option>
                {statusSeries.map(({ status, label }) => (
                  <option key={status} value={status}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <Overview
            aggregate={aggregate}
            title={segment?.label ?? "Visão geral"}
            financial={financial}
            selectedStatus={search.situacao}
            onStatus={(status) => selectStatus(status === search.situacao ? undefined : status)}
          />
          {showFinancial && <FinancialSummary totals={showFinancial} />}
          <section aria-labelledby="cd-segments-title" className="cd-segments">
            <div className="cd-section-heading">
              <h2 id="cd-segments-title">Pavilhões e segmentos</h2>
              {search.segmento && (
                <button type="button" className="cd-text-button" onClick={() => selectSegment()}>
                  Todos os segmentos
                </button>
              )}
            </div>
            <div className="cd-segment-grid">
              {segments.map((item) => (
                <SegmentCard
                  key={item.key}
                  segment={item}
                  selected={item.key === search.segmento}
                  onSelect={() =>
                    selectSegment(item.key === search.segmento ? undefined : item.key)
                  }
                />
              ))}
            </div>
          </section>
          <div className="cd-chart-grid">
            <SegmentComparison segments={segments} onSelect={(item) => selectSegment(item.key)} />
            {snapshot.activity && details.data && <SalesHistory events={details.data.events} />}
          </div>
          <section className="cd-panel cd-lots" aria-labelledby="lotes-comerciais">
            <div className="cd-lots-heading">
              <h2 id="lotes-comerciais">Lotes e negociações</h2>
              <p>
                {segment?.label ?? "Todos os segmentos"}
                {search.situacao &&
                  ` · ${statusSeries.find(({ status }) => status === search.situacao)?.label}`}
              </p>
            </div>
            {details.isPending && <DashboardLoading />}
            {details.isError && !details.data && (
              <ErrorBox error={details.error} onRetry={() => void details.refetch()} />
            )}
            {details.data && (
              <DashboardLots
                key={search.segmento ?? "all"}
                lots={details.data.lots}
                segments={segments}
                status={search.situacao}
                selected={search.lote}
                financial={financial}
                onSelect={(lote) => onSearch({ lote }, !lote)}
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}
