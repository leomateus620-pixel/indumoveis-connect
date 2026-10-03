/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload, Crosshair } from "lucide-react";
import { PageHeader, FilterBar, SearchInput, StatusBadge, DataList, EmptyState, Pending, Loading, Restricted, NativeSelect, FormRow, Field, Section } from "@/components/app/ui";
import { RelatedLink } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSpaces, useFloorPlans, useDeals, useContracts, useInspections, useCan, useDbMutation, api, useEditionId, uploadDocument, signedUrl } from "@/lib/api";
import { SPACE_STATUS, area, brl, toCents, centsToInput, DEAL_STATUS, CONTRACT_STATUS } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mapa")({
  validateSearch: (s: Record<string, unknown>): { status?: string; space?: string; deal?: string } => ({
    status: typeof s.status === "string" ? s.status : undefined,
    space: typeof s.space === "string" ? s.space : undefined,
    deal: typeof s.deal === "string" ? s.deal : undefined,
  }),
  head: () => ({ meta: [{ title: "Mapa Comercial — Sistema Indumóveis" }, { name: "description", content: "Espaços, localização e situação comercial." }] }),
  component: MapaPage,
});

const FILL: Record<string, string> = {
  disponivel: "bg-success/25 border-success",
  em_negociacao: "bg-info/25 border-info",
  reservado: "bg-warning/30 border-warning",
  vendido: "bg-primary/40 border-primary",
  bloqueado: "bg-muted-foreground/25 border-muted-foreground",
};

