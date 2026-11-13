import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DataList, EmptyState, Field, SearchInput, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { area, brl, DEAL_STATUS, SPACE_STATUS } from "@/lib/format";
import type {
  CommercialLot,
  CommercialLotStatus,
  CommercialSegmentAggregate,
} from "@/lib/commercial";
import { count } from "./presentation";

const PAGE_SIZE = 25;
const lotCodes = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const interiorRoutes = {
  p8: "/mapa/pavilhoes/8/interior",
  p12: "/mapa/pavilhoes/12/interior",
  p13: "/mapa/pavilhoes/13/interior",
} as const;

function DealSummary({ lot, financial }: { lot: CommercialLot; financial: boolean }) {
  if (!lot.deal) return <>—</>;
  return (
    <span className="cd-deal-summary">
      {lot.deal.companyName && <strong>{lot.deal.companyName}</strong>}
      <StatusBadge map={DEAL_STATUS} value={lot.deal.status} />
      {financial && lot.deal.spacePriceCents != null && (
        <span className="tnum">{brl(lot.deal.spacePriceCents)}</span>
      )}
    </span>
  );
}

const pendingPrice: Record<string, string> = {
  area_pending: "Metragem a confirmar",
  corner_pending: "Classificação de esquina pendente",
  no_tariff: "Tarifa não definida",
};

const cornerLabel: Record<string, string> = {
  corner: "Esquina confirmada",
  regular: "Lote regular",
  pending: "Classificação a confirmar",
};

