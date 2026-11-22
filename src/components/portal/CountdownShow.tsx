import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Minimize2 } from "lucide-react";
import pavilion from "@/assets/countdown-pavilion.avif";
import portraitPavilion from "@/assets/countdown-pavilion-mobile.avif";
import type { Edition } from "@/lib/api";
import type { CountdownPhase } from "@/lib/countdown";
import { PortalWordmark } from "./PortalWordmark";
import "./countdown-show.css";

type Props = {
  screen: RefObject<HTMLDivElement | null>;
  edition: Edition;
  phase: CountdownPhase;
  period: string | null;
  opening: string;
  children: ReactNode;
};

export function CountdownShow({ screen, edition, phase, period, opening, children }: Props) {
  const exit = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");

  useEffect(() => {
    const visibilityChange = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", visibilityChange);
    return () => document.removeEventListener("visibilitychange", visibilityChange);
  }, []);

  return (
    <Dialog.Portal container={document.body}>
      <Dialog.Overlay />
      <Dialog.Content
        ref={screen}
        className="countdown-show"
        aria-modal="true"
        aria-describedby={undefined}
        data-hidden={hidden}
        data-phase={phase}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          exit.current?.focus({ preventScroll: true });
        }}
      >
        <picture className="countdown-show__scene" aria-hidden="true">
          <source media="(orientation: portrait)" srcSet={portraitPavilion} />
          <img src={pavilion} alt="" decoding="async" fetchPriority="high" draggable={false} />
        </picture>
        <div className="countdown-show__light" aria-hidden="true" />
        <header className="countdown-show__header">
          <div className="countdown-show__identity">
            <PortalWordmark presentation />
            <span className="countdown-show__year">{edition.year}</span>
          </div>
          <Dialog.Close asChild>
            <button
              ref={exit}
              className="countdown-show__exit"
              type="button"
              aria-label="Voltar ao portal"
              title="Voltar ao portal"
            >
              <Minimize2 aria-hidden="true" />
            </button>
          </Dialog.Close>
        </header>
        <div className="countdown-show__main">
          <Dialog.Title className="countdown-show__eyebrow">
            Contagem oficial<span className="sr-only"> · {edition.name}</span>
          </Dialog.Title>
          {children}
          <div className="countdown-show__details">
            {period && <p className="countdown-show__period">{period}</p>}
            <p className="countdown-show__opening">{opening}</p>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