function MapaPage() {
  const can = useCan("mapa");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/mapa" });
  const { data: spaces = [], isLoading } = useSpaces();
  const { data: plans = [] } = useFloorPlans();
  const { data: deals = [] } = useDeals();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"lista" | "planta">("lista");
  const [planId, setPlanId] = useState<string>("");
  const [editing, setEditing] = useState<any | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);

  useEffect(() => { if (!planId && plans[0]) setPlanId(plans[0].id); }, [plans, planId]);
  useEffect(() => { if (plans.length) setView("planta"); }, [plans.length]);

  const highlightDeal = search.deal ? deals.find((d: any) => d.id === search.deal) : null;
  const highlightIds = new Set<string>((highlightDeal?.deal_spaces ?? []).map((x: any) => x.space_id));

  const filtered = useMemo(() => spaces.filter((s: any) =>
    (!search.status || s.commercial_status === search.status) &&
    (!q || [s.code, s.sector].some((v) => v?.toLowerCase().includes(q.toLowerCase())))), [spaces, search.status, q]);

  const selected = spaces.find((s: any) => s.id === search.space);
  const setSel = (id?: string) => navigate({ to: ".", search: (p) => ({ ...p, space: id }), replace: true });

  if (!can.read) return <Restricted />;

  return (
    <>
      <PageHeader title="Mapa Comercial" subtitle={`${spaces.length} espaços cadastrados`}
        actions={can.write && <>
          <PlanUpload />
          <Button size="sm" onClick={() => setEditing({})}><Plus className="size-4" />Novo espaço</Button>
        </>}>
        <div className="flex gap-1 pb-2" role="tablist">
          {(["planta", "lista"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-semibold", view === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {v === "planta" ? "Planta" : "Lista"}
            </button>
          ))}
        </div>
      </PageHeader>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar código ou setor" />
        <NativeSelect className="sm:w-48" aria-label="Situação" value={search.status ?? ""} onChange={(e) => navigate({ to: ".", search: (p) => ({ ...p, status: e.target.value || undefined }) })}>
          <option value="">Todas as situações</option>
          {Object.entries(SPACE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </NativeSelect>
        <div className="flex flex-wrap gap-3 text-xs sm:ml-auto" aria-label="Legenda">
          {Object.entries(SPACE_STATUS).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border", FILL[k])} />{v.label}</span>)}
        </div>
      </FilterBar>
      {highlightDeal && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-md bg-accent px-3 py-2 text-sm md:mx-8">
          <span>Destacando {highlightIds.size} espaço(s) da negociação com <strong>{highlightDeal.companies?.trade_name}</strong></span>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: ".", search: (p) => ({ ...p, deal: undefined }) })}>Limpar</Button>
        </div>
      )}

      {isLoading ? <Loading /> : view === "planta" ? (
        plans.length === 0 ? (
          <div className="px-4 md:px-8"><Pending title="Planta oficial não cadastrada">
            A planta dos pavilhões ainda não foi fornecida. {can.write ? "Envie a imagem da planta em “Enviar planta” e posicione cada espaço sobre ela." : "Solicite o cadastro à administração."} Enquanto isso, use a visualização em lista.
          </Pending></div>
        ) : (
          <div className="px-4 pb-8 md:px-8">
            {plans.length > 1 && <NativeSelect className="mb-3 sm:w-64" value={planId} onChange={(e) => setPlanId(e.target.value)}>{plans.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>}
            {placing && <p className="mb-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Arraste sobre a planta para definir a área do espaço {spaces.find((s: any) => s.id === placing)?.code}. <button className="ml-2 underline" onClick={() => setPlacing(null)}>Cancelar</button></p>}
            <PlanCanvas plan={plans.find((p: any) => p.id === planId)} spaces={spaces.filter((s: any) => s.floor_plan_id === planId)} visible={new Set(filtered.map((s: any) => s.id))}
              highlight={highlightIds} selected={search.space} onSelect={setSel} placing={placing} onPlaced={() => setPlacing(null)} />
            <p className="mt-2 text-xs text-muted-foreground">Selecionar um espaço apenas consulta seus dados; reservas são registradas em Comercialização.</p>
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState title={spaces.length ? "Nenhum espaço neste filtro" : "Nenhum espaço cadastrado"} text={spaces.length ? undefined : "A lista oficial de espaços, áreas e preços ainda não foi fornecida. Cadastre cada espaço quando as informações estiverem disponíveis."}
          action={can.write && !spaces.length && <Button onClick={() => setEditing({})}><Plus className="size-4" />Cadastrar espaço</Button>} />
      ) : (
        <DataList rows={filtered} rowKey={(s: any) => s.id} selectedKey={search.space} onRowClick={(s: any) => setSel(s.id)} columns={[
          { header: "Espaço", cell: (s: any) => <span className="font-semibold">{s.code}</span> },
          { header: "Setor", cell: (s: any) => s.sector ?? "—" },
          { header: "Área", cell: (s: any) => <span className="tnum">{area(s.area_m2)}</span>, className: "text-right" },
          { header: "Preço de tabela", cell: (s: any) => <span className="tnum">{brl(s.list_price_cents)}</span>, className: "text-right" },
          { header: "Situação", cell: (s: any) => <StatusBadge map={SPACE_STATUS} value={s.commercial_status} /> },
        ]} />
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSel(undefined)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && <SpaceDetail space={selected} canWrite={can.write} onEdit={() => setEditing(selected)} onPlace={() => { setPlacing(selected.id); setView("planta"); setSel(undefined); }} hasPlan={plans.length > 0} />}
        </SheetContent>
      </Sheet>
      <SpaceDialog space={editing} onClose={() => setEditing(null)} plans={plans} />
    </>
  );
}

function SpaceDetail({ space, canWrite, onEdit, onPlace, hasPlan }: { space: any; canWrite: boolean; onEdit: () => void; onPlace: () => void; hasPlan: boolean }) {
  const { data: deals = [] } = useDeals();
  const { data: contracts = [] } = useContracts();
  const { data: inspections = [] } = useInspections();
  const spaceDeals = deals.filter((d: any) => d.deal_spaces?.some((x: any) => x.space_id === space.id));
  const spaceContracts = contracts.filter((c: any) => c.contract_spaces?.some((x: any) => x.space_id === space.id));
  const spaceIns = inspections.filter((i: any) => i.space_id === space.id);
  return (
    <>
      <SheetHeader><SheetTitle className="font-display text-xl">Espaço {space.code}</SheetTitle></SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        <StatusBadge map={SPACE_STATUS} value={space.commercial_status} />
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Setor">{space.sector}</Field>
          <Field label="Área"><span className="tnum">{area(space.area_m2)}</span></Field>
          <Field label="Preço de tabela"><span className="tnum">{brl(space.list_price_cents)}</span></Field>
          <Field label="Posição na planta">{space.pos_x != null ? "Definida" : "Não definida"}</Field>
        </dl>
        {space.notes && <p className="text-sm text-muted-foreground">{space.notes}</p>}
        {canWrite && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={onEdit}>Editar</Button>{hasPlan && <Button size="sm" variant="outline" onClick={onPlace}><Crosshair className="size-4" />Posicionar</Button>}</div>}
        <Section title="Negociações">
          {spaceDeals.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma.</p> : spaceDeals.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between py-1 text-sm">
              <RelatedLink type="deal" id={d.id}>{d.companies?.trade_name}</RelatedLink><StatusBadge map={DEAL_STATUS} value={d.status} />
            </div>
          ))}
        </Section>
        <Section title="Contratos">
          {spaceContracts.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum.</p> : spaceContracts.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between py-1 text-sm">
              <RelatedLink type="contract" id={c.id}>{c.number} · {c.companies?.trade_name}</RelatedLink><StatusBadge map={CONTRACT_STATUS} value={c.status} />
            </div>
          ))}
        </Section>
        <Section title="Vistorias">
          {spaceIns.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma.</p> : spaceIns.map((i: any) => (
            <div key={i.id} className="py-1 text-sm"><RelatedLink type="inspection" id={i.id}>{i.kind === "entrega" ? "Entrega" : "Devolução"} · {i.status}</RelatedLink></div>
          ))}
        </Section>
      </div>
    </>
  );
}

