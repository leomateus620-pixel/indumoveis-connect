import { Plus, Search, UserRoundPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/app/ui";
import { editionLabel, type CompanySearch } from "@/lib/company-exhibitors";
import type { Edition } from "@/lib/api";
import "./companies.css";

export function CompaniesHeader({
  editions,
  edition,
  search,
  areas,
  count,
  loading,
  canWrite,
  onChange,
  onCreate,
  onReuse,
}: {
  editions: Edition[];
  edition?: Edition;
  search: CompanySearch;
  areas: string[];
  count: number;
  loading?: boolean;
  canWrite: boolean;
  onChange: (patch: Partial<CompanySearch>) => void;
  onCreate: () => void;
  onReuse: () => void;
}) {
  return (
    <div className="companies-header">
      <div className="companies-header-top">
        <div className="companies-header-identity">
          <h1 id="companies-title" className="companies-header-title">
            <span>Empresas</span>
            <span>Expositores</span>
          </h1>
          <label className="companies-header-edition" htmlFor="companies-header-edition">
            <span>Edição</span>
            <NativeSelect
              id="companies-header-edition"
              value={edition?.id ?? ""}
              disabled={!editions.length}
              onChange={(event) =>
                onChange({ edition: event.target.value, expanded: undefined, area: undefined })
              }
            >
              {!editions.length && <option value="">Carregando…</option>}
              {!edition && !!editions.length && <option value="">Selecione</option>}
              {editions.map((item) => (
                <option key={item.id} value={item.id}>
                  {editionLabel(item)}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        {canWrite && (
          <div className="companies-header-actions">
            <Button type="button" size="sm" disabled={!edition} onClick={onCreate}>
              <Plus className="size-4" />
              Nova empresa
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!edition} onClick={onReuse}>
              <UserRoundPlus className="size-4" />
              Adicionar de outra edição
            </Button>
          </div>
        )}
      </div>
      <div className="companies-header-filters">
        <div className="companies-header-search">
          <Search className="size-4" aria-hidden />
          <Input
            type="search"
            aria-label="Buscar empresa por nome, razão social ou documento"
            placeholder="Nome, razão social ou documento"
            value={search.q ?? ""}
            onChange={(event) => onChange({ q: event.target.value || undefined })}
          />
        </div>
        <NativeSelect
          aria-label="Filtrar por área ou pavilhão"
          className="companies-header-area"
          value={search.area ?? ""}
          onChange={(event) => onChange({ area: event.target.value || undefined })}
        >
          <option value="">Todas as áreas</option>
          {areas.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </NativeSelect>
        {(search.q || search.area) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="companies-header-clear"
            aria-label="Limpar filtros"
            onClick={() => onChange({ q: undefined, area: undefined })}
          >
            <X className="size-4" />
            <span>Limpar</span>
          </Button>
        )}
        <p className="companies-header-count" role="status">
          {loading ? (
            "Carregando empresas…"
          ) : (
            <>
              <strong className="tnum">{count}</strong> {count === 1 ? "empresa" : "empresas"}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
