import { Link, Outlet, useMatches, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEdition, type Edition, type Me } from "@/lib/api";
import { ROLE_LABEL, fmtDate } from "@/lib/format";
import {
  PORTAL_ENTRY,
  PORTAL_PATH,
  matchDestination,
  prewarmMapRenderer,
  visibleCategories,
  type NavDestination,
} from "@/lib/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AccessGate, Notice } from "./AccessGate";
import { NavigationProgress } from "./NavigationProgress";
import { useSignOut } from "./session";
import { readCompactPreference, writeCompactPreference } from "./sidebar-preference";
import { AppHeaderProvider, useAppHeaderSlot } from "./AppHeaderContext";
import logoLight from "@/assets/logo-light.png.asset.json";
import markLight from "@/assets/mark-light.png.asset.json";

function isActive(path: string, to: string) {
  return to === PORTAL_PATH ? path === to : path === to || path.startsWith(to + "/");
}

function NavItem({
  to,
  label,
  icon: Icon,
  prewarm,
  active,
  compact,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  prewarm?: () => void;
  active: boolean;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      to={to}
      onClick={onNavigate}
      onPointerDown={prewarm}
      onFocus={prewarm}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-ring",
        active
          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/60",
        compact && "justify-center px-0",
      )}
    >
      {active && (
        <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-sidebar-primary" aria-hidden />
      )}
      <Icon className="size-[1.15rem] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      {!compact && <span className="truncate">{label}</span>}
    </Link>
  );
  return compact ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ) : (
    link
  );
}

function SidebarBody({
  compact,
  me,
  onNavigate,
  onSignOut,
}: {
  compact: boolean;
  me: Me;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const groups = useMemo(() => visibleCategories(me.perms), [me.perms]);
  const item = (d: NavDestination) => (
    <NavItem
      key={d.to}
      to={d.to}
      label={d.label}
      icon={d.icon}
      prewarm={d.prewarm}
      active={isActive(path, d.to)}
      compact={compact}
      onNavigate={onNavigate}
    />
  );
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center px-5 pt-6 pb-5", compact && "justify-center px-2")}>
        <Link
          to={PORTAL_PATH}
          onClick={onNavigate}
          aria-label="Ir ao Portal Indumóveis"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sidebar-ring"
        >
          {compact ? (
            <img src={markLight.url} width={402} height={372} alt="" className="h-9 w-auto" />
          ) : (
            <img src={logoLight.url} width={1452} height={372} alt="" className="h-auto w-48" />
          )}
        </Link>
      </div>
      <TooltipProvider delayDuration={150}>
        <nav aria-label="Módulos" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
          <NavItem
            to={PORTAL_ENTRY.to}
            label={PORTAL_ENTRY.label}
            icon={PORTAL_ENTRY.icon}
            active={path === PORTAL_PATH}
            compact={compact}
            onNavigate={onNavigate}
          />
          {groups.map(({ category, destinations }) =>
            category.destinations.length > 1 ? (
              <div
                key={category.id}
                role="group"
                aria-label={category.title}
                className={cn(
                  "space-y-0.5",
                  !compact &&
                    "mb-2 border-b border-sidebar-border/60 pb-2 last:mb-0 last:border-b-0",
                )}
              >
                {compact ? (
                  <div className="mx-2 my-2 h-px bg-sidebar-border" aria-hidden />
                ) : (
                  <p
                    className="px-3 pt-4 pb-1 text-[0.6875rem] font-bold tracking-[0.08em] text-sidebar-foreground/65 uppercase"
                    aria-hidden
                  >
                    {category.title}
                  </p>
                )}
                {destinations.map(item)}
              </div>
            ) : (
              destinations.map(item)
            ),
          )}
        </nav>
      </TooltipProvider>
      <div
        className={cn(
          "m-3 flex items-center gap-3 border-t border-sidebar-border pt-3",
          compact && "flex-col",
        )}
      >
        <UserCircle2 className="size-9 shrink-0 text-sidebar-foreground/80" />
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{me.name || me.email || "—"}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">
              {me.roles.length
                ? me.roles.map((r) => ROLE_LABEL[r]).join(", ")
                : "Sem perfil atribuído"}
            </p>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Sair"
          onClick={onSignOut}
          className="hover:bg-sidebar-accent"
        >
          <LogOut className="size-5" />
        </Button>
      </div>
    </div>
  );
}

function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="sr-only z-50 rounded-md bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Pular para o conteúdo
    </a>
  );
}

export function AppShell({ userId }: { userId: string }) {
  return <AccessGate userId={userId}>{(me) => <ModuleGuard me={me} />}</AccessGate>;
}

function ModuleGuard({ me }: { me: Me }) {
  const signOut = useSignOut();
  // `location` já aponta para o destino enquanto a navegação carrega; as matches
  // confirmadas descrevem a página que está de fato na tela.
  const path = useMatches({ select: (ms) => ms[ms.length - 1]?.pathname ?? "" });
  const current = matchDestination(path);
  if (!current || !me.perms[current.module]?.read)
    return (
      <Notice title="Acesso não permitido">
        <p className="text-muted-foreground">Seu perfil não permite consultar este módulo.</p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link to={PORTAL_PATH}>Voltar ao portal</Link>
          </Button>
          <Button variant="outline" onClick={signOut}>
            Sair
          </Button>
        </div>
      </Notice>
    );
  return <AuthorizedShell me={me} current={current} onSignOut={signOut} />;
}

