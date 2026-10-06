/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCompanies,
  useProfiles,
  useDbMutation,
  api,
  useEditionId,
  useActivities,
  useMe,
  useCan,
} from "@/lib/api";
import { NativeSelect, FormRow, StatusBadge } from "./ui";
import { ACTIVITY_STATUS, fmtDate } from "@/lib/format";

export const RELATED_LABEL: Record<string, string> = {
  company: "Empresa",
  deal: "Negociação",
  contract: "Contrato",
  inspection: "Vistoria",
  space: "Espaço",
  installment: "Parcela",
};

export function RelatedLink({
  type,
  id,
  children,
}: {
  type: string;
  id: string;
  children: ReactNode;
}) {
  const cls = "font-medium text-primary underline-offset-4 hover:underline";
  switch (type) {
    case "company":
      return (
        <Link to="/empresas/$id" params={{ id }} className={cls}>
          {children}
        </Link>
      );
    case "contract":
      return (
        <Link to="/contratos/$id" params={{ id }} className={cls}>
          {children}
        </Link>
      );
    case "inspection":
      return (
        <Link to="/vistorias/$id" params={{ id }} className={cls}>
          {children}
        </Link>
      );
    case "deal":
      return (
        <Link to="/comercializacao" search={{ id }} className={cls}>
          {children}
        </Link>
      );
    case "space":
      return (
        <Link to="/mapa" search={{ space: id }} className={cls}>
          {children}
        </Link>
      );
    case "installment":
      return (
        <Link to="/financeiro" className={cls}>
          {children}
        </Link>
      );
    default:
      return <span>{children}</span>;
  }
}

export function CompanySelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const { data = [] } = useCompanies();
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Selecione a empresa…</option>
      {data.map((c: any) => (
        <option key={c.id} value={c.id}>
          {c.trade_name} — {c.legal_name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function ProfileSelect({
  value,
  onChange,
  id,
  placeholder = "Selecione…",
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const { data = [] } = useProfiles();
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {data.map((p: any) => (
        <option key={p.id} value={p.id}>
          {p.full_name || p.email}
        </option>
      ))}
    </NativeSelect>
  );
}

export function useProfileName() {
  const { data = [] } = useProfiles();
  return (id?: string | null) => {
    if (!id) return "—";
    const p = data.find((x: any) => x.id === id);
    return p ? p.full_name || p.email : "—";
  };
}

/** Diálogo que pede uma observação/motivo antes de confirmar. */
export function ConfirmNoteDialog({
  open,
  onOpenChange,
  title,
  label,
  required,
  onConfirm,
  busy,
  hint,
}: {
  hint?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  label: string;
  required?: boolean;
  onConfirm: (note: string) => void;
  busy?: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setNote("");
      }}
    >
      <DialogContent className="max-h-[min(90dvh,48rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        <FormRow label={label + (required ? " *" : "")} htmlFor="cnote">
          <Textarea
            id="cnote"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
        </FormRow>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button disabled={busy || (required && !note.trim())} onClick={() => onConfirm(note)}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Atividades vinculadas a um registro, com criação rápida. */
export function RelatedActivities({
  type,
  id,
  canWrite: cw,
}: {
  type: string;
  id: string;
  canWrite?: boolean;
}) {
  const agenda = useCan("agenda");
  const canWrite = cw ?? agenda.write;
  const { data = [] } = useActivities();
  const items = data.filter((a: any) => a.related_type === type && a.related_id === id);
  const [open, setOpen] = useState(false);
  return (
    <div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma atividade vinculada.</p>
      ) : (
        <ul className="divide-y text-sm">
          {items.map((a: any) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <span className="truncate">{a.title}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tnum text-xs text-muted-foreground">{fmtDate(a.due_at)}</span>
                <StatusBadge map={ACTIVITY_STATUS} value={a.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Nova atividade
        </Button>
      )}
      <ActivityDialog open={open} onOpenChange={setOpen} related={{ type, id }} />
    </div>
  );
}

export function ActivityDialog({
  open,
  onOpenChange,
  related,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  related?: { type: string; id: string };
  defaults?: { title?: string; description?: string };
}) {
  const edition = useEditionId();
  const { data: me } = useMe();
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [desc, setDesc] = useState(defaults?.description ?? "");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [kind, setKind] = useState("tarefa");
  const m = useDbMutation(
    () =>
      api.insert("activities", {
        edition_id: edition,
        title: title.trim(),
        description: desc || null,
        kind,
        due_at: due ? new Date(due).toISOString() : null,
        assignee_id: assignee || me?.id,
        related_type: related?.type ?? null,
        related_id: related?.id ?? null,
        created_by: me?.id,
      }),
    {
      success: "Atividade registrada",
      onSuccess: () => {
        onOpenChange(false);
        setTitle("");
        setDesc("");
        setDue("");
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90dvh,48rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova atividade</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate(undefined);
          }}
        >
          <FormRow label="Título *" htmlFor="at">
            <Input
              id="at"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormRow>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label="Tipo" htmlFor="ak">
              <NativeSelect id="ak" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="tarefa">Tarefa</option>
                <option value="reuniao">Reunião</option>
                <option value="prazo">Prazo</option>
                <option value="entrega">Entrega</option>
                <option value="pendencia">Pendência</option>
              </NativeSelect>
            </FormRow>
            <FormRow label="Data e hora" htmlFor="ad">
              <Input
                id="ad"
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </FormRow>
          </div>
          <FormRow label="Responsável" htmlFor="ar">
            <ProfileSelect id="ar" value={assignee} onChange={setAssignee} placeholder="Eu mesmo" />
          </FormRow>
          <FormRow label="Descrição" htmlFor="ads">
            <Textarea
              id="ads"
              maxLength={2000}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </FormRow>
          {related && (
            <p className="text-xs text-muted-foreground">
              Vinculada a: {RELATED_LABEL[related.type]}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
