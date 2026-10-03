/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, FilterBar, SearchInput, DataList, EmptyState, Loading, Restricted } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { useCompanies, useCan } from "@/lib/api";
import { CompanyDialog } from "@/components/app/CompanyDialog";

export const Route = createFileRoute("/_authenticated/empresas/")({
  head: () => ({ meta: [{ title: "Empresas / Expositores — Sistema Indumóveis" }, { name: "description", content: "Cadastro central de empresas e contatos." }] }),
  component: EmpresasPage,
});

function EmpresasPage() {
  const can = useCan("empresas");
  const { data = [], isLoading } = useCompanies();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const rows = useMemo(() => {
    const t = q.toLowerCase().trim(); const digits = t.replace(/\D/g, "");
    return data.filter((c: any) => !t || c.trade_name.toLowerCase().includes(t) || c.legal_name.toLowerCase().includes(t) || (digits && c.tax_id?.replace(/\D/g, "").includes(digits)));
  }, [data, q]);
  if (!can.read) return <Restricted />;
  return (
    <>
      <PageHeader title="Empresas / Expositores" subtitle={`${data.length} empresas cadastradas`} actions={can.write && <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />Nova empresa</Button>} />
      <FilterBar><SearchInput value={q} onChange={setQ} placeholder="Nome, razão social ou CNPJ" /></FilterBar>
      {isLoading ? <Loading /> : rows.length === 0 ? (
        <EmptyState title={data.length ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"} text="Comece cadastrando a empresa e seus contatos; ela poderá participar de negociações em qualquer edição." />
      ) : (
        <DataList rows={rows} rowKey={(c: any) => c.id} onRowClick={(c: any) => navigate({ to: "/empresas/$id", params: { id: c.id } })} columns={[
          { header: "Nome fantasia", cell: (c: any) => <span className="font-semibold">{c.trade_name}</span> },
          { header: "Razão social", cell: (c: any) => c.legal_name },
          { header: "CNPJ", cell: (c: any) => <span className="tnum">{c.tax_id || "—"}</span> },
          { header: "Cidade", cell: (c: any) => [c.city, c.state].filter(Boolean).join(" / ") || "—", mobile: false },
          { header: "Contato principal", cell: (c: any) => (c.contacts?.find((x: any) => x.is_primary) ?? c.contacts?.[0])?.name ?? "—", mobile: false },
        ]} />
      )}
      <CompanyDialog open={open} onOpenChange={setOpen} onSaved={(id) => navigate({ to: "/empresas/$id", params: { id } })} />
    </>
  );
}
