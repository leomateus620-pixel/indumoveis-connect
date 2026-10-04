/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  PageHeader,
  FilterBar,
  SearchInput,
  DataList,
  EmptyState,
  Loading,
  Restricted,
  StatusBadge,
  NativeSelect,
  FormRow,
} from "@/components/app/ui";
import { ProfileSelect, useProfileName } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useInspections,
  useCan,
  useSpaces,
  useTemplates,
  useDbMutation,
  api,
  useEditionId,
} from "@/lib/api";
import { INSPECTION_STATUS, fmtDate, today } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vistorias/")({
  head: () => ({
    meta: [
      { title: "Vistorias — Sistema Indumóveis" },
      { name: "description", content: "Entrega e devolução de espaços." },
      { property: "og:title", content: "Vistorias — Sistema Indumóveis" },
      { property: "og:description", content: "Entrega e devolução de espaços." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VistoriasPage,
});

function VistoriasPage() {
  const can = useCan("vistorias");
  const { data = [], isLoading } = useInspections();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const name = useProfileName();
  const rows = useMemo(
    () =>
      data.filter(
        (i: any) =>
          (!kind || i.kind === kind) &&
          (!q ||
            i.spaces?.code?.toLowerCase().includes(q.toLowerCase()) ||
            i.companies?.trade_name?.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, kind],
  );
  if (!can.read) return <Restricted />;
  return (
    <>
      <PageHeader
        title="Vistorias"
        subtitle="Entrega e devolução dos espaços"
        actions={
          can.write && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              Nova vistoria
            </Button>
          )
        }
      />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Espaço ou expositor" />
        <NativeSelect
          className="sm:w-44"
          aria-label="Tipo"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">Entrega e devolução</option>
          <option value="entrega">Entrega</option>
          <option value="devolucao">Devolução</option>
        </NativeSelect>
      </FilterBar>
      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma vistoria"
          text="Agende a vistoria de entrega quando o espaço tiver contrato."
        />
      ) : (
        <DataList
          rows={rows}
          rowKey={(i: any) => i.id}
          onRowClick={(i: any) => navigate({ to: "/vistorias/$id", params: { id: i.id } })}
          columns={[
            {
              header: "Espaço",
              cell: (i: any) => <span className="font-semibold">{i.spaces?.code}</span>,
            },
            { header: "Tipo", cell: (i: any) => (i.kind === "entrega" ? "Entrega" : "Devolução") },
            { header: "Expositor", cell: (i: any) => i.companies?.trade_name ?? "—" },
            {
              header: "Data",
              cell: (i: any) => <span className="tnum">{fmtDate(i.scheduled_for)}</span>,
            },
            { header: "Responsável", cell: (i: any) => name(i.inspector_id), mobile: false },
            {
              header: "Situação",
              cell: (i: any) => <StatusBadge map={INSPECTION_STATUS} value={i.status} />,
            },
          ]}
        />
      )}
      <NewInspection
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => navigate({ to: "/vistorias/$id", params: { id } })}
      />
    </>
  );
}

function NewInspection({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const edition = useEditionId();
  const { data: spaces = [] } = useSpaces();
  const { data: templates = [] } = useTemplates();
  const [space, setSpace] = useState("");
  const [kind, setKind] = useState("entrega");
  const [date, setDate] = useState(today());
  const [tpl, setTpl] = useState("");
  const [insp, setInsp] = useState("");
  const m = useDbMutation(
    () =>
      api.rpc<string>("create_inspection", {
        p_edition_id: edition,
        p_space_id: space,
        p_kind: kind,
        p_scheduled: date,
        p_template_id: tpl || templates.find((t: any) => t.is_active)?.id || null,
        p_inspector: insp || null,
      }),
    {
      success: "Vistoria criada",
      onSuccess: (id) => {
        onOpenChange(false);
        onCreated(id);
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova vistoria</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate(undefined);
          }}
        >
          <FormRow
            label="Espaço *"
            htmlFor="vs"
            hint="Expositor e contrato são vinculados automaticamente a partir do contrato do espaço."
          >
            <NativeSelect id="vs" required value={space} onChange={(e) => setSpace(e.target.value)}>
              <option value="">Selecione…</option>
              {spaces.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.code} {s.sector ? `· ${s.sector}` : ""}
                </option>
              ))}
            </NativeSelect>
          </FormRow>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label="Tipo" htmlFor="vk">
              <NativeSelect id="vk" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="entrega">Entrega</option>
                <option value="devolucao">Devolução</option>
              </NativeSelect>
            </FormRow>
            <FormRow label="Data" htmlFor="vd">
              <Input id="vd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormRow>
          </div>
          <FormRow label="Checklist" htmlFor="vt">
            <NativeSelect id="vt" value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="">Padrão ativo</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </FormRow>
          <FormRow label="Vistoriador" htmlFor="vi">
            <ProfileSelect id="vi" value={insp} onChange={setInsp} placeholder="Eu mesmo" />
          </FormRow>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending || !space}>
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
