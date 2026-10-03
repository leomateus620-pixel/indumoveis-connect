/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, MapPin, FileText } from "lucide-react";
import { PageHeader, FilterBar, SearchInput, StatusBadge, DataList, EmptyState, Loading, Restricted, NativeSelect, FormRow, Field, Section, AttachedDocuments } from "@/components/app/ui";
import { CompanySelect, ProfileSelect, ConfirmNoteDialog, RelatedActivities, RelatedLink, useProfileName } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDeals, useDeal, useSpaces, useContracts, useCan, useDbMutation, api, useEditionId, useEdition, useMe } from "@/lib/api";
import { DEAL_STATUS, DEAL_TRANSITIONS, CONTRACT_STATUS, brl, area, fmtDate, fmtDateTime, toCents, centsToInput } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comercializacao")({
  validateSearch: (s: Record<string, unknown>): { status?: string; id?: string; company?: string } => ({
    status: typeof s.status === "string" ? s.status : undefined,
    id: typeof s.id === "string" ? s.id : undefined,
    company: typeof s.company === "string" ? s.company : undefined,
  }),
  head: () => ({ meta: [{ title: "Comercialização — Sistema Indumóveis" }, { name: "description", content: "Reservas, negociações e vendas de espaços." }] }),
  component: ComercialPage,
});

