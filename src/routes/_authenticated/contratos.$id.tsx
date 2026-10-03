/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader, Section, Field, Loading, Restricted, StatusBadge, AttachedDocuments, Pending, FormRow } from "@/components/app/ui";
import { ConfirmNoteDialog, RelatedLink, useProfileName, RelatedActivities } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useContract, useCan, useDbMutation, api, useInstallments, useEntityDocuments } from "@/lib/api";
import { CONTRACT_STATUS, CONTRACT_TRANSITIONS, brl, area, fmtDate, fmtDateTime, today } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contratos/$id")({
  head: () => ({ meta: [{ title: "Contrato — Sistema Indumóveis" }, { name: "description", content: "Revisão, versões e situação do contrato." }] }),
  component: ContractPage,
});

const LABEL: Record<string, string> = { emitido: "Emitir documento", elaboracao: "Voltar para elaboração", assinado: "Registrar assinatura", cancelado: "Cancelar contrato" };

function ContractPage() {
  const { id } = Route.useParams();
  const can = useCan("contratos");
  const fin = useCan("financeiro");
  const { data: c, isLoading } = useContract(id);
  const { data: inst = [] } = useInstallments(fin.read);
  const { data: files = [] } = useEntityDocuments("contract", id);
  const name = useProfileName();
  const [body, setBody] = useState("");
  const [to, setTo] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  useEffect(() => { if (c) setBody(c.body ?? ""); }, [c?.id, c?.current_version]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useDbMutation(() => api.rpc("save_contract_body", { p_contract_id: id, p_body: body }), { success: "Nova versão salva" });
  const tr = useDbMutation((v: { to: string; note: string }) => api.rpc("set_contract_status", { p_contract_id: id, p_to: v.to, p_note: v.note }), { success: "Situação atualizada", onSuccess: () => setTo(null) });
  if (!can.read) return <Restricted />;
  if (isLoading) return <Loading />;
  if (!c) return <p className="p-8">Contrato não encontrado.</p>;
  const myInst = inst.filter((i: any) => i.contract_id === id);
  const dirty = body !== (c.body ?? "");

  return (
    <>
      <PageHeader title={`Contrato ${c.number}`} subtitle={c.companies?.trade_name}
        actions={<>
          <Link to="/contratos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Contratos</Link>
          <StatusBadge map={CONTRACT_STATUS} value={c.status} />
        </>} />
      <div className="grid gap-4 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Section title="Revisão dos dados">
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="Razão social"><RelatedLink type="company" id={c.company_id}>{c.companies?.legal_name}</RelatedLink></Field>
              <Field label="CNPJ / CPF"><span className="tnum">{c.companies?.tax_id ?? "não informado"}</span></Field>
              <Field label="Valor total"><span className="tnum">{brl(c.total_cents)}</span></Field>
              <Field label="Negociação"><RelatedLink type="deal" id={c.deal_id}>Abrir negociação</RelatedLink></Field>
              <Field label="Emitido em">{fmtDateTime(c.issued_at)}</Field>
              <Field label="Assinatura registrada">{fmtDateTime(c.signed_at)}</Field>
            </dl>
            <p className="mt-4 text-xs font-medium text-muted-foreground">Espaços abrangidos ({c.contract_spaces?.length})</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {c.contract_spaces?.map((x: any) => <li key={x.space_id} className="rounded-md border px-2 py-1 text-sm"><RelatedLink type="space" id={x.space_id}>{x.spaces?.code}</RelatedLink> <span className="tnum text-muted-foreground">{area(x.spaces?.area_m2)}</span></li>)}
            </ul>
            {c.deals?.conditions && <><p className="mt-4 text-xs font-medium text-muted-foreground">Condições da negociação</p><p className="whitespace-pre-wrap text-sm">{c.deals.conditions}</p></>}
            {!c.companies?.tax_id && <p className="mt-3 text-sm text-warning">Documento da empresa não informado — revise o cadastro antes de emitir.</p>}
            {c.signature_note && <p className="mt-3 text-sm"><strong>Registro da assinatura:</strong> {c.signature_note}</p>}
          </Section>
          <Section title={`Texto do contrato · versão ${c.current_version}`} actions={c.status === "elaboracao" && can.write && <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(undefined)}>Salvar nova versão</Button>}>
            {!c.body && c.status === "elaboracao" && <div className="mb-3"><Pending title="Modelo contratual não fornecido">Nenhum modelo aprovado foi cadastrado em Administração › Edição. Redija ou cole o texto validado pelo jurídico; o sistema não gera cláusulas.</Pending></div>}
            <Textarea aria-label="Texto do contrato" className="min-h-80 font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} readOnly={c.status !== "elaboracao" || !can.write} />
            {c.status !== "elaboracao" && <p className="mt-2 text-xs text-muted-foreground">Texto bloqueado: volte para elaboração para editar (gera nova versão).</p>}
          </Section>
        </div>
        <div className="space-y-4">
          {can.write && CONTRACT_TRANSITIONS[c.status].length > 0 && (
            <Section title="Ações">
              <div className="flex flex-col gap-2">
                {CONTRACT_TRANSITIONS[c.status].map((s) => (
                  <Button key={s} variant={s === "cancelado" || s === "elaboracao" ? "outline" : "default"} disabled={dirty} onClick={() => setTo(s)}>{LABEL[s]}</Button>
                ))}
                {dirty && <p className="text-xs text-warning">Salve o texto antes de mudar a situação.</p>}
                {c.status === "emitido" && <p className="text-xs text-muted-foreground">Anexar o arquivo assinado não registra a assinatura automaticamente.</p>}
              </div>
            </Section>
          )}
          <Section title="Arquivos do contrato">
            <AttachedDocuments entityType="contract" entityId={id} category="contrato" canWrite={can.write} extraLinks={[{ type: "company", id: c.company_id }]} />
            {files.length > 0 && c.status !== "assinado" && <p className="mt-2 text-xs text-muted-foreground">Arquivo anexado · assinatura ainda não registrada.</p>}
          </Section>
          {fin.read && (
            <Section title="Parcelas" actions={fin.write && myInst.length === 0 && c.status !== "cancelado" && <Button size="sm" variant="outline" onClick={() => setGen(true)}>Gerar parcelas</Button>}>
              {myInst.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma parcela lançada.</p> : (
                <ul className="divide-y text-sm">{myInst.map((i: any) => (
                  <li key={i.id} className="flex justify-between py-1.5 tnum"><span>{i.number}ª · {fmtDate(i.due_date)}</span><span>{brl(i.amount_cents)} · {i.status}</span></li>
                ))}</ul>
              )}
              <Link to="/financeiro" className="mt-2 inline-block text-xs font-semibold text-primary">Abrir financeiro</Link>
            </Section>
          )}
          <Section title="Versões">
            <ul className="text-sm">{[...(c.contract_versions ?? [])].sort((a: any, b: any) => b.version - a.version).map((v: any) => (
              <li key={v.id} className="flex justify-between py-1"><span>v{v.version}</span><span className="tnum text-xs text-muted-foreground">{fmtDateTime(v.created_at)} · {name(v.created_by)}</span></li>
            ))}</ul>
          </Section>
          <Section title="Atividades"><RelatedActivities type="contract" id={id} /></Section>
        </div>
      </div>
      <ConfirmNoteDialog open={!!to} onOpenChange={(o) => !o && setTo(null)} busy={tr.isPending} title={to ? LABEL[to] : ""}
        label={to === "assinado" ? "Como a assinatura foi obtida (ex.: assinatura física em 12/03, via digitalizada anexada)" : "Observação"}
        required={to === "assinado"} onConfirm={(note) => tr.mutate({ to: to!, note })} />
      <GenerateDialog open={gen} onOpenChange={setGen} contractId={id} total={c.total_cents} />
    </>
  );
}

function GenerateDialog({ open, onOpenChange, contractId, total }: { open: boolean; onOpenChange: (o: boolean) => void; contractId: string; total: number }) {
  const [n, setN] = useState(1);
  const [first, setFirst] = useState(today());
  const [interval, setInterval] = useState(1);
  const m = useDbMutation(() => api.rpc("generate_installments", { p_contract_id: contractId, p_count: n, p_first_due: first, p_interval_months: interval }), { success: "Parcelas lançadas", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Gerar parcelas</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Total do contrato: <strong className="tnum">{brl(total)}</strong>. A diferença de centavos fica na última parcela.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormRow label="Parcelas" htmlFor="gn"><Input id="gn" type="number" min={1} max={36} value={n} onChange={(e) => setN(Number(e.target.value))} /></FormRow>
          <FormRow label="1º vencimento" htmlFor="gf"><Input id="gf" type="date" value={first} onChange={(e) => setFirst(e.target.value)} /></FormRow>
          <FormRow label="Intervalo (meses)" htmlFor="gi"><Input id="gi" type="number" min={1} max={12} value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></FormRow>
        </div>
        <DialogFooter><Button disabled={m.isPending} onClick={() => m.mutate(undefined)}>Gerar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
