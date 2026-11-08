import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PavilionInterior } from "@/features/pavilion-interior/PavilionInterior";
import { validateInteriorSearch } from "@/features/pavilion-interior/navigation";
import { readParkReturn } from "@/features/pavilion-interior/parkReturn";
import {
  useCan,
  useMe,
  useEdition,
  usePavilionInteriorPlan,
  usePavilionInteriorCommercial,
} from "@/lib/api";
import { Restricted } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/mapa/pavilhoes/1/interior")({
  validateSearch: validateInteriorSearch,
  head: () => ({ meta: [{ title: "Pavilhão 1 · Mostra ARQ & Design — Indumóveis" }] }),
  component: InteriorPage,
});
function InteriorPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan("mapa");
  const me = useMe();
  const commercialCan = useCan("comercial");
  const edition = useEdition();
  const plan = usePavilionInteriorPlan(can.read);
  const commercial = usePavilionInteriorCommercial(
    plan.data?.databasePlanId,
    plan.data?.revision,
    can.read && commercialCan.read,
  );
  const back = () => {
    const saved = readParkReturn(edition.data?.id);
    void navigate({ to: "/mapa", search: { ...saved?.search, pavilhao: "1" } });
  };
  if (me.isError || edition.isError || (!edition.isPending && !edition.data))
    return (
      <main className="arq-interior arq-loading">
        <p role="alert">Não foi possível carregar a Mostra.</p>
        <button
          onClick={() => {
            void me.refetch();
            void edition.refetch();
          }}
        >
          Tentar novamente
        </button>
        <button onClick={back}>Voltar ao parque</button>
      </main>
    );
  if (!me.isPending && !can.read) return <Restricted />;
  if (plan.isPending || edition.isPending)
    return (
      <main className="arq-interior arq-loading" aria-busy="true">
        <p role="status">Abrindo a Mostra ARQ & Design…</p>
      </main>
    );
  if (plan.isError || !plan.data)
    return (
      <main className="arq-interior arq-loading">
        <p role="alert">Não foi possível carregar a planta.</p>
        <button onClick={() => void plan.refetch()}>Tentar novamente</button>
        <button onClick={back}>Voltar ao parque</button>
      </main>
    );
  const selectedCode = plan.data.environments.some((e) => e.code === search.espaco)
    ? search.espaco
    : undefined;
  return (
    <PavilionInterior
      key={`${plan.data.editionId}:${plan.data.revision}`}
      plan={plan.data}
      selectedCode={selectedCode}
      commercial={commercialCan.read && commercial.isSuccess ? commercial.data : undefined}
      commercialError={commercialCan.read && commercial.isError}
      onRetryCommercial={() => void commercial.refetch()}
      onBack={back}
      onSelect={(espaco) => {
        void navigate({ to: ".", search: { espaco } });
      }}
    />
  );
}
