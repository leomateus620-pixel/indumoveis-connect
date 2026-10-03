/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, Section, Restricted, Loading, FormRow, Pending } from "@/components/app/ui";
import { useProfileName } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCan,
  useProfiles,
  useUserRoles,
  usePermissions,
  useEdition,
  useTemplates,
  useAudit,
  useDbMutation,
  api,
  useMe,
} from "@/lib/api";
import { ROLE_LABEL, MODULES, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Sistema Indumóveis" },
      { name: "description", content: "Usuários, perfis, edição e parâmetros." },
    ],
  }),
  component: AdminPage,
});

const ROLES = ["admin", "comercial", "financeiro", "operacao", "consulta"];

function AdminPage() {
  const can = useCan("admin");
  if (!can.read) return <Restricted />;
  return (
    <>
      <PageHeader title="Administração" />
      <Tabs defaultValue="usuarios" className="p-4 md:p-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="perfis">Perfis e permissões</TabsTrigger>
          <TabsTrigger value="edicao">Edição e políticas</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
          <TabsTrigger value="auditoria">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios" className="mt-4">
          <Users />
        </TabsContent>
        <TabsContent value="perfis" className="mt-4">
          <Perms />
        </TabsContent>
        <TabsContent value="edicao" className="mt-4">
          <EditionForm />
        </TabsContent>
        <TabsContent value="checklists" className="mt-4">
          <Checklists />
        </TabsContent>
        <TabsContent value="auditoria" className="mt-4">
          <Audit />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Users() {
  const { data: profiles = [], isLoading } = useProfiles();
  const { data: roles = [] } = useUserRoles();
  const { data: me } = useMe();
  const m = useDbMutation(
    async (v: { user: string; role: string; on: boolean }) => {
      if (v.on) return api.insert("user_roles", { user_id: v.user, role: v.role });
      const r = roles.find((x: any) => x.user_id === v.user && x.role === v.role);
      if (r) return api.remove("user_roles", r.id);
    },
    { success: "Perfil atualizado" },
  );
  if (isLoading) return <Loading />;
  return (
    <Section title="Usuários e perfis">
      <p className="mb-3 text-sm text-muted-foreground">
        Usuários criam a própria conta na tela de acesso; aqui a administração atribui perfis. Não
        há contas ou senhas compartilhadas.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Usuário</th>
              {ROLES.map((r) => (
                <th key={r} className="px-2 text-center">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="py-2">
                  <p className="font-semibold">{p.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </td>
                {ROLES.map((r) => {
                  const on = roles.some((x: any) => x.user_id === p.id && x.role === r);
                  return (
                    <td key={r} className="text-center">
                      <Checkbox
                        aria-label={`${ROLE_LABEL[r]} para ${p.email}`}
                        checked={on}
                        disabled={m.isPending || (on && p.id === me?.id && r === "admin")}
                        onCheckedChange={(v) => m.mutate({ user: p.id, role: r, on: !!v })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Perms() {
  const { data = [] } = usePermissions();
  const m = useDbMutation((v: { role: string; module: string; read: boolean; write: boolean }) =>
    api.raw
      .from("role_permissions")
      .upsert({ role: v.role, module: v.module, can_read: v.read, can_write: v.write })
      .then((r: any) => {
        if (r.error) throw r.error;
      }),
  );
  const get = (role: string, module: string) =>
    data.find((p: any) => p.role === role && p.module === module) ?? {
      can_read: false,
      can_write: false,
    };
  return (
    <Section title="Matriz de permissões">
      <p className="mb-3 text-sm text-muted-foreground">
        Leitura permite consultar; edição permite criar, alterar e confirmar operações do módulo. As
        regras são aplicadas no servidor. Administração tem acesso total.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Módulo</th>
              {ROLES.filter((r) => r !== "admin").map((r) => (
                <th key={r} className="px-2 text-center">
                  {ROLE_LABEL[r]}
                  <br />
                  <span className="font-normal">ler · editar</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.filter((x) => x.key !== "admin").map((mod) => (
              <tr key={mod.key} className="border-t">
                <td className="py-2 font-medium">{mod.label}</td>
                {ROLES.filter((r) => r !== "admin").map((r) => {
                  const p = get(r, mod.key);
                  return (
                    <td key={r} className="px-2 text-center">
                      <span className="inline-flex gap-3">
                        <Checkbox
                          aria-label={`${ROLE_LABEL[r]} ler ${mod.label}`}
                          checked={p.can_read}
                          onCheckedChange={(v) =>
                            m.mutate({
                              role: r,
                              module: mod.key,
                              read: !!v,
                              write: !!v && p.can_write,
                            })
                          }
                        />
                        <Checkbox
                          aria-label={`${ROLE_LABEL[r]} editar ${mod.label}`}
                          checked={p.can_write}
                          onCheckedChange={(v) =>
                            m.mutate({
                              role: r,
                              module: mod.key,
                              read: p.can_read || !!v,
                              write: !!v,
                            })
                          }
                        />
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function EditionForm() {
  const { data: e } = useEdition();
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (e)
      setF({
        name: e.name,
        year: e.year,
        starts_on: e.starts_on,
        ends_on: e.ends_on,
        venue: e.venue ?? "",
        hold: e.reservation_hold_days ?? "",
        template: e.contract_template ?? "",
      });
  }, [e]);
  const m = useDbMutation(
    () =>
      api.update("editions", e!.id, {
        name: f.name,
        year: Number(f.year),
        starts_on: f.starts_on,
        ends_on: f.ends_on,
        venue: f.venue || null,
        reservation_hold_days: f.hold === "" ? null : Number(f.hold),
        reservation_expiry_action: f.hold === "" ? null : "alertar",
        contract_template: f.template || null,
      }),
    { success: "Edição atualizada" },
  );
  if (!e) return <Loading />;
  return (
    <form
      className="grid gap-4 lg:grid-cols-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        m.mutate(undefined);
      }}
    >
      <Section title="Edição ativa">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormRow label="Nome" htmlFor="en">
            <Input
              id="en"
              value={f.name ?? ""}
              onChange={(x) => setF({ ...f, name: x.target.value })}
            />
          </FormRow>
          <FormRow label="Ano" htmlFor="ey">
            <Input
              id="ey"
              type="number"
              value={f.year ?? ""}
              onChange={(x) => setF({ ...f, year: x.target.value })}
            />
          </FormRow>
          <FormRow label="Início" htmlFor="es">
            <Input
              id="es"
              type="date"
              value={f.starts_on ?? ""}
              onChange={(x) => setF({ ...f, starts_on: x.target.value })}
            />
          </FormRow>
          <FormRow label="Término" htmlFor="ee">
            <Input
              id="ee"
              type="date"
              value={f.ends_on ?? ""}
              onChange={(x) => setF({ ...f, ends_on: x.target.value })}
            />
          </FormRow>
        </div>
        <div className="mt-3">
          <FormRow label="Local" htmlFor="ev">
            <Input
              id="ev"
              value={f.venue ?? ""}
              onChange={(x) => setF({ ...f, venue: x.target.value })}
              placeholder="Não informado"
            />
          </FormRow>
        </div>
      </Section>
      <Section title="Política de reservas">
        <FormRow
          label="Prazo de validade da reserva (dias)"
          htmlFor="eh"
          hint="Vazio = sem política. Quando definido, reservas vencidas são sinalizadas para ação manual; nenhuma negociação é cancelada automaticamente."
        >
          <Input
            id="eh"
            type="number"
            min={1}
            value={f.hold ?? ""}
            onChange={(x) => setF({ ...f, hold: x.target.value })}
          />
        </FormRow>
        {f.hold === "" && (
          <div className="mt-3">
            <Pending title="Política não definida">
              Informe o prazo oficial quando a Indumóveis definir a regra.
            </Pending>
          </div>
        )}
      </Section>
      <Section title="Modelo contratual" className="lg:col-span-2">
        <Textarea
          className="min-h-56 font-mono text-sm"
          value={f.template ?? ""}
          onChange={(x) => setF({ ...f, template: x.target.value })}
          placeholder="Cole aqui o modelo aprovado pelo jurídico. Ele será copiado como rascunho inicial de cada novo contrato."
        />
      </Section>
      <div className="lg:col-span-2">
        <Button type="submit" disabled={m.isPending}>
          Salvar edição
        </Button>
      </div>
    </form>
  );
}

function Checklists() {
  const { data = [] } = useTemplates();
  const [name, setName] = useState("");
  const add = useDbMutation(
    () => api.insert("checklist_templates", { name: name.trim(), items: [] }),
    { success: "Checklist criado", onSuccess: () => setName("") },
  );
  return (
    <div className="space-y-4">
      {data.map((t: any) => (
        <TemplateEditor key={t.id} t={t} />
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add.mutate(undefined);
        }}
      >
        <Input
          placeholder="Nome do novo checklist"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Adicionar
        </Button>
      </form>
    </div>
  );
}
function TemplateEditor({ t }: { t: any }) {
  const [text, setText] = useState((t.items ?? []).join("\n"));
  const [active, setActive] = useState(t.is_active);
  const m = useDbMutation(
    () =>
      api.update("checklist_templates", t.id, {
        items: text
          .split("\n")
          .map((s: string) => s.trim())
          .filter(Boolean),
        is_active: active,
      }),
    { success: "Checklist salvo" },
  );
  return (
    <Section title={t.name}>
      <FormRow label="Itens (um por linha)" htmlFor={`ti-${t.id}`}>
        <Textarea
          id={`ti-${t.id}`}
          className="min-h-32"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </FormRow>
      <div className="mt-2 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} />
          Ativo
        </label>
        <Button size="sm" onClick={() => m.mutate(undefined)} disabled={m.isPending}>
          Salvar
        </Button>
      </div>
    </Section>
  );
}

const TABLE_LABEL: Record<string, string> = {
  companies: "Empresa",
  spaces: "Espaço",
  deals: "Negociação",
  contracts: "Contrato",
  installments: "Parcela",
  payments: "Pagamento",
  inspections: "Vistoria",
  documents: "Documento",
  user_roles: "Perfil de usuário",
  role_permissions: "Permissão",
  editions: "Edição",
};
const ACTION: Record<string, string> = { INSERT: "criou", UPDATE: "alterou", DELETE: "removeu" };
function Audit() {
  const { data = [], isLoading } = useAudit();
  const name = useProfileName();
  if (isLoading) return <Loading />;
  return (
    <Section title="Últimas 200 alterações">
      <ul className="divide-y text-sm">
        {data.map((a: any) => (
          <li key={a.id} className="flex justify-between gap-3 py-1.5">
            <span>
              <strong>{name(a.actor)}</strong> {ACTION[a.action]}{" "}
              {TABLE_LABEL[a.table_name] ?? a.table_name}
            </span>
            <span className="tnum shrink-0 text-xs text-muted-foreground">
              {fmtDateTime(a.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
