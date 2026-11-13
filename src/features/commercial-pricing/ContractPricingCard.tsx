import { useState } from "react";
import { FormRow, NativeSelect, Section } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { api, useDbMutation } from "@/lib/api";
import type { ContractPricingTerms } from "@/lib/commercial";
import { brl, fmtDate } from "@/lib/format";

const discountLabels: Record<string, string> = {
  cash_full: "Pagamento integral à vista",
  installments_on_time: "Parcelas pagas no vencimento",
  eligible_member: "Associado regular elegível",
};
const feeLabels: Record<string, string> = {
  internal_cleaning: "Administração e limpeza interna",
  external_cleaning: "Administração e limpeza externa",
  external_ppci: "PPCI externo",
  provisional_license: "Alvará provisório",
};

export function ContractPricingCard({
  contractId,
  terms,
  editable,
}: {
  contractId: string;
  terms: ContractPricingTerms;
  editable: boolean;
}) {
  const saved = terms.recorded_terms;
  const [discount, setDiscount] = useState(saved?.discount_modality ?? "");
  const [discountEvidence, setDiscountEvidence] = useState(saved?.discount_evidence ?? "");
  const [feeKeys, setFeeKeys] = useState(saved?.matches_contract ? saved.fee_keys : []);
  const [feeEvidence, setFeeEvidence] = useState(saved?.fee_evidence ?? "");
  const [mixedTreatment, setMixedTreatment] = useState(saved?.mixed_treatment ?? "");
  const save = useDbMutation(
    () =>
      api.rpc<number>("record_contract_pricing_terms", {
        p_contract_id: contractId,
        p_expected_version: saved?.version ?? 0,
        p_discount_modality: discount || null,
        p_discount_evidence: discount ? discountEvidence.trim() : null,
        p_fee_keys: feeKeys,
        p_fee_evidence: feeKeys.length ? feeEvidence.trim() : null,
        p_mixed_treatment: terms.scope === "mixed" && feeKeys.length ? mixedTreatment.trim() : null,
      }),
    { success: "Condições da política registradas" },
  );
  const activeDiscount = terms.discount_rules?.find((rule) => rule.modality === discount);
  const fees = (terms.fee_rules ?? []).filter(
    (fee) =>
      terms.scope !== "unknown" &&
      (terms.scope === "mixed" || fee.scope === "any" || fee.scope === terms.scope),
  );
  const blocked =
    (!!discount && !discountEvidence.trim()) ||
    (!!feeKeys.length && !feeEvidence.trim()) ||
    (terms.scope === "mixed" && !!feeKeys.length && !mixedTreatment.trim());

  return (
    <Section title={`Política comercial · v${terms.policy_version}`}>
      <p className="mb-3 text-sm text-muted-foreground">
        Até {terms.installment_limit} parcelas, com vencimento final em {fmtDate(terms.last_due)}.
        {editable && " O registro abaixo documenta as condições; o total do contrato é mantido."}
      </p>
      {saved && !saved.matches_contract && (
        <p className="mb-3 text-sm text-warning">
          Os espaços ou o expositor mudaram. Revise as condições registradas para este contrato.
        </p>
      )}
      {editable ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!blocked) save.mutate(undefined);
          }}
        >
          <FormRow label="Modalidade de desconto" htmlFor="policy-discount">
            <NativeSelect
              id="policy-discount"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            >
              <option value="">Sem desconto registrado</option>
              {terms.discount_rules?.map((rule) => (
                <option key={rule.modality} value={rule.modality}>
                  {discountLabels[rule.modality]} ({rule.basis_points / 100}%)
                </option>
              ))}
            </NativeSelect>
          </FormRow>
          {activeDiscount && (
            <FormRow label="Evidência de elegibilidade" htmlFor="policy-discount-evidence">
              <p className="mb-1 text-xs text-muted-foreground">
                {activeDiscount.eligibility} · {activeDiscount.application_condition}
              </p>
              <Textarea
                id="policy-discount-evidence"
                maxLength={2000}
                required
                value={discountEvidence}
                onChange={(event) => setDiscountEvidence(event.target.value)}
              />
            </FormRow>
          )}
          {fees.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                Taxas selecionadas para o expositor
              </legend>
              {fees.map((fee) => (
                <label key={fee.fee_key} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={feeKeys.includes(fee.fee_key)}
                    onCheckedChange={(checked) =>
                      setFeeKeys((current) =>
                        checked === true
                          ? [...current, fee.fee_key]
                          : current.filter((key) => key !== fee.fee_key),
                      )
                    }
                  />
                  <span>
                    {feeLabels[fee.fee_key]} · {brl(fee.amount_cents)}
                    <small className="block text-muted-foreground">
                      {fee.application_condition}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {feeKeys.length > 0 && (
            <FormRow label="Justificativa das taxas" htmlFor="policy-fee-evidence">
              <Textarea
                id="policy-fee-evidence"
                maxLength={2000}
                required
                value={feeEvidence}
                onChange={(event) => setFeeEvidence(event.target.value)}
              />
            </FormRow>
          )}
          {terms.scope === "mixed" && feeKeys.length > 0 && (
            <FormRow label="Incidência em contrato misto" htmlFor="policy-mixed-treatment">
              <Textarea
                id="policy-mixed-treatment"
                maxLength={2000}
                required
                value={mixedTreatment}
                onChange={(event) => setMixedTreatment(event.target.value)}
              />
            </FormRow>
          )}
          <Button size="sm" type="submit" variant="outline" disabled={blocked || save.isPending}>
            Registrar condições
          </Button>
        </form>
      ) : (
        saved && (
          <div className="space-y-1 text-sm">
            <p>
              Desconto registrado:{" "}
              {saved.discount_modality ? discountLabels[saved.discount_modality] : "nenhum"}.
            </p>
            {saved.fee_keys.length > 0 && (
              <p>Taxas registradas: {saved.fee_keys.map((key) => feeLabels[key]).join(", ")}.</p>
            )}
          </div>
        )
      )}
    </Section>
  );
}
