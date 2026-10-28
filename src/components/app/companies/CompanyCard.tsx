import { Link } from "@tanstack/react-router";
import { ChevronDown, ArrowUpRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  useCompanyParticipation,
  type CompanyEditionSummary,
  type CompanyParticipationDetail,
} from "@/lib/api";
import { type CompanySearch } from "@/lib/company-exhibitors";
import { Loading, ErrorBox } from "@/components/app/ui";
import { CompanyIdentityDetails, Occupations } from "./CompanyDetails";

export function CompanyCard({
  company,
  editionId,
  expanded,
  onExpandedChange,
  search,
  canWrite,
  onEdit,
}: {
  company: CompanyEditionSummary;
  editionId: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  search: CompanySearch;
  canWrite: boolean;
  onEdit: (detail: CompanyParticipationDetail) => void;
}) {
  const details = useCompanyParticipation(company.id, editionId, expanded);
  const labels = company.area_labels ?? [];
  return (
    <Collapsible asChild open={expanded} onOpenChange={onExpandedChange}>
      <article
        className="company-card overflow-hidden rounded-lg border bg-card"
        aria-label={company.trade_name}
      >
        <div className="flex h-36 flex-col p-3">
          <h2
            className="line-clamp-2 text-sm leading-tight font-semibold"
            title={company.trade_name}
          >
            {company.trade_name}
          </h2>
          <p
            className="mt-1 line-clamp-2 text-[11px] leading-[1.3] text-muted-foreground"
            title={company.legal_name}
          >
            {company.legal_name}
          </p>
          <div
            className="mt-auto flex min-h-6 flex-wrap items-center gap-1 pt-2"
            aria-label="Áreas e pavilhões"
          >
            {labels.length ? (
              <>
                {labels.slice(0, 2).map((label) => (
                  <span
                    key={label}
                    title={label}
                    className="max-w-full truncate rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] leading-tight font-medium text-primary"
                  >
                    {label}
                  </span>
                ))}
                {labels.length > 2 && (
                  <span
                    title={labels.slice(2).join(", ")}
                    className="text-xs text-muted-foreground"
                  >
                    +{labels.length - 2}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Sem ocupação registrada</span>
            )}
          </div>
        </div>
        <CollapsibleTrigger
          className="flex min-h-10 w-full items-center justify-between gap-2 border-t px-3 text-left text-xs font-semibold text-primary transition-colors hover:bg-surface-subtle"
          aria-label={`${expanded ? "Recolher" : "Expandir"} dados de ${company.trade_name}`}
        >
          <span>{expanded ? "Recolher dados" : "Expandir dados"}</span>
          <ChevronDown
            aria-hidden
            className={`size-4 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="company-card-content border-t bg-surface-subtle">
          <div className="space-y-4 p-4">
            {details.isLoading ? (
              <Loading />
            ) : details.isError ? (
              <ErrorBox error={details.error} onRetry={() => void details.refetch()} />
            ) : details.data ? (
              <>
                <CompanyIdentityDetails detail={details.data} />
                <div className="space-y-2 border-t pt-3">
                  <h3 className="text-sm font-semibold">Ocupações</h3>
                  <Occupations occupations={details.data.occupations} compact />
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" asChild>
                    <Link to="/empresas/$id" params={{ id: company.id }} search={search}>
                      Ficha completa
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                  {canWrite && (
                    <Button size="sm" variant="outline" onClick={() => onEdit(details.data!)}>
                      <Pencil className="size-3.5" />
                      Editar
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Participação não encontrada.</p>
            )}
          </div>
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
}
