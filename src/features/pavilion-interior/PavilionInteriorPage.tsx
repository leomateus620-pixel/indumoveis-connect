import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Restricted } from "@/components/app/ui";
import {
  useCan,
  useMe,
  useEdition,
  usePavilionInteriorPlan,
  usePavilionInteriorCommercial,
  useCommercialLots,
  useIsAdmin,
} from "@/lib/api";
import { PavilionInterior } from "./PavilionInterior";
import { pavilionDestination, type ParkPavilionSearch } from "./connections";
import { readParkReturn } from "./parkReturn";
import { PAVILION_PRESENTATIONS, type InteriorPavilionNumber } from "./presentation";

export function PavilionInteriorPage({
  pavilionNumber,
  selectedCode,
  onSelect,
}: {
  pavilionNumber: InteriorPavilionNumber;
  selectedCode?: string;
  onSelect: (code?: string) => void;
}) {
  const presentation = PAVILION_PRESENTATIONS[pavilionNumber];
  const navigate = useNavigate();
  const can = useCan("mapa");
  const isAdmin = useIsAdmin();
  const me = useMe(),
    edition = useEdition();
  const plan = usePavilionInteriorPlan(can.read, pavilionNumber);
  const commercial = usePavilionInteriorCommercial(
    plan.data?.databasePlanId,
    plan.data?.revision,
    can.read && isAdmin,
    pavilionNumber,
  );
  const inventory = useCommercialLots(`p${pavilionNumber}`, can.read);
  const lotsByEnvironment = useMemo(
    () =>
      new Map(
        (can.read && inventory.isSuccess ? (inventory.data ?? []) : []).flatMap((lot) =>
          lot.environmentId ? [[lot.environmentId, lot] as const] : [],
        ),
      ),
    [can.read, inventory.isSuccess, inventory.data],
  );
  const back = () => {
    const saved = readParkReturn(edition.data?.id, pavilionNumber);
    void navigate({
      to: "/mapa",
      search: { ...saved?.search, pavilhao: String(pavilionNumber) as ParkPavilionSearch },
    });
  };
  const shell = `arq-interior is-pavilion-${pavilionNumber} arq-loading`;
  if (me.isError || edition.isError || (!edition.isPending && !edition.data))
    return (
      <main className={shell}>
        <p role="alert">{presentation.loadErrorText}</p>
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
      <main className={shell} aria-busy="true">
        <p role="status">{presentation.loadingText}</p>
      </main>
    );
  if (plan.isError || !plan.data || plan.data.pavilionNumber !== pavilionNumber)
    return (
      <main className={shell}>
        <p role="alert">Não foi possível carregar a planta.</p>
        <button onClick={() => void plan.refetch()}>Tentar novamente</button>
        <button onClick={back}>Voltar ao parque</button>
      </main>
    );
  const selection = plan.data.environments.some(
    (e) => e.code === selectedCode && (presentation.mode !== "lots" || e.kind === "commercial"),
  )
    ? selectedCode
    : undefined;
  return (
    <PavilionInterior
      key={`${plan.data.editionId}:${pavilionNumber}:${plan.data.revision}`}
      plan={plan.data}
      presentation={presentation}
      selectedCode={selection}
      commercial={isAdmin && commercial.isSuccess ? commercial.data : undefined}
      lotsByEnvironment={lotsByEnvironment}
      commercialError={can.read && (inventory.isError || (isAdmin && commercial.isError))}
      onRetryCommercial={() => {
        if (commercial.isError) void commercial.refetch();
        if (inventory.isError) void inventory.refetch();
      }}
      onBack={back}
      onSelect={onSelect}
      onConnect={(pavilion) => void navigate(pavilionDestination(pavilion))}
    />
  );
}
