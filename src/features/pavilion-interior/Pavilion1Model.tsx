import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { COMMERCIAL_STATUS_COLORS } from "@/features/commercial-map/visualTheme";
import { SPACE_STATUS } from "@/lib/format";
import type { InteriorEnvironment, PavilionPlan } from "./data";
import type { Pavilion1ModelControls } from "./pavilion1Artwork";

type Props = {
  plan: PavilionPlan;
  selected?: InteriorEnvironment;
  controls: RefObject<Pavilion1ModelControls | null>;
  status: (room: InteriorEnvironment) => string | undefined;
  saleSelected: (room: InteriorEnvironment) => boolean;
  salesActive: boolean;
  onChoose: (code: string) => void;
  onUnavailable: () => void;
};

export function Pavilion1Model(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const { plan, controls, selected } = props;
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const highlighted = props.salesActive
    ? plan.environments
        .filter(props.saleSelected)
        .map((room) => room.code)
        .join(",")
    : selected?.code;
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    void import("./pavilion1Renderer")
      .then(({ openPavilion1Model }) => {
        if (cancelled || !host.current || !labels.current) return;
        const scene = openPavilion1Model({
          host: host.current,
          labels: labels.current,
          plan,
          onReady: () => setReady(true),
          onChoose: (code) => latest.current.onChoose(code),
          onUnavailable: () => latest.current.onUnavailable(),
        });
        controls.current = scene;
        release = scene.dispose;
        scene.focus(latest.current.selected);
      })
      .catch(() => {
        if (!cancelled) latest.current.onUnavailable();
      });
    return () => {
      cancelled = true;
      controls.current = null;
      release?.();
    };
  }, [plan, controls]);

  useEffect(() => controls.current?.focus(selected), [selected, controls]);
  useEffect(() => {
    if (ready)
      controls.current?.highlight(highlighted?.split(",").filter(Boolean) ?? [], props.salesActive);
  }, [controls, ready, highlighted, props.salesActive]);

  return (
    <div
      className="arq-p1-model"
      role="group"
      aria-label="Maquete interativa do Pavilhão 1"
      aria-describedby="arq-model-navigation-help"
      aria-busy={!ready}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        switch (event.key) {
          case "+":
          case "=":
            controls.current?.zoom(1.35);
            break;
          case "-":
            controls.current?.zoom(1 / 1.35);
            break;
          case "Home":
          case "0":
            controls.current?.fit();
            break;
          case "ArrowLeft":
            controls.current?.rotate(-Math.PI / 8);
            break;
          case "ArrowRight":
            controls.current?.rotate(Math.PI / 8);
            break;
          default:
            return;
        }
        event.preventDefault();
      }}
    >
      <div className="arq-p1-model-canvas" ref={host} />
      <div
        className="arq-p1-model-labels"
        ref={labels}
        style={{ visibility: ready ? "visible" : "hidden" }}
      >
        {plan.environments
          .filter((room) => room.kind !== "circulation")
          .map((room) => {
            const status = room.kind === "commercial" ? props.status(room) : undefined;
            const forSale = props.salesActive && props.saleSelected(room);
            const numbered = room.kind === "commercial";
            return (
              <button
                key={room.id}
                type="button"
                className="arq-p1-room-marker"
                data-room={room.code}
                data-sale-selected={forSale || undefined}
                data-commercial-status={status}
                style={
                  status && COMMERCIAL_STATUS_COLORS[status]
                    ? ({ "--arq-stock-color": COMMERCIAL_STATUS_COLORS[status] } as CSSProperties)
                    : undefined
                }
                aria-label={numbered ? `${room.code} · ${room.name}` : room.name}
                aria-pressed={props.salesActive ? forSale : room.code === selected?.code}
                disabled={props.salesActive && !numbered}
                aria-description={status ? SPACE_STATUS[status]?.label : undefined}
                onClick={() => props.onChoose(room.code)}
              >
                {numbered ? room.code : room.name}
              </button>
            );
          })}
      </div>
      {!ready && (
        <p className="arq-p1-model-loading" role="status">
          Carregando a maquete…
        </p>
      )}
      <span className="arq-sr-only" id="arq-model-navigation-help">
        Arraste para girar a maquete. Use a roda ou a pinça para aproximar. As setas esquerda e
        direita giram a vista. Mais e menos ajustam o zoom. Home mostra a maquete inteira. Selecione
        um ambiente na maquete ou na lista de ambientes.
      </span>
    </div>
  );
}
