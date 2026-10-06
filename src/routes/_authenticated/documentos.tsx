/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Upload,
  X,
  FolderOpen,
  Clock,
  Unlink,
} from "lucide-react";
import {
  PageHeader,
  SearchInput,
  ErrorBox,
  Loading,
  Restricted,
  NativeSelect,
} from "@/components/app/ui";
import { useProfileName } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCan, useDocumentSearch, useEdition, useProfiles } from "@/lib/api";
import { DOC_CATEGORIES, fmtDate } from "@/lib/format";
import { DOC_LINK_LABEL, fmtBytes } from "@/lib/documents";
import { DocIcon } from "@/components/app/documents/common";
import { DocumentPanel } from "@/components/app/documents/DocumentPanel";
import { UploadDialog } from "@/components/app/documents/UploadDialog";
import { cn } from "@/lib/utils";

type Search = {
  q?: string;
  col?: "recent" | "unlinked";
  cat?: string;
  link?: string;
  by?: string;
  from?: string;
  to?: string;
  scope?: "general" | "all";
  sort?: "name" | "category";
  view?: "grid";
  page?: number;
  doc?: string;
  tab?: "details" | "versions";
};
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const date = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
const PAGE = 25;

export const Route = createFileRoute("/_authenticated/documentos")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q),
    col: s.col === "recent" || s.col === "unlinked" ? s.col : undefined,
    cat: str(s.cat),
    link: str(s.link),
    by: str(s.by),
    from: date(s.from),
    to: date(s.to),
    scope: s.scope === "general" || s.scope === "all" ? s.scope : undefined,
    sort: s.sort === "name" || s.sort === "category" ? s.sort : undefined,
    view: s.view === "grid" ? "grid" : undefined,
    page: Number(s.page) > 1 ? Math.floor(Number(s.page)) : undefined,
    doc: str(s.doc),
    tab: s.tab === "details" || s.tab === "versions" ? s.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Documentos — Sistema Indumóveis" },
      { name: "description", content: "Central documental com vínculos, versões e prévia segura." },
      { property: "og:title", content: "Documentos — Sistema Indumóveis" },
      {
        property: "og:description",
        content: "Central documental com vínculos, versões e prévia segura.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentosPage,
});

