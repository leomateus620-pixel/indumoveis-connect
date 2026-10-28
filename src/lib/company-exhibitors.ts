/** URL state belongs to Empresas, never to editions.is_active. */
export type CompanySearch = { edition?: string; q?: string; expanded?: string; area?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateCompanySearch(search: Record<string, unknown>): CompanySearch {
  return {
    edition:
      typeof search.edition === "string" && UUID.test(search.edition) ? search.edition : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 200) || undefined : undefined,
    area: typeof search.area === "string" ? search.area.slice(0, 200) || undefined : undefined,
    expanded:
      typeof search.expanded === "string"
        ? search.expanded
            .split(",")
            .filter((id) => UUID.test(id))
            .slice(0, 107)
            .join(",") || undefined
        : undefined,
  };
}
export function companySearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}
export function matchesCompanySearch(
  company: CompanyIdentity & { area_labels?: string[] },
  query: string,
) {
  const term = companySearchText(query.trim());
  if (!term) return true;
  const text = companySearchText(
    [
      company.trade_name,
      company.legal_name,
      company.city,
      company.state,
      ...(company.area_labels ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  return (
    text.includes(term) ||
    (/^[\d\s./-]+$/.test(term) &&
      !!term.replace(/\D/g, "") &&
      !!company.tax_id?.replace(/\D/g, "").includes(term.replace(/\D/g, "")))
  );
}
export function editionLabel(edition: { year: number; is_historical?: boolean }) {
  return `${edition.is_historical ? "Histórico" : "Participantes"} ${edition.year}`;
}
export type CompanyIdentity = {
  trade_name?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  segment?: string | null;
  website?: string | null;
  tax_id_type?: string | null;
  representative_name?: string | null;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  postal_code?: string | null;
  address_complement?: string | null;
  contacts?: { name?: string; phone?: string; email?: string; role?: string }[];
};
export type CompanyOccupation = {
  id?: string;
  area_label: string;
  module_codes: string[];
  module_count?: number;
  area_total: number | string | null;
  kind?: "historical" | "declared";
};
/** A historical blank must remain blank, including after the current company changes. */
export function participationIdentity(detail: {
  company: CompanyIdentity;
  participation?: {
    snapshot_locked?: boolean;
    registration_snapshot?: CompanyIdentity | null;
  } | null;
}): CompanyIdentity {
  return detail.participation?.snapshot_locked
    ? (detail.participation.registration_snapshot ?? {})
    : detail.company;
}
export function companyAddress(company: CompanyIdentity) {
  return [
    [company.street, company.address_number].filter(Boolean).join(", "),
    company.address_complement,
    company.neighborhood,
    company.postal_code && `CEP ${company.postal_code}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
/** Database areas have four decimal places. Sum before rounding for presentation. */
export function occupationTotals(occupations: CompanyOccupation[]) {
  let areaUnits = 0;
  let hasUnknownArea = false;
  let modules = 0;
  for (const occupation of occupations) {
    modules += occupation.module_codes.length;
    if (occupation.area_total == null || !Number.isFinite(Number(occupation.area_total)))
      hasUnknownArea = true;
    else areaUnits += Math.round(Number(occupation.area_total) * 10_000);
  }
  return { modules, area: hasUnknownArea ? null : areaUnits / 10_000 };
}
