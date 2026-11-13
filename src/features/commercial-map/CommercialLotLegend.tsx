import { Check } from "lucide-react";
import { SPACE_STATUS } from "@/lib/format";
import { COMMERCIAL_STATUS_COLORS, SALES_MAP_COLORS } from "./visualTheme";

export function CommercialLotLegend({
  statuses,
  salesActive,
}: {
  statuses: Iterable<string>;
  salesActive?: boolean;
}) {
  const present = new Set(statuses);
  const known = Object.entries(SPACE_STATUS).filter(([key]) => present.has(key));
  if (!known.length && !salesActive) return null;
  return (
    <ul className="commercial-lot-legend" aria-label="Legenda comercial">
      {salesActive && (
        <li>
          <i style={{ backgroundColor: SALES_MAP_COLORS.selected }} aria-hidden="true" />
          Selecionado para venda
        </li>
      )}
      {known.map(([status, entry]) => (
        <li key={status}>
          {status === "vendido" ? (
            <Check
              size={13}
              strokeWidth={2.5}
              className="commercial-lot-legend-check"
              aria-hidden="true"
            />
          ) : (
            <i style={{ backgroundColor: COMMERCIAL_STATUS_COLORS[status] }} aria-hidden="true" />
          )}
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/** The lot remains the sole pointer target. Its accessible name carries the status. */
export function SoldLotCheck({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      data-sold-lot-check
      aria-hidden="true"
      pointerEvents="none"
    >
      <circle cx="8" cy="8" r="7.5" fill={SALES_MAP_COLORS.sold} stroke={SALES_MAP_COLORS.check} />
      <path
        d="m4.8 8.1 2.1 2.1 4.4-4.4"
        fill="none"
        stroke={SALES_MAP_COLORS.check}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
