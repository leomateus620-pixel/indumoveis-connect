/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Upload, Link2, History } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, FilterBar, SearchInput, DataList, EmptyState, Loading, Restricted, NativeSelect, OpenDoc } from "@/components/app/ui";
import { RelatedLink, RELATED_LABEL, useProfileName } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { useDocuments, useCan, useDbMutation, uploadDocument, useEditionId, signedUrl } from "@/lib/api";
import { DOC_CATEGORIES, fmtDate, errMsg } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({ meta: [{ title: "Documentos — Sistema Indumóveis" }, { name: "description", content: "Central de documentos vinculados." }] }),
  component: DocumentosPage,
});

function DocumentosPage() {
  const can = useCan("documentos");
  const { data = [], isLoading } = useDocuments();
  const edition = useEditionId();
  const name = useProfileName();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [link, setLink] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const verRef = useRef<HTMLInputElement>(null);
  const [verOf, setVerOf] = useState<any | null>(null);
  const up = useDbMutation((file: File) => uploadDocument({ file, category: cat || "geral", editionId: edition, links: [] }), { success: "Documento enviado" });
  const newVer = useDbMutation((v: { file: File; prev: any }) => uploadDocument({
    file: v.file, category: v.prev.category, editionId: v.prev.edition_id, previousId: v.prev.id, version: v.prev.version + 1,
    links: (v.prev.document_links ?? []).map((l: any) => ({ type: l.entity_type, id: l.entity_id })),
  }), { success: "Nova versão enviada" });

  const superseded = new Set(data.map((d: any) => d.previous_id).filter(Boolean));
  const rows = useMemo(() => data.filter((d: any) => !superseded.has(d.id) && (!cat || d.category === cat) &&
    (!link || (link === "none" ? !d.document_links?.length : d.document_links?.some((l: any) => l.entity_type === link))) &&
    (!q || d.name.toLowerCase().includes(q.toLowerCase()))), [data, cat, link, q]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can.read) return <Restricted />;

  async function share(d: any) {
    if (!confirm("Gerar link de acesso externo válido por 7 dias? Qualquer pessoa com o link poderá abrir o arquivo.")) return;
    try { const u = await signedUrl(d.storage_path, 7 * 86400); await navigator.clipboard.writeText(u); toast.success("Link copiado (expira em 7 dias)"); } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <>
      <PageHeader title="Documentos" subtitle="Mesmos arquivos anexados em empresas, contratos, vistorias e financeiro · armazenamento privado"
        actions={can.write && <><input ref={ref} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ""; }} />
          <Button size="sm" disabled={up.isPending} onClick={() => ref.current?.click()}><Upload className="size-4" />Enviar documento</Button></>} />
      <input ref={verRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && verOf) newVer.mutate({ file: f, prev: verOf }); e.target.value = ""; setVerOf(null); }} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Nome do arquivo" />
        <NativeSelect className="sm:w-48" aria-label="Categoria" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas as categorias</option>{Object.entries(DOC_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect>
        <NativeSelect className="sm:w-48" aria-label="Vínculo" value={link} onChange={(e) => setLink(e.target.value)}><option value="">Qualquer vínculo</option>{Object.entries(RELATED_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="none">Sem vínculo</option></NativeSelect>
      </FilterBar>
      {isLoading ? <Loading /> : rows.length === 0 ? <EmptyState title="Nenhum documento" /> : (
        <DataList rows={rows} rowKey={(d: any) => d.id} columns={[
          { header: "Arquivo", cell: (d: any) => <span className="font-semibold">{d.name}</span> },
          { header: "Categoria", cell: (d: any) => DOC_CATEGORIES[d.category] ?? d.category },
          { header: "Versão", cell: (d: any) => <span className="tnum">v{d.version}</span> },
          { header: "Vínculos", cell: (d: any) => d.document_links?.length ? d.document_links.map((l: any) => <span key={l.entity_type + l.entity_id} className="mr-2"><RelatedLink type={l.entity_type} id={l.entity_id}>{RELATED_LABEL[l.entity_type] ?? l.entity_type}</RelatedLink></span>) : "—" },
          { header: "Enviado", cell: (d: any) => <span className="tnum">{fmtDate(d.created_at)} · {name(d.uploaded_by)}</span>, mobile: false },
          { header: "Ações", cell: (d: any) => (
            <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <OpenDoc path={d.storage_path} />
              {can.write && <Button variant="ghost" size="sm" aria-label="Nova versão" onClick={() => { setVerOf(d); verRef.current?.click(); }}><History className="size-4" /></Button>}
              {can.write && <Button variant="ghost" size="sm" aria-label="Gerar link externo" onClick={() => share(d)}><Link2 className="size-4" /></Button>}
            </span>
          ) },
        ]} />
      )}
    </>
  );
}
