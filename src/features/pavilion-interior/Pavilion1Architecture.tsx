import { useId } from "react";
import type { InteriorPoint, PavilionPlan } from "./data";
import "./pavilion1-architecture.css";

// Soleiras sobre os vãos identificados na revisão documental, em pontos PDF.
const thresholds = [
  { x: 1010, y: 277.41, width: 8, height: 58.2, kind: "entrance" },
  { x: 100.891, y: 481.4, width: 47.28, height: 7, kind: "exit" },
  { x: 688.41, y: 122.1, width: 14.16, height: 7, kind: "service" },
  { x: 526.89, y: 482.6, width: 14.16, height: 7, kind: "service" },
] as const;

export function Pavilion1Architecture({ plan }: { plan: PavilionPlan }) {
  const id = useId();
  const mineral = `${id}-mineral`;
  const rear = `${id}-rear`;
  const reception = `${id}-reception`;
  const cafe = `${id}-cafe`;
  const salon = `${id}-salon`;
  const terrace = `${id}-terrace`;
  const mineralJoints = `${id}-mineral-joints`;
  const salonJoints = `${id}-salon-joints`;
  const terraceJoints = `${id}-terrace-joints`;
  const supportJoints = `${id}-support-joints`;
  const distinctRoomFinishes: Record<string, string> = {
    "01": `url(#${reception})`,
    "14": `url(#${cafe})`,
  };
  const interiorSlab = plan.environments
    .flatMap((environment) => environment.parts)
    .filter((part) => part.kind === "interior")
    .map((part) => part.path)
    .join(" ");

  return (
    <g className="arq-p1-structure" aria-hidden="true" pointerEvents="none">
      <defs>
        <linearGradient id={mineral} x2="86%" y2="100%">
          <stop stopColor="#f0e8df" />
          <stop offset="100%" stopColor="#e4d6ca" />
        </linearGradient>
        <linearGradient id={rear} x2="20%" y2="100%">
          <stop stopColor="#d6bab8" />
          <stop offset="100%" stopColor="#e8d8cf" />
        </linearGradient>
        <linearGradient id={reception} x2="90%" y2="100%">
          <stop stopColor="#f0e5db" />
          <stop offset="100%" stopColor="#dfc7c3" />
        </linearGradient>
        <linearGradient id={cafe} x2="80%" y2="100%">
          <stop stopColor="#eadbc8" />
          <stop offset="100%" stopColor="#dac0a8" />
        </linearGradient>
        <radialGradient id={salon} cx="55%" cy="42%" r="69%">
          <stop stopColor="#f5ead5" />
          <stop offset="70%" stopColor="#e8d7bb" />
          <stop offset="100%" stopColor="#d9c3a6" />
        </radialGradient>
        <linearGradient id={terrace} x2="5%" y2="100%">
          <stop stopColor="#e3e3d2" />
          <stop offset="100%" stopColor="#bdc6af" />
        </linearGradient>
        <pattern id={mineralJoints} width="54" height="36" patternUnits="userSpaceOnUse">
          <path d="M0 .5H54M18 .5V36" className="arq-p1-mineral-joint" />
        </pattern>
        <pattern id={salonJoints} width="88" height="60" patternUnits="userSpaceOnUse">
          <path d="M0 .5H88M.5 0V60" className="arq-p1-salon-joint" />
        </pattern>
        <pattern id={terraceJoints} width="44" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 .5H44M0 6.5H44M9 0V6M31 6V12" className="arq-p1-terrace-joint" />
        </pattern>
        <pattern id={supportJoints} width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M-1 8L8-1M6 8L8 6" className="arq-p1-support-joint" />
        </pattern>
      </defs>

      <path d={interiorSlab} className="arq-p1-slab-shadow" transform="translate(2 7)" />
      <path d={interiorSlab} className="arq-p1-slab-edge" transform="translate(0 3)" />
      <path d={interiorSlab} className="arq-p1-slab" />

      {plan.environments.map((environment) => {
        const hasTerrace = environment.parts.some((part) => part.kind === "external");
        const isHall = environment.kind === "hall";
        const isSupport = environment.kind === "support" || environment.kind === "circulation";
        const commercialFinish = hasTerrace
          ? `url(#${rear})`
          : (distinctRoomFinishes[environment.code] ?? `url(#${mineral})`);
        const roomFinish = {
          commercial: commercialFinish,
          hall: `url(#${salon})`,
          support: "#d5d7ca",
          circulation: "#c4c8ba",
        }[environment.kind];
        const roomJoints = isHall ? salonJoints : isSupport ? supportJoints : mineralJoints;

        return environment.parts.map((part) => {
          const isTerrace = part.kind === "external";
          let inlay: string | undefined;
          if (hasTerrace && !isTerrace) {
            const xs = part.polygon.map(([x]) => x);
            const y = Math.min(...part.polygon.map(([, y]) => y));
            inlay = `M${Math.min(...xs) + 3} ${y + 4}H${Math.max(...xs) - 3}`;
          }
          return (
            <g key={part.id} className="arq-p1-finish">
              <path d={part.path} fill={isTerrace ? `url(#${terrace})` : roomFinish} />
              <path d={part.path} fill={`url(#${isTerrace ? terraceJoints : roomJoints})`} />
              {inlay && <path className="arq-p1-rear-inlay" d={inlay} />}
            </g>
          );
        });
      })}

      {plan.source.revisionName === "mostra-arq-design-1-2026-11-08" &&
        thresholds.map(({ kind, ...bounds }) => (
          <rect
            key={`${bounds.x}:${bounds.y}`}
            {...bounds}
            rx={0.65}
            className={`arq-p1-threshold is-${kind}`}
          />
        ))}
    </g>
  );
}

export function Pavilion1NumberPlate({ center: [x, y] }: { center: InteriorPoint }) {
  return (
    <g
      className="arq-p1-number-plate"
      transform={`translate(${x} ${y})`}
      aria-hidden="true"
      pointerEvents="none"
    >
      <rect x={-16} y={-9} width={32} height={21} rx={2} className="arq-p1-plate-edge" />
      <rect x={-16} y={-10.5} width={32} height={21} rx={2} className="arq-p1-plate-face" />
    </g>
  );
}
