/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDbMutation, api } from "@/lib/api";
import { type CompanyOccupation } from "@/lib/company-exhibitors";
import { FormRow } from "./ui";
import { Occupations } from "./companies/CompanyDetails";

const EMPTY = {
  legal_name: "",
  trade_name: "",
  tax_id: "",
  tax_id_type: "unknown",
  representative_name: "",
  email: "",
  phone: "",
  website: "",
  city: "",
  state: "",
  segment: "",
  notes: "",
  street: "",
  address_number: "",
  neighborhood: "",
  postal_code: "",
  address_complement: "",
};
type Form = typeof EMPTY;
type OccupationDraft = { area_label: string; modules: string; area_total: string };
const occupationDraft = (occupation: CompanyOccupation): OccupationDraft => ({
  area_label: occupation.area_label,
  modules: occupation.module_codes.join("; "),
  area_total: occupation.area_total == null ? "" : String(occupation.area_total),
});
const COMPANY_SCHEMA = z.object({
  legal_name: z.string().trim().min(2, "Informe a razão social").max(200),
  trade_name: z.string().trim().min(1, "Informe o nome fantasia").max(120),
  tax_id: z.string().trim().max(40),
  tax_id_type: z.enum(["cpf", "cnpj", "unknown"]),
  representative_name: z.string().trim().max(120),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((value) => !value || z.string().email().safeParse(value).success, "E-mail inválido"),
  phone: z.string().trim().max(80),
  website: z.string().trim().max(200),
  city: z.string().trim().max(100),
  state: z.string().trim().max(2),
  segment: z.string().trim().max(100),
  notes: z.string().max(2000),
  street: z.string().trim().max(200),
  address_number: z.string().trim().max(40),
  neighborhood: z.string().trim().max(100),
  postal_code: z.string().trim().max(20),
  address_complement: z.string().trim().max(200),
});

