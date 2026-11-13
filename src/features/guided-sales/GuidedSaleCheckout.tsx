import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, FileCheck2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  cancelGuidedSaleAttachment,
  uploadGuidedSaleAttachment,
  useDbMutation,
  useGuidedSaleCompanies,
} from "@/lib/api";
import { GuidedSaleAttachmentRetry } from "@/lib/guided-sales";
import type { CommercialLot } from "@/lib/commercial";
import { area, brl, centsToInput, fmtDate } from "@/lib/format";
import type {
  GuidedSaleCompanyInput,
  GuidedSalePayment,
  GuidedSaleQuote,
} from "@/lib/guided-sales";
import { splitInstallments } from "@/lib/journey";
import {
  SaleContractFile,
  SaleField,
  SalePaymentConditions,
  SalePaymentFields,
  SaleSchedule,
} from "./SaleFormFields";
import { SaleDialog } from "./SaleDialog";
import { saleSegmentLabel } from "./selection";
import {
  agreedPrices,
  civilToday,
  isUncertainSaleError,
  paymentMethods,
  saleError,
  validSaleFile,
  type PriceFields,
} from "./sale-form";

const steps = ["Empresa", "Pagamento", "Revisão"] as const;
const initialCompany = {
  legal_name: "",
  trade_name: "",
  tax_id: "",
  representative_name: "",
  email: "",
  phone: "",
  city: "",
  state: "",
};

type CheckoutProps = {
  editionId: string;
  timezone?: string;
  lots: readonly CommercialLot[];
  host?: Element | null;
  onClose(): void;
  onSaved(dealId: string): void;
};

