/* eslint-disable @typescript-eslint/no-explicit-any */
import { Field, NativeSelect } from "@/components/app/ui";
import {
  companyAddress,
  editionLabel,
  occupationTotals,
  participationIdentity,
  type CompanyOccupation,
} from "@/lib/company-exhibitors";
import { area } from "@/lib/format";

export function EditionSelect({
  editions,
  value,
  onChange,
  id = "company-edition",
  label = "Edição",
  includeGeneral = false,
}: {
  editions: { id: string; year: number; is_historical?: boolean }[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  label?: string;
  includeGeneral?: boolean;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm font-medium" htmlFor={id}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 sm:w-52"
      >
        {includeGeneral && <option value="global">Cadastro geral</option>}
        {editions.map((edition) => (
          <option value={edition.id} key={edition.id}>
            {editionLabel(edition)}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

export function CompanyIdentityDetails({
  detail,
  includeContacts = true,
}: {
  detail: any;
  includeContacts?: boolean;
}) {
  const company = participationIdentity(detail);
  const representatives = detail.participation?.snapshot_locked
    ? (company.contacts ?? [])
    : (detail.contacts ?? detail.company.contacts ?? []);
  const address = companyAddress(company);
  return (
    <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
      <Field
        label={
          company.tax_id_type === "cpf"
            ? "CPF"
            : company.tax_id_type === "cnpj"
              ? "CNPJ"
              : "CNPJ / CPF"
        }
      >
        {company.tax_id ? <span className="tnum break-words">{company.tax_id}</span> : null}
      </Field>
      <Field label="Município / UF">
        {[company.city, company.state].filter(Boolean).join(" / ") || null}
      </Field>
      {company.segment && <Field label="Segmento">{company.segment}</Field>}
      {company.website && (
        <Field label="Site">
          <span className="break-all">{company.website}</span>
        </Field>
      )}
      {company.representative_name && (
        <Field label="Representante">{company.representative_name}</Field>
      )}
      {address && (
        <div className="sm:col-span-2">
          <Field label="Endereço">{address}</Field>
        </div>
      )}
      <Field label="Celular">{company.phone}</Field>
      <Field label="E-mail">
        {company.email ? <span className="break-all">{company.email}</span> : null}
      </Field>
      {includeContacts &&
        representatives.map((contact: any, index: number) => (
          <div key={contact.id ?? index} className="sm:col-span-2">
            <Field label={contact.role || "Contato"}>
              <span className="block">{contact.name}</span>
              <span className="block break-all text-xs text-muted-foreground">
                {[contact.phone, contact.email].filter(Boolean).join(" · ")}
              </span>
            </Field>
          </div>
        ))}
    </dl>
  );
}

export function Occupations({
  occupations,
  compact = false,
}: {
  occupations: CompanyOccupation[];
  compact?: boolean;
}) {
  const totals = occupationTotals(occupations);
  if (!occupations.length)
    return <p className="text-sm text-muted-foreground">Nenhuma ocupação registrada.</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {occupations.map((occupation, index) => (
          <li key={occupation.id ?? index} className="rounded-md border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="text-sm font-semibold">{occupation.area_label}</h4>
              <span className="tnum text-xs text-muted-foreground">
                {occupation.module_codes.length}{" "}
                {occupation.module_codes.length === 1 ? "módulo" : "módulos"}
                {occupation.area_total != null ? ` · ${area(Number(occupation.area_total))}` : ""}
              </span>
            </div>
            {occupation.module_codes.length > 0 && (
              <div
                className="mt-2 flex flex-wrap gap-1"
                aria-label={`Códigos dos módulos de ${occupation.area_label}`}
              >
                {occupation.module_codes.map((code, codeIndex) => (
                  <span
                    key={`${code}-${codeIndex}`}
                    className="tnum rounded border bg-surface-subtle px-1.5 py-0.5 text-xs"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {occupations.length > 1 && (
        <div
          className={`flex flex-wrap justify-between gap-2 border-t pt-2 text-xs ${compact ? "" : "px-1"}`}
        >
          <span className="text-muted-foreground">Total das ocupações</span>
          <span className="tnum font-semibold">
            {totals.modules} {totals.modules === 1 ? "módulo" : "módulos"} · {area(totals.area)}
          </span>
        </div>
      )}
    </div>
  );
}
