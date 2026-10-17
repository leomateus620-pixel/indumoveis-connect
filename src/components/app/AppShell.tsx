import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  MapPin,
  Handshake,
  Users,
  FileText,
  ClipboardCheck,
  Coins,
  CalendarDays,
  Folder,
  Settings,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useEdition } from "@/lib/api";
import { ROLE_LABEL, fmtDate } from "@/lib/format";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loading } from "./ui";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import logoLight from "@/assets/logo-light.png.asset.json";
import markLight from "@/assets/mark-light.png.asset.json";

export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, module: "dashboard" },
  { to: "/mapa", label: "Mapa Comercial", icon: MapPin, module: "mapa" },
  { to: "/comercializacao", label: "Comercialização", icon: Handshake, module: "comercial" },
  { to: "/empresas", label: "Empresas / Expositores", icon: Users, module: "empresas" },
  { to: "/contratos", label: "Contratos", icon: FileText, module: "contratos" },
  { to: "/vistorias", label: "Vistorias", icon: ClipboardCheck, module: "vistorias" },
  { to: "/financeiro", label: "Financeiro Operacional", icon: Coins, module: "financeiro" },
  { to: "/agenda", label: "Agenda / Atividades", icon: CalendarDays, module: "agenda" },
  { to: "/documentos", label: "Documentos", icon: Folder, module: "documentos" },
  { to: "/admin", label: "Administração", icon: Settings, module: "admin" },
] as const;

function SidebarBody({
  compact,
  userId,
  onNavigate,
}: {
  compact: boolean;
  userId: string;
  onNavigate?: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useMe(userId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    queryClient.setQueryData(["auth", "session"], null);
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center px-5 pt-6 pb-5", compact && "justify-center px-2")}>
        {compact ? (
          <img src={markLight.url} alt="Indumóveis 2027" className="h-9 w-auto" />
        ) : (
          <img src={logoLight.url} alt="Indumóveis 2027" className="h-auto w-48" />
        )}
      </div>
      <TooltipProvider delayDuration={150}>
        <nav aria-label="Módulos" className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map((item) => {
            const active = path === item.to || path.startsWith(item.to + "/");
            const allowed = me?.perms[item.module]?.read;
            const link = (
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                  active
                    ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60",
                  !allowed && "opacity-55",
                  compact && "justify-center px-0",
                )}
              >
                {active && (
                  <span
                    className="absolute inset-y-1 left-0 w-1 rounded-r bg-sidebar-primary"
                    aria-hidden
                  />
                )}
                <item.icon className="size-[1.15rem] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                {!compact && <span className="truncate">{item.label}</span>}
              </Link>
            );
            return compact ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.to}>{link}</div>
            );
          })}
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
            <p className="truncate text-sm font-semibold">{me?.name || me?.email || "—"}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">
              {me?.roles.length
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
          onClick={signOut}
          className="hover:bg-sidebar-accent"
        >
          <LogOut className="size-5" />
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ userId }: { userId: string }) {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const { data: me, isLoading, isError, refetch } = useMe(userId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => path === n.to || path.startsWith(n.to + "/"));
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    queryClient.setQueryData(["auth", "session"], null);
    navigate({ to: "/auth", replace: true });
  }

  useEffect(() => {
    setCompact(localStorage.getItem("sidebar-compact") === "1");
  }, []);
  const toggle = () => {
    setCompact((c) => {
      localStorage.setItem("sidebar-compact", c ? "0" : "1");
      return !c;
    });
  };

  if (isLoading || (!me && !isError))
    return (
      <div className="min-h-screen">
        <Loading />
      </div>
    );
  if (isError || !me || me.id !== userId)
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-display text-xl font-bold">Não foi possível consultar seu acesso</h1>
          <p className="text-muted-foreground">
            Sua sessão continua ativa. Tente novamente ou saia da conta.
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => refetch()}>Tentar novamente</Button>
            <Button variant="outline" onClick={signOut}>
              Sair
            </Button>
          </div>
        </div>
      </main>
    );
  if (me.roles.length === 0)
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-display text-xl font-bold">Acesso aguardando liberação</h1>
          <p className="text-muted-foreground">
            Sua conta ({me.email}) ainda não possui perfil. Solicite à administração a liberação do
            acesso.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => refetch()}>
              Verificar acesso
            </Button>
            <Button onClick={signOut}>Sair</Button>
          </div>
        </div>
      </main>
    );
  if (!current || !me.perms[current.module]?.read)
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-display text-xl font-bold">Acesso não permitido</h1>
          <p className="text-muted-foreground">Seu perfil não permite consultar este módulo.</p>
          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link to={NAV.find((n) => me.perms[n.module]?.read)?.to ?? "/auth"}>
                Ir ao início
              </Link>
            </Button>
            <Button variant="outline" onClick={signOut}>
              Sair
            </Button>
          </div>
        </div>
      </main>
    );
  return (
    <AuthorizedShell
      compact={compact}
      open={open}
      setOpen={setOpen}
      userId={userId}
      current={current}
      toggle={toggle}
    />
  );
}

function AuthorizedShell({
  compact,
  open,
  setOpen,
  userId,
  current,
  toggle,
}: {
  compact: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  userId: string;
  current: (typeof NAV)[number];
  toggle: () => void;
}) {
  const { data: edition } = useEdition();
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const pathKey = current.to;
  useEffect(() => {
    // Warm the 3D map chunk in idle time so opening the map is instant.
    const run = () => void import("@/features/commercial-map/MapRenderer").catch(() => {});
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run);
    else setTimeout(run, 2000);
  }, []);
  return (
    <div className="internal-app flex min-h-dvh w-full bg-workspace">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 transition-[width] motion-reduce:transition-none md:block",
          compact ? "w-[4.5rem]" : "w-64",
        )}
      >
        <SidebarBody compact={compact} userId={userId} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[min(19rem,88vw)] overflow-y-auto border-none p-0">
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <SidebarBody compact={false} userId={userId} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
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
            <span className="truncate font-semibold md:hidden">{current?.label}</span>
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
          {pending && <div className="route-progress" role="progressbar" aria-label="Carregando" />}
          <div key={pathKey} className={cn("route-enter", pending && "route-pending")}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
