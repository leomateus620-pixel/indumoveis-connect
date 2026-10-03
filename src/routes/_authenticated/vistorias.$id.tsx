/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2, Plus } from "lucide-react";
import {
  PageHeader,
  Section,
  Field,
  Loading,
  Restricted,
  StatusBadge,
  FormRow,
} from "@/components/app/ui";
import {
  RelatedLink,
  ActivityDialog,
  RelatedActivities,
  useProfileName,
} from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useInspection,
  useInspections,
  useCan,
  useDbMutation,
  api,
  uploadDocument,
  useEditionId,
  useEntityDocuments,
  signedUrl,
} from "@/lib/api";
import { INSPECTION_STATUS, fmtDate, fmtDateTime, area } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/vistorias/$id")({
  head: () => ({
    meta: [
      { title: "Vistoria — Sistema Indumóveis" },
      { name: "description", content: "Checklist, fotos e aceite da vistoria." },
    ],
  }),
  component: InspectionPage,
});

const CONDS = [
  { v: "ok", label: "OK", cls: "bg-success text-primary-foreground" },
  { v: "avaria", label: "Avaria", cls: "bg-destructive text-primary-foreground" },
  { v: "ausente", label: "Ausente", cls: "bg-warning text-primary-foreground" },
  { v: "na", label: "N/A", cls: "bg-muted-foreground text-primary-foreground" },
];

