import type { InteriorPoint } from "./data";

export const WAYFINDING_SIGNS = {
  entrance: { asset: "entrada.svg", label: "Entrada" },
  exit: { asset: "saida.svg", label: "Saída" },
  service: { asset: "servico.svg", label: "Acesso de serviço" },
};

export type InteriorWayfinding = {
  elementId: string;
  kind: keyof typeof WAYFINDING_SIGNS;
  centers: readonly InteriorPoint[];
};

export const WAYFINDING_SIGN_SIZE = { width: 64, height: 26 };
