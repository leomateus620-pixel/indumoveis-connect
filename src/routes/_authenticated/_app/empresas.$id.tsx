/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, Plus, ArrowLeft, Pencil } from "lucide-react";
import {
  PageHeader,
  Section,
  Loading,
  ErrorBox,
  NotFoundState,
  Restricted,
  StatusBadge,
  FormRow,
} from "@/components/app/ui";
import { RelatedLink, ActivityDialog } from "@/components/app/shared";
import { CompanyDialog } from "@/components/app/CompanyDialog";
import {
  CompanyIdentityDetails,
  EditionSelect,
  Occupations,
} from "@/components/app/companies/CompanyDetails";
import { AttachedDocuments } from "@/components/app/documents/AttachedDocuments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCompanyEditions,
  useCompanyParticipation,
  useCompanyDeals,
  useCompanyContracts,
  useCompanyActivities,
  useCan,
  useDbMutation,
  api,
} from "@/lib/api";
import { DEAL_STATUS, CONTRACT_STATUS, ACTIVITY_STATUS, brl, area, fmtDate } from "@/lib/format";
import {
  editionLabel,
  occupationTotals,
  participationIdentity,
  validateCompanySearch,
} from "@/lib/company-exhibitors";

export const Route = createFileRoute("/_authenticated/_app/empresas/$id")({
  validateSearch: validateCompanySearch,
  head: () => ({
    meta: [
      { title: "Ficha da empresa — Sistema Indumóveis" },
      {
        name: "description",
        content: "Dados, contatos, participação e ocupações da empresa por edição.",
      },
    ],
  }),
  component: CompanyPage,
});

function CompanyPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan("empresas");
  const commercial = useCan("comercial");
  const contractsCan = useCan("contratos");
  const docsCan = useCan("documentos");
  const agenda = useCan("agenda");
  const editionsQuery = useCompanyEditions();
  const editions = editionsQuery.data ?? [];
  const edition =
    editions.find((item) => item.id === search.edition) ??
    (!search.edition ? (editions.find((item) => item.is_active) ?? editions[0]) : undefined);
  useEffect(() => {
    if (!search.edition && edition?.id)
      void navigate({ search: { ...search, edition: edition.id }, replace: true });
  }, [search, edition?.id, navigate]);
  const detailQuery = useCompanyParticipation(id, edition?.id);
  const detail = detailQuery.data;
  const [tab, setTab] = useState("dados");
  const [edit, setEdit] = useState(false);
  const [contact, setContact] = useState(false);
  const [activity, setActivity] = useState(false);
  const dealsQuery = useCompanyDeals(id, edition?.id, tab === "comercial");
  const contractsQuery = useCompanyContracts(id, edition?.id, tab === "contratos");
  const activitiesQuery = useCompanyActivities(id, edition?.id, tab === "ativ");
  const previousEdition = editions.find((item) => item.is_historical && item.id !== edition?.id);
  const previousQuery = useCompanyParticipation(
    id,
    previousEdition?.id,
    edit && !detail?.participation,
  );
  const removeContact = useDbMutation((contactId: string) => api.remove("contacts", contactId), {
    success: "Contato removido",
  });
  if (!can.read) return <Restricted />;
  if (editionsQuery.isLoading || detailQuery.isLoading) return <Loading />;
  if (editionsQuery.isError)
    return <ErrorBox error={editionsQuery.error} onRetry={() => void editionsQuery.refetch()} />;
  if (detailQuery.isError)
    return <ErrorBox error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />;
  if (!edition || !detail)
    return (
      <NotFoundState
        title={!edition ? "Edição não encontrada" : "Empresa não encontrada"}
        back={
          <Link to="/empresas" search={search} className="text-sm font-semibold text-primary">
            Voltar para empresas
          </Link>
        }
      />
    );
  const company = detail.company;
  const identity = participationIdentity(detail);
  const historical =
    !!detail.participation && (!!detail.participation.snapshot_locked || !!edition.is_historical);
  const totals = occupationTotals(detail.occupations);
  const deals = dealsQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];
  const activities = activitiesQuery.data ?? [];
  const spaces = deals
    .filter((deal: any) => !["perdida", "cancelada"].includes(deal.status))
    .flatMap((deal: any) => (deal.deal_spaces ?? []).map((space: any) => ({ ...space, deal })));
  return (
    <>
      <PageHeader
        title={identity.trade_name || "Empresa sem nome fantasia"}
        subtitle={identity.legal_name}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <Link
            to="/empresas"
            search={{ ...search, edition: edition.id }}
            className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Empresas
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {can.write && (
              <Button
                size="sm"
                variant="outline"
                className="min-h-10"
                onClick={() => setEdit(true)}
              >
                <Pencil className="size-4" />
                {!detail.participation
                  ? `Adicionar a ${edition.year}`
                  : historical
                    ? "Editar dados atuais"
                    : "Editar"}
              </Button>
            )}
            {commercial.write && edition.is_active && !historical && (
              <Button size="sm" className="min-h-10" asChild>
                <Link to="/comercializacao" search={{ company: id }}>
                  Nova negociação
                </Link>
              </Button>
            )}
          </div>
        </div>
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 md:px-6 xl:px-8">
        <EditionSelect
          editions={editions}
          value={edition.id}
          onChange={(selected) => {
            setTab("dados");
            void navigate({ search: { ...search, edition: selected }, replace: true });
          }}
          id="company-detail-edition"
        />
        <span className="rounded-md bg-plum-soft px-2.5 py-1 text-xs font-medium text-primary">
          {detail.participation ? editionLabel(edition) : `Ainda não participa de ${edition.year}`}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-px border-b bg-border text-sm">
        {[
          ["Ocupações", detail.occupations.length],
          ["Módulos listados", totals.modules],
          ["Área total", area(totals.area)],
        ].map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-3 md:px-6">
            <dt className="text-xs text-muted-foreground">
              {label} · {edition.year}
            </dt>
            <dd className="tnum mt-1 font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 p-4 md:p-6 xl:p-8">
        <TabsList className="flex h-auto max-w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="dados">Dados da empresa</TabsTrigger>
          <TabsTrigger value="ocupacoes">Ocupações</TabsTrigger>
          {commercial.read && <TabsTrigger value="comercial">Negociações e espaços</TabsTrigger>}
          {contractsCan.read && <TabsTrigger value="contratos">Contratos</TabsTrigger>}
          {docsCan.read && <TabsTrigger value="docs">Documentos</TabsTrigger>}
          {agenda.read && <TabsTrigger value="ativ">Atividades</TabsTrigger>}
        </TabsList>
        <TabsContent value="dados" className="mt-5 grid gap-6 xl:grid-cols-2">
          <Section title={historical ? `Dados da empresa · ${edition.year}` : "Dados da empresa"}>
            <CompanyIdentityDetails detail={detail} includeContacts={historical} />
            {historical && (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Cadastro preservado nesta edição.
              </p>
            )}
            {!historical && company.notes && (
              <p className="mt-4 whitespace-pre-wrap border-t pt-3 text-sm text-muted-foreground">
                {company.notes}
              </p>
            )}
          </Section>
          {!historical && (
            <Section
              title="Contatos"
              actions={
                can.write && (
                  <Button size="sm" variant="ghost" onClick={() => setContact(true)}>
                    <Plus className="size-4" />
                    Adicionar
                  </Button>
                )
              }
            >
              {detail.contacts.length ? (
                <ul className="divide-y text-sm">
                  {detail.contacts.map((person) => (
                    <li key={person.id} className="flex items-start justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {person.name}
                          {person.is_primary && (
                            <span className="text-xs font-normal text-primary"> · principal</span>
                          )}
                        </p>
                        <p className="break-words text-xs text-muted-foreground">
                          {[person.role, person.email, person.phone].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {can.write && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remover ${person.name}`}
                          disabled={removeContact.isPending}
                          onClick={() => removeContact.mutate(person.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum representante cadastrado.</p>
              )}
            </Section>
          )}
          <Section title={`Ocupações · ${edition.year}`}>
            <Occupations occupations={detail.occupations} />
          </Section>
        </TabsContent>
        <TabsContent value="ocupacoes" className="mt-5">
          <Section title={`Ocupações · ${edition.year}`}>
            <Occupations occupations={detail.occupations} />
            {!historical && (
              <p className="mt-4 text-xs text-muted-foreground">
                Reservas e vendas são acompanhadas em Negociações e espaços.
              </p>
            )}
          </Section>
        </TabsContent>
        <TabsContent value="comercial" className="mt-5">
          {dealsQuery.isLoading ? (
            <Loading />
          ) : dealsQuery.isError ? (
            <ErrorBox error={dealsQuery.error} onRetry={() => void dealsQuery.refetch()} />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <Section title={`Negociações · ${edition.year}`}>
                {!deals.length ? (
                  <p className="text-sm text-muted-foreground">Nenhuma negociação nesta edição.</p>
                ) : (
                  deals.map((deal: any) => (
                    <div
                      key={deal.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <RelatedLink type="deal" id={deal.id}>
                        {deal.deal_spaces?.map((item: any) => item.spaces?.code).join(", ") ||
                          "Negociação"}{" "}
                        · <span className="tnum">{brl(deal.total_cents)}</span>
                      </RelatedLink>
                      <StatusBadge map={DEAL_STATUS} value={deal.status} />
                    </div>
                  ))
                )}
              </Section>
              <Section title={`Espaços vinculados · ${edition.year}`}>
                {!spaces.length ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum espaço vinculado a negociações nesta edição.
                  </p>
                ) : (
                  spaces.map((space: any) => (
                    <div
                      key={space.deal.id + space.space_id}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <RelatedLink type="space" id={space.space_id}>
                        {space.spaces?.code}
                      </RelatedLink>
                      <span className="tnum text-muted-foreground">
                        {area(space.spaces?.area_m2)} · {DEAL_STATUS[space.deal.status]?.label}
                      </span>
                    </div>
                  ))
                )}
              </Section>
            </div>
          )}
        </TabsContent>
        <TabsContent value="contratos" className="mt-5">
          <Section title={`Contratos · ${edition.year}`}>
            {contractsQuery.isLoading ? (
              <Loading />
            ) : contractsQuery.isError ? (
              <ErrorBox
                error={contractsQuery.error}
                onRetry={() => void contractsQuery.refetch()}
              />
            ) : !contracts.length ? (
              <p className="text-sm text-muted-foreground">Nenhum contrato nesta edição.</p>
            ) : (
              contracts.map((contract: any) => (
                <div
                  key={contract.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <RelatedLink type="contract" id={contract.id}>
                    Contrato {contract.number} ·{" "}
                    <span className="tnum">{brl(contract.total_cents)}</span>
                  </RelatedLink>
                  <StatusBadge map={CONTRACT_STATUS} value={contract.status} />
                </div>
              ))
            )}
          </Section>
        </TabsContent>
        <TabsContent value="docs" className="mt-5">
          <Section title={`Documentos · ${edition.year}`}>
            <AttachedDocuments
              entityType="company"
              entityId={id}
              category="cadastro"
              editionId={edition.id}
              editionName={edition.name}
              canWrite={docsCan.write && edition.is_active && !historical}
            />
          </Section>
        </TabsContent>
        <TabsContent value="ativ" className="mt-5">
          <Section title={`Atividades · ${edition.year}`}>
            {activitiesQuery.isLoading ? (
              <Loading />
            ) : activitiesQuery.isError ? (
              <ErrorBox
                error={activitiesQuery.error}
                onRetry={() => void activitiesQuery.refetch()}
              />
            ) : !activities.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade nesta edição.</p>
            ) : (
              <ul className="divide-y text-sm">
                {activities.map((item: any) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span>{item.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="tnum text-xs text-muted-foreground">
                        {fmtDate(item.start_at)}
                      </span>
                      <StatusBadge map={ACTIVITY_STATUS} value={item.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {agenda.write && edition.is_active && !historical && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setActivity(true)}
              >
                Nova atividade
              </Button>
            )}
          </Section>
        </TabsContent>
      </Tabs>
      {edit && (
        <CompanyDialog
          open={edit}
          onOpenChange={setEdit}
          company={{ ...company, contacts: detail.contacts }}
          edition={edition}
          participation={detail.participation}
          occupations={detail.occupations}
          reuse={!detail.participation}
          previousOccupations={previousQuery.data?.occupations ?? []}
          previousEditionName={previousEdition ? String(previousEdition.year) : undefined}
        />
      )}
      {contact && <ContactDialog open={contact} onOpenChange={setContact} companyId={id} />}
      {activity && (
        <ActivityDialog
          open={activity}
          onOpenChange={setActivity}
          related={{ type: "company", id }}
        />
      )}
    </>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
}) {
  const [f, setF] = useState({ name: "", role: "", email: "", phone: "", is_primary: false });
  const m = useDbMutation(
    () => {
      if (!f.name.trim()) throw new Error("Informe o nome");
      return api.insert("contacts", {
        ...f,
        name: f.name.trim(),
        company_id: companyId,
        role: f.role || null,
        email: f.email || null,
        phone: f.phone || null,
      });
    },
    {
      success: "Contato adicionado",
      onSuccess: () => {
        onOpenChange(false);
        setF({ name: "", role: "", email: "", phone: "", is_primary: false });
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate(undefined);
          }}
        >
          <FormRow label="Nome *" htmlFor="kn">
            <Input
              id="kn"
              required
              maxLength={120}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </FormRow>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormRow label="Cargo" htmlFor="kr">
              <Input
                id="kr"
                maxLength={80}
                value={f.role}
                onChange={(e) => setF({ ...f, role: e.target.value })}
              />
            </FormRow>
            <FormRow label="Telefone" htmlFor="kp">
              <Input
                id="kp"
                maxLength={40}
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
              />
            </FormRow>
          </div>
          <FormRow label="E-mail" htmlFor="ke">
            <Input
              id="ke"
              type="email"
              maxLength={255}
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </FormRow>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={f.is_primary}
              onCheckedChange={(v) => setF({ ...f, is_primary: !!v })}
            />
            Contato principal
          </label>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
