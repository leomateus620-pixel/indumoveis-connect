import { memo, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { NavCategory, NavDestination } from "@/lib/navigation";
import { PortalEmblem } from "./PortalEmblem";

type Props = {
  category: NavCategory;
  /** Somente os destinos que o perfil pode ler. */
  destinations: NavDestination[];
};

function CardHead({
  category,
  destinations,
  only,
}: {
  category: NavCategory;
  destinations: NavDestination[];
  only?: NavDestination;
}) {
  const group = destinations.length > 1;
  return (
    <span className="portal-card__head">
      <PortalEmblem id={category.id} tone={category.tone} />
      <span className="portal-card__copy">
        <span className="portal-card__title">{category.title}</span>
        <span className="portal-card__desc">{category.description}</span>
        {group && (
          <span className="portal-card__chips" aria-hidden="true">
            {destinations.map((d) => (
              <span key={d.to} className="portal-card__chip">
                {d.label}
              </span>
            ))}
          </span>
        )}
        {only && (
          <span className="portal-card__chips">
            <span className="portal-card__chip">{only.label}</span>
          </span>
        )}
      </span>
    </span>
  );
}

export const PortalCategoryCard = memo(function PortalCategoryCard({
  category,
  destinations,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  if (destinations.length === 1) {
    const [dest] = destinations;
    // Grupo reduzido a um destino: abre direto, com o destino identificado no card.
    const only = category.destinations.length > 1 ? dest : undefined;
    return (
      <Link
        to={dest.to}
        className="portal-card portal-card__surface"
        data-kind="link"
        data-tone={category.tone}
        data-category={category.id}
        aria-label={`${dest.openLabel}: ${category.title}${only ? ` — ${dest.label}` : ""}`}
        onPointerDown={dest.prewarm}
        onFocus={dest.prewarm}
      >
        <CardHead category={category} destinations={destinations} only={only} />
        <span className="portal-card__foot" aria-hidden="true">
          <span className="portal-card__action">{dest.openLabel}</span>
          <span className="portal-card__cue portal-card__cue--go">
            <ArrowRight strokeWidth={2.25} />
          </span>
        </span>
      </Link>
    );
  }

  return (
    <div
      className="portal-card"
      data-kind="group"
      data-tone={category.tone}
      data-category={category.id}
      data-expanded={expanded || undefined}
    >
      <button
        type="button"
        className="portal-card__surface"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
      >
        <CardHead category={category} destinations={destinations} />
        <span className="portal-card__foot">
          <span className="portal-card__action">
            {expanded ? "Ocultar opções" : `Ver ${destinations.length} opções`}
            <span className="sr-only"> de {category.title}</span>
          </span>
          <span className="portal-card__cue portal-card__cue--toggle" aria-hidden="true">
            <ChevronDown strokeWidth={2.25} />
          </span>
        </span>
      </button>
      <div id={panelId} className="portal-card__panel" inert={!expanded}>
        <div className="portal-card__panel-inner">
          <ul className="portal-card__links" aria-label={`Destinos de ${category.title}`}>
            {destinations.map((d) => (
              <li key={d.to}>
                <Link
                  to={d.to}
                  className="portal-card__link"
                  onPointerDown={d.prewarm}
                  onFocus={d.prewarm}
                >
                  <span className="portal-card__link-icon" aria-hidden="true">
                    <d.icon strokeWidth={1.9} />
                  </span>
                  <span className="portal-card__link-label">{d.label}</span>
                  <ArrowRight className="portal-card__link-go" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
});
