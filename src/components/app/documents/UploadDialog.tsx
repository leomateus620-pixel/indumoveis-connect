import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { FormRow, NativeSelect } from "@/components/app/ui";
import { DOC_CATEGORIES, errMsg } from "@/lib/format";
import { DOC_ACCEPT, fmtBytes, validateDocFile } from "@/lib/documents";
import { uploadDocument, useEdition } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { LinkChips, LinkPicker, type LinkTarget } from "./common";

export function UploadDialog({
  open,
  onOpenChange,
  defaultCategory = "geral",
  presetLinks = [],
  defaultGeneral = false,
  editionId,
  editionName,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCategory?: string;
  presetLinks?: LinkTarget[];
  defaultGeneral?: boolean;
  /** Contexto fixado pela ficha: mantém o novo arquivo na mesma edição da listagem. */
  editionId?: string;
  editionName?: string;
  onUploaded?: (doc: { id: string }) => void;
}) {
  const { data: edition } = useEdition();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [general, setGeneral] = useState(defaultGeneral);
  const [links, setLinks] = useState<LinkTarget[]>(presetLinks);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setCategory(defaultCategory);
    setTitle("");
    setDescription("");
    setGeneral(defaultGeneral);
    setLinks(presetLinks);
    setProgress(null);
    setError(null);
    keyRef.current = crypto.randomUUID();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileError = file ? validateDocFile(file) : null;
  const locked = presetLinks.map((l) => l.type + l.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || fileError || busy) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const doc = await uploadDocument({
        file,
        category,
        title,
        description,
        editionId: editionId ?? (general ? null : (edition?.id ?? null)),
        links: links.map((l) => ({ type: l.type, id: l.id })),
        idempotencyKey: keyRef.current,
        onProgress: setProgress,
      });
      await qc.invalidateQueries({ queryKey: ["db"] });
      toast.success("Documento enviado");
      onUploaded?.(doc);
      onOpenChange(false);
    } catch (err) {
      // O envio foi compensado; nova tentativa usa nova reserva.
      keyRef.current = crypto.randomUUID();
      setError(errMsg(err));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Enviar documento</DialogTitle>
          <DialogDescription>
            Até 25 MB · PDF, imagens, Office, DWG, ZIP, TXT ou CSV. O arquivo fica no armazenamento
            privado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormRow
            label="Arquivo"
            htmlFor="doc-file"
            hint={file ? `${file.name} · ${fmtBytes(file.size)}` : undefined}
          >
            <Input
              id="doc-file"
              type="file"
              accept={DOC_ACCEPT}
              required
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-invalid={!!fileError}
            />
            {fileError && (
              <p className="text-xs text-destructive" role="alert">
                {fileError}
              </p>
            )}
          </FormRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Categoria" htmlFor="doc-cat">
              <NativeSelect
                id="doc-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                disabled={busy}
              >
                {Object.entries(DOC_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </FormRow>
            <FormRow label="Edição" htmlFor="doc-ed">
              <NativeSelect
                id="doc-ed"
                value={editionId ? "contexto" : general ? "geral" : "ativa"}
                onChange={(e) => setGeneral(e.target.value === "geral")}
                disabled={busy || !!editionId}
              >
                {editionId ? (
                  <option value="contexto">
                    {editionName ??
                      (editionId === edition?.id ? edition.name : "Edição selecionada")}
                  </option>
                ) : (
                  <>
                    <option value="ativa">{edition?.name ?? "Edição ativa"}</option>
                    <option value="geral">Geral (não pertence a uma edição)</option>
                  </>
                )}
              </NativeSelect>
            </FormRow>
          </div>
          <FormRow
            label="Título de exibição (opcional)"
            htmlFor="doc-title"
            hint="O nome original do arquivo é preservado."
          >
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
            />
          </FormRow>
          <FormRow label="Descrição (opcional)" htmlFor="doc-desc">
            <Textarea
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={1000}
              disabled={busy}
            />
          </FormRow>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Vínculos</legend>
            <LinkChips
              value={links}
              locked={locked}
              onRemove={(l) => setLinks((p) => p.filter((x) => x.type + x.id !== l.type + l.id))}
            />
            {!busy && (
              <LinkPicker
                id="doc-link"
                selected={links}
                onAdd={(l) => setLinks((p) => [...p, l])}
              />
            )}
          </fieldset>
          {progress !== null && (
            <div className="space-y-1" aria-live="polite">
              <Progress value={Math.round(progress * 100)} aria-label="Progresso do envio" />
              <p className="text-xs text-muted-foreground">
                {progress < 1
                  ? `Enviando… ${Math.round(progress * 100)}%`
                  : "Conferindo e registrando…"}
              </p>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive"
            >
              Não foi salvo: {error}. Nada ficou pela metade — você pode tentar novamente.
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!file || !!fileError || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              {error ? "Tentar novamente" : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
