import type { InteriorPavilionNumber } from "./presentation";

export type ParkPavilionNumber = InteriorPavilionNumber | 3 | 8;
export type ParkPavilionSearch = `${ParkPavilionNumber}`;
export type InteriorConnection = {
  elementId: string;
  destination: ParkPavilionNumber;
  icon: string;
};

// Register only interiors that actually exist. A connector then switches from
// focusing the destination in the park to opening its interior without editing the plan.
const interiorRoutes = {
  1: "/mapa/pavilhoes/1/interior",
  13: "/mapa/pavilhoes/13/interior",
} as const satisfies { [Number in ParkPavilionNumber]?: `/mapa/pavilhoes/${Number}/interior` };

export function parkPavilionNumber(value: unknown): ParkPavilionNumber | undefined {
  return [1, 3, 8, 13].find((number) => value === number || value === String(number)) as
    ParkPavilionNumber | undefined;
}

export function pavilionDestination(pavilion: ParkPavilionNumber) {
  if (pavilion in interiorRoutes)
    return { to: interiorRoutes[pavilion as keyof typeof interiorRoutes] } as const;
  return { to: "/mapa", search: { pavilhao: String(pavilion) as ParkPavilionSearch } } as const;
}

export function pavilionDestinationHref(pavilion: ParkPavilionNumber): string {
  const target = pavilionDestination(pavilion);
  return target.to === "/mapa" ? `${target.to}?pavilhao=${target.search.pavilhao}` : target.to;
}