function PlanCanvas({ plan, spaces, visible, highlight, selected, onSelect, placing, onPlaced }: any) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const m = useDbMutation((v: any) => api.update("spaces", placing, v), { success: "Posição salva", onSuccess: onPlaced });
  useEffect(() => { if (plan) signedUrl(plan.storage_path, 3600).then(setUrl).catch(() => setUrl(null)); }, [plan]);
  const pct = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  return (
    <div ref={ref} className={cn("relative w-full overflow-hidden rounded-lg border bg-card select-none", placing && "cursor-crosshair touch-none")}
      onPointerDown={(e) => { if (!placing) return; const p = pct(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
      onPointerMove={(e) => { if (!drag) return; const p = pct(e); setDrag({ ...drag, x1: p.x, y1: p.y }); }}
      onPointerUp={() => {
        if (!drag) return;
        const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
        setDrag(null);
        if (w > 0.5 && h > 0.5) m.mutate({ pos_x: x, pos_y: y, pos_w: w, pos_h: h, floor_plan_id: plan.id });
      }}>
      {url ? <img src={url} alt={plan?.name} className="block w-full" draggable={false} /> : <div className="aspect-video" />}
      {spaces.filter((s: any) => s.pos_x != null).map((s: any) => (
        <button key={s.id} type="button" aria-label={`Espaço ${s.code}: ${SPACE_STATUS[s.commercial_status]?.label}`}
          onClick={(e) => { e.stopPropagation(); if (!placing) onSelect(s.id); }}
          style={{ left: `${s.pos_x}%`, top: `${s.pos_y}%`, width: `${s.pos_w}%`, height: `${s.pos_h}%` }}
          className={cn("absolute flex items-center justify-center border-2 text-[10px] font-bold text-foreground transition-opacity focus-visible:outline-2 focus-visible:outline-ring",
            FILL[s.commercial_status], !visible.has(s.id) && "opacity-15", highlight.size && !highlight.has(s.id) && "opacity-25",
            highlight.has(s.id) && "ring-4 ring-brand-red", selected === s.id && "ring-4 ring-foreground")}>
          {s.code}
        </button>
      ))}
      {drag && <div className="absolute border-2 border-dashed border-brand-red bg-brand-red/10" style={{ left: `${Math.min(drag.x0, drag.x1)}%`, top: `${Math.min(drag.y0, drag.y1)}%`, width: `${Math.abs(drag.x1 - drag.x0)}%`, height: `${Math.abs(drag.y1 - drag.y0)}%` }} />}
    </div>
  );
}

function PlanUpload() {
  const edition = useEditionId();
  const ref = useRef<HTMLInputElement>(null);
  const m = useDbMutation(async (file: File) => {
    const doc = await uploadDocument({ file, category: "planta", editionId: edition, links: [] });
    return api.insert("floor_plans", { edition_id: edition, name: file.name.replace(/\.[^.]+$/, ""), storage_path: doc.storage_path });
  }, { success: "Planta cadastrada" });
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) m.mutate(f); e.target.value = ""; }} />
      <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => ref.current?.click()}><Upload className="size-4" />Enviar planta</Button>
    </>
  );
}

