/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Presentation,
  DraftingCompass,
  X,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { docKind, DOC_LINK_LABEL, DOC_LINK_MODULE, type DocKind } from "@/lib/documents";
import {
  useActivities,
  useCompanies,
  useContracts,
  useDeals,
  useInspections,
  useInstallments,
  useMe,
  useSpaces,
} from "@/lib/api";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/ui";

const ICONS: Record<DocKind, typeof FileIcon> = {
  pdf: FileText,
  image: FileImage,
  sheet: FileSpreadsheet,
  doc: FileText,
  slides: Presentation,
  cad: DraftingCompass,
  archive: FileArchive,
  text: FileText,
  other: FileIcon,
};
const TONE: Record<DocKind, string> = {
  pdf: "docs-tone-red",
  image: "docs-tone-plum",
  sheet: "docs-tone-green",
  doc: "docs-tone-plum",
  slides: "docs-tone-red",
  cad: "docs-tone-taupe",
  archive: "docs-tone-taupe",
  text: "docs-tone-taupe",
  other: "docs-tone-taupe",
};
export function DocIcon({
  name,
  mime,
  className,
}: {
  name: string;
  mime?: string | null;
  className?: string;
}) {
  const k = docKind(name, mime);
  const I = ICONS[k];
  return (
    <span
      aria-hidden
      className={cn(
        "docs-icon inline-flex size-9 shrink-0 items-center justify-center rounded-md",
        TONE[k],
        className,
      )}
    >
      <I className="size-4" />
    </span>
  );
}

export type LinkTarget = { type: string; id: string; label: string | null };

/** Registros vinculáveis que o perfil pode ler (o servidor revalida existência, edição e acesso). */
export function useLinkTargets(): { options: LinkTarget[]; isLoading: boolean } {
  const { data: me } = useMe();
  const can = (t: string) => !!me?.perms[DOC_LINK_MODULE[t]]?.read;
  const companies = useCompanies();
  const deals = useDeals();
  const contracts = useContracts();
  const spaces = useSpaces();
  const inspections = useInspections(can("inspection"));
  const installments = useInstallments(can("installment"));
  const activities = useActivities();
  const options = useMemo(() => {
    const o: LinkTarget[] = [];
    if (can("company"))
      (companies.data ?? []).forEach((c: any) =>
        o.push({ type: "company", id: c.id, label: c.trade_name }),
      );
    if (can("deal"))
      (deals.data ?? []).forEach((d: any) =>
        o.push({ type: "deal", id: d.id, label: `Negociação · ${d.companies?.trade_name ?? "—"}` }),
      );
    if (can("contract"))
      (contracts.data ?? []).forEach((c: any) =>
        o.push({
          type: "contract",
          id: c.id,
          label: `Contrato ${c.number ?? "s/n"} · ${c.companies?.trade_name ?? ""}`,
        }),
      );
    if (can("space"))
      (spaces.data ?? []).forEach((s: any) =>
        o.push({ type: "space", id: s.id, label: `Espaço ${s.code}` }),
      );
    if (can("inspection"))
      (inspections.data ?? []).forEach((i: any) =>
        o.push({ type: "inspection", id: i.id, label: `Vistoria · ${i.spaces?.code ?? ""}` }),
      );
    if (can("installment"))
      (installments.data ?? []).forEach((i: any) =>
        o.push({
          type: "installment",
          id: i.id,
          label: `Parcela ${i.number} · contrato ${i.contracts?.number ?? "s/n"}`,
        }),
      );
    if (can("activity"))
      (activities.data ?? []).forEach((a: any) =>
        o.push({ type: "activity", id: a.id, label: a.title }),
      );
    return o;
  }, [
    me,
    companies.data,
    deals.data,
    contracts.data,
    spaces.data,
    inspections.data,
    installments.data,
    activities.data,
  ]); // eslint-disable-line react-hooks/exhaustive-deps
  return { options, isLoading: companies.isLoading || deals.isLoading || contracts.isLoading };
}

export function LinkChips({
  value,
  onRemove,
  locked = [],
}: {
  value: LinkTarget[];
  onRemove?: (l: LinkTarget) => void;
  locked?: string[];
}) {
  if (!value.length)
    return <p className="text-xs text-muted-foreground">Sem vínculos (documento geral).</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {value.map((l) => (
        <li
          key={l.type + l.id}
          className="docs-chip inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
        >
          <span className="font-semibold text-muted-foreground">
            {DOC_LINK_LABEL[l.type] ?? l.type}
          </span>
          <span className="max-w-48 truncate">{l.label ?? "registro sem acesso"}</span>
          {onRemove && !locked.includes(l.type + l.id) && (
            <button
              type="button"
              onClick={() => onRemove(l)}
              aria-label={`Remover vínculo ${l.label ?? ""}`}
              className="-mr-1 rounded-full p-0.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Seletor pesquisável de registros para vincular. */
export function LinkPicker({
  selected,
  onAdd,
  id,
}: {
  selected: LinkTarget[];
  onAdd: (l: LinkTarget) => void;
  id?: string;
}) {
  const { options, isLoading } = useLinkTargets();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const taken = new Set(selected.map((s) => s.type + s.id));
  const res = options
    .filter(
      (o) =>
        !taken.has(o.type + o.id) &&
        (!type || o.type === type) &&
        (!q || (o.label ?? "").toLowerCase().includes(q.toLowerCase())),
    )
    .slice(0, 8);
  const types = [...new Set(options.map((o) => o.type))];
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar empresa, contrato, espaço, atividade…"
          aria-label="Buscar registro para vincular"
        />
        <NativeSelect
          className="sm:w-40"
          aria-label="Tipo de registro"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {DOC_LINK_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {(q || type) && (
        <ul className="max-h-52 divide-y overflow-auto rounded-md border bg-card text-sm">
          {isLoading ? (
            <li className="p-2 text-muted-foreground">Carregando registros…</li>
          ) : res.length === 0 ? (
            <li className="p-2 text-muted-foreground">Nenhum registro encontrado.</li>
          ) : (
            res.map((o) => (
              <li key={o.type + o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(o);
                    setQ("");
                  }}
                  className="flex min-h-10 w-full items-center gap-2 px-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {DOC_LINK_LABEL[o.type]}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
