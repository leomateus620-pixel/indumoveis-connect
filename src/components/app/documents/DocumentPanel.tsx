/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, History, Link2, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ErrorBox, FormRow, Loading, NativeSelect } from "@/components/app/ui";
import { RelatedLink, useProfileName } from "@/components/app/shared";
import { DOC_CATEGORIES, errMsg, fmtDate } from "@/lib/format";
import { DOC_ACCEPT, DOC_LINK_LABEL, fmtBytes, previewMode } from "@/lib/documents";
import {
  linkDocument,
  signedUrl,
  unlinkDocument,
  updateDocumentMeta,
  uploadDocumentVersion,
  useCan,
  useCurrentDocument,
  useDbMutation,
  useDocumentLinks,
  useDocumentVersions,
} from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { DocIcon, LinkChips, LinkPicker } from "./common";

/** Baixa o arquivo via URL assinada e o exibe como blob com tipo forçado (PDF ou imagem raster).
 *  Nunca renderiza HTML/SVG enviado. Em falha (ex.: link expirado), gera nova URL uma vez. */
function useDocBlob(path?: string, name?: string, mime?: string | null) {
  const mode = name ? previewMode(name, mime) : "none";
  const [state, setState] = useState<{
    url?: string;
    status: "idle" | "loading" | "ok" | "expired" | "error";
    error?: string;
  }>({ status: "idle" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path || mode === "none") return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ status: "loading" });
    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const u = await signedUrl(path, 120);
          const res = await fetch(u);
          if (!res.ok) {
            if (attempt === 0) continue;
            throw Object.assign(new Error(`HTTP ${res.status}`), {
              expired: res.status === 400 || res.status === 403,
            });
          }
          const buf = await res.arrayBuffer();
          const type =
            mode === "pdf"
              ? "application/pdf"
              : mime?.startsWith("image/") && mime !== "image/svg+xml"
                ? mime
                : "image/png";
          objectUrl = URL.createObjectURL(new Blob([buf], { type }));
          if (!cancelled) setState({ status: "ok", url: objectUrl });
          return;
        } catch (e: any) {
          if (attempt === 1 && !cancelled)
            setState({ status: e?.expired ? "expired" : "error", error: errMsg(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, mode, mime, nonce]);
  return { ...state, mode, retry: () => setNonce((n) => n + 1) };
}

async function openFresh(path: string, download?: string) {
  try {
    const u = await signedUrl(path, 120, download);
    const a = document.createElement("a");
    a.href = u;
    a.rel = "noopener";
    if (!download) a.target = "_blank";
    a.click();
  } catch (e) {
    toast.error("Não foi possível gerar o acesso ao arquivo: " + errMsg(e));
  }
}

export function DocumentPanel({
  rootId,
  onClose,
  tab,
  onTab,
}: {
  rootId?: string;
  onClose: () => void;
  tab?: string;
  onTab?: (t: string) => void;
}) {
  const docQ = useCurrentDocument(rootId);
  const d = docQ.data;
  return (
    <Sheet open={!!rootId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="docs-panel flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        {docQ.isLoading ? (
          <Loading />
        ) : docQ.isError ? (
          <ErrorBox error={docQ.error} onRetry={() => void docQ.refetch()} />
        ) : !d ? (
          <div className="p-6 text-sm">
            <SheetTitle className="font-display">Documento indisponível</SheetTitle>
            <p className="mt-2 text-muted-foreground">
              O documento não existe ou está vinculado a um registro que seu perfil não pode ler.
            </p>
          </div>
        ) : (
          <PanelBody d={d} tab={tab} onTab={onTab} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({ d, tab, onTab }: { d: any; tab?: string; onTab?: (t: string) => void }) {
  const can = useCan("documentos");
  const name = useProfileName();
  return (
    <>
      <SheetHeader className="border-b p-4 pr-12 text-left">
        <div className="flex items-start gap-3">
          <DocIcon name={d.name} mime={d.mime_type} />
          <div className="min-w-0">
            <SheetTitle className="font-display text-base leading-tight break-words">
              {d.title || d.name}
            </SheetTitle>
            <SheetDescription className="mt-0.5 text-xs">
              {DOC_CATEGORIES[d.category] ?? d.category} · v{d.version} vigente ·{" "}
              {fmtDate(d.created_at)} · {name(d.uploaded_by)}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => openFresh(d.storage_path, d.name)}>
            <Download className="size-4" /> Baixar
          </Button>
          {previewMode(d.name, d.mime_type) !== "none" && (
            <Button size="sm" variant="outline" onClick={() => openFresh(d.storage_path)}>
              <ExternalLink className="size-4" /> Abrir em nova aba
            </Button>
          )}
          {can.write && <ShareButton d={d} />}
        </div>
      </SheetHeader>
      <Tabs value={tab || "preview"} onValueChange={onTab} className="flex-1 p-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="preview">Prévia</TabsTrigger>
          <TabsTrigger value="details">Detalhes</TabsTrigger>
          <TabsTrigger value="versions">Versões</TabsTrigger>
        </TabsList>
        <TabsContent value="preview" className="pt-3">
          <Preview d={d} />
        </TabsContent>
        <TabsContent value="details" className="pt-3">
          <Details d={d} canWrite={can.write} />
        </TabsContent>
        <TabsContent value="versions" className="pt-3">
          <Versions d={d} canWrite={can.write} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ShareButton({ d }: { d: any }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        if (
          !confirm(
            "Gerar link externo da versão vigente, válido por 7 dias?\n\nQualquer pessoa com o link poderá abrir o arquivo até expirar. O link não pode ser revogado antes do prazo.",
          )
        )
          return;
        try {
          const u = await signedUrl(d.storage_path, 7 * 86400);
          await navigator.clipboard.writeText(u);
          toast.success("Link copiado · expira em 7 dias · não revogável");
        } catch (e) {
          toast.error(errMsg(e));
        }
      }}
    >
      <Link2 className="size-4" /> Link externo
    </Button>
  );
}

function Preview({ d }: { d: any }) {
  const b = useDocBlob(d.storage_path, d.name, d.mime_type);
  if (b.mode === "none")
    return (
      <div className="docs-surface flex flex-col items-center gap-3 rounded-lg border p-8 text-center text-sm">
        <DocIcon name={d.name} mime={d.mime_type} className="size-12" />
        <p className="font-semibold">{d.name}</p>
        <p className="text-muted-foreground">
          Prévia não disponível para este formato ({fmtBytes(d.size_bytes)}). Use “Baixar” para
          abrir no seu computador.
        </p>
      </div>
    );
  if (b.status === "loading" || b.status === "idle") return <Loading />;
  if (b.status === "expired" || b.status === "error")
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-danger-soft p-4 text-sm text-destructive"
      >
        <p>
          {b.status === "expired"
            ? "O acesso temporário ao arquivo expirou ou foi recusado."
            : `Não foi possível carregar a prévia: ${b.error}`}
        </p>
        <Button size="sm" variant="outline" className="mt-2" onClick={b.retry}>
          <RefreshCw className="size-4" /> Gerar novo acesso
        </Button>
      </div>
    );
  return b.mode === "pdf" ? (
    <iframe
      title={`Prévia de ${d.name}`}
      src={b.url}
      className="h-[65vh] w-full rounded-md border bg-card"
    />
  ) : (
    <img
      src={b.url}
      alt={d.title || d.name}
      className="max-h-[65vh] w-full rounded-md border bg-card object-contain"
    />
  );
}

function Details({ d, canWrite }: { d: any; canWrite: boolean }) {
  const name = useProfileName();
  const qc = useQueryClient();
  const linksQ = useDocumentLinks(d.root_id);
  const [title, setTitle] = useState(d.title ?? "");
  const [description, setDescription] = useState(d.description ?? "");
  const [category, setCategory] = useState(d.category);
  useEffect(() => {
    setTitle(d.title ?? "");
    setDescription(d.description ?? "");
    setCategory(d.category);
  }, [d.id, d.title, d.description, d.category]);
  const dirty =
    title !== (d.title ?? "") || description !== (d.description ?? "") || category !== d.category;
  const save = useDbMutation(
    () => updateDocumentMeta({ rootId: d.root_id, title, description, category }),
    {
      success: "Detalhes salvos",
    },
  );
  const link = useDbMutation(
    (l: { type: string; id: string }) => linkDocument(d.id, l.type, l.id),
    {
      success: "Vínculo adicionado",
    },
  );
  const unlink = useDbMutation(
    (l: { type: string; id: string }) => unlinkDocument(d.id, l.type, l.id),
    {
      success: "Vínculo removido (o documento continua na central)",
    },
  );
  void qc;
  const links = linksQ.data ?? [];
  return (
    <div className="space-y-5 text-sm">
      {canWrite ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && !save.isPending) save.mutate(undefined);
          }}
        >
          <FormRow
            label="Título de exibição"
            htmlFor="meta-title"
            hint={`Nome original: ${d.name}`}
          >
            <Input
              id="meta-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={d.name}
              maxLength={200}
            />
          </FormRow>
          <FormRow label="Descrição" htmlFor="meta-desc">
            <Textarea
              id="meta-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
            />
          </FormRow>
          <FormRow label="Categoria" htmlFor="meta-cat">
            <NativeSelect
              id="meta-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(DOC_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </FormRow>
          <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Salvar detalhes
          </Button>
        </form>
      ) : (
        d.description && <p className="whitespace-pre-wrap">{d.description}</p>
      )}
      <section className="space-y-2 border-t pt-4">
        <h3 className="font-display text-sm font-bold">Vínculos</h3>
        {linksQ.isError ? (
          <ErrorBox error={linksQ.error} onRetry={() => void linksQ.refetch()} />
        ) : (
          <>
            <ul className="space-y-1">
              {links.length === 0 && (
                <li className="text-muted-foreground">Documento geral, sem vínculo.</li>
              )}
              {links.map((l: any) => (
                <li key={l.type + l.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {DOC_LINK_LABEL[l.type]} ·{" "}
                    </span>
                    <RelatedLink type={l.type} id={l.id}>
                      {l.label ?? "Abrir origem"}
                    </RelatedLink>
                  </span>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={unlink.isPending}
                      onClick={() =>
                        confirm("Remover este vínculo? O documento não será excluído.") &&
                        unlink.mutate(l)
                      }
                    >
                      Remover
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {canWrite && <LinkPicker selected={links} onAdd={(l) => link.mutate(l)} />}
          </>
        )}
      </section>
      <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-xs">
        <Meta label="Arquivo original">{d.name}</Meta>
        <Meta label="Tamanho">{fmtBytes(d.size_bytes)}</Meta>
        <Meta label="Tipo">{d.mime_type || "—"}</Meta>
        <Meta label="Edição">{d.edition_id ? "Edição ativa" : "Geral"}</Meta>
        <Meta label="Versão vigente enviada por">{name(d.uploaded_by)}</Meta>
        <Meta label="Em">{fmtDate(d.created_at)}</Meta>
      </dl>
    </div>
  );
}
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  );
}