function SpaceDialog({ space, onClose, plans }: { space: any | null; onClose: () => void; plans: any[] }) {
  const edition = useEditionId();
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (space) setF({ code: space.code ?? "", sector: space.sector ?? "", area: space.area_m2 ?? "", price: centsToInput(space.list_price_cents), blocked: !!space.blocked, notes: space.notes ?? "", plan: space.floor_plan_id ?? plans[0]?.id ?? "" });
  }, [space, plans]);
  const m = useDbMutation(async () => {
    const price = f.price ? toCents(f.price) : null;
    if (price != null && Number.isNaN(price)) throw new Error("Preço inválido");
    const row = { code: f.code.trim(), sector: f.sector || null, area_m2: f.area === "" ? null : Number(f.area), list_price_cents: price, blocked: f.blocked, notes: f.notes || null, floor_plan_id: f.plan || null };
    if (!row.code) throw new Error("Informe o código");
    return space?.id ? api.update("spaces", space.id, row) : api.insert("spaces", { ...row, edition_id: edition });
  }, { success: "Espaço salvo", onSuccess: onClose });
  return (
    <Dialog open={!!space} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{space?.id ? `Editar espaço ${space.code}` : "Novo espaço"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(undefined); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label="Código *" htmlFor="sc"><Input id="sc" required maxLength={30} value={f.code ?? ""} onChange={(e) => setF({ ...f, code: e.target.value })} /></FormRow>
            <FormRow label="Setor / pavilhão" htmlFor="ss"><Input id="ss" maxLength={80} value={f.sector ?? ""} onChange={(e) => setF({ ...f, sector: e.target.value })} /></FormRow>
            <FormRow label="Área (m²)" htmlFor="sa"><Input id="sa" type="number" step="0.01" min="0" value={f.area ?? ""} onChange={(e) => setF({ ...f, area: e.target.value })} /></FormRow>
            <FormRow label="Preço de tabela (R$)" htmlFor="sp"><Input id="sp" inputMode="decimal" placeholder="0,00" value={f.price ?? ""} onChange={(e) => setF({ ...f, price: e.target.value })} /></FormRow>
          </div>
          {plans.length > 0 && <FormRow label="Planta" htmlFor="spl"><NativeSelect id="spl" value={f.plan ?? ""} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="">—</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></FormRow>}
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!f.blocked} onCheckedChange={(v) => setF({ ...f, blocked: v })} />Bloqueado para comercialização</label>
          <FormRow label="Observações" htmlFor="sn"><Textarea id="sn" maxLength={1000} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></FormRow>
          <DialogFooter><Button type="submit" disabled={m.isPending}>Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
