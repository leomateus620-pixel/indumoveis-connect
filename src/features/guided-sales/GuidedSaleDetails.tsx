import { useEffect, useRef, useState, type FormEvent } from "react";
import { BadgeCheck, CalendarDays, FileText, LockKeyhole, UploadCloud } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  cancelGuidedSaleAttachment,
  signedUrl,
  uploadGuidedSaleAttachment,
  useDbMutation,
  useGuidedSale,
} from "@/lib/api";
import { area, brl, fmtDate, fmtDateTime } from "@/lib/format";
import { GuidedSaleAttachmentRetry } from "@/lib/guided-sales";
import type { GuidedSalePayment, GuidedSaleView } from "@/lib/guided-sales";
import { splitInstallments } from "@/lib/journey";
import { SaleDialog } from "./SaleDialog";
import {
  SaleContractFile,
  SaleField,
  SalePaymentConditions,
  SalePaymentFields,
  SaleSchedule,
} from "./SaleFormFields";
import {
  civilToday,
  isUncertainSaleError,
  paymentMethods,
  saleError,
  validSaleFile,
} from "./sale-form";

export function GuidedSaleDetails({
  dealId,
  host,
  timezone,
  onClose,
}: {
  dealId: string;
  host?: Element | null;
  timezone?: string;
  onClose(): void;
}) {
  const query = useGuidedSale(dealId);
  if (query.data)
    return <LoadedDetails view={query.data} host={host} timezone={timezone} onClose={onClose} />;
  return (
    <SaleDialog title="Comercialização" description="Dados da venda" host={host} onClose={onClose}>
      <div className="guided-dialog-scroll">
        {query.isPending ? (
          <p role="status">Carregando comercialização…</p>
        ) : (
          <p role="alert">
            {query.isError ? saleError(query.error) : "Comercialização não encontrada."}
          </p>
        )}
      </div>
      {query.isError && (
        <footer className="guided-dialog-footer">
          <Button type="button" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </footer>
      )}
    </SaleDialog>
  );
}

