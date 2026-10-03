/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { PageHeader, Stat, Section, Pending, Loading } from "@/components/app/ui";
import { useActivities, useCan, useContracts, useDeals, useEdition, useFloorPlans, useInspections, useInstallments, useSpaces } from "@/lib/api";
import { brl, fmtDate, today, SPACE_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Sistema Indumóveis" }, { name: "description", content: "Visão operacional da edição." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: edition } = useEdition();
  const fin = useCan("financeiro");
  const spaces = useSpaces();
  const deals = useDeals();
  const contracts = useContracts();
  const inspections = useInspections();
  const activities = useActivities();
  const installments = useInstallments(fin.read);
  const plans = useFloorPlans();
  const t = today();

  const s = useMemo(() => {
    const sp = spaces.data ?? [];
    const byStatus: Record<string, number> = {};
    for (const x of sp) byStatus[x.commercial_status] = (byStatus[x.commercial_status] ?? 0) + 1;
    const dl = deals.data ?? [];
    const active = dl.filter((d) => ["proposta", "negociacao", "reservada"].includes(d.status));
    const ct = contracts.data ?? [];
    const ins = installments.data ?? [];
    const negotiated = dl.filter((d) => ["negociacao", "reservada", "contratada"].includes(d.status)).reduce((a, d) => a + Number(d.total_cents), 0);
    const forecast = ins.filter((i) => i.status !== "cancelada").reduce((a, i) => a + Number(i.amount_cents), 0);
    const received = ins.reduce((a, i) => a + (i.payments ?? []).reduce((b: number, p: any) => b + Number(p.amount_cents), 0), 0);
    const overdue = ins.filter((i) => i.status === "aberta" && i.due_date < t);
    return {
      total: sp.length, byStatus, active: active.length, reserved: dl.filter((d) => d.status === "reservada").length,
      ctElab: ct.filter((c) => c.status === "elaboracao").length, ctEmit: ct.filter((c) => c.status === "emitido").length, ctSigned: ct.filter((c) => c.status === "assinado").length,
      negotiated, forecast, received, overdue,
      insPending: (inspections.data ?? []).filter((i) => i.status !== "concluida"),
      acts: (activities.data ?? []).filter((a) => a.status === "aberta").slice(0, 8),
      reservedNoContract: dl.filter((d) => d.status === "reservada" && !ct.some((c) => c.deal_id === d.id && c.status !== "cancelado")),
      emittedUnsigned: ct.filter((c) => c.status === "emitido"),
    };
  }, [spaces.data, deals.data, contracts.data, installments.data, inspections.data, activities.data, t]);

  if (spaces.isLoading || deals.isLoading) return <><PageHeader title="Dashboard" /><Loading /></>;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={edition ? `Operação da edição ${edition.name}` : undefined} />
      <div className="space-y-6 p-4 md:p-8">
        {(plans.data?.length ?? 0) === 0 && s.total === 0 && (
          <Pending title="Espaços ainda não cadastrados">
            A planta oficial e a lista de espaços não foram fornecidas. Cadastre os espaços em <Link to="/mapa" className="font-semibold text-primary underline">Mapa Comercial</Link> para liberar comercialização e indicadores.
          </Pending>
        )}

        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Comercialização</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Espaços disponíveis" value={`${s.byStatus.disponivel ?? 0}`} hint={`de ${s.total} cadastrados`} to="/mapa" search={{ status: "disponivel" }} />
            <Stat label={SPACE_STATUS.reservado.label + "s"} value={s.byStatus.reservado ?? 0} to="/mapa" search={{ status: "reservado" }} />
            <Stat label="Vendidos" value={s.byStatus.vendido ?? 0} hint="contrato com assinatura registrada" to="/mapa" search={{ status: "vendido" }} />
            <Stat label="Negociações ativas" value={s.active} hint="proposta, negociação ou reserva" to="/comercializacao" search={{ status: "ativas" }} />
            <Stat label="Contratos" value={`${s.ctSigned}/${(contracts.data ?? []).filter((c) => c.status !== "cancelado").length}`} hint={`${s.ctElab} em elaboração · ${s.ctEmit} emitidos`} to="/contratos" />
          </div>
        </div>

        {fin.read && (
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Financeiro operacional</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Negociado" value={brl(s.negotiated)} hint="negociações em andamento, reservadas e contratadas" to="/comercializacao" />
              <Stat label="Previsto em parcelas" value={brl(s.forecast)} hint="parcelas lançadas em contratos" to="/financeiro" />
              <Stat label="Recebido" value={brl(s.received)} hint="pagamentos registrados" to="/financeiro" search={{ view: "pagas" }} />
              <Stat label="Vencido" value={brl(s.overdue.reduce((a, i) => a + Number(i.amount_cents) - (i.payments ?? []).reduce((b: number, p: any) => b + Number(p.amount_cents), 0), 0))} hint={`${s.overdue.length} parcelas`} to="/financeiro" search={{ view: "vencidas" }} />
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Pendências que exigem ação">
            <ul className="divide-y text-sm">
              {s.reservedNoContract.map((d) => (
                <PendingItem key={d.id} to="/comercializacao" search={{ id: d.id }} text={`Reserva sem contrato: ${d.companies?.trade_name}`} />
              ))}
              {s.emittedUnsigned.map((c) => (
                <PendingItem key={c.id} to={`/contratos/${c.id}`} text={`Contrato ${c.number} emitido aguardando assinatura · ${c.companies?.trade_name}`} />
              ))}
              {fin.read && s.overdue.slice(0, 5).map((i) => (
                <PendingItem key={i.id} to="/financeiro" search={{ view: "vencidas" }} text={`Parcela ${i.number} vencida em ${fmtDate(i.due_date)} · ${i.contracts?.companies?.trade_name}`} />
              ))}
              {s.insPending.slice(0, 5).map((i) => (
                <PendingItem key={i.id} to={`/vistorias/${i.id}`} text={`Vistoria de ${i.kind} pendente · espaço ${i.spaces?.code}${i.scheduled_for ? " · " + fmtDate(i.scheduled_for) : ""}`} />
              ))}
              {s.reservedNoContract.length + s.emittedUnsigned.length + s.insPending.length + (fin.read ? s.overdue.length : 0) === 0 && (
                <li className="py-3 text-muted-foreground">Nenhuma pendência no momento.</li>
              )}
            </ul>
          </Section>
          <Section title="Próximas atividades" actions={<Link to="/agenda" className="text-xs font-semibold text-primary">Ver agenda</Link>}>
            <ul className="divide-y text-sm">
              {s.acts.length === 0 && <li className="py-3 text-muted-foreground">Nenhuma atividade aberta.</li>}
              {s.acts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{a.title}</span>
                  <span className={"tnum shrink-0 text-xs " + (a.due_at && a.due_at.slice(0, 10) < t ? "font-semibold text-destructive" : "text-muted-foreground")}>{fmtDate(a.due_at)}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}

function PendingItem({ to, search, text }: { to: string; search?: any; text: string }) {
  return (
    <li>
      <Link to={to as any} search={search} className="flex items-center gap-2 py-2 hover:text-primary">
        <AlertCircle className="size-4 shrink-0 text-brand-red" />
        <span className="min-w-0 flex-1 truncate">{text}</span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