function DocumentosPage() {
  const can = useCan("documentos");
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/documentos" });
  const { data: edition } = useEdition();
  const { data: profiles = [] } = useProfiles();
  const name = useProfileName();
  const [upload, setUpload] = useState(false);
  const [q, setQ] = useState(s.q ?? "");

  const set = (patch: Partial<Search>, replace = true) =>
    navigate({ search: (p: Search) => ({ ...p, page: undefined, ...patch }), replace });

  useEffect(() => {
    const t = setTimeout(() => (q || undefined) !== s.q && set({ q: q || undefined }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setQ(s.q ?? ""), [s.q]);

  const scope = s.scope ?? "edition";
  const page = s.page ?? 1;
  const res = useDocumentSearch(
    {
      scope,
      editionId: edition?.id,
      q: s.q,
      category: s.cat,
      collection: s.col ?? "all",
      linkType: s.link,
      uploader: s.by,
      from: s.from,
      to: s.to,
      sort: s.sort ?? "recent",
      limit: PAGE,
      offset: (page - 1) * PAGE,
    },
    can.read,
  );

  if (!can.read) return <Restricted />;

  const facets = res.data?.facets;
  const total = res.data?.total ?? 0;
  const rows = res.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const active: { label: string; clear: Partial<Search> }[] = [
    s.q && { label: `“${s.q}”`, clear: { q: undefined } },
    s.cat && { label: DOC_CATEGORIES[s.cat] ?? s.cat, clear: { cat: undefined } },
    s.link && {
      label: s.link === "none" ? "Sem vínculo" : `Vínculo: ${DOC_LINK_LABEL[s.link]}`,
      clear: { link: undefined },
    },
    s.by && { label: `Por ${name(s.by)}`, clear: { by: undefined } },
    s.from && { label: `Desde ${fmtDate(s.from)}`, clear: { from: undefined } },
    s.to && { label: `Até ${fmtDate(s.to)}`, clear: { to: undefined } },
    s.scope && {
      label: s.scope === "general" ? "Somente gerais" : "Todas as edições",
      clear: { scope: undefined },
    },
  ].filter(Boolean) as any;
  const filtered = active.length > 0 || !!s.col;
  const select = (d: any) =>
    navigate({ search: (p: Search) => ({ ...p, doc: d.root_id, tab: undefined }) });

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle={
          <>
            {scope === "edition"
              ? (edition?.name ?? "Edição ativa")
              : scope === "general"
                ? "Documentos gerais"
                : "Todas as edições"}{" "}
            · armazenamento privado · versões e vínculos com os módulos
          </>
        }
        actions={
          can.write && (
            <Button onClick={() => setUpload(true)}>
              <Upload className="size-4" /> Enviar documento
            </Button>
          )
        }
      >
        <nav aria-label="Coleções e categorias" className="-mx-1 flex gap-1 overflow-x-auto pb-2">
          <NavItem
            current={!s.col && !s.cat}
            onClick={() => set({ col: undefined, cat: undefined })}
            icon={FolderOpen}
            label="Todos"
            n={facets?.all}
          />
          <NavItem
            current={s.col === "recent"}
            onClick={() => set({ col: "recent", cat: undefined })}
            icon={Clock}
            label="Recentes"
            n={facets?.recent}
            hint="últimos 30 dias"
          />
          <NavItem
            current={s.col === "unlinked"}
            onClick={() => set({ col: "unlinked", cat: undefined })}
            icon={Unlink}
            label="Sem vínculo"
            n={facets?.unlinked}
          />
          <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
          {Object.entries(DOC_CATEGORIES).map(([k, v]) => (
            <NavItem
              key={k}
              current={s.cat === k}
              onClick={() => set({ cat: s.cat === k ? undefined : k, col: undefined })}
              label={v}
              n={facets?.categories?.[k] ?? 0}
            />
          ))}
        </nav>
      </PageHeader>

      <div className="space-y-2 border-b bg-card/60 px-4 py-3 md:px-6 xl:px-8">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Título, arquivo, descrição ou registro vinculado"
          />
          <NativeSelect
            aria-label="Edição"
            value={scope}
            onChange={(e) =>
              set({ scope: e.target.value === "edition" ? undefined : (e.target.value as any) })
            }
          >
            <option value="edition">{edition?.name ?? "Edição ativa"}</option>
            <option value="general">Somente gerais</option>
            <option value="all">Todas as edições</option>
          </NativeSelect>
          <NativeSelect
            aria-label="Tipo de vínculo"
            value={s.link ?? ""}
            onChange={(e) => set({ link: e.target.value || undefined })}
          >
            <option value="">Qualquer vínculo</option>
            {Object.entries(DOC_LINK_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Enviado por"
            value={s.by ?? ""}
            onChange={(e) => set({ by: e.target.value || undefined })}
          >
            <option value="">Qualquer responsável</option>
            {profiles.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Ordenar"
            value={s.sort ?? "recent"}
            onChange={(e) =>
              set({ sort: e.target.value === "recent" ? undefined : (e.target.value as any) })
            }
          >
            <option value="recent">Mais recentes</option>
            <option value="name">Nome</option>
            <option value="category">Categoria</option>
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            De{" "}
            <Input
              type="date"
              className="h-9 w-36"
              value={s.from ?? ""}
              onChange={(e) => set({ from: e.target.value || undefined })}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            até{" "}
            <Input
              type="date"
              className="h-9 w-36"
              value={s.to ?? ""}
              onChange={(e) => set({ to: e.target.value || undefined })}
            />
          </label>
          {active.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => set(a.clear)}
              className="docs-chip inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs"
              aria-label={`Remover filtro ${a.label}`}
            >
              {a.label} <X className="size-3" />
            </button>
          ))}
          {active.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                set({
                  q: undefined,
                  cat: undefined,
                  link: undefined,
                  by: undefined,
                  from: undefined,
                  to: undefined,
                  scope: undefined,
                  col: undefined,
                });
              }}
            >
              Limpar filtros
            </Button>
          )}
          <div
            className="ml-auto flex items-center gap-1"
            role="group"
            aria-label="Modo de exibição"
          >
            <Button
              variant={s.view ? "ghost" : "secondary"}
              size="sm"
              aria-pressed={!s.view}
              aria-label="Lista"
              onClick={() => set({ view: undefined }, true)}
            >
              <List className="size-4" />
            </Button>
            <Button
              variant={s.view ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={!!s.view}
              aria-label="Grade"
              onClick={() => set({ view: "grid" }, true)}
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {res.isLoading ? (
        <Loading />
      ) : res.isError ? (
        <ErrorBox error={res.error} onRetry={() => void res.refetch()} />
      ) : rows.length === 0 ? (
        filtered ? (
          <div className="mx-4 my-6 rounded-lg border border-dashed bg-card p-8 text-center text-sm md:mx-6 xl:mx-8">
            <p className="font-display font-bold">Nenhum documento corresponde aos filtros</p>
            <p className="mt-1 text-muted-foreground">
              Revise a busca ou limpe os filtros para ver toda a biblioteca.
            </p>
          </div>
        ) : (
          <div className="mx-4 my-6 rounded-lg border border-dashed bg-card p-8 text-center text-sm md:mx-6 xl:mx-8">
            <p className="font-display font-bold">A biblioteca desta edição ainda está vazia</p>
            <p className="mx-auto mt-1 max-w-lg text-muted-foreground">
              Use “Enviar documento” para incluir o primeiro arquivo. Arquivos anexados em Empresas,
              Comercialização, Contratos, Vistorias, Financeiro e Agenda também aparecem aqui
              automaticamente.
            </p>
          </div>
        )
      ) : (
        <div
          className={cn(
            "px-4 py-3 md:px-6 xl:px-8",
            res.isFetching && "opacity-70 transition-opacity",
          )}
          aria-busy={res.isFetching}
        >
          <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
            {total} {total === 1 ? "documento" : "documentos"} · versão vigente de cada um
          </p>
          {s.view === "grid" ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rows.map((d: any) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => select(d)}
                    aria-selected={s.doc === d.root_id}
                    className="docs-row flex h-full w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <DocIcon name={d.name} mime={d.mime_type} className="size-11" />
                    <span className="line-clamp-2 text-sm font-semibold">{d.display_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {DOC_CATEGORIES[d.category] ?? d.category} · v{d.version}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="hidden border-b bg-muted/40 text-left text-xs text-muted-foreground md:table-header-group">
                  <tr>
                    <th className="px-3 py-2 font-medium">Documento</th>
                    <th className="px-3 py-2 font-medium">Categoria</th>
                    <th className="px-3 py-2 font-medium">Vínculos</th>
                    <th className="px-3 py-2 font-medium">Versão</th>
                    <th className="px-3 py-2 font-medium">Atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((d: any) => (
                    <tr
                      key={d.id}
                      aria-selected={s.doc === d.root_id}
                      className="docs-row cursor-pointer hover:bg-accent/40"
                      onClick={() => select(d)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <DocIcon name={d.name} mime={d.mime_type} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="block max-w-full truncate text-left font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                              onClick={(e) => {
                                e.stopPropagation();
                                select(d);
                              }}
                            >
                              {d.display_name}
                            </button>
                            <p className="truncate text-xs text-muted-foreground">
                              {d.title ? d.name + " · " : ""}
                              {fmtBytes(d.size_bytes)}
                              <span className="md:hidden">
                                {" "}
                                · {DOC_CATEGORIES[d.category] ?? d.category} · v{d.version} ·{" "}
                                {fmtDate(d.created_at)}
                              </span>
                            </p>
                            {d.links.length > 0 && (
                              <p className="truncate text-xs md:hidden">
                                {d.links
                                  .map((l: any) => l.label ?? DOC_LINK_LABEL[l.type])
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        {DOC_CATEGORIES[d.category] ?? d.category}
                      </td>
                      <td className="hidden max-w-64 px-3 py-2.5 md:table-cell">
                        {d.links.length ? (
                          <ul className="space-y-0.5 text-xs">
                            {d.links.slice(0, 3).map((l: any) => (
                              <li key={l.type + l.id} className="truncate">
                                <span className="text-muted-foreground">
                                  {DOC_LINK_LABEL[l.type]}:{" "}
                                </span>
                                {l.label ?? "—"}
                              </li>
                            ))}
                            {d.links.length > 3 && (
                              <li className="text-muted-foreground">+{d.links.length - 3}</li>
                            )}
                          </ul>
                        ) : (
                          <span className="text-xs text-muted-foreground">Geral</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2.5 tnum md:table-cell">v{d.version}</td>
                      <td className="hidden px-3 py-2.5 text-xs md:table-cell">
                        <span className="tnum">{fmtDate(d.created_at)}</span>
                        <span className="block text-muted-foreground">{name(d.uploaded_by)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <nav
              aria-label="Paginação"
              className="mt-3 flex items-center justify-end gap-2 text-sm"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => set({ page: page - 1 > 1 ? page - 1 : undefined }, false)}
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tnum">
                {page} de {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => set({ page: page + 1 }, false)}
                aria-label="Próxima página"
              >
                <ChevronRight className="size-4" />
              </Button>
            </nav>
          )}
        </div>
      )}

      <DocumentPanel
        rootId={s.doc}
        tab={s.tab ?? "preview"}
        onTab={(t) =>
          navigate({
            search: (p: Search) => ({ ...p, tab: t === "preview" ? undefined : (t as any) }),
            replace: true,
          })
        }
        onClose={() =>
          navigate({ search: (p: Search) => ({ ...p, doc: undefined, tab: undefined }) })
        }
      />
      <UploadDialog
        open={upload}
        onOpenChange={setUpload}
        defaultCategory={s.cat ?? "geral"}
        defaultGeneral={scope === "general"}
        onUploaded={(d) => navigate({ search: (p: Search) => ({ ...p, doc: d.id }) })}
      />
    </>
  );
}

function NavItem({
  current,
  onClick,
  label,
  n,
  icon: Icon,
  hint,
}: {
  current: boolean;
  onClick: () => void;
  label: string;
  n?: number;
  icon?: any;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current}
      title={hint}
      className="docs-nav-item inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {label}
      {n !== undefined && <span className="tnum rounded bg-muted px-1.5 text-[11px]">{n}</span>}
    </button>
  );
}
