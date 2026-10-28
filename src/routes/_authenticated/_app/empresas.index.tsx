import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, Loading, ErrorBox, Restricted } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  useEditionCompanies,
  useCompanyEditions,
  useCan,
  type CompanyParticipationDetail,
} from "@/lib/api";
import { CompanyDialog } from "@/components/app/CompanyDialog";
import { CompanyCard } from "@/components/app/companies/CompanyCard";
import { CompaniesHeader } from "@/components/app/companies/CompaniesHeader";
import { useAppHeaderCommands } from "@/components/app/AppHeaderContext";
import { ReuseCompanyDialog } from "@/components/app/companies/ReuseCompanyDialog";
import { matchesCompanySearch, validateCompanySearch } from "@/lib/company-exhibitors";

export const Route = createFileRoute("/_authenticated/_app/empresas/")({
  validateSearch: validateCompanySearch,
  head: () => ({
    meta: [
      { title: "Empresas / Expositores — Sistema Indumóveis" },
      {
        name: "description",
        content: "Empresas, participações e ocupações por edição da Indumóveis.",
      },
    ],
  }),
  component: EmpresasPage,
});

function EmpresasPage() {
  const can = useCan("empresas");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const editionsQuery = useCompanyEditions();
  const editions = editionsQuery.data ?? [];
  const edition =
    editions.find((item) => item.id === search.edition) ??
    (!search.edition ? (editions.find((item) => item.is_active) ?? editions[0]) : undefined);
  const query = useEditionCompanies(edition?.id);
  const data = useMemo(() => query.data ?? [], [query.data]);
  useEffect(() => {
    if (!search.edition && edition?.id)
      void navigate({ search: { ...search, edition: edition.id }, replace: true });
  }, [search, edition?.id, navigate]);
  const [create, setCreate] = useState(false);
  const [reuse, setReuse] = useState(false);
  const [edit, setEdit] = useState<CompanyParticipationDetail | null>(null);
  const expanded = new Set(search.expanded?.split(",") ?? []);
  const areas = useMemo(
    () =>
      [...new Set(data.flatMap((company) => company.area_labels ?? []))].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { numeric: true }),
      ),
    [data],
  );
  const rows = useMemo(
    () =>
      data.filter(
        (company) =>
          matchesCompanySearch(company, search.q ?? "") &&
          (!search.area || company.area_labels?.includes(search.area)),
      ),
    [data, search.q, search.area],
  );
  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({
      search: { ...search, edition: edition?.id, ...patch },
      replace: true,
      resetScroll: false,
    });
  const openCompany = (id: string) =>
    void navigate({
      to: "/empresas/$id",
      params: { id },
      search: { ...search, edition: edition?.id },
    });
  useAppHeaderCommands({
    route: "/empresas",
    layout: "page",
    commands: (
      <CompaniesHeader
        editions={editions}
        edition={edition}
        search={search}
        areas={areas}
        count={rows.length}
        loading={editionsQuery.isLoading || query.isLoading}
        canWrite={can.write}
        onChange={setSearch}
        onCreate={() => setCreate(true)}
        onReuse={() => setReuse(true)}
      />
    ),
  });
  if (!can.read) return <Restricted />;
  if (editionsQuery.isLoading) return <Loading />;
  if (editionsQuery.isError)
    return <ErrorBox error={editionsQuery.error} onRetry={() => void editionsQuery.refetch()} />;
  if (!edition)
    return (
      <EmptyState
        title="Edição não encontrada"
        text="Selecione uma edição disponível para consultar os participantes."
        action={
          <Button
            onClick={() =>
              setSearch({ edition: editions.find((item) => item.is_active)?.id ?? editions[0]?.id })
            }
          >
            Abrir edição disponível
          </Button>
        }
      />
    );
  return (
    <>
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} />
      ) : !rows.length ? (
        <EmptyState
          title={
            data.length ? "Nenhuma empresa encontrada" : `Nenhum participante em ${edition.year}`
          }
          text={
            data.length
              ? "Experimente outro nome, documento ou pavilhão."
              : "Adicione uma empresa de outra edição ou cadastre uma nova empresa."
          }
        />
      ) : (
        <div className="grid items-start gap-3 px-4 pt-4 pb-6 sm:grid-cols-2 md:px-6 lg:grid-cols-3 xl:px-8 2xl:grid-cols-4">
          {rows.map((company) => (
            <CompanyCard
              key={`${edition.id}-${company.id}`}
              company={company}
              editionId={edition.id}
              search={{ ...search, edition: edition.id }}
              expanded={expanded.has(company.id)}
              onExpandedChange={(value) => {
                const next = new Set(expanded);
                if (value) next.add(company.id);
                else next.delete(company.id);
                setSearch({ expanded: [...next].join(",") || undefined });
              }}
              canWrite={can.write}
              onEdit={setEdit}
            />
          ))}
        </div>
      )}
      {create && (
        <CompanyDialog
          open={create}
          onOpenChange={setCreate}
          edition={edition}
          onSaved={openCompany}
        />
      )}
      {edit && (
        <CompanyDialog
          open={!!edit}
          onOpenChange={(open) => {
            if (!open) setEdit(null);
          }}
          edition={edition}
          company={{ ...edit.company, contacts: edit.contacts }}
          participation={edit.participation}
          occupations={edit.occupations}
        />
      )}
      {reuse && (
        <ReuseCompanyDialog
          key={edition.id}
          open={reuse}
          onOpenChange={setReuse}
          edition={edition}
          editions={editions}
          participants={data}
          onSaved={openCompany}
        />
      )}
    </>
  );
}