function LotSheet({
  selected,
  lot,
  segment,
  financial,
  onClose,
  restoreFocus,
}: {
  selected?: string;
  lot?: CommercialLot;
  segment?: CommercialSegmentAggregate;
  financial: boolean;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const interior =
    lot && Object.hasOwn(interiorRoutes, lot.segmentKey)
      ? interiorRoutes[lot.segmentKey as keyof typeof interiorRoutes]
      : undefined;
  return (
    <Sheet
      open={!!selected}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        className="cd-sheet w-full overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <SheetHeader className="cd-sheet-heading">
          <SheetDescription>{segment?.label ?? "Inventário comercial"}</SheetDescription>
          <SheetTitle className="cd-sheet-title">
            {lot ? `Lote ${lot.code}` : "Detalhes do lote"}
          </SheetTitle>
        </SheetHeader>
        {lot ? (
          <>
            <div className="cd-sheet-status">
              <StatusBadge map={SPACE_STATUS} value={lot.status} />
            </div>
            <section className="cd-sheet-section" aria-labelledby="cd-sheet-lot">
              <h3 id="cd-sheet-lot">Dados do lote</h3>
              <dl className="cd-sheet-fields">
                <Field label="Localização">{segment?.label}</Field>
                <Field label="Área confirmada">
                  {area(lot.areaM2)}
                  {lot.areaPending && (
                    <small className="cd-field-note">
                      {lot.areaM2 != null
                        ? "Validação documental em aberto"
                        : "Metragem a confirmar"}
                    </small>
                  )}
                </Field>
                {lot.cornerState && cornerLabel[lot.cornerState] && (
                  <Field label="Classificação do lote">{cornerLabel[lot.cornerState]}</Field>
                )}
                {financial && (
                  <>
                    <Field label="Tarifa por m²">{brl(lot.tariffCents)}</Field>
                    <Field label="Valor bruto de tabela">
                      {brl(lot.grossCents)}
                      {lot.grossCents == null && pendingPrice[lot.pricingState] && (
                        <small className="cd-field-note">{pendingPrice[lot.pricingState]}</small>
                      )}
                    </Field>
                  </>
                )}
              </dl>
              {financial && lot.policySource && (
                <p className="cd-field-note">
                  {lot.policySource}
                  {lot.policyVersion != null && ` · Versão ${lot.policyVersion}`}
                </p>
              )}
            </section>
            {lot.deal && (
              <section className="cd-sheet-section" aria-labelledby="cd-sheet-deal">
                <h3 id="cd-sheet-deal">Negociação vinculada</h3>
                <dl className="cd-sheet-fields">
                  {lot.deal.companyName && <Field label="Expositor">{lot.deal.companyName}</Field>}
                  <Field label="Situação">
                    <StatusBadge map={DEAL_STATUS} value={lot.deal.status} />
                  </Field>
                  {financial && (
                    <Field label="Valor negociado do lote">{brl(lot.deal.spacePriceCents)}</Field>
                  )}
                </dl>
                <Button variant="outline" asChild>
                  <Link to="/comercializacao" search={{ id: lot.deal.id }} preload={false}>
                    Abrir negociação <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
              </section>
            )}
            {lot.segmentKey === "p1" && (
              <Button variant="outline" asChild>
                <Link to="/mapa/pavilhoes/1/interior" search={{ espaco: lot.code }} preload={false}>
                  Localizar na planta <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            )}
            {interior && (
              <Button variant="outline" asChild>
                <Link to={interior} search={{ lote: lot.code }} preload={false}>
                  Localizar na planta <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            )}
            {lot.geometryId && !interior && lot.segmentKey !== "p1" && (
              <Button variant="outline" asChild>
                <Link to="/mapa" search={{ space: lot.id }} preload={false}>
                  Localizar no mapa <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            )}
          </>
        ) : (
          <p className="cd-sheet-missing" role="status">
            Este lote não está disponível no recorte atual.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function DashboardLots({
  lots,
  segments,
  status,
  selected,
  financial,
  onSelect,
}: {
  lots: CommercialLot[];
  segments: CommercialSegmentAggregate[];
  status?: CommercialLotStatus;
  selected?: string;
  financial: boolean;
  onSelect: (id?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const trigger = useRef<HTMLElement | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const segmentByKey = useMemo(
    () => new Map(segments.map((segment, index) => [segment.key, { ...segment, order: index }])),
    [segments],
  );
  const matchingLots = useMemo(() => {
    const q = normalize(query.trim());
    return lots
      .filter((lot) => {
        if (status && lot.status !== status) return false;
        if (!q) return true;
        const segment = segmentByKey.get(lot.segmentKey);
        return [lot.code, segment?.label, lot.deal?.companyName].some(
          (value) => value && normalize(value).includes(q),
        );
      })
      .sort(
        (a, b) =>
          (segmentByKey.get(a.segmentKey)?.order ?? 0) -
            (segmentByKey.get(b.segmentKey)?.order ?? 0) || lotCodes.compare(a.code, b.code),
      );
  }, [lots, query, segmentByKey, status]);
  const maxPage = Math.max(0, Math.ceil(matchingLots.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const start = currentPage * PAGE_SIZE;
  const visibleLots = matchingLots.slice(start, start + PAGE_SIZE);
  const selectedLot = lots.find((lot) => lot.id === selected);
  const tableColumns = [
    {
      header: "Lote",
      cell: (lot: CommercialLot) => <span className="font-semibold tnum">{lot.code}</span>,
    },
    {
      header: "Localização",
      cell: (lot: CommercialLot) => segmentByKey.get(lot.segmentKey)?.label ?? "—",
    },
    {
      header: "Área confirmada",
      cell: (lot: CommercialLot) => (
        <span className="tnum whitespace-nowrap">{area(lot.areaM2)}</span>
      ),
    },
    ...(financial
      ? [
          {
            header: "Tarifa por m²",
            cell: (lot: CommercialLot) => (
              <span className="tnum whitespace-nowrap">{brl(lot.tariffCents)}</span>
            ),
          },
          {
            header: "Valor bruto",
            cell: (lot: CommercialLot) => (
              <span className="tnum whitespace-nowrap">{brl(lot.grossCents)}</span>
            ),
          },
        ]
      : []),
    {
      header: "Situação",
      cell: (lot: CommercialLot) => <StatusBadge map={SPACE_STATUS} value={lot.status} />,
    },
    {
      header: "Negociação",
      cell: (lot: CommercialLot) => <DealSummary lot={lot} financial={financial} />,
    },
  ];

  function movePage(next: number) {
    setPage(next);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start" });
  }

  return (
    <>
      <div className="cd-results-toolbar">
        <h3 tabIndex={-1} ref={resultsHeading}>
          Resultados
        </h3>
        <SearchInput
          value={query}
          onChange={(next) => {
            setQuery(next);
            setPage(0);
          }}
          placeholder="Buscar por lote, segmento ou expositor"
        />
      </div>
      <div className="cd-results-meta" role="status">
        {matchingLots.length === 0
          ? "0 lotes"
          : `${count(start + 1)}–${count(start + visibleLots.length)} de ${count(matchingLots.length)} lotes`}
      </div>
      {visibleLots.length ? (
        <>
          <DataList
            rows={visibleLots}
            columns={tableColumns}
            rowKey={(lot) => lot.id}
            selectedKey={selected}
            onRowClick={(lot) => {
              trigger.current =
                document.activeElement instanceof HTMLElement &&
                document.activeElement !== document.body
                  ? document.activeElement
                  : null;
              onSelect(lot.id);
            }}
          />
          {maxPage > 0 && (
            <nav className="cd-pagination" aria-label="Páginas de lotes">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={currentPage === 0}
                onClick={() => movePage(currentPage - 1)}
              >
                <ArrowLeft aria-hidden="true" /> Anterior
              </Button>
              <span>
                Página {count(currentPage + 1)} de {count(maxPage + 1)}
              </span>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={currentPage === maxPage}
                onClick={() => movePage(currentPage + 1)}
              >
                Próxima <ArrowRight aria-hidden="true" />
              </Button>
            </nav>
          )}
        </>
      ) : (
        <EmptyState
          title={lots.length ? "Nenhum lote encontrado" : "Nenhum lote cadastrado neste recorte"}
          text={lots.length ? "Ajuste os filtros ou revise a busca." : undefined}
        />
      )}
      <LotSheet
        selected={selected}
        lot={selectedLot}
        segment={selectedLot ? segmentByKey.get(selectedLot.segmentKey) : undefined}
        financial={financial}
        onClose={() => onSelect(undefined)}
        restoreFocus={() =>
          (trigger.current?.isConnected ? trigger.current : resultsHeading.current)?.focus({
            preventScroll: true,
          })
        }
      />
    </>
  );
}
