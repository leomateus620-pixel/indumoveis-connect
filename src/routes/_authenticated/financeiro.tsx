/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  PageHeader,
  FilterBar,
  SearchInput,
  DataList,
  EmptyState,
  Loading,
  Restricted,
  Stat,
  NativeSelect,
  FormRow,
  Section,
  ErrorBox,
} from "@/components/app/ui";
import { financeSummary, needsReview, paidOf } from "@/lib/journey";
import { AttachedDocuments } from "@/components/app/documents/AttachedDocuments";
import { RelatedLink } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInstallments, useContracts, useCan, useDbMutation, api } from "@/lib/api";
import { brl, fmtDate, today, toCents, centsToInput, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/financeiro")({
  validateSearch: (s: Record<string, unknown>): { view?: string; contract?: string } => ({
    view: typeof s.view === "string" ? s.view : undefined,
    contract: typeof s.contract === "string" ? s.contract : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Financeiro Operacional — Sistema Indumóveis" },
      { name: "description", content: "Parcelas, vencimentos e pagamentos registrados." },
      { property: "og:title", content: "Financeiro Operacional — Sistema Indumóveis" },
      { property: "og:description", content: "Parcelas, vencimentos e pagamentos registrados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const can = useCan("financeiro");
  const { view, contract } = Route.useSearch();
  const navigate = useNavigate({ from: "/financeiro" });
  const iq = useInstallments(can.read);
  const { data: allInst = [], isLoading } = iq;
  const { data: allContracts = [] } = useContracts();
  const inst = contract ? allInst.filter((i: any) => i.contract_id === contract) : allInst;
  const contracts = contract ? allContracts.filter((c: any) => c.id === contract) : allContracts;
  const contractRow = allContracts.find((c: any) => c.id === contract);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const t = today();
  const status = (i: any) =>
    i.status === "paga"
      ? "Paga"
      : i.status === "cancelada"
        ? "Cancelada"
        : i.due_date < t
          ? "Vencida"
          : paidOf(i) > 0
            ? "Parcial"
            : "A vencer";

  const rows = useMemo(
    () =>
      inst.filter((i: any) => {
        const s = status(i);
        if (view === "vencidas" && s !== "Vencida") return false;
        if (view === "abertas" && !["A vencer", "Parcial", "Vencida"].includes(s)) return false;
        if (view === "pagas" && s !== "Paga") return false;
        return (
          !q ||
          i.contracts?.companies?.trade_name?.toLowerCase().includes(q.toLowerCase()) ||
          i.contracts?.number?.includes(q)
        );
      }),
    [inst, view, q], // eslint-disable-line react-hooks/exhaustive-deps
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // Total negociado por contrato (uma vez por contrato, independentemente do nº de espaços)
  const activeContracts = contracts.filter((c: any) => c.status !== "cancelado");
  const { contracted, forecast, received, open } = financeSummary(contracts, inst);
  const overdue = inst
    .filter((i: any) => status(i) === "Vencida")
    .reduce((a: number, i: any) => a + Number(i.amount_cents) - paidOf(i), 0);
  const noInst = activeContracts.filter((c: any) => !inst.some((i: any) => i.contract_id === c.id));

  if (!can.read)
    return (
      <Restricted text="Informações financeiras são visíveis apenas para perfis autorizados." />
    );
  const selected = inst.find((i: any) => i.id === sel);

  return (
    <>
      <PageHeader
        title="Financeiro Operacional"
        subtitle="Registros próprios do sistema — sem integração bancária, fiscal ou cobrança automática"
      />
      <div className="grid gap-px bg-border px-4 pt-4 sm:grid-cols-2 md:px-6 xl:grid-cols-4 xl:px-8">
        <Stat
          label="Contratado"
          value={brl(contracted)}
          hint={`${activeContracts.length} contratos ativos`}
        />
        <Stat
          label="Previsto em parcelas"
          value={brl(forecast)}
          hint={`${brl(Math.max(0, contracted - forecast))} ainda sem parcelas`}
        />
        <Stat label="Recebido" value={brl(received)} hint="inclui contratos cancelados" />
        <Stat label="Saldo em aberto" value={brl(open)} hint={`${brl(overdue)} vencido`} />
      </div>
      {noInst.length > 0 && (
        <p className="mx-4 mt-3 border-l-2 border-warning bg-warning-soft px-3 py-2 text-sm text-warning md:mx-6 xl:mx-8">
          {noInst.length} contrato(s) sem parcelas lançadas:{" "}
          {noInst.map((c: any, idx: number) => (
            <span key={c.id}>
              {idx > 0 && ", "}
              <RelatedLink type="contract" id={c.id}>
                {c.number}
              </RelatedLink>
            </span>
          ))}
        </p>
      )}
      <FilterBar>
        {contract && (
          <span className="inline-flex min-h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm">
            Contrato <strong className="tnum">{contractRow?.number ?? "…"}</strong>
            <button
              type="button"
              className="text-xs font-semibold text-primary"
              onClick={() => navigate({ to: ".", search: (p) => ({ ...p, contract: undefined }) })}
            >
              Limpar
            </button>
          </span>
        )}
        <SearchInput value={q} onChange={setQ} placeholder="Empresa ou contrato" />
        <NativeSelect
          className="sm:w-44"
          aria-label="Visão"
          value={view ?? ""}
          onChange={(e) =>
            navigate({ to: ".", search: (p) => ({ ...p, view: e.target.value || undefined }) })
          }
        >
          <option value="">Todas as parcelas</option>
          <option value="abertas">Em aberto</option>
          <option value="vencidas">Vencidas</option>
          <option value="pagas">Pagas</option>
        </NativeSelect>
      </FilterBar>
      {isLoading ? (
        <Loading />
      ) : iq.isError ? (
        <ErrorBox error={iq.error} onRetry={() => void iq.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={inst.length ? "Nenhuma parcela neste filtro" : "Nenhuma parcela lançada"}
          text="Parcelas são geradas no contrato, depois da emissão."
        />
      ) : (
        <DataList
          rows={rows}
          rowKey={(i: any) => i.id}
          selectedKey={sel ?? undefined}
          onRowClick={(i: any) => setSel(i.id)}
          columns={[
            {
              header: "Empresa",
              cell: (i: any) => (
                <span className="font-semibold">{i.contracts?.companies?.trade_name}</span>
              ),
            },
            {
              header: "Contrato",
              cell: (i: any) => (
                <span className="tnum">
                  {i.contracts?.number} · {i.number}ª
                </span>
              ),
            },
            {
              header: "Vencimento",
              cell: (i: any) => <span className="tnum">{fmtDate(i.due_date)}</span>,
            },
            {
              header: "Valor",
              cell: (i: any) => <span className="tnum">{brl(i.amount_cents)}</span>,
              className: "text-right",
            },
            {
              header: "Recebido",
              cell: (i: any) => <span className="tnum">{brl(paidOf(i))}</span>,
              className: "text-right",
            },
            {
              header: "Situação",
              cell: (i: any) => {
                const s = status(i);
                if (needsReview(i))
                  return (
                    <span className="text-xs font-semibold text-warning">
                      {s} · Revisar (contrato cancelado)
                    </span>
                  );
                return (
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      s === "Vencida" && "text-destructive",
                      s === "Paga" && "text-success",
                    )}
                  >
                    {s}
                  </span>
                );
              },
            },
          ]}
        />
      )}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && <InstallmentDetail i={selected} canWrite={can.write} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function InstallmentDetail({ i, canWrite }: { i: any; canWrite: boolean }) {
  const balance = Number(i.amount_cents) - paidOf(i);
  const [amount, setAmount] = useState(centsToInput(balance));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const m = useDbMutation(
    () => {
      const c = toCents(amount);
      if (!c || c <= 0) throw new Error("Valor inválido");
      return api.rpc("register_payment", {
        p_installment_id: i.id,
        p_amount_cents: c,
        p_paid_on: date,
        p_method: method || null,
        p_note: note || null,
        p_idempotency_key: key,
      });
    },
    { success: "Pagamento registrado" },
  );
  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-display text-xl">
          {i.number}ª parcela · {i.contracts?.companies?.trade_name}
        </SheetTitle>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        <p className="text-sm">
          <RelatedLink type="contract" id={i.contract_id}>
            Contrato {i.contracts?.number}
          </RelatedLink>{" "}
          · vence {fmtDate(i.due_date)}
        </p>
        <div className="grid grid-cols-2 gap-px bg-border text-sm tnum">
          <div className="min-w-0 bg-card p-3">
            Valor
            <br />
            <strong className="block break-words text-base">{brl(i.amount_cents)}</strong>
          </div>
          <div className="min-w-0 bg-card p-3">
            Saldo
            <br />
            <strong className="block break-words text-base">{brl(balance)}</strong>
          </div>
        </div>
        <Section title="Pagamentos registrados">
          {(i.payments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum.</p>
          ) : (
            <ul className="divide-y text-sm">
              {i.payments.map((p: any) => (
                <li key={p.id} className="py-1.5 tnum">
                  {fmtDate(p.paid_on)} · <strong>{brl(p.amount_cents)}</strong>{" "}
                  {p.method && `· ${p.method}`}
                  <br />
                  <span className="text-xs text-muted-foreground">
                    registrado {fmtDateTime(p.created_at)}
                    {p.note && ` · ${p.note}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {canWrite && balance > 0 && i.status !== "cancelada" && (
          <Section title="Registrar pagamento">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                m.mutate(undefined);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <FormRow label="Valor (R$)" htmlFor="pa">
                  <Input
                    id="pa"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </FormRow>
                <FormRow label="Data" htmlFor="pd">
                  <Input
                    id="pd"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </FormRow>
              </div>
              <FormRow label="Forma" htmlFor="pm">
                <Input
                  id="pm"
                  maxLength={60}
                  placeholder="PIX, boleto, transferência…"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                />
              </FormRow>
              <FormRow label="Observação" htmlFor="pn">
                <Input
                  id="pn"
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </FormRow>
              <Button type="submit" disabled={m.isPending || m.isSuccess}>
                Registrar
              </Button>
            </form>
          </Section>
        )}
        <Section title="Comprovantes">
          <AttachedDocuments
            entityType="installment"
            entityId={i.id}
            category="comprovante"
            canWrite={canWrite}
            extraLinks={[{ type: "contract", id: i.contract_id }]}
          />
        </Section>
      </div>
    </>
  );
}
