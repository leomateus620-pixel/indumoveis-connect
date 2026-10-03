/* eslint-disable @typescript-eslint/no-explicit-any */
import { type ReactNode, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileUp, Loader2, Lock, Paperclip, Search, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fmtDate, DOC_CATEGORIES, errMsg } from "@/lib/format";
import {
  signedUrl,
  uploadDocument,
  useEntityDocuments,
  useEditionId,
  useDbMutation,
} from "@/lib/api";
import { toast } from "sonner";

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-b bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-4 pt-5 pb-3 md:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold text-foreground md:text-[1.75rem]">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      </div>
      {children && <div className="px-4 md:px-8">{children}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  warn: "bg-warning-soft text-warning",
  ok: "bg-success-soft text-success",
  danger: "bg-danger-soft text-destructive",
  brand: "bg-plum-soft text-primary",
};
export function StatusBadge({
  map,
  value,
}: {
  map: Record<string, { label: string; tone: string }>;
  value: string;
}) {
  const s = map[value] ?? { label: value, tone: "neutral" };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        TONES[s.tone],
      )}
    >
      {s.label}
    </span>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Buscar"}
        className="pl-8"
        aria-label={placeholder ?? "Buscar"}
      />
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center md:px-8">
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-4 my-6 rounded-lg border border-dashed bg-card px-6 py-10 text-center md:mx-8">
      <p className="font-display text-base font-bold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pending({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-brand-red bg-card p-4 text-sm shadow-xs">
      <p className="font-semibold">{title}</p>
      <div className="mt-1 text-muted-foreground">{children}</div>
    </div>
  );
}

export function Restricted({ text }: { text?: string }) {
  return (
    <div className="m-8 flex items-start gap-3 rounded-lg border bg-card p-5 text-sm">
      <Lock className="mt-0.5 size-4 text-muted-foreground" />
      <div>
        <p className="font-semibold">Acesso restrito</p>
        <p className="text-muted-foreground">
          {text ??
            "Seu perfil não tem permissão para este módulo. Solicite acesso à administração."}
        </p>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center gap-2 px-8 py-10 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" /> Carregando…
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="m-8 rounded-lg border border-destructive/30 bg-danger-soft p-4 text-sm text-destructive"
    >
      Não foi possível carregar: {errMsg(error)}
    </div>
  );
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children ?? "—"}</dd>
    </div>
  );
}

/** Tabela no desktop, cartões empilhados no celular. */
export function DataList<T>({
  rows,
  columns,
  onRowClick,
  rowKey,
  selectedKey,
}: {
  rows: T[];
  columns: { header: string; cell: (r: T) => ReactNode; className?: string; mobile?: boolean }[];
  onRowClick?: (r: T) => void;
  rowKey: (r: T) => string;
  selectedKey?: string;
}) {
  return (
    <div className="px-4 pb-8 md:px-8">
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.header} className={cn("px-3 py-2.5", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={() => onRowClick?.(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRowClick?.(r);
                }}
                className={cn(
                  "border-t focus-visible:outline-2 focus-visible:outline-ring",
                  onRowClick && "cursor-pointer hover:bg-accent/60",
                  selectedKey === rowKey(r) && "bg-accent",
                )}
              >
                {columns.map((c) => (
                  <td key={c.header} className={cn("px-3 py-2.5 align-middle", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)}>
            <button
              type="button"
              onClick={() => onRowClick?.(r)}
              className="w-full rounded-lg border bg-card p-3 text-left"
            >
              {columns
                .filter((c) => c.mobile !== false)
                .map((c, i) => (
                  <div
                    key={c.header}
                    className={cn(
                      "flex items-center justify-between gap-3 text-sm",
                      i > 0 && "mt-1",
                    )}
                  >
                    {i > 0 && <span className="text-xs text-muted-foreground">{c.header}</span>}
                    <span className={cn(i === 0 && "font-semibold")}>{c.cell(r)}</span>
                  </div>
                ))}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  to,
  search,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  to?: string;
  search?: any;
}) {
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tnum mt-1 font-display text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = "block rounded-lg border bg-card p-4 transition-colors";
  return to ? (
    <Link
      to={to as any}
      search={search}
      className={cn(cls, "hover:border-primary/40 hover:bg-accent/40")}
    >
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Lista de documentos vinculados a um registro + anexar. Usa o mesmo arquivo da central. */
export function AttachedDocuments({
  entityType,
  entityId,
  category,
  canWrite,
  extraLinks = [],
}: {
  entityType: string;
  entityId: string;
  category: string;
  canWrite: boolean;
  extraLinks?: { type: string; id: string }[];
}) {
  const { data: docs = [], isLoading } = useEntityDocuments(entityType, entityId);
  const edition = useEditionId();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const m = useDbMutation(
    (file: File) =>
      uploadDocument({
        file,
        category,
        editionId: edition,
        links: [{ type: entityType, id: entityId }, ...extraLinks],
      }),
    { success: "Arquivo anexado" },
  );
  return (
    <div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum arquivo vinculado.</p>
      ) : (
        <ul className="divide-y text-sm">
          {docs.map((d: any) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{d.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  v{d.version} · {DOC_CATEGORIES[d.category] ?? d.category} ·{" "}
                  {fmtDate(d.created_at)}
                </span>
              </div>
              <OpenDoc path={d.storage_path} />
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <>
          <input
            ref={ref}
            type="file"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                await m.mutateAsync(f);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={busy}
            onClick={() => ref.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}{" "}
            Anexar arquivo
          </Button>
        </>
      )}
    </div>
  );
}

export function OpenDoc({ path }: { path: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Abrir arquivo"
      onClick={async () => {
        try {
          window.open(await signedUrl(path), "_blank", "noopener");
        } catch (e) {
          toast.error(errMsg(e));
        }
      }}
    >
      <ExternalLink className="size-4" />
    </Button>
  );
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring",
        props.className,
      )}
    />
  );
}

export function FormRow({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
