/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader, FilterBar, Loading, Restricted, StatusBadge, NativeSelect, EmptyState } from "@/components/app/ui";
import { ActivityDialog, RelatedLink, RELATED_LABEL, useProfileName } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useActivities, useInspections, useInstallments, useCan, useDbMutation, api, useMe } from "@/lib/api";
import { ACTIVITY_STATUS, fmtDate, today, brl } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda / Atividades — Sistema Indumóveis" }, { name: "description", content: "Prazos, reuniões, entregas e pendências." }] }),
  component: AgendaPage,
});

type Item = { key: string; date: string | null; title: string; source: string; activity?: any; link?: { type: string; id: string }; done: boolean };

function AgendaPage() {
  const can = useCan("agenda");
  const fin = useCan("financeiro");
  const { data: me } = useMe();
  const { data: acts = [], isLoading } = useActivities();
  const { data: ins = [] } = useInspections();
  const { data: inst = [] } = useInstallments(fin.read);
  const name = useProfileName();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("abertas");
  const [view, setView] = useState<"lista" | "mes">("lista");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const toggle = useDbMutation((a: any) => api.update("activities", a.id, { status: a.status === "aberta" ? "concluida" : "aberta" }));
  const t = today();

  // Datas vindas dos próprios registros (sem duplicar em atividades)
  const items: Item[] = useMemo(() => ([
    ...acts.map((a: any) => ({ key: a.id, date: a.due_at?.slice(0, 10) ?? null, title: a.title, source: "Atividade", activity: a, link: a.related_type ? { type: a.related_type, id: a.related_id } : undefined, done: a.status !== "aberta" })),
    ...ins.filter((i: any) => i.scheduled_for).map((i: any) => ({ key: "i" + i.id, date: i.scheduled_for, title: `Vistoria de ${i.kind === "entrega" ? "entrega" : "devolução"} · ${i.spaces?.code}`, source: "Vistoria", link: { type: "inspection", id: i.id }, done: i.status === "concluida" })),
    ...inst.map((i: any) => ({ key: "p" + i.id, date: i.due_date, title: `Vencimento ${i.number}ª parcela · ${i.contracts?.companies?.trade_name} · ${brl(i.amount_cents)}`, source: "Financeiro", link: { type: "contract", id: i.contract_id }, done: i.status !== "aberta" })),
  ] as Item[]).filter((x) => filter === "todas" || (filter === "minhas" ? x.activity?.assignee_id === me?.id && !x.done : !x.done))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")), [acts, ins, inst, filter, me?.id]);

  if (!can.read) return <Restricted />;

  return (
    <>
      <PageHeader title="Agenda / Atividades" subtitle="Atividades, vistorias agendadas e vencimentos em uma só visão"
        actions={can.write && <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />Nova atividade</Button>}>
        <div className="flex gap-1 pb-2" role="tablist">
          {(["lista", "mes"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1.5 text-sm font-semibold", view === v ? "bg-accent" : "text-muted-foreground")}>{v === "lista" ? "Lista" : "Mês"}</button>
          ))}
        </div>
      </PageHeader>
      <FilterBar>
        <NativeSelect className="sm:w-48" aria-label="Filtro" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="abertas">Pendentes</option><option value="minhas">Minhas atividades</option><option value="todas">Tudo</option>
        </NativeSelect>
      </FilterBar>
      {isLoading ? <Loading /> : view === "lista" ? (
        items.length === 0 ? <EmptyState title="Nada pendente" /> : (
          <ul className="mx-4 mb-8 divide-y rounded-lg border bg-card md:mx-8">
            {items.map((x) => (
              <li key={x.key} className="flex items-center gap-3 px-3 py-2.5">
                {x.activity && can.write ? <Checkbox aria-label="Concluir" checked={x.done} onCheckedChange={() => toggle.mutate(x.activity)} /> : <span className="size-4" />}
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", x.done && "line-through text-muted-foreground")}>{x.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {x.source}{x.activity && ` · ${name(x.activity.assignee_id)}`}
                    {x.link && <> · <RelatedLink type={x.link.type} id={x.link.id}>{RELATED_LABEL[x.link.type]}</RelatedLink></>}
                  </p>
                </div>
                {x.activity && <StatusBadge map={ACTIVITY_STATUS} value={x.activity.status} />}
                <span className={cn("tnum w-20 shrink-0 text-right text-xs", x.date && x.date < t && !x.done ? "font-semibold text-destructive" : "text-muted-foreground")}>{x.date ? fmtDate(x.date) : "sem data"}</span>
              </li>
            ))}
          </ul>
        )
      ) : <MonthGrid month={month} setMonth={setMonth} items={items} />}
      <ActivityDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function MonthGrid({ month, setMonth, items }: { month: Date; setMonth: (d: Date) => void; items: Item[] }) {
  const start = new Date(month); start.setDate(1 - month.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const t = today();
  return (
    <div className="px-4 pb-8 md:px-8">
      <div className="mb-2 flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button>
        <p className="min-w-40 text-center font-display font-bold capitalize">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
        <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border bg-card text-xs">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="border-b bg-muted/60 px-2 py-1.5 font-semibold text-muted-foreground">{d}</div>)}
        {days.map((d) => {
          const k = iso(d); const list = items.filter((x) => x.date === k);
          return (
            <div key={k} className={cn("min-h-24 border-b border-r p-1.5", d.getMonth() !== month.getMonth() && "bg-muted/30 text-muted-foreground")}>
              <p className={cn("tnum mb-1 font-semibold", k === t && "inline-block rounded bg-brand-red px-1 text-primary-foreground")}>{d.getDate()}</p>
              {list.slice(0, 3).map((x) => <p key={x.key} className="truncate rounded bg-accent px-1 py-0.5" title={x.title}>{x.title}</p>)}
              {list.length > 3 && <p className="text-muted-foreground">+{list.length - 3}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
