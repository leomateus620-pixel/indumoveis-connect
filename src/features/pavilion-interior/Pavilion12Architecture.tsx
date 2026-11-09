import { useId, useMemo } from "react";
import type { PavilionPlan } from "./data";
import "./pavilion12-architecture.css";

const islandRanges = [
  [37, 120],
  [121, 204],
] as const;

export function Pavilion12Architecture({ plan }: { plan: PavilionPlan }) {
  const id = useId();
  const floor = plan.architecture.find((element) => element.id === "p12:floor-outline");
  const perimeter = plan.architecture.find((element) => element.id === "p12:perimeter");
  const islands = useMemo(
    () =>
      islandRanges.flatMap(([first, last]) => {
        const points = plan.environments
          .filter(({ code }) => Number(code) >= first && Number(code) <= last)
          .flatMap(({ parts }) => parts.flatMap(({ polygon }) => polygon));
        if (!points.length) return [];
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return [{ first, x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }];
      }),
    [plan.environments],
  );
  if (!floor || !perimeter) return null;

  const finish = `${id}-p12-mineral`;
  const planks = `${id}-p12-planks`;

  return (
    <g className="arq-p12-structure" aria-hidden="true" pointerEvents="none">
      <defs>
        <linearGradient id={finish} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#efe6d7" />
          <stop offset="55%" stopColor="#e5d8c5" />
          <stop offset="100%" stopColor="#ddcbb6" />
        </linearGradient>
        <pattern id={planks} width="144" height="64" patternUnits="userSpaceOnUse">
          <path className="arq-p12-plank-warm" d="M0 0H144V16H0Z M0 32H144V48H0Z" />
          <path className="arq-p12-plank-light" d="M0 16H144V32H0Z" />
          <path
            className="arq-p12-plank-joint"
            d="M0 0H144 M0 16H144 M0 32H144 M0 48H144 M38 0V16 M104 16V32 M60 32V48 M126 48V64"
          />
        </pattern>
      </defs>
      <path d={floor.path} className="arq-p12-floor-shadow" transform="translate(2 5)" />
      <path d={floor.path} fill={`url(#${finish})`} />
      <path d={floor.path} fill={`url(#${planks})`} />
      <path d={perimeter.path} className="arq-p12-perimeter" />
      {islands.map(({ first, ...bounds }) => (
        <rect key={first} {...bounds} className="arq-p12-island-edge" />
      ))}
    </g>
  );
}
