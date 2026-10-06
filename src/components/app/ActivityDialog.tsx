/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { FormRow, NativeSelect } from "./ui";
import {
  saveActivity,
  useActivityCategories,
  useAgendaPeople,
  useCommissions,
  useDbMutation,
  useEdition,
  useMe,
} from "@/lib/api";
import { localInputInZone } from "@/lib/agenda";
import { cn } from "@/lib/utils";

type Related = { type: string; id: string };

export function ActivityDialog({
  open,
  onOpenChange,
  related,
  defaults,
  activity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  related?: Related;
  defaults?: { title?: string; description?: string };
  activity?: any;
}) {
  const { data: edition } = useEdition();
  const { data: me } = useMe();
  const { data: categories = [] } = useActivityCategories();
  const { data: commissions = [] } = useCommissions();
  const { data: people = [] } = useAgendaPeople();
  const idempotency = useRef(crypto.randomUUID());
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState(() => blankForm(defaults, related));

  useEffect(() => {
    if (!open) return;
    setForm(activity ? activityForm(activity, edition?.timezone) : blankForm(defaults, related, me?.id));
    setDirty(false);
    if (!activity) idempotency.current = crypto.randomUUID();
  }, [open, activity, edition?.timezone, defaults, related, me?.id]);

  const close = (next: boolean) => {
    if (!next && dirty && !window.confirm("Descartar as alterações não salvas?")) return;
    onOpenChange(next);
  };
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const mutation = useDbMutation(
    () => {
      if (!edition) throw new Error("A edição ainda não foi carregada");
      if (form.end && !form.start) throw new Error("Informe o início antes do fim");
      if (form.end && form.end < form.start) throw new Error("O fim não pode ser anterior ao início");
      return saveActivity({
        p_activity_id: activity?.id ?? null,
        p_edition_id: edition.id,
        p_title: form.title,
        p_description: form.description || null,
        p_kind: form.kind,
        p_category_id: form.categoryId || null,
        p_start_local: form.start || null,
        p_end_local: form.end || null,
        p_all_day: form.allDay,
        p_location: form.location || null,
        p_primary_assignee: form.primaryAssignee || null,
        p_assignee_ids: form.assigneeIds,
        p_commission_ids: form.commissionIds,
        p_related_type: form.relatedType || null,
        p_related_id: form.relatedId || null,
        p_expected_version: activity?.version ?? 0,
        p_idempotency_key: activity ? null : idempotency.current,
      });
    },
    {
      success: activity ? "Atividade atualizada" : "Atividade registrada",
      onSuccess: () => {
        setDirty(false);
        onOpenChange(false);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activity ? "Editar atividade" : "Nova atividade"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(undefined);
          }}
        >
          <FormGroup title="Informações principais">
            <FormRow label="Título *" htmlFor="activity-title">
              <Input id="activity-title" required maxLength={200} value={form.title} onChange={(event) => set("title", event.target.value)} />
            </FormRow>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormRow label="Tipo" htmlFor="activity-kind">
                <NativeSelect id="activity-kind" value={form.kind} onChange={(event) => set("kind", event.target.value)}>
                  <option value="tarefa">Tarefa</option><option value="reuniao">Reunião</option><option value="prazo">Prazo</option><option value="entrega">Entrega</option><option value="pendencia">Pendência</option>
                </NativeSelect>
              </FormRow>
              <FormRow label="Categoria" htmlFor="activity-category">
                <NativeSelect id="activity-category" value={form.categoryId} onChange={(event) => set("categoryId", event.target.value)}>
                  <option value="">Sem categoria</option>
                  {categories.filter((row: any) => row.is_active || row.id === form.categoryId).map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </NativeSelect>
              </FormRow>
            </div>
            <FormRow label="Descrição" htmlFor="activity-description">
              <Textarea id="activity-description" maxLength={4000} value={form.description} onChange={(event) => set("description", event.target.value)} />
            </FormRow>
          </FormGroup>

          <FormGroup title="Programação">
            <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
              <Checkbox checked={form.allDay} onCheckedChange={(value) => set("allDay", value === true)} /> Dia inteiro
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormRow label="Início" htmlFor="activity-start"><Input id="activity-start" type="datetime-local" value={form.start} onChange={(event) => set("start", event.target.value)} /></FormRow>
              <FormRow label="Fim" htmlFor="activity-end"><Input id="activity-end" type="datetime-local" min={form.start || undefined} value={form.end} onChange={(event) => set("end", event.target.value)} /></FormRow>
            </div>
            <FormRow label="Local" htmlFor="activity-location"><Input id="activity-location" maxLength={240} value={form.location} onChange={(event) => set("location", event.target.value)} placeholder="Preenchido pela equipe" /></FormRow>
            <p className="text-xs text-muted-foreground">Horários em {edition?.timezone ?? "America/Sao_Paulo"}.</p>
          </FormGroup>

          <FormGroup title="Responsabilidade">
            <FormRow label="Responsável principal" htmlFor="activity-primary">
              <NativeSelect id="activity-primary" value={form.primaryAssignee} onChange={(event) => set("primaryAssignee", event.target.value)}>
                <option value="">Sem responsável principal</option>
                {people.map((person: any) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}
              </NativeSelect>
            </FormRow>
            <MultiSelect label="Demais responsáveis" items={people.map((person: any) => ({ id: person.id, label: person.full_name || person.email }))} values={form.assigneeIds.filter((id) => id !== form.primaryAssignee)} onChange={(values) => set("assigneeIds", values)} />
            <MultiSelect label="Comissões relacionadas" items={commissions.filter((row: any) => row.is_active || form.commissionIds.includes(row.id)).map((row: any) => ({ id: row.id, label: row.name }))} values={form.commissionIds} onChange={(values) => set("commissionIds", values)} />
          </FormGroup>

          <FormGroup title="Vínculo">
            <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <FormRow label="Origem" htmlFor="activity-related-type">
                <NativeSelect id="activity-related-type" value={form.relatedType} disabled={!!related} onChange={(event) => { set("relatedType", event.target.value); set("relatedId", ""); }}>
                  <option value="">Sem vínculo</option><option value="company">Empresa</option><option value="deal">Negociação</option><option value="contract">Contrato</option><option value="inspection">Vistoria</option><option value="space">Espaço</option><option value="installment">Parcela</option>
                </NativeSelect>
              </FormRow>
              <FormRow label="Identificador" htmlFor="activity-related-id">
                <Input id="activity-related-id" value={form.relatedId} disabled={!!related || !form.relatedType} onChange={(event) => set("relatedId", event.target.value)} placeholder="Selecione a partir do módulo de origem" />
              </FormRow>
            </div>
          </FormGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>Voltar</Button>
            <Button type="submit" disabled={mutation.isPending || !form.title.trim()}>{mutation.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="space-y-3 border-t pt-4"><legend className="pr-3 font-display text-sm font-bold">{title}</legend>{children}</fieldset>;
}

function MultiSelect({ label, items, values, onChange }: { label: string; items: { id: string; label: string }[]; values: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => items.filter((item) => values.includes(item.id)), [items, values]);
  return <div className="space-y-1.5"><p className="text-sm font-medium">{label}</p><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal"><span>{selected.length ? `${selected.length} selecionado${selected.length > 1 ? "s" : ""}` : "Selecionar…"}</span><ChevronsUpDown className="size-4 opacity-60" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command><CommandInput placeholder="Buscar…" /><CommandList><CommandEmpty>Nenhum resultado.</CommandEmpty><CommandGroup>{items.map((item) => <CommandItem key={item.id} value={item.label} onSelect={() => onChange(values.includes(item.id) ? values.filter((id) => id !== item.id) : [...values, item.id])}><Check className={cn("size-4", values.includes(item.id) ? "opacity-100" : "opacity-0")} />{item.label}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>{selected.length > 0 && <div className="flex flex-wrap gap-1.5">{selected.map((item) => <span key={item.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">{item.label}<button type="button" aria-label={`Remover ${item.label}`} onClick={() => onChange(values.filter((id) => id !== item.id))}><X className="size-3" /></button></span>)}</div>}</div>;
}

function blankForm(defaults?: { title?: string; description?: string }, related?: Related, me?: string) {
  return { title: defaults?.title ?? "", description: defaults?.description ?? "", kind: "tarefa", categoryId: "", start: "", end: "", allDay: false, location: "", primaryAssignee: me ?? "", assigneeIds: [] as string[], commissionIds: [] as string[], relatedType: related?.type ?? "", relatedId: related?.id ?? "" };
}

function activityForm(activity: any, timeZone = "America/Sao_Paulo") {
  return { title: activity.title, description: activity.description ?? "", kind: activity.kind, categoryId: activity.category_id ?? "", start: localInputInZone(activity.start_at, timeZone), end: localInputInZone(activity.end_at, timeZone), allDay: !!activity.all_day, location: activity.location ?? "", primaryAssignee: activity.assignee_id ?? "", assigneeIds: (activity.activity_assignees ?? []).map((row: any) => row.profile_id), commissionIds: (activity.activity_commissions ?? []).map((row: any) => row.commission_id), relatedType: activity.related_type ?? "", relatedId: activity.related_id ?? "" };
}