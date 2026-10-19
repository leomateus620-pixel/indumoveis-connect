import { useMemo } from "react";
import { LockKeyhole } from "lucide-react";
import { useEdition, useMe } from "@/lib/api";
import { visibleCategories } from "@/lib/navigation";
import { PortalHero } from "./PortalHero";
import { EditionCountdown } from "./EditionCountdown";
import { PortalCategoryCard } from "./PortalCategoryCard";

export function PortalPage({ userId }: { userId: string }) {
  const { data: me } = useMe(userId);
  const edition = useEdition();
  const perms = me?.perms;
  const categories = useMemo(() => visibleCategories(perms), [perms]);
  const refetchEdition = edition.refetch;

  return (
    <div className="portal-wrap">
      <div className="portal-intro">
        <PortalHero />
        <EditionCountdown
          edition={edition.data}
          isLoading={edition.isLoading}
          isError={edition.isError && !edition.data}
          onRetry={refetchEdition}
          canConfigure={!!perms?.admin?.write}
        />
      </div>

      <section className="portal-modules" aria-labelledby="portal-modules-title">
        <div className="portal-modules__head">
          <h2 id="portal-modules-title" className="portal-modules__title">
            Acessos do sistema
          </h2>
          {categories.length > 0 && (
            <p className="portal-modules__count">
              {categories.length === 1
                ? "1 categoria liberada"
                : `${categories.length} categorias liberadas`}
            </p>
          )}
        </div>
        {categories.length ? (
          <ul className="portal-grid">
            {categories.map(({ category, destinations }) => (
              <li key={category.id}>
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
