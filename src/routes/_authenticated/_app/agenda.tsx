/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  CircleX,
  Layers3,
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { ActivityDetails } from "@/components/app/ActivityDetails";
import { AgendaCommands } from "@/components/app/AgendaCommands";
import { useAppHeaderCommands } from "@/components/app/AppHeaderContext";
import {
  activeAgendaCriteria,
  clearedAgendaCriteria,
  validateAgendaSearch,
  type AgendaSearch as Search,
} from "@/lib/agenda-search";
import "@/components/app/agenda.css";
import { RelatedLink } from "@/components/app/shared";
import {
  EmptyState,
  ErrorBox,
  FormRow,
  NativeSelect,
  Restricted,
  StatusBadge,
} from "@/components/app/ui";
import {
  api,
  setActivityStatus,
  useActivities,
  useActivityCategories,
  useAgendaPeople,
  useCan,
  useCommissions,
  useDbMutation,
  useEdition,
  useInspections,
  useInstallments,
  useMe,
} from "@/lib/api";
import { ACTIVITY_STATUS, fmtDate } from "@/lib/format";
import {
  agendaMetrics,
  buildAgendaItems,
  dateKeyInZone,
  filterAgendaItems,
  groupAgendaItemsAcrossDays,
  monthKeyInZone,
  timeInZone,
  type AgendaItem,
} from "@/lib/agenda";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/agenda")({
  validateSearch: validateAgendaSearch,
  head: () => ({
    meta: [
      { title: "Agenda Indumóveis — Sistema Indumóveis" },
      {
        name: "description",
        content:
          "Agenda Indumóveis: atividades, vistorias e vencimentos em uma área de trabalho integrada.",
      },
      { property: "og:title", content: "Agenda Indumóveis — Sistema Indumóveis" },
      {
        property: "og:description",
        content:
          "Agenda Indumóveis: atividades, vistorias e vencimentos em uma área de trabalho integrada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPage,
});

function AgendaPage() {
  const can = useCan("agenda");
  const finance = useCan("financeiro");
  const inspectionsCan = useCan("vistorias");
  const { data: me } = useMe();
  const { data: edition } = useEdition();
  const activitiesQuery = useActivities();
  const inspectionsQuery = useInspections(inspectionsCan.read);
  const installmentsQuery = useInstallments(finance.read);
  const categoriesQuery = useActivityCategories();
  const commissionsQuery = useCommissions();
  const peopleQuery = useAgendaPeople();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/agenda" });
  const timeZone = edition?.timezone ?? "America/Sao_Paulo";
  const view = search.view ?? "timeline";
  const month = search.month ?? monthKeyInZone(new Date(), timeZone);
  const today = dateKeyInZone(new Date(), timeZone);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const setSearch = useCallback(
    (patch: Partial<Search>) =>
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  );
  const selectedTrigger = useRef<HTMLElement | null>(null);
  const allItems = useMemo(
    () =>
      buildAgendaItems({
        activities: activitiesQuery.data ?? [],
        inspections: inspectionsCan.read ? (inspectionsQuery.data ?? []) : [],
        installments: finance.read ? (installmentsQuery.data ?? []) : [],
        timeZone,
      }),
    [
      activitiesQuery.data,
      inspectionsQuery.data,
      installmentsQuery.data,
      inspectionsCan.read,
      finance.read,
      timeZone,
    ],
  );
  const filtered = useMemo(
    () =>
      filterAgendaItems(allItems, {
        month,
        query: search.q,
        status: search.status ?? "todas",
        category: search.category,
        commission: search.commission,
        assignee: search.status === "minhas" ? me?.id : search.assignee,
      }),
    [allItems, month, search, me?.id],
  );
  const selected = (activitiesQuery.data ?? []).find((row: any) => row.id === search.activity);
  const failures = [
    activitiesQuery.isError && { label: "Atividades", query: activitiesQuery },
    inspectionsCan.read &&
      inspectionsQuery.isError && { label: "Vistorias", query: inspectionsQuery },
    finance.read && installmentsQuery.isError && { label: "Financeiro", query: installmentsQuery },
  ].filter(Boolean) as { label: string; query: any }[];

  const criteriaCount = activeAgendaCriteria(search);
  const clearFilters = () => setSearch(clearedAgendaCriteria);
  const selectItem = (item: AgendaItem) => {
    selectedTrigger.current = document.activeElement as HTMLElement;
    if (item.activity) void setSearch({ activity: item.activity.id });
  };
  useAppHeaderCommands({
    route: "/agenda",
    commands: can.read ? (
      <AgendaCommands
        search={search}
        view={view}
        onChange={setSearch}
        categories={categoriesQuery.data ?? []}
        commissions={commissionsQuery.data ?? []}
        people={peopleQuery.data ?? []}
        count={filtered.length}
        canWrite={can.write}
        onCatalog={() => setCatalogOpen(true)}
      />
    ) : null,
  });

  if (!can.read) return <Restricted />;
  if (activitiesQuery.isLoading) return <AgendaSkeleton />;
  if (activitiesQuery.isError && !activitiesQuery.data)
    return (
      <ErrorBox error={activitiesQuery.error} onRetry={() => void activitiesQuery.refetch()} />
    );

  return (
    <div className="agenda-workspace min-w-0">
      <h1 className="sr-only">Agenda Indumóveis</h1>
      <div className="agenda-period-bar">
        <MonthNav
          month={month}
          timeZone={timeZone}
          onChange={(value) => setSearch({ month: value, day: undefined })}
        />
        {can.write && (
          <Button size="sm" className="agenda-create" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Nova atividade
          </Button>
        )}
      </div>
      {failures.map(({ label, query }) => (
        <div key={label} className="px-4 pt-3 md:px-6 xl:px-8">
          <ErrorBox
            error={`${label}: ${String(query.error?.message ?? "fonte indisponível")}`}
            onRetry={() => void query.refetch()}
          />
        </div>
      ))}
      {!filtered.length ? (
        <EmptyState
          title={
            criteriaCount
              ? "Nenhum resultado para estes filtros"
              : allItems.length
                ? "Nenhum evento neste mês"
                : "Nenhum evento cadastrado"
          }
          text={
            criteriaCount
              ? "Tente outros critérios ou limpe os filtros para ver os eventos do período."
              : allItems.length
                ? "Navegue entre os meses para consultar a programação."
                : "As atividades, vistorias e vencimentos da edição aparecem aqui."
          }
          action={
            criteriaCount ? (
              <Button variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {view === "timeline" && (
            <Timeline
              items={filtered}
              today={today}
              timeZone={timeZone}
              canWrite={can.write}
              onSelect={selectItem}
            />
          )}
          {view === "panel" && (
            <Dashboard
              items={filtered}
              allItems={allItems}
              today={today}
              categories={categoriesQuery.data ?? []}
              commissions={commissionsQuery.data ?? []}
              people={peopleQuery.data ?? []}
              onFilter={(patch) => setSearch({ ...patch, view: "timeline" })}
            />
          )}
          {view === "calendar" && (
            <Calendar
              month={month}
              day={search.day}
              items={filtered}
              today={today}
              timeZone={timeZone}
              onDay={(day) => setSearch({ day, month: day.slice(0, 7) })}
              onSelect={selectItem}
            />
          )}
        </>
      )}
      <ActivityDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ActivityDialog open={editOpen} onOpenChange={setEditOpen} activity={selected} />
      <ActivityDetails
        activity={selected}
        canWrite={can.write}
        timeZone={timeZone}
        onEdit={() => setEditOpen(true)}
        open={!!search.activity && !editOpen}
        onOpenChange={(open) => !open && !editOpen && setSearch({ activity: undefined })}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!editOpen) selectedTrigger.current?.focus({ preventScroll: true });
        }}
      />
      <CatalogDialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        categories={categoriesQuery.data ?? []}
        commissions={commissionsQuery.data ?? []}
        editionId={edition?.id}
      />
    </div>
  );
}

function MonthNav({
  month,
  timeZone,
  onChange,
}: {
  month: string;
  timeZone: string;
  onChange: (month: string) => void;
}) {
  const shift = (amount: number) => {
    const [y, m] = month.split("-").map(Number);
    onChange(new Date(Date.UTC(y, m - 1 + amount, 1)).toISOString().slice(0, 7));
  };
  return (
    <div className="agenda-month-nav">
      <h2>{fmtMonth(month)}</h2>
      <div className="agenda-month-actions">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => shift(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(monthKeyInZone(new Date(), timeZone))}
        >
          Hoje
        </Button>
      </div>
    </div>
  );
}

function Timeline({
  items,
  today,
  timeZone,
  canWrite,
  onSelect,
}: {
  items: AgendaItem[];
  today: string;
  timeZone: string;
  canWrite: boolean;
  onSelect: (item: AgendaItem) => void;
}) {
  const dated = items.filter((item) => item.date),
    unscheduled = items.filter((item) => !item.date);
  return (
    <div className="agenda-timeline" aria-label="Eventos da Agenda">
      <p className="agenda-result-count" role="status">
        {items.length} {items.length === 1 ? "evento" : "eventos"} no período
        {unscheduled.length > 0 ? ` · ${unscheduled.length} sem data` : ""}
      </p>
      <div className="agenda-event-list">
        {dated.map((item) => (
          <TimelineRow
            key={item.key}
            item={item}
            timeZone={timeZone}
            canWrite={canWrite}
            onSelect={onSelect}
            overdue={!!item.date && (item.endDate ?? item.date) < today && item.status === "aberta"}
          />
        ))}
      </div>
      {unscheduled.length > 0 && (
        <section className="agenda-unscheduled">
          <h2>
            Sem data <span>A programar</span>
          </h2>
          <div className="agenda-event-list">
            {unscheduled.map((item) => (
              <TimelineRow
                key={item.key}
                item={item}
                timeZone={timeZone}
                canWrite={canWrite}
                onSelect={onSelect}
                overdue={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TimelineRow({
  item,
  timeZone,
  canWrite,
  onSelect,
  overdue,
}: {
  item: AgendaItem;
  timeZone: string;
  canWrite: boolean;
  onSelect: (item: AgendaItem) => void;
  overdue: boolean;
}) {
  const activity = item.activity;
  const assignees = [...(activity?.activity_assignees ?? [])].sort(
    (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary),
  );
  const commissions = activity?.activity_commissions ?? [];
  const StatusIcon =
    item.status === "concluida" || item.status === "paga" || item.status === "aprovada"
      ? CheckCircle2
      : item.status === "cancelada"
        ? CircleX
        : CircleDashed;
  const statusLabel = activity
    ? ACTIVITY_STATUS[item.status]?.label
    : item.status.replaceAll("_", " ");
  return (
    <article
      className={cn(
        "agenda-event",
        overdue && "is-overdue",
        item.status === "concluida" && "is-complete",
        item.status === "cancelada" && "is-cancelled",
      )}
    >
      <div className="agenda-date-badge" aria-label={item.date ? fmtDate(item.date) : "Sem data"}>
        <span className="agenda-date-weekday">{item.date ? weekday(item.date) : "A definir"}</span>
        <strong>{item.date ? Number(item.date.slice(-2)) : "—"}</strong>
        <span className="agenda-date-month">
          {item.date
            ? new Date(`${item.date}T12:00:00Z`)
                .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
                .replace(".", "")
            : "Sem data"}
        </span>
        <span className="agenda-date-time">
          <Clock3 className="size-3" aria-hidden />
          {item.allDay
            ? "Dia inteiro"
            : item.startAt
              ? timeInZone(item.startAt, timeZone)
              : "A definir"}
        </span>
      </div>
      <div className="agenda-event-content">
        <div className="agenda-event-category">
          <span>{activity?.activity_categories?.name ?? sourceLabel(item.source)}</span>
          {activity?.activity_categories?.name && <small>{sourceLabel(item.source)}</small>}
        </div>
        <h3>
          {activity ? (
            <button type="button" onClick={() => onSelect(item)}>
              {item.title}
            </button>
          ) : item.link ? (
            <RelatedLink type={item.link.type} id={item.link.id}>
              {item.title}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </RelatedLink>
          ) : (
            item.title
          )}
        </h3>
        {item.endDate && item.endDate !== item.date && (
          <p className="agenda-event-range">
            <CalendarDays className="size-3.5" aria-hidden />
            {fmtDate(item.date)} a {fmtDate(item.endDate)}
            {!item.allDay && item.endAt
              ? ` · até ${timeInZone(item.endAt, timeZone)}`
              : " · dia inteiro"}
          </p>
        )}
        <div className="agenda-event-meta">
          {activity?.location && (
            <span>
              <MapPin className="size-3.5" aria-hidden />
              {activity.location}
            </span>
          )}
          {assignees.length > 0 && (
            <span>
              <Users className="size-3.5" aria-hidden />
              {assignees
                .map((row: any) => row.profiles?.full_name || row.profiles?.email)
                .filter(Boolean)
                .join(", ")}
            </span>
          )}
          {commissions.length > 0 && (
            <span>
              <Layers3 className="size-3.5" aria-hidden />
              {commissions.map((row: any) => row.commissions?.name).join(", ")}
            </span>
          )}
        </div>
      </div>
      <div className="agenda-event-state">
        <span className="agenda-status" data-status={item.status}>
          <StatusIcon className="size-3.5" aria-hidden />
          {statusLabel}
        </span>
        {overdue && (
          <span className="agenda-overdue">
            <AlertCircle className="size-3.5" aria-hidden />
            Atrasada
          </span>
        )}
        {activity && canWrite && item.status === "aberta" && (
          <StatusButton activity={activity} status="concluida" label="Concluir" />
        )}
      </div>
    </article>
  );
}

function AgendaSkeleton() {
  return (
    <div className="agenda-skeleton" role="status" aria-label="Carregando eventos">
      <div />
      <div />
      <div />
      <span className="sr-only">Carregando eventos…</span>
    </div>
  );
}

function StatusButton({
  activity,
  status,
  label,
}: {
  activity: any;
  status: "aberta" | "concluida" | "cancelada";
  label: string;
}) {
  const mutation = useDbMutation(() => setActivityStatus(activity.id, status, activity.version), {
    success: `Atividade ${status === "concluida" ? "concluída" : status === "cancelada" ? "cancelada" : "reaberta"}`,
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      className="agenda-complete-action"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(undefined)}
    >
      {label}
    </Button>
  );
}

function Dashboard({
  items,
  allItems,
  today,
  categories,
  commissions,
  people,
  onFilter,
}: {
  items: AgendaItem[];
  allItems: AgendaItem[];
  today: string;
  categories: any[];
  commissions: any[];
  people: any[];
  onFilter: (patch: Partial<Search>) => void;
}) {
  const metrics = agendaMetrics(items, today);
  const distribution = (key: "categoryId" | "commissionIds" | "assigneeIds", rows: any[]) =>
    rows
      .map((row) => ({
        ...row,
        count: items.filter((item) =>
          Array.isArray(item[key])
            ? (item[key] as string[]).includes(row.id)
            : item[key] === row.id,
        ).length,
      }))
      .filter((row) => row.count)
      .sort((a, b) => b.count - a.count);
  return (
    <div className="space-y-8 px-4 py-5 md:px-6 xl:px-8">
      <section className="grid gap-px border bg-border sm:grid-cols-2 xl:grid-cols-5">
        {(
          [
            ["Próximas", metrics.upcoming, { status: "aberta" }],
            ["Abertas", metrics.open, { status: "aberta" }],
            ["Atrasadas", metrics.overdue, { status: "aberta" }],
            ["Concluídas", metrics.completed, { status: "concluida" }],
            ["Sem data", metrics.unscheduled, { status: "aberta" }],
          ] as [string, number, Partial<Search>][]
        ).map(([label, value, patch]) => {
          const content = (
            <>
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <strong className="tnum mt-1 block text-2xl">{value}</strong>
            </>
          );
          return label === "Abertas" || label === "Concluídas" ? (
            <button
              key={label}
              type="button"
              onClick={() => onFilter(patch)}
              className="bg-card p-4 text-left transition-colors hover:bg-accent"
            >
              {content}
            </button>
          ) : (
            <div key={label} className="bg-card p-4">
              {content}
            </div>
          );
        })}
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(18rem,.75fr)_repeat(3,minmax(0,1fr))]">
        <div className="border-t-2 border-primary bg-card p-4">
          <p className="text-sm font-semibold">Evolução no período</p>
          <p className="tnum mt-3 text-3xl font-bold">{metrics.completionRate}%</p>
          <Progress value={metrics.completionRate} className="mt-3" />
          <p className="mt-2 text-xs text-muted-foreground">
            {metrics.completed} concluídas de {metrics.completed + metrics.open} atividades abertas
            ou concluídas. Canceladas não entram no cálculo.
          </p>
        </div>
        <Distribution
          title="Categorias"
          rows={distribution("categoryId", categories)}
          onClick={(id) => onFilter({ category: id })}
        />
        <Distribution
          title="Comissões"
          rows={distribution("commissionIds", commissions)}
          onClick={(id) => onFilter({ commission: id })}
        />
        <Distribution
          title="Responsáveis"
          rows={distribution("assigneeIds", people)}
          onClick={(id) => onFilter({ assignee: id })}
        />
      </section>
      {allItems.length > items.length && (
        <p className="text-xs text-muted-foreground">
          Indicadores respeitam período, busca e filtros atuais.
        </p>
      )}
    </div>
  );
}

function Distribution({
  title,
  rows,
  onClick,
}: {
  title: string;
  rows: any[];
  onClick: (id: string) => void;
}) {
  return (
    <section className="border-t-2 bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length ? (
        <ul className="mt-2 divide-y">
          {rows.slice(0, 6).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-primary"
                onClick={() => onClick(row.id)}
              >
                <span className="truncate">{row.name || row.full_name || row.email}</span>
                <strong className="tnum">{row.count}</strong>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Sem dados no recorte.</p>
      )}
    </section>
  );
}

function Calendar({
  month,
  day,
  items,
  today,
  timeZone,
  onDay,
  onSelect,
}: {
  month: string;
  day?: string;
  items: AgendaItem[];
  today: string;
  timeZone: string;
  onDay: (day: string) => void;
  onSelect: (item: AgendaItem) => void;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const byDay = groupAgendaItemsAcrossDays(items);
  const selectedDay =
    day && day.startsWith(month) ? day : today.startsWith(month) ? today : `${month}-01`;
  const selectedRows = byDay[selectedDay] ?? [];
  return (
    <div className="grid gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_20rem] md:px-6 xl:px-8">
      <div className="overflow-x-auto">
        <div className="agenda-calendar border bg-card">
          <div className="grid grid-cols-7 border-b bg-surface-subtle">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => (
              <div key={label} className="px-2 py-2 text-xs font-semibold text-muted-foreground">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((date) => {
              const rows = byDay[date] ?? [];
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onDay(date)}
                  aria-label={`${fmtDate(date)} · ${rows.length} ${rows.length === 1 ? "evento" : "eventos"}`}
                  aria-pressed={date === selectedDay}
                  className={cn(
                    "min-h-20 min-w-0 border-b border-r p-1 text-left sm:min-h-28 sm:p-2",
                    !date.startsWith(month) && "bg-muted/30 text-muted-foreground",
                    date === selectedDay && "bg-accent",
                    date === today && "ring-2 ring-inset ring-primary",
                  )}
                >
                  <span className="tnum text-xs font-semibold">{Number(date.slice(-2))}</span>
                  <span className="mt-2 hidden space-y-1 sm:block">
                    {rows.slice(0, 3).map((item) => (
                      <span
                        key={item.key}
                        className="block truncate rounded-sm bg-plum-soft px-1.5 py-1 text-xs text-primary"
                      >
                        {item.startAt && !item.allDay
                          ? `${timeInZone(item.startAt, timeZone)} · `
                          : ""}
                        {item.title}
                      </span>
                    ))}
                    {rows.length > 3 && (
                      <span className="block text-xs font-semibold text-primary">
                        +{rows.length - 3} ver todos
                      </span>
                    )}
                  </span>
                  {rows.length > 0 && (
                    <span className="mt-2 block text-[10px] font-semibold text-primary sm:hidden">
                      {rows.length} {rows.length === 1 ? "evento" : "eventos"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <section>
        <h2 className="font-bold">{selectedDay ? fmtDate(selectedDay) : "Selecione um dia"}</h2>
        {selectedRows.length ? (
          <ul className="mt-3 divide-y border-y bg-card">
            {selectedRows.map((item) => (
              <li key={item.key}>
                <div className="px-3 py-3 text-left">
                  <span className="block text-xs text-muted-foreground">
                    {item.allDay ? "Dia inteiro" : timeInZone(item.startAt, timeZone)}
                  </span>
                  {item.activity ? (
                    <button
                      type="button"
                      className="text-left font-semibold hover:underline"
                      onClick={() => onSelect(item)}
                    >
                      {item.title}
                    </button>
                  ) : item.link ? (
                    <RelatedLink type={item.link.type} id={item.link.id}>
                      {item.title}
                    </RelatedLink>
                  ) : (
                    <span className="font-semibold">{item.title}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum registro neste dia.</p>
        )}
        {items.some((item) => !item.date) && (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-sm font-semibold">Sem data</h3>
            <ul className="mt-2 space-y-3">
              {items
                .filter((item) => !item.date)
                .map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className="text-left text-sm font-medium hover:underline"
                      onClick={() => onSelect(item)}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
function CatalogDialog({
  open,
  onOpenChange,
  categories,
  commissions,
  editionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: any[];
  commissions: any[];
  editionId?: string;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"category" | "commission">("category");
  const mutation = useDbMutation(
    () => {
      if (!editionId) throw new Error("Edição não encontrada");
      return api.rpc(
        mode === "category" ? "save_activity_category" : "save_commission",
        mode === "category"
          ? { p_id: null, p_edition_id: editionId, p_name: name, p_is_active: true }
          : {
              p_id: null,
              p_edition_id: editionId,
              p_name: name,
              p_is_active: true,
              p_is_coordinating: false,
            },
      );
    },
    {
      success: mode === "category" ? "Categoria adicionada" : "Comissão adicionada",
      onSuccess: () => setName(""),
    },
  );
  const toggle = useDbMutation(
    (row: any) =>
      api.rpc(
        mode === "category" ? "save_activity_category" : "save_commission",
        mode === "category"
          ? { p_id: row.id, p_edition_id: editionId, p_name: row.name, p_is_active: !row.is_active }
          : {
              p_id: row.id,
              p_edition_id: editionId,
              p_name: row.name,
              p_is_active: !row.is_active,
              p_is_coordinating: row.is_coordinating,
            },
      ),
    { success: "Catálogo atualizado" },
  );
  const rows = mode === "category" ? categories : commissions;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Categorias e comissões</SheetTitle>
          <SheetDescription>
            Catálogos editáveis da edição. Desativar preserva o histórico.
          </SheetDescription>
        </SheetHeader>
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as typeof mode)}
          className="mt-5"
        >
          <TabsList>
            <TabsTrigger value="category">Categorias</TabsTrigger>
            <TabsTrigger value="commission">Comissões</TabsTrigger>
          </TabsList>
        </Tabs>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(undefined);
          }}
        >
          <FormRow label={mode === "category" ? "Nova categoria" : "Nova comissão"}>
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </FormRow>
          <Button className="mt-6" type="submit" disabled={mutation.isPending || !name.trim()}>
            <Plus className="size-4" />
            Adicionar
          </Button>
        </form>
        <ul className="mt-5 divide-y border-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    !row.is_active && "text-muted-foreground line-through",
                  )}
                >
                  {row.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.is_coordinating ? "Coordenadora · " : ""}
                  {row.is_active ? "Ativa" : "Inativa"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => toggle.mutate(row)}>
                {row.is_active ? "Desativar" : "Reativar"}
              </Button>
            </li>
          ))}
        </ul>
        {mode === "commission" && (
          <p className="mt-4 text-xs text-muted-foreground">
            A fonte oficial informa 23 comissões em 2027; 22 nomes estão comprovados e cadastrados.
            O nome restante permanece pendente.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

const sourceLabel = (source: AgendaItem["source"]) =>
  source === "activity" ? "Atividade" : source === "inspection" ? "Vistoria" : "Financeiro";
const fmtMonth = (month: string) =>
  capitalize(
    new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" });
