/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, FilterBar, SearchInput, DataList, EmptyState, Loading, Restricted, StatusBadge, NativeSelect } from "@/components/app/ui";
import { useContracts, useCan } from "@/lib/api";
import { CONTRACT_STATUS, brl, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contratos/")({
  head: () => ({ meta: [{ title: "Contratos — Sistema Indumóveis" }, { name: "description", content: "Rascunhos, emissão, versões e assinaturas." }] }),
  component: ContratosPage,
});

function ContratosPage() {
  const can = useCan("contratos");
  const { data = [], isLoading } = useContracts();
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const navigate = useNavigate();
  const rows = useMemo(() => data.filter((c: any) => (!st || c.status === st) && (!q || c.companies?.trade_name?.toLowerCase().includes(q.toLowerCase()) || c.number?.includes(q))), [data, q, st]);
  if (!can.read) return <Restricted />;
  return (
    <>
      <PageHeader title="Contratos" subtitle="Contratos são preparados a partir de uma negociação em Comercialização" />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Empresa ou número" />
        <NativeSelect className="sm:w-56" aria-label="Situação" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Todas as situações</option>
          {Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </NativeSelect>
      </FilterBar>
      {isLoading ? <Loading /> : rows.length === 0 ? (
        <EmptyState title="Nenhum contrato" text="Abra uma negociação em andamento ou reservada e use “Preparar contrato”." />
      ) : (
        <DataList rows={rows} rowKey={(c: any) => c.id} onRowClick={(c: any) => navigate({ to: "/contratos/$id", params: { id: c.id } })} columns={[
          { header: "Número", cell: (c: any) => <span className="tnum font-semibold">{c.number}</span> },
          { header: "Empresa", cell: (c: any) => c.companies?.trade_name },
          { header: "Espaços", cell: (c: any) => c.contract_spaces?.map((x: any) => x.spaces?.code).join(", ") },
          { header: "Valor", cell: (c: any) => <span className="tnum">{brl(c.total_cents)}</span>, className: "text-right" },
          { header: "Versão", cell: (c: any) => <span className="tnum">v{c.current_version}</span>, mobile: false },
          { header: "Criado", cell: (c: any) => <span className="tnum">{fmtDate(c.created_at)}</span>, mobile: false },
          { header: "Situação", cell: (c: any) => <StatusBadge map={CONTRACT_STATUS} value={c.status} /> },
        ]} />
      )}
    </>
  );
}
