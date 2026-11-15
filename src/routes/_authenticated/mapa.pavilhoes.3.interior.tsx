import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PavilionInteriorPage } from "@/features/pavilion-interior/PavilionInteriorPage";
import { validatePavilion3Search } from "@/features/pavilion-interior/pavilion3";

export const Route = createFileRoute("/_authenticated/mapa/pavilhoes/3/interior")({
  validateSearch: validatePavilion3Search,
  head: () => ({ meta: [{ title: "Pavilhão 3 · Construção e Mobiliário — Indumóveis" }] }),
  component: InteriorPage,
});

function InteriorPage() {
  const { lote } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PavilionInteriorPage
      pavilionNumber={3}
      selectedCode={lote}
      onSelect={(code) => void navigate({ to: ".", search: { lote: code } })}
    />
  );
}