export function CompanyDialog({
  open,
  onOpenChange,
  company,
  edition,
  participation,
  occupations = [],
  previousOccupations = [],
  previousEditionName,
  reuse = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: any;
  edition: { id: string; year: number; is_historical?: boolean };
  participation?: any;
  occupations?: CompanyOccupation[];
  previousOccupations?: CompanyOccupation[];
  previousEditionName?: string;
  reuse?: boolean;
  onSaved?: (id: string) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [drafts, setDrafts] = useState<OccupationDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [confirmReuse, setConfirmReuse] = useState(false);
  const [baseline, setBaseline] = useState<{ updatedAt: string | null; version: number | null }>({
    updatedAt: null,
    version: null,
  });
  const locked = !!participation?.snapshot_locked;
  useEffect(() => {
    if (!open) return;
    const values = company
      ? (Object.fromEntries(
          Object.keys(EMPTY).map((key) => [key, company[key] ?? EMPTY[key as keyof Form]]),
        ) as Form)
      : { ...EMPTY };
    if (!values.representative_name)
      values.representative_name =
        company?.contacts?.find((contact: any) => contact.is_primary)?.name ?? "";
    values.tax_id_type = ["cpf", "cnpj"].includes(values.tax_id_type)
      ? values.tax_id_type
      : "unknown";
    setForm(values);
    setBaseline({
      updatedAt: company?.updated_at ?? null,
      version: participation?.version ?? null,
    });
    setDrafts(occupations.map(occupationDraft));
    setError(null);
    setConfirmReuse(false);
    setIdempotencyKey(crypto.randomUUID());
    // Open a stable editing session; refetches must not discard unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company?.id, edition.id]);
  const mutation = useDbMutation(
    async () => {
      const parsed = COMPANY_SCHEMA.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      if (parsed.data.tax_id && parsed.data.tax_id !== (company?.tax_id ?? "")) {
        const digits = parsed.data.tax_id.replace(/\D/g, "");
        if (![11, 14].includes(digits.length))
          throw new Error("Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos");
        if (parsed.data.tax_id_type === "unknown")
          parsed.data.tax_id_type = digits.length === 11 ? "cpf" : "cnpj";
      }
      if (
        company?.contacts?.some((contact: any) => contact.is_primary) &&
        !parsed.data.representative_name
      )
        throw new Error("Para remover o representante, use a seção Contatos na ficha da empresa.");
      const occupationValues = locked
        ? null
        : drafts.map((draft, index) => {
            if (!draft.area_label.trim())
              throw new Error(`Informe a área / pavilhão da ocupação ${index + 1}`);
            if (!/^\d+(?:[.,]\d{1,4})?$/.test(draft.area_total.trim()))
              throw new Error(
                `Informe uma área válida na ocupação ${index + 1}, com até quatro casas decimais`,
              );
            return {
              area_label: draft.area_label.trim(),
              module_codes: draft.modules
                .split(";")
                .map((code) => code.trim())
                .filter(Boolean),
              area_total: draft.area_total ? Number(draft.area_total.replace(",", ".")) : null,
            };
          });
      const values = Object.fromEntries(
        Object.entries(parsed.data).map(([key, value]) => [key, value === "" ? null : value]),
      );
      return api.saveCompanyParticipation({
        companyId: company?.id ?? null,
        editionId: edition.id,
        company: values,
        occupations: occupationValues,
        expectedCompanyUpdatedAt: baseline.updatedAt,
        expectedParticipationVersion: baseline.version,
        idempotencyKey,
      });
    },
    {
      success: reuse ? `Participação em ${edition.year} cadastrada` : "Dados salvos",
      onSuccess: (result: any) => {
        onOpenChange(false);
        onSaved?.(result.company_id ?? result.id);
      },
    },
  );
  const set =
    (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((value) => ({ ...value, [key]: event.target.value }));
  const changeOccupation = (index: number, key: keyof OccupationDraft, value: string) =>
    setDrafts((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!mutation.isPending) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {reuse
              ? `Adicionar a ${edition.year}`
              : company
                ? "Editar dados da empresa"
                : "Nova empresa"}
          </DialogTitle>
          <DialogDescription>
            {locked
              ? `Os dados gerais podem ser atualizados. O retrato de ${edition.year} permanece preservado.`
              : `Confira o cadastro e a participação na edição ${edition.year}.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            mutation.mutate(undefined, { onError: (reason: any) => setError(reason.message) });
          }}
        >
          <fieldset disabled={mutation.isPending} className="space-y-6">
            <section aria-labelledby="company-identification" className="space-y-3">
              <h3 id="company-identification" className="text-sm font-semibold">
                Identificação
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormRow label="Nome fantasia *" htmlFor="company-trade">
                  <Input
                    id="company-trade"
                    value={form.trade_name}
                    onChange={set("trade_name")}
                    maxLength={120}
                    required
                  />
                </FormRow>
                <FormRow label="Razão social *" htmlFor="company-legal">
                  <Input
                    id="company-legal"
                    value={form.legal_name}
                    onChange={set("legal_name")}
                    maxLength={200}
                    required
                  />
                </FormRow>
                <FormRow label="CNPJ / CPF" htmlFor="company-tax">
                  <Input
                    id="company-tax"
                    value={form.tax_id}
                    onChange={set("tax_id")}
                    inputMode="numeric"
                    maxLength={40}
                  />
                </FormRow>
                <FormRow label="Tipo de documento" htmlFor="company-tax-type">
                  <Input
                    id="company-tax-type"
                    readOnly
                    value={
                      form.tax_id.replace(/\D/g, "").length === 14
                        ? "CNPJ · verificação ao salvar"
                        : form.tax_id.replace(/\D/g, "").length === 11
                          ? "CPF · verificação ao salvar"
                          : "A identificar"
                    }
                  />
                </FormRow>
                <FormRow label="Segmento" htmlFor="company-segment">
                  <Input id="company-segment" value={form.segment} onChange={set("segment")} />
                </FormRow>
                <FormRow label="Site" htmlFor="company-website">
                  <Input id="company-website" value={form.website} onChange={set("website")} />
                </FormRow>
              </div>
            </section>
            <section aria-labelledby="company-contacts" className="space-y-3 border-t pt-4">
              <h3 id="company-contacts" className="text-sm font-semibold">
                Contatos
              </h3>
              <FormRow label="Representante" htmlFor="company-representative">
                <Input
                  id="company-representative"
                  value={form.representative_name}
                  onChange={set("representative_name")}
                  maxLength={120}
                />
              </FormRow>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormRow label="Celular" htmlFor="company-phone">
                  <Input
                    id="company-phone"
                    value={form.phone}
                    onChange={set("phone")}
                    type="tel"
                    maxLength={80}
                  />
                </FormRow>
                <FormRow label="E-mail" htmlFor="company-email">
                  <Input
                    id="company-email"
                    value={form.email}
                    onChange={set("email")}
                    type="email"
                    maxLength={255}
                  />
                </FormRow>
              </div>
            </section>
            <section aria-labelledby="company-location" className="space-y-3 border-t pt-4">
              <h3 id="company-location" className="text-sm font-semibold">
                Endereço
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2 sm:col-span-3">
                  <FormRow label="Município" htmlFor="company-city">
                    <Input
                      id="company-city"
                      value={form.city}
                      onChange={set("city")}
                      maxLength={100}
                    />
                  </FormRow>
                </div>
                <FormRow label="UF" htmlFor="company-state">
                  <Input
                    id="company-state"
                    maxLength={2}
                    value={form.state}
                    onChange={(event) =>
                      setForm({ ...form, state: event.target.value.toUpperCase() })
                    }
                  />
                </FormRow>
                <FormRow label="CEP" htmlFor="company-postal">
                  <Input
                    id="company-postal"
                    value={form.postal_code}
                    onChange={set("postal_code")}
                    maxLength={20}
                  />
                </FormRow>
                <div className="col-span-2">
                  <FormRow label="Logradouro" htmlFor="company-street">
                    <Input
                      id="company-street"
                      value={form.street}
                      onChange={set("street")}
                      maxLength={200}
                    />
                  </FormRow>
                </div>
                <FormRow label="Número" htmlFor="company-number">
                  <Input
                    id="company-number"
                    value={form.address_number}
                    onChange={set("address_number")}
                    maxLength={40}
                  />
                </FormRow>
                <div className="col-span-2">
                  <FormRow label="Bairro" htmlFor="company-neighborhood">
                    <Input
                      id="company-neighborhood"
                      value={form.neighborhood}
                      onChange={set("neighborhood")}
                      maxLength={100}
                    />
                  </FormRow>
                </div>
                <div className="col-span-2">
                  <FormRow label="Complemento" htmlFor="company-complement">
                    <Input
                      id="company-complement"
                      value={form.address_complement}
                      onChange={set("address_complement")}
                      maxLength={200}
                    />
                  </FormRow>
                </div>
              </div>
            </section>
            {!!previousOccupations.length && (
              <section
                className="space-y-3 rounded-lg border bg-surface-subtle p-4"
                aria-labelledby="previous-occupations"
              >
                <h3 id="previous-occupations" className="text-sm font-semibold">
                  Ocupações anteriores · {previousEditionName}
                </h3>
                <Occupations occupations={previousOccupations} />
                {!locked && (
                  <>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={confirmReuse}
                        onCheckedChange={(checked) => setConfirmReuse(checked === true)}
                        className="mt-0.5"
                      />
                      <span>
                        Conferi pavilhões, módulos e áreas com a estrutura de {edition.year}.
                      </span>
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      disabled={!confirmReuse || !!drafts.length}
                      onClick={() => setDrafts(previousOccupations.map(occupationDraft))}
                    >
                      Reaproveitar ocupações para conferência
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Os códigos e pavilhões serão validados ao salvar. Esta ação não reserva
                      espaços.
                    </p>
                  </>
                )}
              </section>
            )}
            <section aria-labelledby="company-participation" className="space-y-3 border-t pt-4">
              <h3 id="company-participation" className="text-sm font-semibold">
                Participação na edição {edition.year}
              </h3>
              {locked ? (
                <Occupations occupations={occupations} />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    O cadastro registra a participação. Reservas e vendas seguem em Comercialização.
                  </p>
                  {drafts.map((draft, index) => (
                    <fieldset key={index} className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <legend className="text-sm font-medium">Ocupação {index + 1}</legend>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          aria-label={`Remover ocupação ${index + 1}`}
                          onClick={() =>
                            setDrafts((values) =>
                              values.filter((_, itemIndex) => index !== itemIndex),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormRow label="Área / pavilhão *" htmlFor={`occupation-area-${index}`}>
                          <Input
                            id={`occupation-area-${index}`}
                            value={draft.area_label}
                            onChange={(event) =>
                              changeOccupation(index, "area_label", event.target.value)
                            }
                            required
                            maxLength={200}
                          />
                        </FormRow>
                        <FormRow label="Área total (m²) *" htmlFor={`occupation-total-${index}`}>
                          <Input
                            id={`occupation-total-${index}`}
                            value={draft.area_total}
                            onChange={(event) =>
                              changeOccupation(index, "area_total", event.target.value)
                            }
                            inputMode="decimal"
                            placeholder="Ex.: 36,50"
                            required
                          />
                        </FormRow>
                      </div>
                      <FormRow
                        label="Códigos dos módulos, separados por ponto e vírgula"
                        htmlFor={`occupation-codes-${index}`}
                      >
                        <Textarea
                          id={`occupation-codes-${index}`}
                          value={draft.modules}
                          onChange={(event) =>
                            changeOccupation(index, "modules", event.target.value)
                          }
                          placeholder="Ex.: 001; 002; 003"
                        />
                      </FormRow>
                      <p className="text-xs text-muted-foreground">
                        {draft.modules.split(";").filter((code) => code.trim()).length} módulos ·
                        área total da ocupação
                      </p>
                    </fieldset>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDrafts((values) => [
                        ...values,
                        { area_label: "", modules: "", area_total: "" },
                      ])
                    }
                  >
                    <Plus className="size-4" />
                    Adicionar ocupação
                  </Button>
                </>
              )}
            </section>
            <FormRow label="Observações gerais" htmlFor="company-notes">
              <Textarea
                id="company-notes"
                value={form.notes}
                onChange={set("notes")}
                maxLength={2000}
              />
            </FormRow>
          </fieldset>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando…" : reuse ? `Adicionar a ${edition.year}` : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