function Versions({ d, canWrite }: { d: any; canWrite: boolean }) {
  const name = useProfileName();
  const vq = useDocumentVersions(d.root_id);
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function send(file: File) {
    setError(null);
    setProgress(0);
    try {
      await uploadDocumentVersion({
        rootId: d.root_id,
        expectedVersion: d.version,
        file,
        onProgress: setProgress,
      });
      await qc.invalidateQueries({ queryKey: ["db"] });
      toast.success(`Versão ${d.version + 1} enviada`);
    } catch (e) {
      setError(errMsg(e));
      await qc.invalidateQueries({ queryKey: ["db", "documents"] });
    } finally {
      setProgress(null);
    }
  }
  return (
    <div className="space-y-3 text-sm">
      {canWrite && (
        <div>
          <input
            ref={ref}
            type="file"
            accept={DOC_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void send(f);
            }}
          />
          <Button size="sm" disabled={progress !== null} onClick={() => ref.current?.click()}>
            <Upload className="size-4" /> Enviar nova versão
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Vínculos, título e categoria são mantidos. A versão anterior é preservada.
          </p>
          {progress !== null && (
            <Progress
              className="mt-2"
              value={Math.round(progress * 100)}
              aria-label="Progresso da nova versão"
            />
          )}
          {error && (
            <p
              role="alert"
              className="mt-2 rounded-md border border-destructive/30 bg-danger-soft p-3 text-destructive"
            >
              Não foi salvo: {error}
            </p>
          )}
        </div>
      )}
      {vq.isLoading ? (
        <Loading />
      ) : vq.isError ? (
        <ErrorBox error={vq.error} onRetry={() => void vq.refetch()} />
      ) : (
        <ol className="divide-y rounded-md border">
          {(vq.data ?? []).map((v: any) => (
            <li key={v.id} className="flex items-center gap-3 p-3">
              <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  v{v.version}{" "}
                  {v.is_current && (
                    <span className="docs-current ml-1 rounded px-1.5 py-0.5 text-[11px] font-bold">
                      Vigente
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {v.name} · {fmtBytes(v.size_bytes)} · {fmtDate(v.created_at)} ·{" "}
                  {name(v.uploaded_by)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Baixar versão ${v.version}`}
                onClick={() => openFresh(v.storage_path, v.name)}
              >
                <Download className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
