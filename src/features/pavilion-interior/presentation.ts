import type { InteriorConnection } from "./connections";
import { PAVILION_8_LOT_CODES } from "./pavilion8-codes";
import type { InteriorWayfinding } from "./wayfinding";

export type InteriorPavilionNumber = 1 | 8 | 13;
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
  searchLots?: boolean;
  numberLabelMaxSize?: number;
  connections?: readonly InteriorConnection[];
  connectionBadge?: { width: number; height: number; radius: number };
  wayfinding?: readonly InteriorWayfinding[];
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
    wayfinding: [
      { elementId: "main-access", kind: "entrance", centers: [[1047, 282]] },
      { elementId: "exit", kind: "exit", centers: [[114, 519]] },
      { elementId: "north-service-access", kind: "service", centers: [[733, 108]] },
      { elementId: "south-service-access", kind: "service", centers: [[569, 519]] },
    ],
  },
  8: {
    pavilionNumber: 8,
    title: "Fornecedores e Construção Civil",
    brandPath: "/brand/fornecedores-construcao/fornecedores-construcao-compact.svg",
    brandAlt: "Fornecedores & Construção Civil · Indumóveis",
    showAreas: false,
    mode: "lots",
    commercialCount: PAVILION_8_LOT_CODES.length,
    loadingText: "Abrindo o Pavilhão 8…",
    loadErrorText: "Não foi possível carregar o Pavilhão 8.",
    connectionBadge: { width: 62, height: 68, radius: 8 },
    connections: [
      {
        elementId: "p8:left-passage",
        destination: 13,
        icon: "/brand/fornecedores-construcao/acesso-pavilhao-13.svg",
        center: [107.493, 440.892],
      },
      {
        elementId: "p8:right-passage",
        destination: 12,
        icon: "/brand/fornecedores-construcao/acesso-pavilhao-12.svg",
        center: [487.741, 339.176],
      },
    ],
    wayfinding: [
      {
        elementId: "p8:main-entrance",
        kind: "entrance",
        centers: [
          [200.333, 799],
          [394.882, 799],
        ],
      },
      { elementId: "p8:rear-exit", kind: "exit", centers: [[486.582, 128]] },
    ],
  },
  13: {
    pavilionNumber: 13,
    title: "Salão de Imóveis",
    brandPath: "/brand/salao-imoveis/salao-imoveis-compact.svg",
    brandAlt: "Salão de IMÓVEIS",
    showAreas: false,
    mode: "lots",
    searchLots: true,
    numberLabelMaxSize: 21,
    connectionBadge: { width: 76, height: 86, radius: 10 },
    connections: [
      {
        elementId: "p13:left-transverse-circulation",
        destination: 3,
        icon: "/brand/salao-imoveis/acesso-pavilhao-3.svg",
        center: [148, 642],
      },
      {
        elementId: "p13:right-transverse-circulation",
        destination: 8,
        icon: "/brand/salao-imoveis/acesso-pavilhao-8.svg",
        center: [486, 642],
      },
    ],
    commercialCount: 80,
    loadingText: "Abrindo o Salão de Imóveis…",
    loadErrorText: "Não foi possível carregar o Salão de Imóveis.",
    wayfinding: [
      {
        elementId: "p13:rear-label",
        kind: "exit",
        centers: [
          [248, 77],
          [472, 77],
        ],
        hideSourcePath: true,
      },
      {
        elementId: "p13:main-entrance",
        kind: "entrance",
        centers: [
          [248, 1202],
          [472, 1202],
        ],
      },
    ],
  },
};
export function interiorPavilionNumber(value: unknown): InteriorPavilionNumber | undefined {
  if (value === 1 || value === "1") return 1;
  if (value === 8 || value === "8") return 8;
  if (value === 13 || value === "13") return 13;
  return undefined;
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

export function validatePavilion8Search(search: Record<string, unknown>): { lote?: string } {
  const code = normalizedLotCode(search.lote);
  return { lote: PAVILION_8_LOT_CODES.find((lot) => lot === code) };
}
