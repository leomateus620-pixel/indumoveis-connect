import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PavilionInteriorPage } from "@/features/pavilion-interior/PavilionInteriorPage";
import { validatePavilion12Search } from "@/features/pavilion-interior/presentation";

export const Route = createFileRoute("/_authenticated/mapa/pavilhoes/12/interior")({
  validateSearch: validatePavilion12Search,
  head: () => ({ meta: [{ title: "Pavilhão 12 · Móveis e Seriados — Indumóveis" }] }),
  component: InteriorPage,
});

function InteriorPage() {
  const { lote } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PavilionInteriorPage
      pavilionNumber={12}
      selectedCode={lote}
      onSelect={(code) => void navigate({ to: ".", search: { lote: code } })}
    />
  );
}
