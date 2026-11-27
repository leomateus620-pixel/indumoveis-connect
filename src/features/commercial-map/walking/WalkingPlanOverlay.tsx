import { memo } from "react";
import type { WalkingOverlay } from "./useParkWalking";

export const WalkingPlanOverlay = memo(function WalkingPlanOverlay({
  overlay,
}: {
  overlay: WalkingOverlay;
}) {
  const { path, alternate, turns, entry, person } = overlay;
  const points = path.map((p) => p.join(",")).join(" ");
  return (
    <g className="im-walking-plan" pointerEvents="none" aria-hidden="true">
      {alternate.length > 1 && (
        <polyline
          className="im-walking-route-alternate"
          points={alternate.map((p) => p.join(",")).join(" ")}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {path.length > 1 && (
        <>
          <polyline
            className="im-walking-route-casing"
            points={points}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            className="im-walking-route"
            points={points}
            vectorEffect="non-scaling-stroke"
          />
          {turns.map(({ point: [x, y], angle }) => (
            <path
              key={`${x}:${y}`}
              d="M-.62,-.3 L0,.7 L.62,-.3 Z"
              transform={`translate(${x} ${y}) rotate(${(-angle * 180) / Math.PI})`}
              className="im-walking-turn"
            />
          ))}
        </>
      )}
      {entry && (
        <g transform={`translate(${entry[0]} ${entry[1]})`}>
          <circle className="im-walking-plan-flag" />
          <path className="im-walking-plan-flag-icon" d="M0,0 v-3 h4 l-1,1.5 h-3" />
        </g>
      )}
      {person && (
        <g transform={`translate(${person.point[0]} ${person.point[1]})`}>
          <circle
            r={person.radius}
            className="im-walking-accuracy"
            vectorEffect="non-scaling-stroke"
          />
          <circle className="im-walking-plan-position" vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </g>
  );
});
