import { useId } from "react";
import type { InteriorPoint, PavilionPlan } from "./data";

// Presentation coordinates for the documented Rev. 02 drawing, in PDF points.
const floor = { x: 87.493, y: 106.804, width: 420.248, height: 662.28 };
const thresholds = [
  { x: 82.493, y: 393.574, width: 10, height: 94.636, kind: "connection" },
  { x: 502.741, y: 296.335, width: 10, height: 85.682, kind: "connection" },
  { x: 165.351, y: 765.084, width: 69.963, height: 8, kind: "entrance" },
  { x: 359.881, y: 765.084, width: 70.002, height: 8, kind: "entrance" },
  { x: 465.423, y: 102.804, width: 42.318, height: 8, kind: "exit" },
];

export function Pavilion8Architecture({ plan }: { plan: PavilionPlan }) {
  const id = useId();
  const perimeter = plan.architecture.find((element) => element.id === "p8:perimeter");
  if (!perimeter || plan.source.revisionName !== "pavilhao-08-rev02-2025-11-14") return null;
  const finish = `${id}-mineral`;
  const joints = `${id}-joints`;

  return (
    <g className="arq-p8-structure" aria-hidden="true" pointerEvents="none">
      <defs>
        <linearGradient id={finish} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e6e1d8" />
          <stop offset="100%" stopColor="#d2ccc1" />
        </linearGradient>
        <pattern
          id={joints}
          x={floor.x}
          y={floor.y}
          width="70"
          height="73"
          patternUnits="userSpaceOnUse"
        >
          <path className="arq-p8-floor-joint" d="M70 0H0V73" />
        </pattern>
      </defs>
      <rect {...floor} className="arq-p8-floor-shadow" transform="translate(2 9)" />
      <rect {...floor} className="arq-p8-floor-edge" transform="translate(0 5)" />
      <rect {...floor} fill={`url(#${finish})`} />
      <rect {...floor} fill={`url(#${joints})`} />
      <path d={perimeter.path} className="arq-p8-wall-shadow" transform="translate(1 4)" />
      <path d={perimeter.path} className="arq-p8-wall" />
      <path d={perimeter.path} className="arq-p8-wall-cap" transform="translate(-1 -1)" />
      {thresholds.map(({ kind, ...bounds }) => (
        <rect
          key={`${bounds.x}:${bounds.y}`}
          {...bounds}
          className={`arq-p8-threshold is-${kind}`}
        />
      ))}
      <text x="297.598" y="441" className="arq-p8-aisle-label" textAnchor="middle">
        Circulação
      </text>
    </g>
  );
}

export function Pavilion8LotRelief({ path }: { path: string }) {
  const clipId = useId();
  return (
    <g className="arq-p8-lot-relief" aria-hidden="true" pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={path} className="arq-p8-lot-rim" />
        <path d={path} className="arq-p8-lot-light" transform="translate(2 2)" />
      </g>
    </g>
  );
}

export function Pavilion8NumberPlate({ center: [x, y] }: { center: InteriorPoint }) {
  return (
    <g className="arq-p8-number-plate" aria-hidden="true" pointerEvents="none">
      <rect x={x - 25} y={y - 15} width="50" height="36" rx="5" className="arq-p8-plate-edge" />
      <rect x={x - 25} y={y - 18} width="50" height="36" rx="5" className="arq-p8-plate-face" />
    </g>
  );
}
