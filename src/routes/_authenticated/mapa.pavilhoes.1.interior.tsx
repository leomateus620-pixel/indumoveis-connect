import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PavilionInteriorPage } from "@/features/pavilion-interior/PavilionInteriorPage";
import { validateInteriorSearch } from "@/features/pavilion-interior/navigation";

export const Route = createFileRoute("/_authenticated/mapa/pavilhoes/1/interior")({
  validateSearch: validateInteriorSearch,
  head: () => ({ meta: [{ title: "Pavilhão 1 · Mostra ARQ & Design — Indumóveis" }] }),
  component: InteriorPage,
});
function InteriorPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PavilionInteriorPage
      pavilionNumber={1}
      selectedCode={search.espaco}
      onSelect={(espaco) => {
        void navigate({ to: ".", search: { espaco } });
      }}
    />
  );
}
