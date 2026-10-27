import type { ComponentProps, ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleSlash,
  Clock3,
  FileText,
  Layers3,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  RotateCcw,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AttachedDocuments } from "@/components/app/documents/AttachedDocuments";
import { RelatedLink, RELATED_LABEL } from "@/components/app/shared";
import { setActivityStatus, useDbMutation, useMe } from "@/lib/api";
import { dateKeyInZone, timeInZone } from "@/lib/agenda";
import type { ModuleKey } from "@/lib/navigation";
import "./activity-details.css";

type ActivityStatus = "aberta" | "concluida" | "cancelada";
type Assignee = {
  profile_id: string;
  is_primary?: boolean;
  profiles?: { id?: string; full_name?: string | null; email?: string | null } | null;
};

/** Presentation fields already returned by useActivities; no additional data access. */
export type ActivityDetailsActivity = {
  id: string;
  title: string;
  description?: string | null;
  kind: string;
  status: ActivityStatus;
  version: number;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean;
  location?: string | null;
  related_type?: string | null;
  related_id?: string | null;
  activity_categories?: { name?: string | null } | null;
  activity_assignees?: Assignee[];
  activity_commissions?: {
    commission_id: string;
    commissions?: { name?: string | null; is_coordinating?: boolean } | null;
  }[];
};

type ActivityDetailsProps = {
  activity?: ActivityDetailsActivity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
  timeZone: string;
  onEdit: () => void;
  onCloseAutoFocus?: ComponentProps<typeof SheetContent>["onCloseAutoFocus"];
};

