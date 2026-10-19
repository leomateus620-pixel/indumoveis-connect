import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
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
import { supabase } from "@/integrations/supabase/client";
import { useMe, useEdition, type Me } from "@/lib/api";
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
import { useQueryClient } from "@tanstack/react-query";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { BootScreen } from "./BootScreen";
import logoLight from "@/assets/logo-light.png.asset.json";
import markLight from "@/assets/mark-light.png.asset.json";
import "@/components/portal/portal.css";

function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    queryClient.setQueryData(["auth", "session"], null);
    navigate({ to: "/auth", replace: true });
  }, [queryClient, navigate]);
}

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
                className="space-y-0.5"
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

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-display text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function AppShell({ userId }: { userId: string }) {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const { data: me, isLoading, refetch, isRefetching } = useMe(userId);
  const signOut = useSignOut();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isPortal = path === PORTAL_PATH;
  const current = isPortal ? undefined : matchDestination(path);

  useEffect(() => {
    setCompact(localStorage.getItem("sidebar-compact") === "1");
  }, []);
  const toggle = useCallback(() => {
    setCompact((c) => {
      localStorage.setItem("sidebar-compact", c ? "0" : "1");
      return !c;
    });
  }, []);

  if (isLoading) return <BootScreen label="Carregando seu acesso" />;
  // Falha de atualização em segundo plano mantém o perfil já carregado.
  if (!me || me.id !== userId)
    return (
      <Notice title="Não foi possível consultar seu acesso">
        <p className="text-muted-foreground">
          Sua sessão continua ativa. Tente novamente ou saia da conta.
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? "Verificando…" : "Tentar novamente"}
          </Button>
          <Button variant="outline" onClick={signOut}>
            Sair
          </Button>
        </div>
      </Notice>
    );
  if (me.roles.length === 0)
    return (
      <Notice title="Acesso aguardando liberação">
        <p className="text-muted-foreground">
          Sua conta ({me.email}) ainda não possui perfil. Solicite à administração a liberação do
          acesso.
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? "Verificando…" : "Verificar acesso"}
          </Button>
          <Button onClick={signOut}>Sair</Button>
        </div>
      </Notice>
    );
  if (!isPortal && (!current || !me.perms[current.module]?.read))
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
  return (
    <AuthorizedShell
      compact={compact}
      open={open}
      setOpen={setOpen}
      me={me}
      current={current}
      toggle={toggle}
      onSignOut={signOut}
    />
  );
}

function AuthorizedShell({
  compact,
  open,
  setOpen,
  me,
  current,
  toggle,
  onSignOut,
}: {
  compact: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  me: Me;
  current: NavDestination | undefined;
  toggle: () => void;
  onSignOut: () => void;
}) {
  const { data: edition } = useEdition();
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const isPortal = !current;
  const pathKey = current?.to ?? PORTAL_PATH;
  const closeSheet = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    // Nos módulos internos o renderer 3D é aquecido em tempo ocioso; no portal,
    // só por intenção (toque/foco no acesso ao mapa) para a entrada continuar leve.
    if (isPortal) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prewarmMapRenderer);
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prewarmMapRenderer, 2000);
    return () => window.clearTimeout(id);
  }, [isPortal]);

  const sheet = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-[min(19rem,88vw)] overflow-y-auto border-none p-0">
        <SheetTitle className="sr-only">Navegação</SheetTitle>
        <SidebarBody compact={false} me={me} onNavigate={closeSheet} onSignOut={onSignOut} />
      </SheetContent>
    </Sheet>
  );
  const content = (
    <>
      {pending && <div className="route-progress" role="progressbar" aria-label="Carregando" />}
      <div key={pathKey} className={cn("route-enter", pending && "route-pending")}>
        <Outlet />
      </div>
    </>
  );

  if (isPortal)
    return (
      <div className="portal">
        {sheet}
        <PortalTopBar me={me} onOpenMenu={() => setOpen(true)} onSignOut={onSignOut} />
        <main className="portal-main relative" aria-busy={pending || undefined}>
          {content}
        </main>
      </div>
    );

  return (
    <div className="internal-app flex min-h-dvh w-full bg-workspace">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 transition-[width] motion-reduce:transition-none md:block",
          compact ? "w-[4.5rem]" : "w-64",
        )}
      >
        <SidebarBody compact={compact} me={me} onSignOut={onSignOut} />
      </aside>
      {sheet}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-card px-3 text-sm md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 md:hidden"
              aria-label="Abrir menu"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label={compact ? "Expandir menu" : "Recolher menu"}
              onClick={toggle}
            >
              {compact ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
            <nav aria-label="Localização" className="flex min-w-0 items-center gap-1.5">
              <Link
                to={PORTAL_PATH}
                className="hidden min-h-11 items-center rounded-md px-1.5 font-medium text-muted-foreground hover:text-foreground md:inline-flex"
              >
                Portal
              </Link>
              <ChevronRight
                className="hidden size-3.5 shrink-0 text-muted-foreground md:block"
                aria-hidden
              />
              <span className="truncate font-semibold" aria-current="page">
                {current?.title}
              </span>
            </nav>
          </div>
          <span className="tnum min-w-0 truncate text-right text-xs text-muted-foreground">
            {edition ? (
              <>
                <span className="font-semibold text-foreground">{edition.name}</span> ·{" "}
                {fmtDate(edition.starts_on)} a {fmtDate(edition.ends_on)}
              </>
            ) : (
              "Nenhuma edição configurada"
            )}
          </span>
        </div>
        <main className="relative min-w-0 flex-1" aria-busy={pending || undefined}>
          {content}
        </main>
      </div>
    </div>
  );
}
