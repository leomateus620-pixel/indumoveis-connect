import type { InteriorEnvironment } from "./data";

export function pavilion12Neighbor(
  lots: readonly InteriorEnvironment[],
  current: InteriorEnvironment,
  direction: string,
): InteriorEnvironment | undefined {
  const [x, y] = current.label;
  const horizontal = direction === "ArrowLeft" || direction === "ArrowRight";
  const sign = direction === "ArrowLeft" || direction === "ArrowUp" ? -1 : 1;
  const candidates = lots.filter((lot) => {
    if (lot.kind !== "commercial") return false;
    const sameRow = lot.functionLabel === current.functionLabel;
    return horizontal
      ? sameRow && sign * (lot.label[0] - x) > 0
      : !sameRow && sign * (lot.label[1] - y) > 0;
  });
  const nearest = candidates.sort((a, b) =>
    horizontal
      ? Math.abs(a.label[0] - x) - Math.abs(b.label[0] - x)
      : Math.abs(a.label[1] - y) - Math.abs(b.label[1] - y),
  )[0];
  if (horizontal || !nearest) return nearest;
  return candidates
    .filter((lot) => lot.functionLabel === nearest.functionLabel)
    .sort((a, b) => Math.abs(a.label[0] - x) - Math.abs(b.label[0] - x))[0];
}