const STATUS = {
  aberta: { label: "Aberta", icon: Clock3 },
  concluida: { label: "Concluída", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", icon: CircleSlash },
} as const;
const KIND: Record<string, string> = {
  tarefa: "Tarefa",
  reuniao: "Reunião",
  prazo: "Prazo",
  entrega: "Entrega",
  pendencia: "Pendência",
};
const ORIGIN_MODULE: Record<string, ModuleKey> = {
  company: "empresas",
  deal: "comercial",
  contract: "contratos",
  inspection: "vistorias",
  space: "mapa",
  installment: "financeiro",
};

export function ActivityDetails({
  activity,
  open,
  onOpenChange,
  canWrite,
  timeZone,
  onEdit,
  onCloseAutoFocus,
}: ActivityDetailsProps) {
  const { data: me } = useMe();
  if (!activity) return null;
  const status = STATUS[activity.status];
  const StatusIcon = status.icon;
  const assignees = activity.activity_assignees ?? [];
  const primary = assignees.find((person) => person.is_primary);
  const others = assignees.filter((person) => !person.is_primary);
  const commissions = activity.activity_commissions ?? [];
  const originModule = activity.related_type ? ORIGIN_MODULE[activity.related_type] : undefined;
  const canOpenOrigin = originModule && me?.perms[originModule]?.read;
  const canReadDocuments = !!me?.perms.documentos?.read;
  const canWriteDocuments = canWrite && !!me?.perms.documentos?.write;
  const period = activityPeriod(activity, timeZone);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="activity-details" onCloseAutoFocus={onCloseAutoFocus}>
        <SheetHeader className="activity-details__header">
          <p className="activity-details__category">
            <span aria-hidden="true" />
            {activity.activity_categories?.name || "Sem categoria"}
          </p>
          <SheetTitle className="activity-details__title">{activity.title}</SheetTitle>
          <SheetDescription className="sr-only">
            Informações, programação e documentos da atividade.
          </SheetDescription>
          <div className="activity-details__identity">
            <span className="activity-details__status" data-status={activity.status}>
              <StatusIcon aria-hidden="true" />
              {status.label}
            </span>
            <span className="activity-details__kind">{KIND[activity.kind] ?? activity.kind}</span>
          </div>
        </SheetHeader>

        <div className="activity-details__body">
          <DetailSection
            icon={CalendarClock}
            title="Programação"
            className="activity-details__schedule"
          >
            {period.start ? (
              <>
                <dl className="activity-details__period">
                  <div>
                    <dt>Início</dt>
                    <dd>
                      <time dateTime={activity.start_at!}>
                        {period.start.date}
                        <strong>{period.start.time}</strong>
                      </time>
                    </dd>
                  </div>
                  {period.end && (
                    <div>
                      <dt>Fim</dt>
                      <dd>
                        <time dateTime={activity.end_at!}>
                          {period.end.date}
                          <strong>{period.end.time}</strong>
                        </time>
                      </dd>
                    </div>
                  )}
                </dl>
                {period.duration && (
                  <p className="activity-details__duration">
                    <Clock3 aria-hidden="true" />
                    Duração de {period.duration}
                  </p>
                )}
              </>
            ) : (
              <p className="activity-details__empty">Data a definir</p>
            )}
          </DetailSection>

          <DetailSection icon={MapPin} title="Local">
            <p
              className={activity.location ? "activity-details__value" : "activity-details__empty"}
            >
              {activity.location || "Local a definir"}
            </p>
          </DetailSection>

          <DetailSection icon={UserRound} title="Responsabilidade">
            {primary ? (
              <Person person={primary} primary />
            ) : (
              <p className="activity-details__empty">Responsável principal a definir</p>
            )}
            {others.length > 0 && (
              <div className="activity-details__other-people">
                <p className="activity-details__subheading">
                  <UsersRound aria-hidden="true" />
                  Demais responsáveis <span>{others.length}</span>
                </p>
                <ul>
                  {others.map((person) => (
                    <li key={person.profile_id}>
                      <Person person={person} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DetailSection>

          <DetailSection icon={Layers3} title="Comissões relacionadas">
            {commissions.length ? (
              <ul className="activity-details__commissions">
                {commissions.map((row) => (
                  <li key={row.commission_id}>
                    <span aria-hidden="true" />
                    {row.commissions?.name || "Comissão"}
                    {row.commissions?.is_coordinating && <small>Coordenadora</small>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="activity-details__empty">Nenhuma comissão vinculada</p>
            )}
          </DetailSection>

          {activity.description && (
            <DetailSection icon={FileText} title="Descrição">
              <p className="activity-details__description">{activity.description}</p>
            </DetailSection>
          )}

          {activity.related_type && activity.related_id && (
            <DetailSection icon={Link2} title="Registro de origem">
              {canOpenOrigin ? (
                <div className="activity-details__origin">
                  <RelatedLink type={activity.related_type} id={activity.related_id}>
                    Abrir{" "}
                    {RELATED_LABEL[activity.related_type]?.toLocaleLowerCase("pt-BR") ?? "origem"}
                    <ArrowUpRight aria-hidden="true" />
                  </RelatedLink>
                </div>
              ) : (
                <p className="activity-details__empty">
                  {RELATED_LABEL[activity.related_type] ?? "Origem"} vinculada · acesso restrito ao
                  módulo
                </p>
              )}
            </DetailSection>
          )}

          <DetailSection icon={FileText} title="Documentos e anexos">
            {canReadDocuments ? (
              <AttachedDocuments
                entityType="activity"
                entityId={activity.id}
                entityLabel={activity.title}
                category="geral"
                canWrite={canWriteDocuments}
              />
            ) : (
              <p className="activity-details__empty">
                Acesso aos documentos não disponível para este perfil.
              </p>
            )}
          </DetailSection>
        </div>

        <div className="activity-details__footer">
          <span className="activity-details__version">Versão {activity.version}</span>
          {canWrite ? (
            <ActivityActions activity={activity} onEdit={onEdit} />
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({
  icon: Icon,
  title,
  children,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`activity-details__section ${className}`} aria-label={title}>
      <span className="activity-details__section-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="activity-details__section-content">
        <h3>{title}</h3>
        {children}
      </div>
    </section>
  );
}

function Person({ person, primary = false }: { person: Assignee; primary?: boolean }) {
  const name = person.profiles?.full_name || person.profiles?.email || "Responsável";
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
  return (
    <div className="activity-details__person" data-primary={primary || undefined}>
      <span className="activity-details__avatar" aria-hidden="true">
        {initials}
      </span>
      <span className="activity-details__person-name">{name}</span>
      {primary && (
        <small>
          <Check aria-hidden="true" />
          Principal
        </small>
      )}
    </div>
  );
}

function ActivityActions({
  activity,
  onEdit,
}: {
  activity: ActivityDetailsActivity;
  onEdit: () => void;
}) {
  const mutation = useDbMutation(
    (status: ActivityStatus) => setActivityStatus(activity.id, status, activity.version),
    { success: "Situação da atividade atualizada" },
  );
  return (
    <div className="activity-details__actions" aria-label="Ações da atividade">
      {activity.status !== "cancelada" && (
        <Button
          variant="ghost"
          className="activity-details__cancel"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("cancelada")}
        >
          {mutation.isPending && mutation.variables === "cancelada" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <CircleSlash />
          )}
          Cancelar
        </Button>
      )}
      {activity.status === "aberta" ? (
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("concluida")}
        >
          {mutation.isPending && mutation.variables === "concluida" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <CheckCircle2 />
          )}
          Concluir
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("aberta")}
        >
          {mutation.isPending && mutation.variables === "aberta" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RotateCcw />
          )}
          Reabrir
        </Button>
      )}
      <Button disabled={mutation.isPending} onClick={onEdit}>
        <Pencil />
        Editar
      </Button>
    </div>
  );
}

function activityPeriod(activity: ActivityDetailsActivity, timeZone: string) {
  if (!activity.start_at) return {};
  const dateFormat = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const point = (value: string) => ({
    date: dateFormat.format(new Date(value)),
    time: activity.all_day ? "Dia inteiro" : timeInZone(value, timeZone),
  });
  const start = point(activity.start_at);
  const end = activity.end_at ? point(activity.end_at) : undefined;
  let duration: string | undefined;
  if (activity.end_at) {
    if (activity.all_day) {
      const first = dateKeyInZone(activity.start_at, timeZone);
      const last = dateKeyInZone(activity.end_at, timeZone);
      const days =
        Math.round(
          (Date.parse(`${last}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000,
        ) + 1;
      if (days > 0) duration = days === 1 ? "1 dia" : `${days} dias`;
    } else {
      const minutes = Math.round(
        (Date.parse(activity.end_at) - Date.parse(activity.start_at)) / 60_000,
      );
      if (minutes > 0) {
        const days = Math.floor(minutes / 1_440);
        const hours = Math.floor((minutes % 1_440) / 60);
        const rest = minutes % 60;
        duration = [
          days && `${days} ${days === 1 ? "dia" : "dias"}`,
          hours && `${hours}h`,
          rest && `${rest}min`,
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
  }
  return { start, end, duration };
}
