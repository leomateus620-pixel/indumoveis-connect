const integer = new Intl.NumberFormat("pt-BR");
export const count = (n: number) => integer.format(n);

export const statusSeries = [
  { status: "vendido", field: "sold", label: "Vendidos" },
  { status: "reservado", field: "reserved", label: "Reservados" },
  { status: "em_negociacao", field: "negotiating", label: "Em negociação" },
  { status: "disponivel", field: "available", label: "Disponíveis" },
  { status: "bloqueado", field: "blocked", label: "Bloqueados" },
] as const;