function LoadedDetails({
  view,
  host,
  timezone,
  onClose,
}: {
  view: GuidedSaleView;
  host?: Element | null;
  timezone?: string;
  onClose(): void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [revising, setRevising] = useState(false);
  const [payment, setPayment] = useState<GuidedSalePayment>(view.payment);
  const [issue, setIssue] = useState("");
  const [progress, setProgress] = useState<number>();
  const [verifying, setVerifying] = useState<"complete" | "attach" | null>(null);
  const [fileUrl, setFileUrl] = useState<{ name: string; url: string }>();
  const [openingFile, setOpeningFile] = useState<string>();
  const staged = useRef<Awaited<ReturnType<typeof uploadGuidedSaleAttachment>> | null>(null);
  const attachmentKey = useRef<string | null>(null);
  const preserveStaged = useRef(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const reserved = view.status === "reservada";
  const contracted = view.status === "contratada";
  const { policy, lots } = view.quote;
  const schedule = view.schedule ?? view.quote.schedule;
  const editionId = view.editionId;
  const latestAttachment = view.attachments.at(-1);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (staged.current && !preserveStaged.current) {
        void cancelGuidedSaleAttachment(staged.current).catch(() => {});
        staged.current = null;
      }
    };
  }, []);

  function resetStaged() {
    if (staged.current) void cancelGuidedSaleAttachment(staged.current).catch(() => {});
    staged.current = null;
    attachmentKey.current = null;
    setProgress(undefined);
  }
  function changeFile(next: File | null) {
    resetStaged();
    setFile(next);
    setIssue("");
  }
  async function stage() {
    if (!file) return null;
    if (staged.current) return staged.current.id;
    attachmentKey.current ??= crypto.randomUUID();
    try {
      staged.current = await uploadGuidedSaleAttachment({
        editionId,
        file,
        idempotencyKey: attachmentKey.current,
        onProgress: (value) => {
          if (mounted.current) setProgress(value);
        },
      });
      if (!mounted.current) {
        void cancelGuidedSaleAttachment(staged.current).catch(() => {});
        staged.current = null;
        throw new Error("A tela da comercialização foi fechada.");
      }
      return staged.current.id;
    } catch (error) {
      if (!(error instanceof GuidedSaleAttachmentRetry)) attachmentKey.current = null;
      setProgress(undefined);
      throw error;
    }
  }
  const mutate = useDbMutation(
    async (action: "complete" | "attach") => {
      const attachmentId = await stage();
      preserveStaged.current = true;
      try {
        if (action === "attach") {
          if (!attachmentId) throw new Error("Escolha um PDF antes de anexar.");
          return await api.attachGuidedSaleContract(view.dealId, attachmentId);
        }
        return await api.completeGuidedSale({
          dealId: view.dealId,
          signatureNote: note.trim(),
          attachmentId,
          payment: revising ? payment : null,
        });
      } catch (error) {
        if (isUncertainSaleError(error)) setVerifying(action);
        else {
          preserveStaged.current = false;
          if (!mounted.current && staged.current)
            void cancelGuidedSaleAttachment(staged.current).catch(() => {});
          setVerifying(null);
        }
        throw error;
      }
    },
    {
      onSuccess: () => {
        staged.current = null;
        preserveStaged.current = false;
        attachmentKey.current = null;
        setVerifying(null);
        setAttested(false);
        setRevising(false);
        setProgress(undefined);
        setIssue("");
        setFile(null);
        setNote("");
      },
    },
  );
  const busy = mutate.isPending;
  const currentPolicyDate = civilToday(timezone);
  const minimumDate = [policy.firstDueOn, policy.today, currentPolicyDate].sort().at(-1);
  const ceiling =
    revising && payment.firstDueOn
      ? splitInstallments(0, policy.maxInstallments, payment.firstDueOn, 1).filter(
          (item) => item.due_date <= policy.lastDueOn,
        ).length
      : policy.maxInstallments;

  async function openFile(attachment: GuidedSaleView["attachments"][number]) {
    setOpeningFile(attachment.id);
    setIssue("");
    try {
      const url = await signedUrl(attachment.storagePath);
      if (mounted.current) setFileUrl({ name: attachment.name, url });
    } catch (error) {
      if (mounted.current) setIssue(saleError(error));
    } finally {
      if (mounted.current) setOpeningFile(undefined);
    }
  }

  async function submit(action: "complete" | "attach", event?: FormEvent) {
    event?.preventDefault();
    if (pending.current || busy) return;
    if (file && !validSaleFile(file)) return setIssue("Escolha um contrato em PDF de até 25 MB.");
    if (action === "attach" && !validSaleFile(file)) return setIssue("Escolha um contrato em PDF.");
    if (
      action === "complete" &&
      (!attested || !note.trim() || (!validSaleFile(file) && !view.attachments.length))
    )
      return setIssue("Anexe o contrato assinado e registre a evidência da assinatura.");
    setIssue("");
    pending.current = true;
    try {
      await mutate.mutateAsync(action);
    } catch (error) {
      if (mounted.current) setIssue(saleError(error));
    } finally {
      pending.current = false;
    }
  }

  const statusLabel = contracted
    ? "Venda confirmada"
    : reserved
      ? "Aguardando assinatura"
      : "Comercialização encerrada";
  return (
    <SaleDialog
      title={statusLabel}
      description={`Comercialização de ${lots.length} ${lots.length === 1 ? "lote" : "lotes"}`}
      host={host}
      busy={busy || !!verifying}
      onClose={() => {
        resetStaged();
        onClose();
      }}
    >
      <form
        className="guided-checkout-form"
        onSubmit={(event) => void submit(verifying ?? (reserved ? "complete" : "attach"), event)}
      >
        <div className="guided-dialog-scroll" aria-busy={busy}>
          <div className={`guided-sale-result${contracted ? " is-sold" : ""}`}>
            {contracted ? <BadgeCheck aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
            <div>
              <strong>{statusLabel}</strong>
              <p>
                {contracted
                  ? "Os lotes constam como vendidos no mapa."
                  : reserved
                    ? "Os lotes ficam reservados até o registro da assinatura."
                    : "Consulte o histórico e os contratos vinculados."}
              </p>
            </div>
          </div>
          <div className="guided-review-facts">
            <div>
              <span>Registrado por</span>
              <strong>{view.createdByName || view.createdBy}</strong>
              <small>{fmtDateTime(view.createdAt)}</small>
            </div>
            <div>
              <span>Valor acordado</span>
              <strong>{brl(view.quote.totalCents)}</strong>
              <small>
                {area(view.quote.areaM2)} · {lots.map((lot) => lot.code).join(", ")}
              </small>
            </div>
          </div>
          {view.company && (
            <p className="guided-muted">
              Empresa: <strong>{view.company.tradeName || view.company.legalName}</strong>
              {view.company.taxId && ` · ${view.company.taxId}`}
            </p>
          )}
          <details className="guided-disclosure">
            <summary>
              <CalendarDays aria-hidden="true" /> Pagamento · {paymentMethods[view.payment.method]}
            </summary>
            <SaleSchedule schedule={schedule} />
            <SalePaymentConditions payment={view.payment} />
          </details>
          {reserved && !verifying && (
            <div className="guided-payment-revision">
              <label className="guided-signature-check">
                <input
                  type="checkbox"
                  checked={revising}
                  onChange={(event) => setRevising(event.target.checked)}
                />
                Revisar o pagamento antes de confirmar
              </label>
              {revising && (
                <SalePaymentFields
                  payment={payment}
                  minDate={minimumDate}
                  maxDate={policy.lastDueOn}
                  maxInstallments={ceiling}
                  external={
                    view.quote.segmentKey === "external" || view.quote.segmentKey === "automobile"
                  }
                  onChange={setPayment}
                />
              )}
            </div>
          )}
          <section className="guided-signature" aria-label="Contratos anexados">
            <h4>
              <FileText aria-hidden="true" /> Contrato
            </h4>
            {view.attachments.length ? (
              <ul className="guided-file-list">
                {view.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <span>
                      <strong>{attachment.name}</strong>
                      <small>
                        {fmtDate(attachment.createdAt)}
                        {view.signature?.documentId === attachment.id && " · Assinatura registrada"}
                      </small>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!!openingFile}
                      onClick={() => void openFile(attachment)}
                    >
                      {openingFile === attachment.id ? "Abrindo…" : "Visualizar"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="guided-muted">Nenhum contrato anexado.</p>
            )}
            {fileUrl && (
              <div className="guided-pdf-preview">
                <iframe
                  src={fileUrl.url}
                  title={`Contrato ${fileUrl.name}`}
                  referrerPolicy="no-referrer"
                />
                <div>
                  <a href={fileUrl.url} target="_blank" rel="noreferrer">
                    Abrir em nova aba
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setFileUrl(undefined)}
                  >
                    Fechar prévia
                  </Button>
                </div>
              </div>
            )}
            {(reserved || contracted) && (
              <fieldset disabled={busy || !!verifying}>
                <SaleContractFile
                  file={file}
                  onChange={changeFile}
                  progress={progress}
                  disabled={busy || !!verifying}
                />
                {reserved && file && !attested && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void submit("attach")}
                  >
                    <UploadCloud aria-hidden="true" />
                    Anexar e manter reserva
                  </Button>
                )}
                {reserved && (
                  <>
                    {!file && latestAttachment && (
                      <p className="guided-muted">PDF para assinatura: {latestAttachment.name}</p>
                    )}
                    <label className="guided-signature-check">
                      <input
                        type="checkbox"
                        checked={attested}
                        onChange={(event) => setAttested(event.target.checked)}
                      />
                      Declaro que as assinaturas do contrato foram verificadas.
                    </label>
                    {attested && (
                      <SaleField
                        label="Registro da assinatura *"
                        help="Descreva como a assinatura foi obtida."
                      >
                        <Input
                          required
                          maxLength={800}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                        />
                      </SaleField>
                    )}
                  </>
                )}
              </fieldset>
            )}
          </section>
          {verifying && (
            <p role="alert" className="guided-error">
              O resultado ainda não foi confirmado. Verifique a mesma tentativa para recuperar o
              registro.
            </p>
          )}
          {issue && (
            <p role="alert" className="guided-error">
              {issue}
            </p>
          )}
        </div>
        <footer className="guided-dialog-footer">
          {!verifying && (
            <Button asChild variant="outline">
              <Link to="/contratos/$id" params={{ id: view.contractId }} onClick={onClose}>
                Abrir contrato
              </Link>
            </Button>
          )}
          {reserved && (attested || verifying) && (
            <Button type="submit" disabled={busy}>
              {busy ? "Confirmando…" : verifying ? "Verificar resultado" : "Confirmar venda"}
            </Button>
          )}
          {contracted && file && (
            <Button type="submit" disabled={busy}>
              {busy ? "Anexando…" : verifying ? "Verificar resultado" : "Anexar contrato"}
            </Button>
          )}
        </footer>
      </form>
    </SaleDialog>
  );
}