function InspectionPage() {
  const { id } = Route.useParams();
  const can = useCan("vistorias");
  const { data: i, isLoading } = useInspection(id);
  const { data: all = [] } = useInspections();
  const name = useProfileName();
  const agenda = useCan("agenda").write;
  const [notes, setNotes] = useState("");
  const [accName, setAccName] = useState("");
  const [accOk, setAccOk] = useState(false);
  const [pend, setPend] = useState<any | null>(null);
  useEffect(() => {
    if (i) {
      setNotes(i.notes ?? "");
      setAccName(i.acceptance_name ?? "");
    }
  }, [i?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const item = useDbMutation((v: { id: string; patch: any }) =>
    api.update("inspection_items", v.id, v.patch),
  );
  const upd = useDbMutation((patch: any) => api.update("inspections", id, patch), {
    success: "Vistoria salva",
  });
  if (!can.read) return <Restricted />;
  if (isLoading) return <Loading />;
  if (!i) return <p className="p-8">Vistoria não encontrada.</p>;
  const done = i.status === "concluida";
  const editable = can.write && !done;
  const items = [...(i.inspection_items ?? [])].sort((a: any, b: any) => a.position - b.position);
  const pendingCount = items.filter((x: any) => x.condition === "pendente").length;
  const counterpart =
    i.kind === "devolucao"
      ? all.find(
          (x: any) => x.space_id === i.space_id && x.kind === "entrega" && x.status === "concluida",
        )
      : null;

  return (
    <>
      <PageHeader
        title={`${i.kind === "entrega" ? "Entrega" : "Devolução"} · ${i.spaces?.code}`}
        subtitle={i.companies?.trade_name ?? "Sem expositor vinculado"}
        actions={
          <>
            <Link
              to="/vistorias"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground"
            >
              <ArrowLeft className="size-4" />
              Vistorias
            </Link>
            <StatusBadge map={INSPECTION_STATUS} value={i.status} />
          </>
        }
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        <Section title="Vínculos">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Espaço">
              <RelatedLink type="space" id={i.space_id}>
                {i.spaces?.code}
              </RelatedLink>{" "}
              <span className="tnum text-muted-foreground">{area(i.spaces?.area_m2)}</span>
            </Field>
            <Field label="Expositor">
              {i.company_id ? (
                <RelatedLink type="company" id={i.company_id}>
                  {i.companies?.trade_name}
                </RelatedLink>
              ) : null}
            </Field>
            <Field label="Contrato">
              {i.contract_id ? (
                <RelatedLink type="contract" id={i.contract_id}>
                  {i.contracts?.number}
                </RelatedLink>
              ) : null}
            </Field>
            <Field label="Data · vistoriador">
              {fmtDate(i.scheduled_for)} · {name(i.inspector_id)}
            </Field>
          </dl>
        </Section>

        <Section title={`Checklist${pendingCount ? ` · ${pendingCount} pendente(s)` : ""}`}>
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sem itens. Configure checklists em Administração.
            </p>
          )}
          <ul className="space-y-4">
            {items.map((it: any) => {
              return (
                <li key={it.id} className="rounded-md border p-3">
                  <p className="font-semibold">{it.label}</p>
                  <div
                    className="mt-2 grid grid-cols-4 gap-2"
                    role="radiogroup"
                    aria-label={it.label}
                  >
                    {CONDS.map((c) => (
                      <button
                        key={c.v}
                        type="button"
                        role="radio"
                        aria-checked={it.condition === c.v}
                        disabled={!editable}
                        onClick={() => item.mutate({ id: it.id, patch: { condition: c.v } })}
                        className={cn(
                          "min-h-11 rounded-md border text-sm font-semibold",
                          it.condition === c.v ? c.cls : "bg-card hover:bg-accent",
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <ItemNote
                    item={it}
                    disabled={!editable}
                    onSave={(note) => item.mutate({ id: it.id, patch: { note } })}
                  />
                  {["avaria", "ausente"].includes(it.condition) && agenda && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto px-0"
                      onClick={() => setPend(it)}
                    >
                      <Plus className="size-3" />
                      Criar pendência
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        {counterpart && <Comparison entregaId={counterpart.id} current={items} />}

        <Section title="Fotos">
          <Photos
            inspectionId={id}
            spaceId={i.space_id}
            companyId={i.company_id}
            canWrite={editable}
          />
        </Section>

        <Section title="Observações gerais">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            readOnly={!editable}
            maxLength={4000}
            aria-label="Observações"
          />
          {editable && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={notes === (i.notes ?? "")}
              onClick={() =>
                upd.mutate({ notes, status: i.status === "agendada" ? "em_andamento" : i.status })
              }
            >
              Salvar observações
            </Button>
          )}
        </Section>

        <Section title="Aceite">
          {done ? (
            <p className="text-sm">
              Aceite registrado no sistema por <strong>{i.acceptance_name}</strong> em{" "}
              {fmtDateTime(i.acceptance_at)}.<br />
              <span className="text-xs text-muted-foreground">
                Confirmação eletrônica simples — não é assinatura digital certificada.
              </span>
            </p>
          ) : editable ? (
            <div className="space-y-3">
              <FormRow
                label="Nome de quem acompanha a vistoria (expositor/representante)"
                htmlFor="acn"
              >
                <Input
                  id="acn"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  maxLength={120}
                />
              </FormRow>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={accOk}
                  onCheckedChange={(v) => setAccOk(!!v)}
                  className="mt-0.5"
                />
                Declaro que acompanhei a vistoria e concordo com as condições registradas.
              </label>
              <p className="text-xs text-muted-foreground">
                Este aceite é capturado no sistema e não substitui assinatura digital certificada.
              </p>
              <Button
                className="w-full sm:w-auto"
                disabled={!accName.trim() || !accOk || pendingCount > 0 || upd.isPending}
                onClick={() =>
                  upd.mutate({
                    acceptance_name: accName.trim(),
                    acceptance_at: new Date().toISOString(),
                    status: "concluida",
                    completed_at: new Date().toISOString(),
                    notes,
                  })
                }
              >
                Concluir vistoria
              </Button>
              {pendingCount > 0 && (
                <p className="text-xs text-warning">
                  Avalie todos os itens do checklist antes de concluir.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aguardando conclusão.</p>
          )}
        </Section>

        <Section title="Pendências e atividades">
          <RelatedActivities type="inspection" id={id} canWrite={agenda} />
        </Section>
      </div>
      {pend && (
        <ActivityDialog
          open={!!pend}
          onOpenChange={(o) => !o && setPend(null)}
          related={{ type: "inspection", id }}
          defaults={{
            title: `Pendência ${i.spaces?.code}: ${pend.label}`,
            description: pend.note ?? "",
          }}
        />
      )}
    </>
  );
}

function ItemNote({
  item,
  disabled,
  onSave,
}: {
  item: any;
  disabled: boolean;
  onSave: (n: string) => void;
}) {
  const [v, setV] = useState(item.note ?? "");
  return (
    <Input
      className="mt-2"
      placeholder="Observação do item"
      value={v}
      disabled={disabled}
      maxLength={500}
      aria-label={`Observação ${item.label}`}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== (item.note ?? "")) onSave(v);
      }}
    />
  );
}

function Comparison({ entregaId, current }: { entregaId: string; current: any[] }) {
  const { data } = useInspection(entregaId);
  const before = data?.inspection_items ?? [];
  return (
    <Section title="Comparação com a entrega">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1">Item</th>
            <th>Entrega</th>
            <th>Devolução</th>
          </tr>
        </thead>
        <tbody>
          {current.map((c) => {
            const b = before.find((x: any) => x.label === c.label);
            const diff = b && b.condition !== c.condition;
            return (
              <tr key={c.id} className={cn("border-t", diff && "bg-warning-soft")}>
                <td className="py-1.5">{c.label}</td>
                <td>{b?.condition ?? "—"}</td>
                <td className={cn(diff && "font-semibold")}>{c.condition}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Link
        to="/vistorias/$id"
        params={{ id: entregaId }}
        className="mt-2 inline-block text-xs font-semibold text-primary"
      >
        Abrir vistoria de entrega
      </Link>
    </Section>
  );
}

function Photos({
  inspectionId,
  spaceId,
  companyId,
  canWrite,
}: {
  inspectionId: string;
  spaceId: string;
  companyId?: string;
  canWrite: boolean;
}) {
  const { data: docs = [] } = useEntityDocuments("inspection", inspectionId);
  const edition = useEditionId();
  const ref = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const m = useDbMutation(
    (files: File[]) =>
      Promise.all(
        files.map((file) =>
          uploadDocument({
            file,
            category: "foto_vistoria",
            editionId: edition,
            links: [
              { type: "inspection", id: inspectionId },
              { type: "space", id: spaceId },
              ...(companyId ? [{ type: "company", id: companyId }] : []),
            ],
          }),
        ),
      ),
    { success: "Foto(s) adicionada(s)" },
  );
  useEffect(() => {
    docs
      .filter((d: any) => !urls[d.id] && d.mime_type?.startsWith("image/"))
      .forEach((d: any) =>
        signedUrl(d.storage_path, 3600)
          .then((u) => setUrls((p) => ({ ...p, [d.id]: u })))
          .catch(() => {}),
      );
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {docs.map((d: any) => (
          <a
            key={d.id}
            href={urls[d.id]}
            target="_blank"
            rel="noopener"
            className="aspect-square overflow-hidden rounded-md border bg-muted"
          >
            {urls[d.id] && <img src={urls[d.id]} alt={d.name} className="size-full object-cover" />}
          </a>
        ))}
      </div>
      {docs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma foto.</p>}
      {canWrite && (
        <>
          <input
            ref={ref}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              const f = Array.from(e.target.files ?? []);
              if (f.length) m.mutate(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            className="mt-3 min-h-11"
            disabled={m.isPending}
            onClick={() => ref.current?.click()}
          >
            {m.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
            )}
            Adicionar fotos
          </Button>
        </>
      )}
    </div>
  );
}
