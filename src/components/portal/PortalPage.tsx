import { useMemo, type CSSProperties } from "react";
import { LockKeyhole } from "lucide-react";
import type { Me } from "@/lib/api";
import { visibleCategories } from "@/lib/navigation";
import { PortalCategoryCard } from "./PortalCategoryCard";

export function PortalPage({ me }: { me: Me }) {
  const perms = me.perms;
  const categories = useMemo(() => visibleCategories(perms), [perms]);

  return (
    <div className="portal-wrap portal-body">
      <section className="portal-modules" aria-labelledby="portal-modules-title">
        <div className="portal-modules__head">
          <h2 id="portal-modules-title" className="portal-modules__title">
            Acessos do sistema
          </h2>
          {categories.length > 0 && (
            <p className="portal-modules__count">
              {categories.length === 1
                ? "1 área liberada para você"
                : `${categories.length} áreas liberadas para você`}
            </p>
          )}
        </div>
        {categories.length ? (
          <ul className="portal-grid">
            {categories.map(({ category, destinations }, i) => (
              <li key={category.id} style={{ "--i": i } as CSSProperties}>
                <PortalCategoryCard category={category} destinations={destinations} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="portal-empty" role="status">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-[var(--portal-plum-ink)]" />
            <div>
              <p className="font-display font-bold">Nenhum módulo liberado para seu perfil</p>
              <p className="mt-1 text-sm text-[var(--portal-ink-soft)]">
                Solicite à administração a liberação dos módulos de que você precisa.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
