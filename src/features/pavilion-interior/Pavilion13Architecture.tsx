import { useId } from "react";
import type { PavilionPlan } from "./data";
import "./pavilion13-architecture.css";

// These finishes follow the local drawing units of the Rev. 07 schematic.
const floor = { x: 80, y: 120, width: 560, height: 1044 };
const plinths = [
  { x: 80, y: 120, width: 112, height: 450 },
  { x: 80, y: 714, width: 112, height: 420 },
  { x: 304, y: 210, width: 112, height: 660 },
  { x: 528, y: 120, width: 112, height: 450 },
  { x: 528, y: 714, width: 112, height: 420 },
];
const thresholds = [
  { x: 220, y: 1159, width: 56, height: 10, kind: "entrance" },
  { x: 444, y: 1159, width: 56, height: 10, kind: "entrance" },
  { x: 220, y: 115, width: 56, height: 10, kind: "rear" },
  { x: 444, y: 115, width: 56, height: 10, kind: "rear" },
  { x: 76, y: 570, width: 8, height: 144, kind: "connection" },
  { x: 636, y: 570, width: 8, height: 144, kind: "connection" },
];

export function Pavilion13Architecture({ plan }: { plan: PavilionPlan }) {
  const id = useId();
  const perimeter = plan.architecture.find((element) => element.id === "p13:perimeter");
  if (!perimeter || plan.source.revisionName !== "pavilhao-13-rev07-2026-08-17-display-v2") {
    return null;
  }

  const oak = `${id}-oak`;
  const boards = `${id}-boards`;
  const foyerLight = `${id}-foyer-light`;

  return (
    <g className="arq-p13-structure" aria-hidden="true" pointerEvents="none">
      <defs>
        <linearGradient id={oak} x1="0%" y1="0%" x2="96%" y2="100%">
          <stop offset="0%" stopColor="#eaddc6" />
          <stop offset="52%" stopColor="#d9c0a1" />
          <stop offset="100%" stopColor="#ceb08a" />
        </linearGradient>
        <pattern id={boards} x={80} y={120} width={120} height={148} patternUnits="userSpaceOnUse">
          <path
            className="arq-p13-board-shade"
            d="M0 0H20V148H0Z M60 0H80V148H60Z M100 0H120V148H100Z"
          />
          <path className="arq-p13-board-light" d="M20 0H40V148H20Z M80 0H100V148H80Z" />
          <path
            className="arq-p13-floor-joint"
            d="M0 0V148 M20 0V148 M40 0V148 M60 0V148 M80 0V148 M100 0V148 M0 24H20 M20 94H40 M40 56H60 M60 128H80 M80 38H100 M100 83H120"
          />
          <path
            className="arq-p13-board-grain"
            d="M7 32C10 59 5 87 8 114 M31 8C28 34 33 58 30 79 M51 62C55 85 49 111 52 135 M70 15C68 43 73 68 70 99 M91 54C95 82 88 107 92 138 M110 10C113 32 109 55 111 72"
          />
        </pattern>
        <radialGradient id={foyerLight} cx="50%" cy="91%" r="53%">
          <stop offset="0%" stopColor="#fff3d9" stopOpacity="0.66" />
          <stop offset="62%" stopColor="#fff0d5" stopOpacity="0.27" />
          <stop offset="100%" stopColor="#fff0d5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect {...floor} className="arq-p13-floor-shadow" transform="translate(3 9)" />
      <rect {...floor} className="arq-p13-floor-edge" transform="translate(0 5)" />
      <rect {...floor} fill={`url(#${oak})`} />
      <rect {...floor} fill={`url(#${boards})`} />
      <rect {...floor} fill={`url(#${foyerLight})`} />
      {plinths.map((bounds) => (
        <rect
          key={`${bounds.x}:${bounds.y}`}
          {...bounds}
          className="arq-p13-plinth"
          transform="translate(3 5)"
        />
      ))}
      <path className="arq-p13-wall-depth" d={perimeter.path} transform="translate(1 3)" />
      <path className="arq-p13-wall" d={perimeter.path} />
      <path className="arq-p13-wall-cap" d={perimeter.path} transform="translate(-1 -1)" />
      {thresholds.map(({ kind, ...bounds }) => (
        <rect
          key={`${bounds.x}:${bounds.y}`}
          {...bounds}
          className={`arq-p13-threshold is-${kind}`}
        />
      ))}
      <g className="arq-p13-sector-captions" textAnchor="middle" dominantBaseline="central">
        <text x="136" y="1149">
          Esquerda
        </text>
        <text x="360" y="894">
          Ilha central
        </text>
        <text x="584" y="1149">
          Direita
        </text>
      </g>
    </g>
  );
}
