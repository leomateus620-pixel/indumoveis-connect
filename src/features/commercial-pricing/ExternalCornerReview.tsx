import { useId, useState } from "react";
import { MapPin } from "lucide-react";
import { FormRow, NativeSelect } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, useCan, useCommercialCornerReview, useDbMutation } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { CommercialCornerReview, CornerClassification } from "./cornerReview";

const labels: Record<CornerClassification, string> = {
  corner: "Lote de esquina",
  regular: "Lote comum",
  pending: "Classificação pendente",
};

type Props = { editionId: string; spaceId: string };

export function ExternalCornerReview({ editionId, spaceId }: Props) {
  const map = useCan("mapa");
  const commercial = useCan("comercial");
  const [expanded, setExpanded] = useState(false);
  const permitted = map.write && commercial.write;
  const { data, isPending, isError, refetch } = useCommercialCornerReview(
    editionId,
    spaceId,
    permitted && expanded,
  );
  if (!permitted) return null;

  return (
    <details
      className="mt-3 rounded-md border bg-card text-sm"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 font-semibold focus-visible:ring-2 focus-visible:ring-ring">
        <MapPin size={14} aria-hidden="true" />
        Revisar classificação de esquina
      </summary>
      {expanded && (
        <div className="border-t px-3 py-3">
          {isPending && <p role="status">Carregando classificação…</p>}
          {isError && (
            <div role="alert" className="flex items-center justify-between gap-2">
              <p>Não foi possível carregar a classificação.</p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}
          {!isPending && !isError && !data && (
            <p>O espaço não está vinculado à implantação da edição ativa.</p>
          )}
          {data && (
            <ReviewForm key={`${spaceId}:${data.revision}`} editionId={editionId} review={data} />
          )}
        </div>
      )}
    </details>
  );
}

function ReviewForm({ editionId, review }: { editionId: string; review: CommercialCornerReview }) {
  const id = useId();
  const [classification, setClassification] = useState(review.classification);
  const [evidence, setEvidence] = useState("");
  const save = useDbMutation(
    () =>
      api.rpc<number>("review_commercial_corner", {
        p_edition_id: editionId,
        p_lot_number: review.lotNumber,
        p_expected_revision: review.revision,
        p_classification: classification,
        p_evidence: evidence.trim(),
      }),
    { success: "Revisão de esquina registrada" },
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold">{labels[review.classification]}</p>
        <p className="text-muted-foreground">{review.source.basis}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {review.source.intersection?.join(" × ") ??
            [review.source.frontage, review.source.envelopeSideStreet].filter(Boolean).join(" × ")}
        </p>
      </div>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (evidence.trim()) save.mutate(undefined);
        }}
      >
        <FormRow label="Classificação" htmlFor={`${id}-classification`}>
          <NativeSelect
            id={`${id}-classification`}
            value={classification}
            onChange={(event) => setClassification(event.target.value as CornerClassification)}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormRow>
        <FormRow label="Evidência da revisão" htmlFor={`${id}-evidence`}>
          <Textarea
            id={`${id}-evidence`}
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            placeholder="Informe a planta, a revisão e as vias que justificam a classificação."
            rows={2}
            required
          />
        </FormRow>
        <Button size="sm" type="submit" disabled={!evidence.trim() || save.isPending}>
          Registrar revisão
        </Button>
      </form>
      {review.reviews.length > 0 && (
        <details className="border-t pt-2 text-xs">
          <summary className="cursor-pointer rounded font-semibold focus-visible:ring-2 focus-visible:ring-ring">
            Histórico de revisões
          </summary>
          <ol className="mt-2 space-y-2">
            {review.reviews.map((entry) => (
              <li key={entry.revision}>
                <p className="font-semibold">
                  {labels[entry.classification]} · {fmtDateTime(entry.reviewedAt)}
                </p>
                <p className="break-words text-muted-foreground">{entry.evidence}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
