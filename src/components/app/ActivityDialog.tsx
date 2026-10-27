/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarPlus2,
  Check,
  ChevronsUpDown,
  FileText,
  Link2,
  LoaderCircle,
  Pencil,
  Save,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import "./ActivityDialog.css";

type Related = { type: string; id: string };
type ActivityForm = ReturnType<typeof blankForm>;
type EditorSession = {
  identity: string;
  snapshot: any;
  expectedVersion: number;
  timeZone?: string;
  title?: string;
  description?: string;
  relatedType?: string;
  relatedId?: string;
  userId?: string;
  touched: Set<keyof ActivityForm>;
};

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
  const session = useRef<EditorSession | null>(null);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState(() => blankForm(defaults, related));

  useEffect(() => {
    if (!open) {
      session.current = null;
      return;
    }
    const identity = activity?.id ?? "new";
    if (!session.current || session.current.identity !== identity) {
      // Keep the record/version that this editing session actually started from.
      session.current = {
        identity,
        snapshot: activity,
        expectedVersion: activity?.version ?? 0,
        timeZone: edition?.timezone,
        title: defaults?.title,
        description: defaults?.description,
        relatedType: related?.type,
        relatedId: related?.id,
        userId: me?.id,
        touched: new Set(),
      };
      setForm(
        activity ? activityForm(activity, edition?.timezone) : blankForm(defaults, related, me?.id),
      );
      setDirty(false);
      if (!activity) idempotency.current = crypto.randomUUID();
      return;
    }

    // Late context may fill untouched fields, without replacing a draft after a refetch.
    const current = session.current;
    const patch: Partial<ActivityForm> = {};
    const fill = <K extends keyof ActivityForm>(key: K, value: ActivityForm[K]) => {
      if (!current.touched.has(key)) patch[key] = value;
    };
    if (current.timeZone !== edition?.timezone) {
      current.timeZone = edition?.timezone;
      if (current.snapshot) {
        const localized = activityForm(current.snapshot, edition?.timezone);
        fill("start", localized.start);
        fill("end", localized.end);
      }
    }
    if (!current.snapshot) {
      if (current.title !== defaults?.title) fill("title", defaults?.title ?? "");
      if (current.description !== defaults?.description)
        fill("description", defaults?.description ?? "");
      if (current.relatedType !== related?.type) fill("relatedType", related?.type ?? "");
      if (current.relatedId !== related?.id) fill("relatedId", related?.id ?? "");
      if (current.userId !== me?.id) fill("primaryAssignee", me?.id ?? "");
      current.title = defaults?.title;
      current.description = defaults?.description;
      current.relatedType = related?.type;
      current.relatedId = related?.id;
      current.userId = me?.id;
    }
    if (Object.keys(patch).length) setForm((value) => ({ ...value, ...patch }));
  }, [open, activity, edition?.timezone, defaults, related, me?.id]);

  const close = (next: boolean) => {
    if (!next && dirty && !window.confirm("Descartar as alterações não salvas?")) return;
    onOpenChange(next);
  };
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    session.current?.touched.add(key);
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const mutation = useDbMutation(
    () => {
      if (!edition) throw new Error("A edição ainda não foi carregada");
      if (form.end && !form.start) throw new Error("Informe o início antes do fim");
      if (form.end && form.end < form.start)
        throw new Error("O fim não pode ser anterior ao início");
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
        p_expected_version: session.current?.expectedVersion ?? 0,
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
      <DialogContent className="activity-editor">
        <DialogHeader className="activity-editor__header">
          <span className="activity-editor__eyebrow">
            {activity ? <Pencil aria-hidden="true" /> : <CalendarPlus2 aria-hidden="true" />}
            Agenda Indumóveis
          </span>
          <DialogTitle className="activity-editor__title">
            {activity ? "Editar atividade" : "Nova atividade"}
          </DialogTitle>
          <DialogDescription className="activity-editor__description">
            Informações, programação e equipe em um só lugar.
          </DialogDescription>
        </DialogHeader>
        <form
          className="activity-editor__form"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(undefined);
          }}
        >
          <div className="activity-editor__body">
            <FormGroup title="Informações principais" icon={FileText}>
              <FormRow label="Título *" htmlFor="activity-title">
                <Input
                  id="activity-title"
                  required
                  maxLength={200}
                  value={form.title}
                  onChange={(event) => set("title", event.target.value)}
                />
              </FormRow>
              <div className="activity-editor__columns">
                <FormRow label="Tipo" htmlFor="activity-kind">
                  <NativeSelect
                    id="activity-kind"
                    value={form.kind}
                    onChange={(event) => set("kind", event.target.value)}
                  >
                    <option value="tarefa">Tarefa</option>
                    <option value="reuniao">Reunião</option>
                    <option value="prazo">Prazo</option>
                    <option value="entrega">Entrega</option>
                    <option value="pendencia">Pendência</option>
                  </NativeSelect>
                </FormRow>
                <FormRow label="Categoria" htmlFor="activity-category">
                  <NativeSelect
                    id="activity-category"
                    value={form.categoryId}
                    onChange={(event) => set("categoryId", event.target.value)}
                  >
                    <option value="">Sem categoria</option>
                    {categories
                      .filter((row: any) => row.is_active || row.id === form.categoryId)
                      .map((row: any) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                  </NativeSelect>
                </FormRow>
              </div>
              <FormRow label="Descrição" htmlFor="activity-description">
                <Textarea
                  id="activity-description"
                  maxLength={4000}
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              </FormRow>
            </FormGroup>

            <FormGroup title="Programação" icon={CalendarDays}>
              <label className="activity-editor__all-day">
                <Checkbox
                  checked={form.allDay}
                  onCheckedChange={(value) => set("allDay", value === true)}
                />{" "}
                Dia inteiro
              </label>
              <div className="activity-editor__columns">
                <FormRow label="Início" htmlFor="activity-start">
                  <Input
                    id="activity-start"
                    type="datetime-local"
                    value={form.start}
                    onChange={(event) => set("start", event.target.value)}
                  />
                </FormRow>
                <FormRow label="Fim" htmlFor="activity-end">
                  <Input
                    id="activity-end"
                    type="datetime-local"
                    min={form.start || undefined}
                    value={form.end}
                    onChange={(event) => set("end", event.target.value)}
                  />
                </FormRow>
              </div>
              <FormRow label="Local" htmlFor="activity-location">
                <Input
                  id="activity-location"
                  maxLength={240}
                  value={form.location}
                  onChange={(event) => set("location", event.target.value)}
                  placeholder="Preenchido pela equipe"
                />
              </FormRow>
              <p className="text-xs text-muted-foreground">
                Horários em {edition?.timezone ?? "America/Sao_Paulo"}.
              </p>
            </FormGroup>

            <FormGroup title="Responsabilidade" icon={Users}>
              <FormRow label="Responsável principal" htmlFor="activity-primary">
                <NativeSelect
                  id="activity-primary"
                  value={form.primaryAssignee}
                  onChange={(event) => set("primaryAssignee", event.target.value)}
                >
                  <option value="">Sem responsável principal</option>
                  {people.map((person: any) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name || person.email}
                    </option>
                  ))}
                </NativeSelect>
              </FormRow>
              <MultiSelect
                label="Demais responsáveis"
                items={people.map((person: any) => ({
                  id: person.id,
                  label: person.full_name || person.email,
                }))}
                values={form.assigneeIds.filter((id) => id !== form.primaryAssignee)}
                onChange={(values) => set("assigneeIds", values)}
              />
              <MultiSelect
                label="Comissões relacionadas"
                items={commissions
                  .filter((row: any) => row.is_active || form.commissionIds.includes(row.id))
                  .map((row: any) => ({ id: row.id, label: row.name }))}
                values={form.commissionIds}
                onChange={(values) => set("commissionIds", values)}
              />
            </FormGroup>

            <FormGroup title="Vínculo" icon={Link2}>
              <div className="activity-editor__columns activity-editor__columns--related">
                <FormRow label="Origem" htmlFor="activity-related-type">
                  <NativeSelect
                    id="activity-related-type"
                    value={form.relatedType}
                    disabled={!!related}
                    onChange={(event) => {
                      set("relatedType", event.target.value);
                      set("relatedId", "");
                    }}
                  >
                    <option value="">Sem vínculo</option>
                    <option value="company">Empresa</option>
                    <option value="deal">Negociação</option>
                    <option value="contract">Contrato</option>
                    <option value="inspection">Vistoria</option>
                    <option value="space">Espaço</option>
                    <option value="installment">Parcela</option>
                  </NativeSelect>
                </FormRow>
                <FormRow label="Identificador" htmlFor="activity-related-id">
                  <Input
                    id="activity-related-id"
                    value={form.relatedId}
                    disabled={!!related || !form.relatedType}
                    onChange={(event) => set("relatedId", event.target.value)}
                    placeholder="Selecione a partir do módulo de origem"
                  />
                </FormRow>
              </div>
            </FormGroup>
          </div>
          <DialogFooter className="activity-editor__footer">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={mutation.isPending || !form.title.trim()}>
              {mutation.isPending ? (
                <LoaderCircle className="activity-editor__saving" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {mutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="activity-editor__group">
      <legend className="activity-editor__legend">
        <span className="activity-editor__section-icon">
          <Icon aria-hidden="true" />
        </span>
        {title}
      </legend>
      <div className="activity-editor__fields">{children}</div>
    </fieldset>
  );
}

function MultiSelect({
  label,
  items,
  values,
  onChange,
}: {
  label: string;
  items: { id: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const selected = useMemo(() => items.filter((item) => values.includes(item.id)), [items, values]);
  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-sm font-medium">
        {label}
      </p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={labelId}
            className="activity-editor__multi-select w-full justify-between font-normal"
          >
            <span>
              {selected.length
                ? `${selected.length} selecionado${selected.length > 1 ? "s" : ""}`
                : "Selecionar…"}
            </span>
            <ChevronsUpDown className="size-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="activity-editor__choices w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command>
            <CommandInput placeholder="Buscar…" />
            <CommandList>
              <CommandEmpty>Nenhum resultado.</CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.label}
                    onSelect={() =>
                      onChange(
                        values.includes(item.id)
                          ? values.filter((id) => id !== item.id)
                          : [...values, item.id],
                      )
                    }
                  >
                    <Check
                      className={cn(
                        "size-4",
                        values.includes(item.id) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span key={item.id} className="activity-editor__selection">
              {item.label}
              <button
                type="button"
                className="activity-editor__remove-selection"
                aria-label={`Remover ${item.label}`}
                onClick={() => onChange(values.filter((id) => id !== item.id))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function blankForm(
  defaults?: { title?: string; description?: string },
  related?: Related,
  me?: string,
) {
  return {
    title: defaults?.title ?? "",
    description: defaults?.description ?? "",
    kind: "tarefa",
    categoryId: "",
    start: "",
    end: "",
    allDay: false,
    location: "",
    primaryAssignee: me ?? "",
    assigneeIds: [] as string[],
    commissionIds: [] as string[],
    relatedType: related?.type ?? "",
    relatedId: related?.id ?? "",
  };
}

function activityForm(activity: any, timeZone = "America/Sao_Paulo") {
  return {
    title: activity.title,
    description: activity.description ?? "",
    kind: activity.kind,
    categoryId: activity.category_id ?? "",
    start: localInputInZone(activity.start_at, timeZone),
    end: localInputInZone(activity.end_at, timeZone),
    allDay: !!activity.all_day,
    location: activity.location ?? "",
    primaryAssignee: activity.assignee_id ?? "",
    assigneeIds: (activity.activity_assignees ?? []).map((row: any) => row.profile_id),
    commissionIds: (activity.activity_commissions ?? []).map((row: any) => row.commission_id),
    relatedType: activity.related_type ?? "",
    relatedId: activity.related_id ?? "",
  };
}
