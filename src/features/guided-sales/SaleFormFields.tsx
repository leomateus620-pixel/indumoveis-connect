import { Check, FileText, UploadCloud, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fileExt, fmtBytes, validateDocFile } from "@/lib/documents";
import { brl, fmtDate } from "@/lib/format";
import type { GuidedSalePayment, GuidedSaleQuote } from "@/lib/guided-sales";
import { discountLabels, feeNames, paymentMethods } from "./sale-form";

export function SaleField({
  label,
  children,
  help,
  wide,
}: {
  label: string;
  children: ReactNode;
  help?: string;
  wide?: boolean;
}) {
  return (
    <label className={`guided-field${wide ? " guided-field-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}

export function SalePaymentFields({
  payment,
  minDate,
  maxDate,
  maxInstallments = 18,
  external,
  onChange,
}: {
  payment: GuidedSalePayment;
  minDate?: string;
  maxDate?: string;
  maxInstallments?: number;
  external: boolean;
  onChange(next: GuidedSalePayment): void;
}) {
  const update = (patch: Partial<GuidedSalePayment>) => onChange({ ...payment, ...patch });
  const fees: Array<keyof typeof feeNames> = external
    ? ["external_cleaning", "external_ppci", "provisional_license"]
    : ["internal_cleaning", "provisional_license"];
  return (
    <>
      <div className="guided-fields">
        <SaleField label="Forma de pagamento *">
          <select
            required
            value={payment.method}
            onChange={(event) => {
              const method = event.target.value as GuidedSalePayment["method"];
              const resetDiscount =
                payment.discountModality === "installments_on_time" &&
                method !== "cartao" &&
                method !== "boleto";
              update({
                method,
                ...(resetDiscount
                  ? { discountModality: undefined, discountEvidence: undefined }
                  : {}),
              });
            }}
          >
            {Object.entries(paymentMethods).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </SaleField>
        <SaleField label="Condição *">
          <select
            required
            value={payment.mode}
            onChange={(event) => {
              const mode = event.target.value as GuidedSalePayment["mode"];
              update({
                mode,
                installmentCount: mode === "a_vista" ? 1 : 2,
                discountModality: undefined,
                discountEvidence: undefined,
              });
            }}
          >
            <option value="a_vista">À vista</option>
            <option value="parcelado" disabled={maxInstallments < 2}>
              Parcelado mensal
            </option>
          </select>
        </SaleField>
        <SaleField
          label={payment.mode === "a_vista" ? "Vencimento *" : "Primeiro vencimento *"}
          help={maxDate ? `Prazo final em ${fmtDate(maxDate)}` : undefined}
        >
          <Input
            required
            type="date"
            min={minDate}
            max={maxDate}
            value={payment.firstDueOn}
            onChange={(e) => update({ firstDueOn: e.target.value })}
          />
        </SaleField>
        {payment.mode === "parcelado" && (
          <SaleField label="Parcelas *" help={`Até ${maxInstallments} parcelas mensais`}>
            <Input
              required
              type="number"
              min={2}
              max={maxInstallments}
              value={payment.installmentCount || ""}
              onChange={(event) => update({ installmentCount: Number(event.target.value) })}
            />
          </SaleField>
        )}
        <SaleField
          wide
          label={
            payment.method === "outro"
              ? "Informe a forma de pagamento *"
              : "Observação sobre o pagamento"
          }
        >
          <Input
            required={payment.method === "outro"}
            value={payment.note ?? ""}
            maxLength={800}
            onChange={(event) => update({ note: event.target.value })}
          />
        </SaleField>
      </div>
      <details className="guided-disclosure">
        <summary>Condições de desconto e taxas</summary>
        <p>
          Registre a condição acordada e a evidência. O valor da venda permanece o informado nos
          lotes.
        </p>
        <div className="guided-fields">
          <SaleField wide label="Condição de desconto">
            <select
              value={payment.discountModality ?? ""}
              onChange={(event) =>
                update({
                  discountModality: (event.target.value ||
                    undefined) as GuidedSalePayment["discountModality"],
                  discountEvidence: undefined,
                })
              }
            >
              <option value="">Sem registro</option>
              {Object.entries(discountLabels).map(([key, label]) => (
                <option
                  key={key}
                  value={key}
                  disabled={
                    (key === "cash_full" && payment.mode !== "a_vista") ||
                    (key === "installments_on_time" &&
                      (payment.mode !== "parcelado" ||
                        !["boleto", "cartao"].includes(payment.method)))
                  }
                >
                  {label}
                </option>
              ))}
            </select>
          </SaleField>
          {payment.discountModality && (
            <SaleField wide label="Evidência da condição *">
              <Input
                required
                maxLength={800}
                value={payment.discountEvidence ?? ""}
                onChange={(event) => update({ discountEvidence: event.target.value })}
              />
            </SaleField>
          )}
          <fieldset className="guided-check-list guided-field-wide">
            <legend>Taxas registradas</legend>
            {fees.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={payment.feeKeys?.includes(key) ?? false}
                  onChange={(event) =>
                    update({
                      feeKeys: event.target.checked
                        ? [...(payment.feeKeys ?? []), key]
                        : (payment.feeKeys ?? []).filter((fee) => fee !== key),
                    })
                  }
                />
                {feeNames[key]}
              </label>
            ))}
          </fieldset>
          {Boolean(payment.feeKeys?.length) && (
            <SaleField wide label="Evidência das taxas *">
              <Input
                required
                maxLength={800}
                value={payment.feeEvidence ?? ""}
                onChange={(event) => update({ feeEvidence: event.target.value })}
              />
            </SaleField>
          )}
        </div>
      </details>
    </>
  );
}

export function SaleSchedule({ schedule }: { schedule: GuidedSaleQuote["schedule"] }) {
  if (!schedule.length) return null;
  return (
    <div className="guided-schedule">
      <table>
        <caption>Parcelas previstas</caption>
        <thead>
          <tr>
            <th scope="col">Parcela</th>
            <th scope="col">Vencimento</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row) => (
            <tr key={row.number}>
              <td>{row.number}</td>
              <td>{fmtDate(row.dueOn)}</td>
              <td>{brl(row.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SaleContractFile({
  file,
  onChange,
  progress,
  disabled,
}: {
  file: File | null;
  onChange(file: File | null): void;
  progress?: number;
  disabled?: boolean;
}) {
  const error = file
    ? validateDocFile(file) || (fileExt(file.name) !== "pdf" ? "Escolha um contrato em PDF." : null)
    : null;
  return (
    <div className="guided-attachment">
      {file ? (
        <div className="guided-file-picked">
          <FileText aria-hidden="true" />
          <span>
            <strong>{file.name}</strong>
            <small>{fmtBytes(file.size)}</small>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remover PDF selecionado"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <label className="guided-file-label">
          <UploadCloud aria-hidden="true" />
          <span>
            <strong>Anexar contrato em PDF</strong>
            <small>Até 25 MB</small>
          </span>
          <input
            aria-label="Anexar contrato em PDF"
            type="file"
            accept=".pdf,application/pdf"
            disabled={disabled}
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="guided-error">
          {error}
        </p>
      )}
      {progress != null && (
        <div className="guided-upload-progress" role="status">
          <Check aria-hidden="true" />
          {progress >= 100 ? "PDF enviado" : `Enviando PDF · ${progress}%`}
        </div>
      )}
    </div>
  );
}

export function SalePaymentConditions({ payment }: { payment: GuidedSalePayment }) {
  if (!payment.discountModality && !payment.feeKeys?.length && !payment.note) return null;
  return (
    <dl className="guided-payment-notes">
      {payment.discountModality && (
        <div>
          <dt>Condição de desconto</dt>
          <dd>{discountLabels[payment.discountModality]}</dd>
          <dd>{payment.discountEvidence}</dd>
        </div>
      )}
      {!!payment.feeKeys?.length && (
        <div>
          <dt>Taxas registradas</dt>
          <dd>
            {payment.feeKeys.map((key) => feeNames[key as keyof typeof feeNames] ?? key).join(", ")}
          </dd>
          <dd>{payment.feeEvidence}</dd>
        </div>
      )}
      {payment.note && (
        <div>
          <dt>Observação</dt>
          <dd>{payment.note}</dd>
        </div>
      )}
    </dl>
  );
}
