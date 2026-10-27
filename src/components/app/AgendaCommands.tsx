/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ListTree,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FormRow, NativeSelect } from "./ui";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  activeAgendaCriteria,
  clearedAgendaCriteria,
  type AgendaSearch,
  type AgendaView,
} from "@/lib/agenda-search";

type Props = {
  search: AgendaSearch;
  view: AgendaView;
  onChange: (patch: Partial<AgendaSearch>) => void;
  categories: any[];
  commissions: any[];
  people: any[];
  count: number;
  canWrite: boolean;
  onCatalog: () => void;
};

export function AgendaCommands(props: Props) {
  const { search, view, onChange } = props;
  const mobile = useIsMobile();
  const searchField = (
    <div className="agenda-search">
      <Search aria-hidden className="size-4" />
      <Input
        type="search"
        aria-label="Buscar na Agenda"
        placeholder="Buscar atividade, pessoa, local…"
        value={search.q ?? ""}
        onChange={(e) => onChange({ q: e.target.value || undefined })}
      />
      {search.q && (
        <button type="button" aria-label="Limpar busca" onClick={() => onChange({ q: undefined })}>
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
  return (
    <div className="agenda-commands">
      <div className="agenda-view-switch" role="group" aria-label="Visualização da Agenda">
        {(
          [
            { value: "timeline", label: "Linha do tempo", icon: ListTree },
            { value: "panel", label: "Painel", icon: BarChart3 },
            { value: "calendar", label: "Calendário", icon: CalendarDays },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <CommandTip key={value} label={label}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
              aria-pressed={view === value}
              onClick={() => onChange({ view: value })}
            >
              <Icon className="size-4" aria-hidden />
            </Button>
          </CommandTip>
        ))}
      </div>
      {mobile ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={search.q ? `Pesquisa ativa: ${search.q}` : "Buscar na Agenda"}
              data-active={!!search.q}
            >
              <Search className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="agenda-search-panel" align="start">
            {searchField}
          </PopoverContent>
        </Popover>
      ) : (
        searchField
      )}
      <AgendaFilters {...props} />
      {props.canWrite && (
        <CommandTip label="Configurar categorias e comissões">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Configurar categorias e comissões"
            onClick={props.onCatalog}
          >
            <Settings2 className="size-4" aria-hidden />
          </Button>
        </CommandTip>
      )}
    </div>
  );
}

function CommandTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function AgendaFilters({ search, onChange, categories, commissions, people, count }: Props) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const active = activeAgendaCriteria(search);
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="agenda-filter-trigger"
      aria-label={`Filtros${active ? `: ${active} critérios ativos` : " da Agenda"}`}
      data-active={active > 0}
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      {active > 0 && <span className="agenda-filter-count">{active}</span>}
    </Button>
  );
  const criteria = [
    search.q && `Busca: ${search.q}`,
    search.status &&
      search.status !== "todas" &&
      ({
        minhas: "Minhas atividades",
        aberta: "Abertas",
        concluida: "Concluídas",
        cancelada: "Canceladas",
      }[search.status] ??
        search.status),
    categories.find((row) => row.id === search.category)?.name,
    commissions.find((row) => row.id === search.commission)?.name,
    search.status !== "minhas" && people.find((row) => row.id === search.assignee)?.full_name,
  ].filter(Boolean);
  const fields = (
    <>
      <div className="agenda-filter-summary">
        <span role="status">
          {count} {count === 1 ? "resultado" : "resultados"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!active}
          onClick={() => onChange(clearedAgendaCriteria)}
        >
          Limpar filtros
        </Button>
      </div>
      <div className="agenda-filter-fields">
        <FormRow label="Situação" htmlFor="agenda-filter-status">
          <NativeSelect
            id="agenda-filter-status"
            value={search.status ?? "todas"}
            onChange={(e) =>
              onChange({ status: e.target.value === "todas" ? undefined : e.target.value })
            }
          >
            <option value="todas">Todas as situações</option>
            <option value="aberta">Abertas</option>
            <option value="minhas">Minhas atividades</option>
            <option value="concluida">Concluídas</option>
            <option value="cancelada">Canceladas</option>
          </NativeSelect>
        </FormRow>
        <FormRow label="Categoria" htmlFor="agenda-filter-category">
          <NativeSelect
            id="agenda-filter-category"
            value={search.category ?? ""}
            onChange={(e) => onChange({ category: e.target.value || undefined })}
          >
            <option value="">Todas as categorias</option>
            {categories.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </NativeSelect>
        </FormRow>
        <FormRow label="Comissão" htmlFor="agenda-filter-commission">
          <NativeSelect
            id="agenda-filter-commission"
            value={search.commission ?? ""}
            onChange={(e) => onChange({ commission: e.target.value || undefined })}
          >
            <option value="">Todas as comissões</option>
            {commissions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </NativeSelect>
        </FormRow>
        <FormRow label="Responsável" htmlFor="agenda-filter-assignee">
          <NativeSelect
            id="agenda-filter-assignee"
            disabled={search.status === "minhas"}
            value={search.status === "minhas" ? "" : (search.assignee ?? "")}
            onChange={(e) => onChange({ assignee: e.target.value || undefined })}
          >
            <option value="">
              {search.status === "minhas" ? "Atribuídas a você" : "Todos os responsáveis"}
            </option>
            {people.map((row) => (
              <option key={row.id} value={row.id}>
                {row.full_name || row.email}
              </option>
            ))}
          </NativeSelect>
        </FormRow>
      </div>
      {criteria.length > 0 && (
        <div className="agenda-selected-criteria" aria-label="Critérios selecionados">
          {criteria.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      )}
      <p className="agenda-filter-hint">
        {search.status === "minhas"
          ? "Minhas atividades considera sua atribuição direta, inclusive como responsável adicional."
          : "Os critérios são mantidos ao trocar a visualização."}
      </p>
    </>
  );
  if (mobile)
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="agenda-filter-sheet">
          <SheetHeader>
            <SheetTitle>Filtros da Agenda</SheetTitle>
            <SheetDescription>Refine os eventos do período em foco.</SheetDescription>
          </SheetHeader>
          {fields}
          <Button type="button" className="mt-5 w-full" onClick={() => setOpen(false)}>
            Ver {count} resultados
          </Button>
        </SheetContent>
      </Sheet>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="agenda-filter-panel" align="center" sideOffset={10}>
        <h2>Filtros da Agenda</h2>
        {fields}
      </PopoverContent>
    </Popover>
  );
}
