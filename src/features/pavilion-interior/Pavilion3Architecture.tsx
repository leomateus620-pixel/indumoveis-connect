import { useId } from "react";
import type { InteriorEnvironment, PavilionPlan } from "./data";
import "./pavilion3-architecture.css";

export function Pavilion3Architecture({ plan }: { plan: PavilionPlan }) {
  const id = useId();
  const floor = plan.architecture.find((element) => element.id === "p3:floor-outline");
  const perimeter = plan.architecture.find((element) => element.id === "p3:perimeter");
  const support = plan.architecture.find((element) => element.id === "p3:support");
  if (!floor || !perimeter) return null;
  return (
    <g className="arq-p3-structure" aria-hidden="true" pointerEvents="none">
      <defs>
        <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#eee9de" />
          <stop offset="1" stopColor="#d7d1c4" />
        </linearGradient>
        <pattern id={`${id}-tiles`} width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M36 0H0V36" fill="none" stroke="#bcb8ac" strokeWidth="0.35" />
        </pattern>
      </defs>
      <path d={floor.path} fill="#283c39" opacity="0.13" transform="translate(3 5)" />
      <path d={floor.path} fill={`url(#${id}-floor)`} />
      <path d={floor.path} fill={`url(#${id}-tiles)`} />
      {support && <path d={support.path} fill="#77817b" />}
      <path d={perimeter.path} className="arq-p3-wall-shadow" transform="translate(1.2 2)" />
      <path d={perimeter.path} className="arq-p3-wall" />
      <path d="M176 704V202 M403 702V204" className="arq-p3-aisle" />
      <text x="176" y="447" transform="rotate(-90 176 447)" className="arq-p3-aisle-label">
        CORREDOR OESTE
      </text>
      <text x="403" y="447" transform="rotate(-90 403 447)" className="arq-p3-aisle-label">
        CORREDOR LESTE
      </text>
      <text x="290" y="160" className="arq-p3-floor-title">
        PAVILHÃO 3
      </text>
    </g>
  );
}

export function Pavilion3Directory({
  plan,
  selectedCode,
  isSaleSelected,
  onSelect,
}: {
  plan: PavilionPlan;
  selectedCode?: string;
  isSaleSelected?: (lot: InteriorEnvironment) => boolean;
  onSelect: (code: string) => void;
}) {
  const sectors = [...new Set(plan.environments.map((environment) => environment.functionLabel))];
  return (
    <nav className="arq-p3-directory" aria-label="Lotes por setor">
      <span className="arq-eyebrow">Explore por setor</span>
      {sectors.map((sector) => {
        const lots = plan.environments.filter(
          (environment) => environment.functionLabel === sector,
        );
        return (
          <details key={sector}>
            <summary>
              {sector}
              <span>{lots.length} lotes</span>
            </summary>
            <div>
              {lots.map((lot) => (
                <button
                  key={lot.id}
                  type="button"
                  aria-label={`Localizar ${lot.name.toLowerCase()}`}
                  aria-pressed={isSaleSelected ? isSaleSelected(lot) : selectedCode === lot.code}
                  onClick={() => onSelect(lot.code)}
                >
                  {lot.code}
                </button>
              ))}
            </div>
          </details>
        );
      })}
    </nav>
  );
}
