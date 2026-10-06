/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListTree,
  MapPin,
  Plus,
  Settings2,
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
import { RelatedLink, RELATED_LABEL } from "@/components/app/shared";
import {
  EmptyState,
  ErrorBox,
  FormRow,
  Loading,
  NativeSelect,
  PageHeader,
  Restricted,
  SearchInput,
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
  daysForItem,
  filterAgendaItems,
  groupAgendaItemsAcrossDays,
  groupAgendaItemsByDate,
  monthBounds,
  monthKeyInZone,
  timeInZone,
  type AgendaItem,
} from "@/lib/agenda";
import { cn } from "@/lib/utils";

type View = "timeline" | "panel" | "calendar";
type Search = {
  view?: View;
  month?: string;
  q?: string;
  status?: string;
  category?: string;
  commission?: string;
  assignee?: string;
  activity?: string;
  day?: string;
};

export const Route = createFileRoute("/_authenticated/agenda")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    view: ["timeline", "panel", "calendar"].includes(String(search.view))
      ? (search.view as View)
      : undefined,
    month: /^\d{4}-\d{2}$/.test(String(search.month)) ? String(search.month) : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
    commission: typeof search.commission === "string" ? search.commission : undefined,
    assignee: typeof search.assignee === "string" ? search.assignee : undefined,
    activity: typeof search.activity === "string" ? search.activity : undefined,
    day: /^\d{4}-\d{2}-\d{2}$/.test(String(search.day)) ? String(search.day) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Agenda Operacional — Sistema Indumóveis" },
      {
        name: "description",
        content: "Linha do tempo, painel e calendário operacional da Indumóveis.",
      },
      { property: "og:title", content: "Agenda Operacional — Sistema Indumóveis" },
      {
        property: "og:description",
        content: "Linha do tempo, painel e calendário operacional da Indumóveis.",
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

  const setSearch = (patch: Partial<Search>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
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

  if (!can.read) return <Restricted />;
  if (activitiesQuery.isLoading || categoriesQuery.isLoading || commissionsQuery.isLoading)
    return <Loading />;
  if (activitiesQuery.isError)
    return (
      <ErrorBox error={activitiesQuery.error} onRetry={() => void activitiesQuery.refetch()} />
    );

  return (
    <div className="agenda-workspace min-w-0">
      <PageHeader
        title="Agenda / Atividades"
        subtitle={`${edition?.name ?? "Edição ativa"} · ${fmtMonth(month)} · fuso de Santa Rosa`}
        actions={
          <>
            {can.write && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Configurar categorias e comissões"
                onClick={() => setCatalogOpen(true)}
              >
                <Settings2 className="size-4" />
              </Button>
            )}
            {can.write && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                Nova atividade
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={view}
            onValueChange={(value) =>
              setSearch({ view: value as View, day: undefined, activity: undefined })
            }
          >
            <TabsList className="grid w-full grid-cols-3 sm:w-auto">
              <TabsTrigger value="timeline">
                <ListTree className="mr-1.5 size-4" />
                Linha do tempo
              </TabsTrigger>
              <TabsTrigger value="panel">
                <BarChart3 className="mr-1.5 size-4" />
                Painel
              </TabsTrigger>
              <TabsTrigger value="calendar">
                <CalendarDays className="mr-1.5 size-4" />
                Calendário
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <MonthNav
            month={month}
            timeZone={timeZone}
            onChange={(value) => setSearch({ month: value, day: undefined })}
          />
        </div>
      </PageHeader>

      <div className="grid gap-2 border-b bg-surface-subtle px-4 py-3 sm:grid-cols-2 lg:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,auto))] md:px-6 xl:px-8">
        <SearchInput
          value={search.q ?? ""}
          onChange={(q) => setSearch({ q: q || undefined })}
          placeholder="Buscar atividade, pessoa, local…"
        />
        <NativeSelect
          aria-label="Situação"
          value={search.status ?? "todas"}
          onChange={(event) =>
            setSearch({ status: event.target.value === "todas" ? undefined : event.target.value })
          }
        >
          <option value="todas">Todas as situações</option>
          <option value="aberta">Abertas</option>
          <option value="minhas">Minhas atividades</option>
          <option value="concluida">Concluídas</option>
          <option value="cancelada">Canceladas</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Categoria"
          value={search.category ?? ""}
          onChange={(event) => setSearch({ category: event.target.value || undefined })}
        >
          <option value="">Todas as categorias</option>
          {(categoriesQuery.data ?? []).map((row: any) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Comissão"
          value={search.commission ?? ""}
          onChange={(event) => setSearch({ commission: event.target.value || undefined })}
        >
          <option value="">Todas as comissões</option>
          {(commissionsQuery.data ?? []).map((row: any) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Responsável"
          value={search.assignee ?? ""}
          onChange={(event) => setSearch({ assignee: event.target.value || undefined })}
        >
          <option value="">Todos os responsáveis</option>
          {(peopleQuery.data ?? []).map((row: any) => (
            <option key={row.id} value={row.id}>
              {row.full_name || row.email}
            </option>
          ))}
        </NativeSelect>
      </div>

      {failures.map(({ label, query }) => (
        <div key={label} className="px-4 pt-3 md:px-6 xl:px-8">
          <ErrorBox
            error={`${label}: ${String(query.error?.message ?? "fonte indisponível")}`}
            onRetry={() => void query.refetch()}
          />
        </div>
      ))}
      {view === "timeline" && (
        <Timeline
          items={filtered}
          today={today}
          timeZone={timeZone}
          canWrite={can.write}
          onSelect={(item) => setSearch({ activity: item.activity?.id })}
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
          onDay={(day) => setSearch({ day })}
          onSelect={(item) =>
            item.activity ? setSearch({ activity: item.activity.id }) : undefined
          }
        />
      )}

      <ActivityDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ActivityDialog open={editOpen} onOpenChange={setEditOpen} activity={selected} />
      <ActivityDetails
        activity={selected}
        canWrite={can.write}
        timeZone={timeZone}
        onEdit={() => setEditOpen(true)}
        open={!!search.activity && !editOpen}
        onOpenChange={(open) => !open && setSearch({ activity: undefined })}
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
    const d = new Date(Date.UTC(y, m - 1 + amount, 1));
    onChange(d.toISOString().slice(0, 7));
  };
  return (
    <div className="flex items-center justify-between gap-1">
      <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => shift(-1)}>
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-36 text-center text-sm font-semibold capitalize">
        {fmtMonth(month)}
      </span>
      <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => shift(1)}>
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
  const dated = items.filter((item) => item.date);
  const unscheduled = items.filter((item) => !item.date);
  const groups = Object.entries(groupAgendaItemsByDate(dated));
  if (!items.length)
    return (
      <EmptyState
        title="Nenhuma atividade neste recorte"
        text="Ajuste o período ou os filtros aplicados."
      />
    );
  return (
    <div className="px-4 py-5 md:px-6 xl:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {groups.map(([date, rows]) => (
          <section key={date} className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <header className="sm:text-right">
              <p className={cn("text-sm font-bold", date === today && "text-primary")}>
                {date === today ? "Hoje" : fmtDate(date)}
              </p>
              <p className="text-xs capitalize text-muted-foreground">{weekday(date)}</p>
            </header>
            <div className="relative space-y-2 border-l pl-5 before:absolute before:-left-1 before:top-1 before:size-2 before:rounded-full before:bg-brand-red">
              {rows?.map((item) => (
                <TimelineRow
                  key={item.key}
                  item={item}
                  timeZone={timeZone}
                  canWrite={canWrite}
                  onSelect={onSelect}
                  overdue={!!item.date && item.date < today && item.status === "aberta"}
                />
              ))}
            </div>
          </section>
        ))}
        {unscheduled.length > 0 && (
          <section className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <header className="sm:text-right">
              <p className="text-sm font-bold">Sem data</p>
              <p className="text-xs text-muted-foreground">A programar</p>
            </header>
            <div className="space-y-2 border-l pl-5">
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
  return (
    <article
      className={cn(
        "border bg-card px-4 py-3 shadow-xs",
        item.status === "concluida" && "opacity-70",
        item.status === "cancelada" && "border-dashed opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="tnum w-14 shrink-0 pt-0.5 text-xs font-semibold text-muted-foreground">
          {item.allDay ? "Dia todo" : item.startAt ? timeInZone(item.startAt, timeZone) : "—"}
        </div>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(item)}>
          <span
            className={cn("block font-semibold", item.status === "cancelada" && "line-through")}
          >
            {item.title}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{sourceLabel(item.source)}</span>
            {activity?.activity_categories?.name && (
              <span>{activity.activity_categories.name}</span>
            )}
            {activity?.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {activity.location}
              </span>
            )}
            {activity && (activity.activity_assignees?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                {activity.activity_assignees
                  .map((row: any) => row.profiles?.full_name || row.profiles?.email)
                  .join(", ")}
              </span>
            )}
          </span>
        </button>
        {activity && <StatusBadge map={ACTIVITY_STATUS} value={activity.status} />}
      </div>
      {overdue && <p className="mt-2 pl-17 text-xs font-semibold text-destructive">Atrasada</p>}
      {activity && canWrite && activity.status === "aberta" && (
        <StatusButton activity={activity} status="concluida" label="Concluir" />
      )}
    </article>
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
      className="ml-17 mt-1"
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
        ).map(([label, value, patch]) => (
          <button
            key={String(label)}
            type="button"
            onClick={() => onFilter(patch)}
            className="bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <strong className="tnum mt-1 block text-2xl">{value}</strong>
          </button>
        ))}
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
    day && day.startsWith(month)
      ? day
      : today.startsWith(month)
        ? today
        : `${month}-01`;
  const selectedRows = byDay[selectedDay] ?? [];
  return (
    <div className="grid gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_20rem] md:px-6 xl:px-8">
      <div className="overflow-x-auto">
        <div className="min-w-[44rem] border bg-card">
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
                  className={cn(
                    "min-h-28 border-b border-r p-2 text-left",
                    !date.startsWith(month) && "bg-muted/30 text-muted-foreground",
                    date === selectedDay && "bg-accent",
                    date === today && "ring-2 ring-inset ring-primary",
                  )}
                >
                  <span className="tnum text-xs font-semibold">{Number(date.slice(-2))}</span>
                  <span className="mt-2 block space-y-1">
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
                <button
                  type="button"
                  className="w-full px-3 py-3 text-left"
                  onClick={() => onSelect(item)}
                >
                  <span className="block text-xs text-muted-foreground">
                    {item.allDay ? "Dia todo" : timeInZone(item.startAt, timeZone)}
                  </span>
                  <span className="block font-semibold">{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum registro neste dia.</p>
        )}
      </section>
    </div>
  );
}
function ActivityDetails({
  activity,
  open,
  onOpenChange,
  canWrite,
  timeZone,
  onEdit,
}: {
  activity?: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
  timeZone: string;
  onEdit: () => void;
}) {
  if (!activity) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{activity.title}</SheetTitle>
          <SheetDescription>
            {activity.activity_categories?.name ?? "Sem categoria"} · versão {activity.version}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge map={ACTIVITY_STATUS} value={activity.status} />
            <span className="text-muted-foreground capitalize">{activity.kind}</span>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Programação">
              {activity.start_at
                ? `${fmtDate(dateKeyInZone(activity.start_at, timeZone))}${activity.all_day ? " · dia inteiro" : ` · ${timeInZone(activity.start_at, timeZone)}`}`
                : "Sem data"}
              {activity.end_at
                ? ` até ${fmtDate(dateKeyInZone(activity.end_at, timeZone))} ${activity.all_day ? "" : timeInZone(activity.end_at, timeZone)}`
                : ""}
            </Detail>
            <Detail label="Local">{activity.location || "—"}</Detail>
            <Detail label="Responsáveis">
              {activity.activity_assignees
                ?.map((row: any) => row.profiles?.full_name || row.profiles?.email)
                .join(", ") || "—"}
            </Detail>
            <Detail label="Comissões">
              {activity.activity_commissions?.map((row: any) => row.commissions?.name).join(", ") ||
                "—"}
            </Detail>
          </dl>
          {activity.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Descrição</p>
              <p className="mt-1 whitespace-pre-wrap">{activity.description}</p>
            </div>
          )}
          {activity.related_type && activity.related_id && (
            <RelatedLink type={activity.related_type} id={activity.related_id}>
              Abrir {RELATED_LABEL[activity.related_type] ?? "origem"}
            </RelatedLink>
          )}
          {canWrite && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={onEdit}>Editar</Button>
              {activity.status !== "concluida" && (
                <StatusButton activity={activity} status="concluida" label="Concluir" />
              )}
              {activity.status !== "aberta" && (
                <StatusButton activity={activity} status="aberta" label="Reabrir" />
              )}
              {activity.status !== "cancelada" && (
                <StatusButton activity={activity} status="cancelada" label="Cancelar" />
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
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
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
