export const PAVILION_13_SECTORS = [
  { key: "left", label: "Esquerda", first: 52, last: 80 },
  { key: "center", label: "Ilha central", first: 30, last: 51 },
  { key: "right", label: "Direita", first: 1, last: 29 },
] as const;

export type Pavilion13Sector = (typeof PAVILION_13_SECTORS)[number]["key"];

export function pavilion13Sector(code: string): Pavilion13Sector | undefined {
  if (!/^\d{2}$/.test(code)) return undefined;
  const number = Number(code);
  return PAVILION_13_SECTORS.find(({ first, last }) => first <= number && number <= last)?.key;
}
