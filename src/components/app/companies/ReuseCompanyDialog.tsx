import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyDialog } from "@/components/app/CompanyDialog";
import { SearchInput, Loading, ErrorBox } from "@/components/app/ui";
import {
  useEditionCompanies,
  useCompanyCandidates,
  useCompanyParticipation,
  type Edition,
  type CompanyEditionSummary,
} from "@/lib/api";
import { matchesCompanySearch } from "@/lib/company-exhibitors";
import { EditionSelect } from "./CompanyDetails";

export function ReuseCompanyDialog({
  open,
  onOpenChange,
  edition,
  editions,
  participants,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edition: Edition;
  editions: Edition[];
  participants: CompanyEditionSummary[];
  onSaved: (id: string) => void;
}) {
  const others = editions.filter((item) => item.id !== edition.id);
  const [source, setSource] = useState(
    others.find((item) => item.is_historical)?.id ?? others[0]?.id ?? "global",
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>();
  const globalSource = source === "global";
  const list = useEditionCompanies(globalSource ? undefined : source, open && !globalSource);
  const candidates = useCompanyCandidates(open && globalSource);
  const sourceQuery = globalSource ? candidates : list;
  const detail = useCompanyParticipation(
    selected,
    globalSource ? edition.id : source,
    open && !!selected,
  );
  const rows = (sourceQuery.data ?? []).filter((company) => matchesCompanySearch(company, query));
  const existingTarget = globalSource && !!detail.data?.participation;
  const ready = !!selected && !!detail.data && !existingTarget;
  // A global candidate may already participate even if the target summary was stale.
  useEffect(() => {
    if (!open || !selected || !existingTarget) return;
    setSelected(undefined);
    onOpenChange(false);
    onSaved(selected);
  }, [open, selected, existingTarget, onOpenChange, onSaved]);
  const close = (value: boolean) => {
    if (!value) setSelected(undefined);
    onOpenChange(value);
  };
  return (
    <>
      <Dialog open={open && !ready} onOpenChange={close}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adicionar de outra edição</DialogTitle>
            <DialogDescription>
              Encontre a empresa em outra edição ou no cadastro geral e confira os dados para{" "}
              {edition.year}.
            </DialogDescription>
          </DialogHeader>
          <EditionSelect
            editions={others}
            value={source}
            includeGeneral
            label="Origem"
            onChange={(value) => {
              setSource(value);
              setSelected(undefined);
            }}
            id="company-source-edition"
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar empresa pelo nome ou documento"
          />
          {selected && detail.isLoading ? (
            <Loading />
          ) : detail.isError ? (
            <ErrorBox error={detail.error} onRetry={() => void detail.refetch()} />
          ) : sourceQuery.isError ? (
            <ErrorBox error={sourceQuery.error} onRetry={() => void sourceQuery.refetch()} />
          ) : sourceQuery.isLoading ? (
            <Loading />
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
              {!rows.length && (
                <li className="p-4 text-sm text-muted-foreground">Nenhuma empresa encontrada.</li>
              )}
              {rows.map((company) => {
                const existing = participants.some((participant) => participant.id === company.id);
                return (
                  <li key={company.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                      onClick={() => {
                        if (existing) {
                          close(false);
                          onSaved(company.id);
                        } else setSelected(company.id);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{company.trade_name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {company.legal_name}
                        </span>
                        {existing && (
                          <span className="mt-1 flex items-center gap-1 text-xs text-success">
                            <Check className="size-3" />
                            Já participa de {edition.year} · abrir ficha
                          </span>
                        )}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-primary" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      {ready && detail.data && (
        <CompanyDialog
          open={open}
          onOpenChange={close}
          company={{ ...detail.data.company, contacts: detail.data.contacts }}
          edition={edition}
          previousOccupations={globalSource ? [] : detail.data.occupations}
          previousEditionName={
            globalSource ? undefined : String(others.find((item) => item.id === source)?.year ?? "")
          }
          reuse
          onSaved={onSaved}
        />
      )}
    </>
  );
}