function ComercialPage() {
  const can = useCan("comercial");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/comercializacao" });
  const { data: deals = [], isLoading } = useDeals();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const name = useProfileName();

  useEffect(() => { if (search.company && can.write) setEditing({ company_id: search.company }); }, [search.company, can.write]);

  const rows = useMemo(() => deals.filter((d: any) => {
    const st = search.status;
    if (st === "ativas" && !["proposta", "negociacao", "reservada"].includes(d.status)) return false;
    if (st && st !== "ativas" && d.status !== st) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    return d.companies?.trade_name?.toLowerCase().includes(t) || d.companies?.legal_name?.toLowerCase().includes(t) || d.deal_spaces?.some((x: any) => x.spaces?.code?.toLowerCase().includes(t));
  }), [deals, search.status, q]);

  if (!can.read) return <Restricted />;
  const setId = (id?: string) => navigate({ to: ".", search: (p) => ({ ...p, id }), replace: true });

  return (
    <>
      <PageHeader title="Comercialização" subtitle="Propostas, negociações, reservas e contratações"
        actions={can.write && <Button size="sm" onClick={() => setEditing({})}><Plus className="size-4" />Nova negociação</Button>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Empresa ou espaço" />
        <NativeSelect className="sm:w-52" aria-label="Situação" value={search.status ?? ""} onChange={(e) => navigate({ to: ".", search: (p) => ({ ...p, status: e.target.value || undefined }) })}>
          <option value="">Todas</option><option value="ativas">Ativas</option>
          {Object.entries(DEAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </NativeSelect>
      </FilterBar>
      {isLoading ? <Loading /> : rows.length === 0 ? (
        <EmptyState title={deals.length ? "Nenhuma negociação neste filtro" : "Nenhuma negociação registrada"} text="Selecione uma empresa e vincule um ou mais espaços disponíveis para iniciar." />
      ) : (
        <DataList rows={rows} rowKey={(d: any) => d.id} selectedKey={search.id} onRowClick={(d: any) => setId(d.id)} columns={[
          { header: "Empresa", cell: (d: any) => <span className="font-semibold">{d.companies?.trade_name}</span> },
          { header: "Espaços", cell: (d: any) => d.deal_spaces?.map((x: any) => x.spaces?.code).join(", ") || "—" },
          { header: "Valor", cell: (d: any) => <span className="tnum">{brl(d.total_cents)}</span>, className: "text-right" },
          { header: "Responsável", cell: (d: any) => name(d.owner_id), mobile: false },
          { header: "Atualizado", cell: (d: any) => <span className="tnum">{fmtDate(d.updated_at)}</span>, mobile: false },
          { header: "Situação", cell: (d: any) => <StatusBadge map={DEAL_STATUS} value={d.status} /> },
        ]} />
      )}
      <Sheet open={!!search.id} onOpenChange={(o) => !o && setId(undefined)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {search.id && <DealDetail id={search.id} canWrite={can.write} onEdit={(d) => setEditing(d)} />}
        </SheetContent>
      </Sheet>
      <DealDialog deal={editing} onClose={() => { setEditing(null); if (search.company) navigate({ to: ".", search: (p) => ({ ...p, company: undefined }) }); }} onSaved={(id) => setId(id)} />
    </>
  );
}

function DealDetail({ id, canWrite, onEdit }: { id: string; canWrite: boolean; onEdit: (d: any) => void }) {
  const { data: d, isLoading } = useDeal(id);
  const { data: contracts = [] } = useContracts();
  const { data: edition } = useEdition();
  const ctCan = useCan("contratos");
  const navigate = useNavigate();
  const name = useProfileName();
  const [to, setTo] = useState<string | null>(null);
  const tr = useDbMutation((v: { to: string; note: string }) => api.rpc("transition_deal", { p_deal_id: id, p_to: v.to, p_note: v.note }), { success: "Situação atualizada", onSuccess: () => setTo(null) });
  const mkContract = useDbMutation(() => api.rpc<string>("create_contract_from_deal", { p_deal_id: id }), {
    success: "Rascunho de contrato preparado", onSuccess: (cid) => navigate({ to: "/contratos/$id", params: { id: cid } }),
  });
  if (isLoading || !d) return <Loading />;
  const contract = contracts.find((c: any) => c.deal_id === id && c.status !== "cancelado");
  const expired = d.status === "reservada" && edition?.reservation_hold_days && d.reserved_at &&
    new Date(d.reserved_at).getTime() + edition.reservation_hold_days * 86400000 < Date.now();
  return (
    <>
      <SheetHeader><SheetTitle className="font-display text-xl">{d.companies?.trade_name}</SheetTitle></SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge map={DEAL_STATUS} value={d.status} />
          {expired && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-destructive">Prazo de reserva excedido (política: {edition!.reservation_hold_days} dias)</span>}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Razão social"><RelatedLink type="company" id={d.company_id}>{d.companies?.legal_name}</RelatedLink></Field>
          <Field label="Responsável">{name(d.owner_id)}</Field>
          <Field label="Valor negociado"><span className="tnum">{brl(d.total_cents)}</span></Field>
          <Field label="Reservada em">{fmtDate(d.reserved_at)}</Field>
        </dl>
        {d.conditions && <div><p className="text-xs font-medium text-muted-foreground">Condições</p><p className="whitespace-pre-wrap text-sm">{d.conditions}</p></div>}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {DEAL_TRANSITIONS[d.status].map((s) => (
              <Button key={s} size="sm" variant={["perdida", "cancelada"].includes(s) ? "outline" : "default"} onClick={() => setTo(s)}>
                {s === "negociacao" && d.status === "proposta" ? "Iniciar negociação" : s === "reservada" ? "Registrar reserva" : s === "contratada" ? "Marcar como contratada" : `Mover para ${DEAL_STATUS[s].label.toLowerCase()}`}
              </Button>
            ))}
            {!["contratada", "perdida", "cancelada"].includes(d.status) && <Button size="sm" variant="outline" onClick={() => onEdit(d)}>Editar</Button>}
          </div>
        )}
        <Section title="Espaços" actions={<Link to="/mapa" search={{ deal: d.id }} className="flex items-center gap-1 text-xs font-semibold text-primary"><MapPin className="size-3" />Ver no mapa</Link>}>
          <ul className="divide-y text-sm">
            {d.deal_spaces?.map((x: any) => (
              <li key={x.space_id} className="flex justify-between py-1.5"><RelatedLink type="space" id={x.space_id}>{x.spaces?.code}</RelatedLink><span className="tnum text-muted-foreground">{area(x.spaces?.area_m2)} · {brl(x.price_cents)}</span></li>
            ))}
          </ul>
        </Section>
        <Section title="Contrato">
          {contract ? (
            <div className="flex items-center justify-between text-sm"><RelatedLink type="contract" id={contract.id}>Contrato {contract.number}</RelatedLink><StatusBadge map={CONTRACT_STATUS} value={contract.status} /></div>
          ) : ["negociacao", "reservada"].includes(d.status) && ctCan.write ? (
            <Button size="sm" variant="outline" disabled={mkContract.isPending} onClick={() => mkContract.mutate(undefined)}><FileText className="size-4" />Preparar contrato</Button>
          ) : <p className="text-sm text-muted-foreground">{d.status === "proposta" ? "Disponível após iniciar a negociação." : "Nenhum contrato."}</p>}
        </Section>
        <Section title="Histórico">
          <ol className="space-y-2 text-sm">
            {[...(d.deal_events ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)).map((e: any) => (
              <li key={e.id} className="border-l-2 border-border pl-3">
                <p><strong>{DEAL_STATUS[e.to_status]?.label}</strong>{e.from_status && <span className="text-muted-foreground"> (de {DEAL_STATUS[e.from_status]?.label})</span>}</p>
                <p className="text-xs text-muted-foreground tnum">{fmtDateTime(e.created_at)} · {name(e.actor)}</p>
                {e.note && <p className="text-muted-foreground">{e.note}</p>}
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Atividades"><RelatedActivities type="deal" id={d.id} /></Section>
        <Section title="Documentos"><AttachedDocuments entityType="deal" entityId={d.id} category="geral" canWrite={canWrite} extraLinks={[{ type: "company", id: d.company_id }]} /></Section>
      </div>
      <ConfirmNoteDialog open={!!to} onOpenChange={(o) => !o && setTo(null)} busy={tr.isPending}
        title={to ? `Confirmar: ${DEAL_STATUS[to].label}` : ""} label={to && ["perdida", "cancelada"].includes(to) ? "Motivo" : "Observação"}
        required={!!to && ["perdida", "cancelada"].includes(to)} onConfirm={(note) => tr.mutate({ to: to!, note })} />
    </>
  );
}

function DealDialog({ deal, onClose, onSaved }: { deal: any | null; onClose: () => void; onSaved: (id: string) => void }) {
  const edition = useEditionId();
  const { data: me } = useMe();
  const { data: spaces = [] } = useSpaces();
  const [company, setCompany] = useState("");
  const [owner, setOwner] = useState("");
  const [conditions, setConditions] = useState("");
  const [notes, setNotes] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({});
  const [key, setKey] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!deal) return;
    setCompany(deal.company_id ?? ""); setOwner(deal.owner_id ?? me?.id ?? ""); setConditions(deal.conditions ?? ""); setNotes(deal.notes ?? "");
    setSel(Object.fromEntries((deal.deal_spaces ?? []).map((x: any) => [x.space_id, centsToInput(x.price_cents)])));
    setKey(crypto.randomUUID()); setQ("");
  }, [deal, me?.id]);
  const options = spaces.filter((s: any) => (s.commercial_status === "disponivel" || sel[s.id] !== undefined || s.active_deal_id === deal?.id) && (!q || s.code.toLowerCase().includes(q.toLowerCase())));
  const total = Object.values(sel).reduce((a, v) => a + (toCents(v || "0") || 0), 0);
  const m = useDbMutation(async () => {
    const ids = Object.keys(sel);
    const prices = ids.map((i) => toCents(sel[i] || "0"));
    if (prices.some((p) => Number.isNaN(p) || p < 0)) throw new Error("Valor inválido em algum espaço");
    return api.rpc<string>("save_deal", { p_deal_id: deal?.id ?? null, p_edition_id: edition, p_company_id: company, p_owner_id: owner || null, p_conditions: conditions || null, p_notes: notes || null, p_space_ids: ids, p_prices: prices, p_idempotency_key: deal?.id ? null : key });
  }, { success: "Negociação salva", onSuccess: (id) => { onClose(); onSaved(id); } });
  return (
    <Dialog open={!!deal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{deal?.id ? "Editar negociação" : "Nova negociação"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(undefined); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label="Empresa *" htmlFor="dc"><CompanySelect id="dc" value={company} onChange={setCompany} /></FormRow>
            <FormRow label="Responsável" htmlFor="do"><ProfileSelect id="do" value={owner} onChange={setOwner} /></FormRow>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-medium">Espaços * <span className="text-muted-foreground">({Object.keys(sel).length} selecionados)</span></span>
              <Input className="h-8 w-40" placeholder="Filtrar código" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar espaços" /></div>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {options.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum espaço disponível. Cadastre espaços em Mapa Comercial.</p>}
              {options.map((s: any) => {
                const on = sel[s.id] !== undefined;
                return (
                  <div key={s.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
                    <Checkbox id={`sp-${s.id}`} checked={on} onCheckedChange={(v) => setSel((p) => { const n = { ...p }; if (v) n[s.id] = centsToInput(s.list_price_cents) || ""; else delete n[s.id]; return n; })} />
                    <label htmlFor={`sp-${s.id}`} className="flex-1 text-sm"><strong>{s.code}</strong> <span className="text-muted-foreground">{s.sector} · {area(s.area_m2)}</span></label>
                    {on && <Input aria-label={`Valor ${s.code}`} className="h-8 w-32 text-right tnum" inputMode="decimal" value={sel[s.id]} onChange={(e) => setSel({ ...sel, [s.id]: e.target.value })} placeholder="0,00" />}
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-right text-sm">Total: <strong className="tnum">{brl(total)}</strong></p>
          </div>
          <FormRow label="Condições comerciais" htmlFor="dcond"><Textarea id="dcond" maxLength={4000} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Forma de pagamento, descontos, prazos…" /></FormRow>
          <FormRow label="Observações internas" htmlFor="dn"><Textarea id="dn" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></FormRow>
          <DialogFooter><Button type="submit" disabled={m.isPending || !company || Object.keys(sel).length === 0}>Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
