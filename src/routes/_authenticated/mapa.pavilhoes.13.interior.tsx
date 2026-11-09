import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PavilionInteriorPage } from "@/features/pavilion-interior/PavilionInteriorPage";
import { validatePavilion13Search } from "@/features/pavilion-interior/presentation";

export const Route = createFileRoute("/_authenticated/mapa/pavilhoes/13/interior")({
  validateSearch: validatePavilion13Search,
  head: () => ({ meta: [{ title: "Pavilhão 13 · Salão de Imóveis — Indumóveis" }] }),
  component: InteriorPage,
});
function InteriorPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PavilionInteriorPage
      pavilionNumber={13}
      selectedCode={search.lote}
      onSelect={(lote) => {
        void navigate({ to: ".", search: { lote } });
      }}
    />
  );
}
