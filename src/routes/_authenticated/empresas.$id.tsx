/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2, Plus, ArrowLeft } from "lucide-react";
import {
  PageHeader,
  Section,
  Field,
  Loading,
  Restricted,
  StatusBadge,
  AttachedDocuments,
  FormRow,
} from "@/components/app/ui";
import { RelatedActivities, RelatedLink } from "@/components/app/shared";
import { CompanyDialog } from "@/components/app/CompanyDialog";
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
import { useCompany, useCan, useDeals, useContracts, useDbMutation, api } from "@/lib/api";
import { DEAL_STATUS, CONTRACT_STATUS, brl, area } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/empresas/$id")({
  head: () => ({
    meta: [
      { title: "Ficha da empresa — Sistema Indumóveis" },
      { name: "description", content: "Dados, contatos e participação da empresa." },
    ],
  }),
  component: CompanyPage,
});

function CompanyPage() {
  const { id } = Route.useParams();
  const can = useCan("empresas");
  const com = useCan("comercial");
  const docsCan = useCan("documentos");
  const { data: c, isLoading } = useCompany(id);
  const { data: deals = [] } = useDeals();
  const { data: contracts = [] } = useContracts();
  const [edit, setEdit] = useState(false);
  const [contact, setContact] = useState(false);
  const del = useDbMutation((cid: string) => api.remove("contacts", cid), {
    success: "Contato removido",
  });
  if (!can.read) return <Restricted />;
  if (isLoading) return <Loading />;
  if (!c) return <p className="p-8">Empresa não encontrada.</p>;
  const myDeals = deals.filter((d: any) => d.company_id === id);
  const myContracts = contracts.filter((x: any) => x.company_id === id);
  const spaces = myDeals
    .filter((d: any) => !["perdida", "cancelada"].includes(d.status))
    .flatMap((d: any) => (d.deal_spaces ?? []).map((x: any) => ({ ...x, deal: d })));

  return (
    <>
      <PageHeader
        title={c.trade_name}
        subtitle={
          <>
            {c.legal_name}
            {c.tax_id && <span className="tnum"> · {c.tax_id}</span>}
          </>
        }
        actions={
          <>
            <Link
              to="/empresas"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Empresas
            </Link>
            {can.write && (
              <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
                Editar
              </Button>
            )}
            {com.write && (
              <Button size="sm" asChild>
                <Link to="/comercializacao" search={{ company: id }}>
                  Nova negociação
                </Link>
              </Button>
            )}
          </>
        }
      />
      <Tabs defaultValue="dados" className="p-4 md:p-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="comercial">Negociações e espaços ({myDeals.length})</TabsTrigger>
          <TabsTrigger value="contratos">Contratos ({myContracts.length})</TabsTrigger>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
          <TabsTrigger value="ativ">Atividades</TabsTrigger>
        </TabsList>
        <TabsContent value="dados" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section title="Cadastro">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Nome fantasia">{c.trade_name}</Field>
              <Field label="Razão social">{c.legal_name}</Field>
              <Field label="CNPJ / CPF">
                <span className="tnum">{c.tax_id}</span>
              </Field>
              <Field label="Segmento">{c.segment}</Field>
              <Field label="E-mail">{c.email}</Field>
              <Field label="Telefone">{c.phone}</Field>
              <Field label="Cidade / UF">
                {[c.city, c.state].filter(Boolean).join(" / ") || null}
              </Field>
              <Field label="Site">{c.website}</Field>
            </dl>
            {c.notes && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{c.notes}</p>
            )}
          </Section>
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
            {c.contacts?.length ? (
              <ul className="divide-y text-sm">
                {c.contacts.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {p.name}{" "}
                        {p.is_primary && (
                          <span className="text-xs font-normal text-primary">· principal</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[p.role, p.email, p.phone].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {can.write && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover ${p.name}`}
                        onClick={() => del.mutate(p.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum contato.</p>
            )}
          </Section>
          <Section title="Participações por edição">
            {c.company_participations?.length ? (
              c.company_participations.map((p: any) => (
                <p key={p.id} className="text-sm">
                  {p.editions?.name} · <span className="text-muted-foreground">{p.status}</span>
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Registrada automaticamente na primeira negociação da edição.
              </p>
            )}
          </Section>
        </TabsContent>
        <TabsContent value="comercial" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section title="Negociações">
            {myDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma.</p>
            ) : (
              myDeals.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between py-1.5 text-sm">
                  <RelatedLink type="deal" id={d.id}>
                    {d.deal_spaces?.map((x: any) => x.spaces?.code).join(", ")} ·{" "}
                    <span className="tnum">{brl(d.total_cents)}</span>
                  </RelatedLink>
                  <StatusBadge map={DEAL_STATUS} value={d.status} />
                </div>
              ))
            )}
          </Section>
          <Section title="Espaços">
            {spaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum.</p>
            ) : (
              spaces.map((s: any) => (
                <div
                  key={s.deal.id + s.space_id}
                  className="flex items-center justify-between py-1.5 text-sm"
                >
                  <RelatedLink type="space" id={s.space_id}>
                    {s.spaces?.code}
                  </RelatedLink>
                  <span className="tnum text-muted-foreground">
                    {area(s.spaces?.area_m2)} · {DEAL_STATUS[s.deal.status].label}
                  </span>
                </div>
              ))
            )}
          </Section>
        </TabsContent>
        <TabsContent value="contratos" className="mt-4">
          <Section title="Contratos">
            {myContracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum.</p>
            ) : (
              myContracts.map((x: any) => (
                <div key={x.id} className="flex items-center justify-between py-1.5 text-sm">
                  <RelatedLink type="contract" id={x.id}>
                    Contrato {x.number} · <span className="tnum">{brl(x.total_cents)}</span>
                  </RelatedLink>
                  <StatusBadge map={CONTRACT_STATUS} value={x.status} />
                </div>
              ))
            )}
          </Section>
        </TabsContent>
        <TabsContent value="docs" className="mt-4">
          <Section title="Documentos">
            <AttachedDocuments
              entityType="company"
              entityId={id}
              category="cadastro"
              canWrite={docsCan.write}
            />
          </Section>
        </TabsContent>
        <TabsContent value="ativ" className="mt-4">
          <Section title="Atividades">
            <RelatedActivities type="company" id={id} />
          </Section>
        </TabsContent>
      </Tabs>
      <CompanyDialog open={edit} onOpenChange={setEdit} company={c} />
      <ContactDialog open={contact} onOpenChange={setContact} companyId={id} />
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
