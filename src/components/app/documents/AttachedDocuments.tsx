/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { FileUp, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBox } from "@/components/app/ui";
import { DOC_CATEGORIES, fmtDate } from "@/lib/format";
import { DOC_LINK_LABEL } from "@/lib/documents";
import { linkDocument, useDbMutation, useDocumentSearch, useEntityDocuments } from "@/lib/api";
import { DocIcon } from "./common";
import { DocumentPanel } from "./DocumentPanel";
import { UploadDialog } from "./UploadDialog";

/** Anexos de um registro: mesma regra de versão vigente e mesmo painel da central. */
export function AttachedDocuments({
  entityType,
  entityId,
  entityLabel,
  category,
  canWrite,
  editionId,
  editionName,
  extraLinks = [],
}: {
  entityType: string;
  entityId: string;
  entityLabel?: string;
  category: string;
  canWrite: boolean;
  editionId?: string;
  editionName?: string;
  extraLinks?: { type: string; id: string; label?: string }[];
}) {
  const q = useEntityDocuments(entityType, entityId, editionId);
  const docs = q.data ?? [];
  const [open, setOpen] = useState<string | undefined>();
  const [upload, setUpload] = useState(false);
  const [attach, setAttach] = useState(false);
  return (
    <div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando arquivos…</p>
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum arquivo vinculado.</p>
      ) : (
        <ul className="divide-y text-sm">
          {docs.map((d: any) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpen(d.root_id)}
                className="flex w-full min-w-0 items-center gap-2 py-2 text-left hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <DocIcon name={d.name} mime={d.mime_type} className="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    v{d.version} vigente · {DOC_CATEGORIES[d.category] ?? d.category} ·{" "}
                    {fmtDate(d.created_at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setUpload(true)}>
            <FileUp className="size-4" /> Anexar arquivo
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAttach(true)}>
            <Link2 className="size-4" /> Associar documento existente
          </Button>
        </div>
      )}
      <UploadDialog
        open={upload && canWrite}
        onOpenChange={setUpload}
        defaultCategory={category}
        editionId={editionId}
        editionName={editionName}
        presetLinks={[
          { type: entityType, id: entityId, label: entityLabel ?? DOC_LINK_LABEL[entityType] },
          ...extraLinks.map((l) => ({ ...l, label: l.label ?? DOC_LINK_LABEL[l.type] })),
        ]}
      />
      <AttachExisting
        open={attach && canWrite}
        onOpenChange={setAttach}
        entityType={entityType}
        entityId={entityId}
        editionId={editionId}
        taken={docs.map((d: any) => d.root_id)}
      />
      <DocumentPanel rootId={open} onClose={() => setOpen(undefined)} />
    </div>
  );
}

function AttachExisting({
  open,
  onOpenChange,
  entityType,
  entityId,
  editionId,
  taken,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entityType: string;
  entityId: string;
  editionId?: string;
  taken: string[];
}) {
  const [q, setQ] = useState("");
  const res = useDocumentSearch(
    { scope: editionId ? "edition" : "all", editionId, q, limit: 15 },
    open,
  );
  const m = useDbMutation((id: string) => linkDocument(id, entityType, entityId), {
    success: "Documento associado (sem nova cópia do arquivo)",
    onSuccess: () => onOpenChange(false),
  });
  // A query may briefly keep its previous results while the edition changes.
  const rows = (res.data?.rows ?? []).filter(
    (d: any) => !taken.includes(d.root_id) && (!editionId || d.edition_id === editionId),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Associar documento existente</DialogTitle>
          <DialogDescription>
            O mesmo arquivo passa a aparecer aqui e na central, sem novo envio.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título, arquivo ou registro"
            aria-label="Buscar documento"
          />
        </div>
        {res.isError ? (
          <ErrorBox error={res.error} onRetry={() => void res.refetch()} />
        ) : (
          <ul className="max-h-72 divide-y overflow-auto rounded-md border text-sm">
            {res.isLoading && <li className="p-3 text-muted-foreground">Buscando…</li>}
            {!res.isLoading && rows.length === 0 && (
              <li className="p-3 text-muted-foreground">Nenhum documento disponível.</li>
            )}
            {rows.map((d: any) => (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={m.isPending}
                  onClick={() => m.mutate(d.id)}
                  className="flex min-h-12 w-full items-center gap-2 px-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <DocIcon name={d.name} mime={d.mime_type} className="size-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.display_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {DOC_CATEGORIES[d.category] ?? d.category} · v{d.version}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
