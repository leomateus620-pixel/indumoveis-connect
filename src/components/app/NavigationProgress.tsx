import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { destinationName } from "@/lib/navigation";
import { BrandLoader } from "./BrandLoader";

// Abaixo disso a troca é percebida como instantânea; o aviso nomeado só aparece em esperas reais.
const LABEL_DELAY_MS = 160;

/**
 * Progresso de navegação: barra fina imediata e, em esperas reais, "Abrindo Agenda".
 * Não bloqueia cliques e some assim que a rota resolve (nada de duração mínima).
 */
export function NavigationProgress() {
  const pendingPath = useRouterState({
    select: (s) => (s.status === "pending" ? s.location.pathname : null),
  });
  const [labelPath, setLabelPath] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingPath) {
      setLabelPath(null);
      return;
    }
    const t = window.setTimeout(() => setLabelPath(pendingPath), LABEL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [pendingPath]);

  const name = labelPath && labelPath === pendingPath ? destinationName(labelPath) : null;
  return (
    <>
      {pendingPath && <div className="nav-progress" aria-hidden="true" />}
      <div className="nav-pill-region" role="status" aria-live="polite">
        {name && (
          <span className="nav-pill">
            <BrandLoader className="size-5" tone="light" />
            Abrindo {name}
          </span>
        )}
      </div>
    </>
  );
}