export function GuidedSaleCheckout({
  editionId,
  timezone,
  lots,
  host,
  onClose,
  onSaved,
}: CheckoutProps) {
  const [step, setStep] = useState(0);
  const [companyMode, setCompanyMode] = useState<"existing" | "new">("existing");
  const [company, setCompany] = useState(initialCompany);
  const [companyId, setCompanyId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const companies = useGuidedSaleCompanies(step === 0 && companyMode === "existing");
  const selectedCompany = companies.data?.find((item) => item.id === companyId);
  const [payment, setPayment] = useState<GuidedSalePayment>(() => ({
    method: "pix",
    mode: "a_vista",
    installmentCount: 1,
    firstDueOn: civilToday(timezone),
    intervalMonths: 1,
  }));
  const [fields, setFields] = useState<PriceFields>({});
  const [policy, setPolicy] = useState<GuidedSaleQuote["policy"]>();
  const [quote, setQuote] = useState<GuidedSaleQuote>();
  const [signature, setSignature] = useState(false);
  const [signatureNote, setSignatureNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>();
  const [issue, setIssue] = useState("");
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const staged = useRef<Awaited<ReturnType<typeof uploadGuidedSaleAttachment>> | null>(null);
  const pending = useRef(false);
  const attempt = useRef<string | null>(null);
  const fileAttempt = useRef<string | null>(null);
  const preserveStaged = useRef(false);
  const mounted = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const segment = lots[0].segmentKey;
  const spaceIds = lots.map((lot) => lot.id);
  const totals = agreedPrices(lots, fields);

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
  useEffect(() => {
    stepHeading.current?.focus();
  }, [step]);

  function baseInput(overrides = totals.overrides) {
    return { editionId, spaceIds, agreedOverrides: overrides };
  }

  function cleanStaged() {
    if (staged.current) void cancelGuidedSaleAttachment(staged.current).catch(() => {});
    staged.current = null;
    fileAttempt.current = null;
    setProgress(undefined);
  }

  function changeFile(next: File | null) {
    cleanStaged();
    setFile(next);
    setIssue("");
  }

  const save = useDbMutation(
    async () => {
      if (!quote) throw new Error("Gere uma revisão antes de confirmar.");
      let attachmentId: string | null = staged.current?.id ?? null;
      if (file && !attachmentId) {
        setProgress(0);
        fileAttempt.current ??= crypto.randomUUID();
        try {
          staged.current = await uploadGuidedSaleAttachment({
            editionId,
            file,
            idempotencyKey: fileAttempt.current,
            onProgress: (value) => {
              if (mounted.current) setProgress(value);
            },
          });
          if (!mounted.current) {
            void cancelGuidedSaleAttachment(staged.current).catch(() => {});
            staged.current = null;
            throw new Error("A tela da comercialização foi fechada.");
          }
          attachmentId = staged.current.id;
        } catch (error) {
          if (!(error instanceof GuidedSaleAttachmentRetry)) fileAttempt.current = null;
          setProgress(undefined);
          throw error;
        }
      }
      const idempotencyKey = (attempt.current ??= crypto.randomUUID());
      preserveStaged.current = true;
      try {
        return await api.saveGuidedSale({
          ...baseInput(),
          payment,
          quoteFingerprint: quote.quoteFingerprint,
          companyId: companyMode === "existing" ? companyId : null,
          company: companyMode === "new" ? (company as GuidedSaleCompanyInput) : null,
          idempotencyKey,
          signatureNote: signature ? signatureNote.trim() : null,
          attachmentId,
        });
      } catch (error) {
        if (isUncertainSaleError(error)) setUncertain(true);
        else {
          preserveStaged.current = false;
          if (!mounted.current && staged.current)
            void cancelGuidedSaleAttachment(staged.current).catch(() => {});
          attempt.current = null;
          setUncertain(false);
        }
        throw error;
      }
    },
    {
      onSuccess: (result) => {
        staged.current = null;
        attempt.current = null;
        if (mounted.current) onSaved(result.dealId);
      },
    },
  );

  const busy = loadingQuote || save.isPending;
  const minimumDate = policy
    ? [policy.today, policy.firstDueOn].sort().at(-1)
    : civilToday(timezone);
  const maximumCount =
    policy && payment.firstDueOn
      ? splitInstallments(0, policy.maxInstallments, payment.firstDueOn, 1).filter(
          (item) => item.due_date <= policy.lastDueOn,
        ).length
      : (policy?.maxInstallments ?? 18);
  const scheduled =
    totals.agreedCents != null && /^\d{4}-\d{2}-\d{2}$/.test(payment.firstDueOn)
      ? splitInstallments(totals.agreedCents, payment.installmentCount, payment.firstDueOn, 1).map(
          (row) => ({ number: row.number, dueOn: row.due_date, amountCents: row.amount_cents }),
        )
      : [];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || busy) return;
    setIssue("");
    if (step === 0) {
      if (companyMode === "existing" && !selectedCompany)
        return setIssue("Selecione uma empresa para continuar.");
      if (
        companyMode === "new" &&
        (!company.legal_name.trim() || ![11, 14].includes(company.tax_id.replace(/\D/g, "").length))
      )
        return setIssue("Informe a razão social e um CPF ou CNPJ válido.");
      if (!totals.issue) {
        setLoadingQuote(true);
        pending.current = true;
        try {
          const pricing = await api.previewGuidedSale({ ...baseInput(), payment: null });
          if (!mounted.current) return;
          setPolicy(pricing.policy);
          setPayment((previous) => ({
            ...previous,
            firstDueOn:
              [previous.firstDueOn, pricing.policy.today, pricing.policy.firstDueOn]
                .sort()
                .at(-1) ?? previous.firstDueOn,
          }));
        } catch (error) {
          if (mounted.current) setIssue(saleError(error));
          return;
        } finally {
          pending.current = false;
          if (mounted.current) setLoadingQuote(false);
        }
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (totals.issue) return setIssue(totals.issue);
      if (
        !payment.firstDueOn ||
        !payment.installmentCount ||
        scheduled.some((row) => row.amountCents < 1)
      )
        return setIssue("Confira o vencimento e os valores previstos das parcelas.");
      if (
        (payment.discountModality && !payment.discountEvidence?.trim()) ||
        (payment.feeKeys?.length && !payment.feeEvidence?.trim())
      )
        return setIssue("Informe a evidência das condições registradas.");
      setLoadingQuote(true);
      pending.current = true;
      try {
        const result = await api.previewGuidedSale({ ...baseInput(), payment });
        if (!mounted.current) return;
        setQuote(result);
        setPolicy(result.policy);
        setStep(2);
      } catch (error) {
        if (mounted.current) setIssue(saleError(error));
      } finally {
        pending.current = false;
        if (mounted.current) setLoadingQuote(false);
      }
      return;
    }
    if (file && !validSaleFile(file)) return setIssue("Escolha um contrato em PDF de até 25 MB.");
    if (signature && (!signatureNote.trim() || !validSaleFile(file)))
      return setIssue("Anexe o PDF assinado e registre a evidência da assinatura.");
    pending.current = true;
    try {
      await save.mutateAsync(undefined);
    } catch (error) {
      if (mounted.current) setIssue(saleError(error));
    } finally {
      pending.current = false;
    }
  }

  const normalizedSearch = companySearch
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
  const visibleCompanies = (companies.data ?? []).filter((item) => {
    if (!normalizedSearch || item.id === companyId) return true;
    const name = `${item.trade_name} ${item.legal_name} ${item.tax_id ?? ""}`
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR");
    return (
      name.includes(normalizedSearch) ||
      (/^\d+$/.test(normalizedSearch) &&
        !!item.tax_id?.replace(/\D/g, "").includes(normalizedSearch))
    );
  });
  const companyLabel =
    companyMode === "existing"
      ? selectedCompany?.trade_name || selectedCompany?.legal_name
      : company.trade_name || company.legal_name;

  return (
    <SaleDialog
      title="Comercialização de lotes"
      description={`${saleSegmentLabel(segment)} · ${lots.length} ${lots.length === 1 ? "lote" : "lotes"}`}
      host={host}
      busy={busy || uncertain}
      onClose={() => {
        cleanStaged();
        onClose();
      }}
    >
      <ol className="guided-steps" aria-label="Etapas da comercialização">
        {steps.map((label, index) => (
          <li
            key={label}
            data-state={index < step ? "done" : index === step ? "active" : "next"}
            aria-current={index === step ? "step" : undefined}
          >
            <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <form className="guided-checkout-form" onSubmit={(event) => void onSubmit(event)}>
        <div className="guided-dialog-scroll" aria-busy={busy}>
          <h3 tabIndex={-1} ref={stepHeading} className="guided-step-heading">
            {["Empresa compradora", "Valores e pagamento", "Confira a comercialização"][step]}
          </h3>
          {step === 0 && (
            <>
              <fieldset className="guided-option-group">
                <legend className="sr-only">Tipo de cadastro</legend>
                <label>
                  <input
                    type="radio"
                    name="guided-company-mode"
                    checked={companyMode === "existing"}
                    onChange={() => setCompanyMode("existing")}
                  />
                  <span>Buscar empresa cadastrada</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="guided-company-mode"
                    checked={companyMode === "new"}
                    onChange={() => setCompanyMode("new")}
                  />
                  <span>Cadastrar nova empresa</span>
                </label>
              </fieldset>
              {companyMode === "existing" ? (
                <div className="guided-fields">
                  <SaleField wide label="Buscar por nome ou CPF/CNPJ">
                    <Input
                      type="search"
                      value={companySearch}
                      onChange={(event) => setCompanySearch(event.target.value)}
                    />
                  </SaleField>
                  <SaleField wide label="Empresa *">
                    <select
                      value={companyId}
                      required
                      disabled={companies.isLoading || companies.isError}
                      onChange={(event) => setCompanyId(event.target.value)}
                    >
                      <option value="">
                        {companies.isLoading ? "Carregando empresas…" : "Selecione a empresa"}
                      </option>
                      {visibleCompanies.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.trade_name || item.legal_name}
                          {item.tax_id ? ` · ${item.tax_id}` : ""}
                        </option>
                      ))}
                    </select>
                  </SaleField>
                  {companies.isError && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void companies.refetch()}
                    >
                      Tentar buscar novamente
                    </Button>
                  )}
                  {!companies.isLoading && !companies.isError && visibleCompanies.length === 0 && (
                    <p className="guided-muted guided-field-wide">
                      Nenhuma empresa encontrada. Você pode cadastrar uma nova empresa.
                    </p>
                  )}
                </div>
              ) : (
                <div className="guided-fields">
                  {(
                    [
                      ["legal_name", "Razão social ou nome completo *", "text", true],
                      ["trade_name", "Nome fantasia", "text", false],
                      ["tax_id", "CPF ou CNPJ *", "text", true],
                      ["representative_name", "Responsável", "text", false],
                      ["email", "E-mail", "email", false],
                      ["phone", "Telefone", "tel", false],
                      ["city", "Cidade", "text", false],
                      ["state", "UF", "text", false],
                    ] as const
                  ).map(([key, label, type, required]) => (
                    <SaleField key={key} label={label}>
                      <Input
                        type={type}
                        required={required}
                        maxLength={key === "state" ? 2 : key === "tax_id" ? 18 : 200}
                        inputMode={key === "tax_id" ? "numeric" : undefined}
                        autoComplete="off"
                        value={company[key]}
                        onChange={(event) =>
                          setCompany((previous) => ({
                            ...previous,
                            [key]:
                              key === "state"
                                ? event.target.value.toUpperCase()
                                : event.target.value,
                          }))
                        }
                      />
                    </SaleField>
                  ))}
                </div>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <div className="guided-price-list" aria-label="Valores por lote">
                {lots.map((lot) => {
                  const field = fields[lot.id];
                  const manual = lot.grossCents == null || Boolean(field);
                  return (
                    <section key={lot.id} className="guided-price-row">
                      <div className="guided-price-line">
                        <div>
                          <strong>Lote {lot.code}</strong>
                          <small>
                            {area(lot.areaM2)} ·{" "}
                            {lot.grossCents != null
                              ? `Tabela ${brl(lot.grossCents)}`
                              : "Sem tarifa de tabela"}
                          </small>
                        </div>
                        {lot.grossCents != null && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setFields((current) => {
                                const next = { ...current };
                                if (field) delete next[lot.id];
                                else
                                  next[lot.id] = {
                                    amount: centsToInput(lot.grossCents),
                                    reason: "",
                                  };
                                return next;
                              })
                            }
                          >
                            {field ? "Usar tabela" : "Informar outro valor"}
                          </Button>
                        )}
                      </div>
                      {manual && (
                        <div className="guided-fields">
                          <SaleField label={`Valor acordado do lote ${lot.code} *`}>
                            <Input
                              required
                              inputMode="decimal"
                              placeholder="0,00"
                              value={field?.amount ?? ""}
                              onChange={(event) =>
                                setFields((current) => ({
                                  ...current,
                                  [lot.id]: {
                                    reason: field?.reason ?? "",
                                    amount: event.target.value,
                                  },
                                }))
                              }
                            />
                          </SaleField>
                          <SaleField label={`Justificativa do lote ${lot.code} *`}>
                            <Input
                              required
                              maxLength={500}
                              value={field?.reason ?? ""}
                              onChange={(event) =>
                                setFields((current) => ({
                                  ...current,
                                  [lot.id]: {
                                    amount: field?.amount ?? "",
                                    reason: event.target.value,
                                  },
                                }))
                              }
                            />
                          </SaleField>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
              <div className="guided-total-strip">
                <span>Valor acordado</span>
                <strong>{brl(totals.agreedCents)}</strong>
              </div>
              <SalePaymentFields
                payment={payment}
                minDate={minimumDate}
                maxDate={policy?.lastDueOn}
                maxInstallments={maximumCount}
                external={segment === "external" || segment === "automobile"}
                onChange={setPayment}
              />
              <SaleSchedule schedule={scheduled} />
            </>
          )}
          {step === 2 && quote && (
            <fieldset disabled={save.isPending || uncertain} className="guided-review">
              <div className="guided-review-facts">
                <div>
                  <span>Empresa</span>
                  <strong>{companyLabel}</strong>
                </div>
                <div>
                  <span>Pagamento</span>
                  <strong>
                    {paymentMethods[payment.method]} ·{" "}
                    {payment.mode === "a_vista"
                      ? "À vista"
                      : `${payment.installmentCount} parcelas`}
                  </strong>
                </div>
              </div>
              <ul className="guided-review-lots">
                {quote.lots.map((lot) => (
                  <li key={lot.id}>
                    <span>
                      <strong>Lote {lot.code}</strong>
                      <small>
                        {area(lot.areaM2)}
                        {lot.priceReason ? ` · ${lot.priceReason}` : ""}
                      </small>
                    </span>
                    <strong>{brl(lot.agreedCents)}</strong>
                  </li>
                ))}
              </ul>
              <div className="guided-total-strip">
                <span>{area(quote.areaM2)} · Valor acordado</span>
                <strong>{brl(quote.totalCents)}</strong>
              </div>
              <SaleSchedule schedule={quote.schedule} />
              <SalePaymentConditions payment={payment} />
              <div className="guided-signature">
                <h4>
                  <FileCheck2 aria-hidden="true" /> Contrato
                </h4>
                <SaleContractFile
                  file={file}
                  onChange={changeFile}
                  progress={progress}
                  disabled={busy || uncertain}
                />
                <label className="guided-signature-check">
                  <input
                    type="checkbox"
                    checked={signature}
                    onChange={(e) => setSignature(e.target.checked)}
                  />
                  Declaro que as assinaturas do contrato anexado foram verificadas.
                </label>
                {signature ? (
                  <SaleField
                    label="Registro da assinatura *"
                    help="Descreva como a assinatura foi obtida."
                  >
                    <Input
                      required
                      maxLength={800}
                      value={signatureNote}
                      onChange={(e) => setSignatureNote(e.target.value)}
                    />
                  </SaleField>
                ) : (
                  <p className="guided-muted">
                    <LockKeyhole aria-hidden="true" /> Os lotes ficam reservados até o registro da
                    assinatura.
                  </p>
                )}
              </div>
              {quote.policy.lastDueOn && (
                <p className="guided-muted">
                  Vencimento final permitido em {fmtDate(quote.policy.lastDueOn)}.
                </p>
              )}
            </fieldset>
          )}
          {uncertain && (
            <p role="alert" className="guided-error">
              O resultado ainda não foi confirmado. Verifique a mesma tentativa para recuperar o
              registro sem duplicar.
            </p>
          )}
          {issue && (
            <p role="alert" className="guided-error">
              {issue}
            </p>
          )}
        </div>
        <footer className="guided-dialog-footer">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || uncertain}
              onClick={() => {
                setStep((value) => value - 1);
                setIssue("");
              }}
            >
              <ArrowLeft aria-hidden="true" />
              Voltar
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? save.isPending
                ? "Registrando…"
                : "Conferindo…"
              : step < 2
                ? "Continuar"
                : uncertain
                  ? "Verificar resultado"
                  : signature
                    ? "Confirmar venda"
                    : "Reservar lotes"}
            {!busy && <ArrowRight aria-hidden="true" />}
          </Button>
        </footer>
      </form>
    </SaleDialog>
  );
}