function useIdlePrewarm() {
  useEffect(() => {
    // Só em desktop (ponteiro fino) e quando aparelho e rede permitirem; no celular
    // o mapa 3D carrega apenas ao ser aberto.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prewarmMapRenderer, { timeout: 8000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prewarmMapRenderer, 2500);
    return () => window.clearTimeout(id);
  }, []);
}

function AuthorizedShell(props: { me: Me; current: NavDestination; onSignOut: () => void }) {
  return (
    <AppHeaderProvider>
      <AuthorizedWorkspace {...props} />
    </AppHeaderProvider>
  );
}

function AuthorizedWorkspace({
  me,
  current,
  onSignOut,
}: {
  me: Me;
  current: NavDestination;
  onSignOut: () => void;
}) {
  const [compact, setCompact] = useState(readCompactPreference);
  const [open, setOpen] = useState(false);
  const { data: edition } = useEdition();
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const closeSheet = useCallback(() => setOpen(false), []);
  useIdlePrewarm();

  const toggle = useCallback(() => {
    setCompact((c) => {
      writeCompactPreference(!c);
      return !c;
    });
  }, []);

  return (
    <div className="internal-app flex min-h-dvh w-full bg-workspace">
      <SkipLink />
      <NavigationProgress />
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 transition-[width] motion-reduce:transition-none md:block",
          compact ? "w-[4.5rem]" : "w-64",
        )}
      >
        <SidebarBody compact={compact} me={me} onSignOut={onSignOut} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[min(19rem,88vw)] overflow-y-auto border-none p-0 motion-reduce:animate-none motion-reduce:transition-none"
        >
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <SidebarBody compact={false} me={me} onNavigate={closeSheet} onSignOut={onSignOut} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellHeader
          current={current}
          compact={compact}
          edition={edition}
          onOpenMenu={() => setOpen(true)}
          onToggleMenu={toggle}
        />
        <main
          id="conteudo"
          tabIndex={-1}
          className="relative min-w-0 flex-1 outline-none"
          aria-busy={pending || undefined}
        >
          <div key={current.to} className={cn("route-enter", pending && "route-pending")}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function ShellHeader({
  current,
  compact,
  edition,
  onOpenMenu,
  onToggleMenu,
}: {
  current: NavDestination;
  compact: boolean;
  edition: Edition | null | undefined;
  onOpenMenu: () => void;
  onToggleMenu: () => void;
}) {
  const entry = useAppHeaderSlot(current.to);
  const path = useMatches({ select: (matches) => matches[matches.length - 1]?.pathname ?? "" });
  // Full page headers belong only to the list route, never to its detail pages.
  const slot = entry?.layout === "page" && path.replace(/\/$/, "") !== current.to ? null : entry;
  const menuControls = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11 md:hidden"
        aria-label="Abrir menu"
        onClick={onOpenMenu}
      >
        <Menu className="size-5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        aria-label={compact ? "Expandir menu" : "Recolher menu"}
        onClick={onToggleMenu}
      >
        {compact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </Button>
    </>
  );
  if (slot?.layout === "page")
    return (
      <header className="app-page-header relative border-b bg-card">
        <div className="app-page-header-navigation">{menuControls}</div>
        {slot.commands}
      </header>
    );
  return (
    <div
      className={cn(
        "items-center border-b bg-card px-3 text-sm md:px-6",
        slot
          ? "app-context-header flex min-h-16 flex-wrap gap-x-3 gap-y-1.5 py-2 xl:gap-x-4"
          : "grid min-h-12 grid-cols-[minmax(0,1fr)_auto] gap-2",
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-2", slot && "shrink-0")}>
        {menuControls}
        <nav aria-label="Localização" className="flex min-w-0 items-center gap-1.5">
          <Link
            to={PORTAL_PATH}
            className={cn(
              "min-h-11 items-center rounded-md px-1.5 font-medium text-muted-foreground hover:text-foreground",
              slot ? "inline-flex" : "hidden md:inline-flex",
            )}
          >
            Portal
          </Link>
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              slot ? "block" : "hidden md:block",
            )}
            aria-hidden
          />
          <span className="truncate font-semibold" aria-current="page">
            {current.title}
          </span>
        </nav>
      </div>
      {slot && (
        <div className="order-2 w-full min-w-0 xl:order-none xl:w-auto xl:flex-1">
          {slot.commands}
        </div>
      )}
      {current.to !== "/empresas" && (
        <span
          className={cn(
            "tnum min-w-0 text-right text-xs text-muted-foreground",
            slot ? "ml-auto max-w-full shrink-0" : "truncate",
          )}
        >
          {edition ? (
            <>
              <span className="font-semibold text-foreground">{edition.name}</span> ·{" "}
              {fmtDate(edition.starts_on)} a {fmtDate(edition.ends_on)}
            </>
          ) : (
            "Nenhuma edição configurada"
          )}
        </span>
      )}
    </div>
  );
}
