/* eslint-disable @typescript-eslint/no-explicit-any */
// Regras puras da jornada comercial (espelham as funções do banco; o banco é a fonte efetiva).

/** Divide em centavos; a diferença fica na última parcela (igual a generate_installments). */
export function splitInstallments(
  totalCents: number,
  count: number,
  firstDue: string,
  intervalMonths: number,
) {
  if (!Number.isInteger(count) || count < 1 || count > 36) return [];
  const base = Math.trunc(totalCents / count);
  const rest = totalCents - base * count;
  const [y, m, d] = firstDue.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const months = m - 1 + i * Math.max(1, intervalMonths);
    const yy = y + Math.floor(months / 12);
    const mm = months % 12;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    const due = `${yy}-${String(mm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    return { number: i + 1, due_date: due, amount_cents: base + (i === count - 1 ? rest : 0) };
  });
}

export const paidOf = (i: any) =>
  (i.payments ?? []).reduce((a: number, p: any) => a + Number(p.amount_cents), 0);

/** Contratado (contratos ativos), previsto (parcelas não canceladas), recebido (todos os pagamentos), saldo aberto. */
export function financeSummary(contracts: any[], installments: any[]) {
  const active = contracts.filter((c) => c.status !== "cancelado");
  const contracted = active.reduce((a, c) => a + Number(c.total_cents), 0);
  const live = installments.filter((i) => i.status !== "cancelada");
  const forecast = live.reduce((a, i) => a + Number(i.amount_cents), 0);
  const received = installments.reduce((a, i) => a + paidOf(i), 0);
  const open = live.reduce((a, i) => a + Math.max(0, Number(i.amount_cents) - paidOf(i)), 0);
  return { contracted, forecast, received, open };
}

/** Parcela de contrato cancelado que ainda tem pagamento: precisa de revisão manual. */
export const needsReview = (i: any) =>
  i.contracts?.status === "cancelado" && i.status !== "cancelada";

export type DealSnapshot = {
  company_id: string;
  conditions: string;
  total_cents: number;
  spaces: { space_id: string; price_cents: number }[];
};

export function snapshotOfDeal(d: any): DealSnapshot {
  return {
    company_id: d.company_id,
    conditions: d.conditions ?? "",
    total_cents: Number(d.total_cents),
    spaces: [...(d.deal_spaces ?? [])]
      .map((x: any) => ({ space_id: x.space_id, price_cents: Number(x.price_cents) }))
      .sort((a, b) => (a.space_id < b.space_id ? -1 : 1)),
  };
}

/** Lista o que mudou na negociação desde a preparação do contrato. */
export function snapshotDiff(saved: DealSnapshot | null | undefined, current: DealSnapshot) {
  if (!saved) return [];
  const out: string[] = [];
  if (saved.company_id !== current.company_id) out.push("Empresa");
  const a = (saved.spaces ?? [])
    .map((s) => s.space_id)
    .sort()
    .join(",");
  const b = current.spaces.map((s) => s.space_id).join(",");
  if (a !== b) out.push("Espaços");
  else if (
    saved.spaces.some(
      (s) =>
        Number(s.price_cents) !==
        current.spaces.find((c) => c.space_id === s.space_id)?.price_cents,
    )
  )
    out.push("Valores dos espaços");
  if (Number(saved.total_cents) !== current.total_cents && !out.includes("Valores dos espaços"))
    out.push("Valor total");
  if ((saved.conditions ?? "") !== current.conditions) out.push("Condições");
  return out;
}

/** Pendências e próxima ação da negociação, a partir da situação e do contrato ativo. */
export function dealGuidance(status: string, contract?: { status: string } | null) {
  const pend: string[] = [];
  let next = "";
  if (status === "proposta") next = "Iniciar a negociação.";
  if (status === "negociacao") {
    next = contract
      ? "Registrar a reserva dos espaços."
      : "Preparar o contrato ou registrar a reserva.";
    if (!contract) pend.push("Contrato ainda não preparado");
  }
  if (status === "reservada") {
    if (!contract) {
      pend.push("Contrato ainda não preparado");
      next = "Preparar o contrato.";
    } else if (contract.status === "elaboracao") {
      pend.push("Contrato em elaboração");
      next = "Revisar e emitir o contrato.";
    } else if (contract.status === "emitido") {
      pend.push("Assinatura não registrada");
      next = "Registrar a assinatura no contrato (conclui a contratação).";
    }
  }
  if (status === "contratada") next = "Acompanhar parcelas no Financeiro.";
  return { pend, next };
}
