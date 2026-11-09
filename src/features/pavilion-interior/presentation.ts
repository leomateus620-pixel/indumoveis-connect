import type { InteriorConnection } from "./connections";

export type InteriorPavilionNumber = 1 | 13;
export type InteriorPresentation = {
  pavilionNumber: InteriorPavilionNumber;
  title: string;
  brandPath: string;
  brandAlt: string;
  showAreas: boolean;
  mode: "environments" | "lots";
  commercialCount: number;
  loadingText: string;
  loadErrorText: string;
  numberLabelMaxSize?: number;
  connections?: readonly InteriorConnection[];
};
export const PAVILION_PRESENTATIONS: Record<InteriorPavilionNumber, InteriorPresentation> = {
  1: {
    pavilionNumber: 1,
    title: "Mostra ARQ & Design",
    brandPath: "/brand/arq-design/arq-design-compact.svg",
    brandAlt: "ARQ & Design Indumóveis",
    showAreas: true,
    mode: "environments",
    commercialCount: 14,
    loadingText: "Abrindo a Mostra ARQ & Design…",
    loadErrorText: "Não foi possível carregar a Mostra.",
  },
  13: {
    pavilionNumber: 13,
    title: "Salão de Imóveis",
    brandPath: "/brand/salao-imoveis/salao-imoveis-compact.svg",
    brandAlt: "Salão de IMÓVEIS",
    showAreas: false,
    mode: "lots",
    numberLabelMaxSize: 21,
    connections: [
      {
        elementId: "p13:left-transverse-circulation",
        destination: 3,
        icon: "/brand/salao-imoveis/acesso-pavilhao-3.svg",
      },
      {
        elementId: "p13:right-transverse-circulation",
        destination: 8,
        icon: "/brand/salao-imoveis/acesso-pavilhao-8.svg",
      },
    ],
    commercialCount: 80,
    loadingText: "Abrindo o Salão de Imóveis…",
    loadErrorText: "Não foi possível carregar o Salão de Imóveis.",
  },
};
export function interiorPavilionNumber(value: unknown): InteriorPavilionNumber | undefined {
  return value === 1 || value === "1" ? 1 : value === 13 || value === "13" ? 13 : undefined;
}
export function normalizedLotCode(value: unknown): string | undefined {
  const text =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!/^\d{1,2}$/.test(text)) return undefined;
  const number = Number(text);
  return number >= 1 && number <= 80 ? String(number).padStart(2, "0") : undefined;
}
export function validatePavilion13Search(search: Record<string, unknown>): { lote?: string } {
  return { lote: normalizedLotCode(search.lote) };
}
