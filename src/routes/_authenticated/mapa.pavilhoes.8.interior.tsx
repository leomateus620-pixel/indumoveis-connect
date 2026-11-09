import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PavilionInteriorPage } from "@/features/pavilion-interior/PavilionInteriorPage";
import { validatePavilion8Search } from "@/features/pavilion-interior/presentation";

export const Route = createFileRoute("/_authenticated/mapa/pavilhoes/8/interior")({
  validateSearch: validatePavilion8Search,
  head: () => ({
    meta: [{ title: "Pavilhão 8 · Fornecedores e Construção Civil — Indumóveis" }],
  }),
  component: InteriorPage,
});

function InteriorPage() {
  const { lote } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PavilionInteriorPage
      pavilionNumber={8}
      selectedCode={lote}
      onSelect={(code) => void navigate({ to: ".", search: { lote: code } })}
    />
  );
}
