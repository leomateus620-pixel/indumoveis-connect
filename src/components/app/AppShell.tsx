import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3, MapPin, Handshake, Users, FileText, ClipboardCheck, Coins, CalendarDays, Folder, Settings,
  LogOut, Menu, PanelLeftClose, PanelLeftOpen, UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useEdition } from "@/lib/api";
import { ROLE_LABEL, fmtDate } from "@/lib/format";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loading } from "./ui";
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

function SidebarBody({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useMe();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center px-5 pt-6 pb-5", compact && "justify-center px-2")}>
        {compact ? <img src={markLight.url} alt="Indumóveis 2027" className="h-9 w-auto" /> : <img src={logoLight.url} alt="Indumóveis 2027" className="h-auto w-48" />}
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
                  "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.94rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                  active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60",
                  !allowed && "opacity-55",
                  compact && "justify-center px-0",
                )}
              >
                {active && <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-sidebar-primary" aria-hidden />}
                <item.icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 1.9} />
                {!compact && <span className="truncate">{item.label}</span>}
              </Link>
            );
            return compact ? (
              <Tooltip key={item.to}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip>
            ) : <div key={item.to}>{link}</div>;
          })}
        </nav>
      </TooltipProvider>
      <div className={cn("m-3 flex items-center gap-3 border-t border-sidebar-border pt-3", compact && "flex-col")}>
        <UserCircle2 className="size-9 shrink-0 text-sidebar-foreground/80" />
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{me?.name || me?.email || "—"}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{me?.roles.length ? me.roles.map((r) => ROLE_LABEL[r]).join(", ") : "Sem perfil atribuído"}</p>
          </div>
        )}
        <button type="button" aria-label="Sair" onClick={() => supabase.auth.signOut()} className="rounded-md p-2 hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring">
          <LogOut className="size-5" />
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const { data: me, isLoading } = useMe();
  const { data: edition } = useEdition();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => path === n.to || path.startsWith(n.to + "/"));

  useEffect(() => { setCompact(localStorage.getItem("sidebar-compact") === "1"); }, []);
  const toggle = () => { setCompact((c) => { localStorage.setItem("sidebar-compact", c ? "0" : "1"); return !c; }); };

  return (
    <div className="flex min-h-screen w-full">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 transition-[width] md:block", compact ? "w-[4.5rem]" : "w-64")}>
        <SidebarBody compact={compact} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-none p-0">
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <SidebarBody compact={false} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center gap-2 border-b bg-card px-2 text-sm md:px-4">
          <button type="button" className="rounded-md p-2 hover:bg-accent md:hidden" aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          <button type="button" className="hidden rounded-md p-2 hover:bg-accent md:block" aria-label={compact ? "Expandir menu" : "Recolher menu"} onClick={toggle}>
            {compact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <span className="font-semibold md:hidden">{current?.label}</span>
          <span className="ml-auto truncate text-xs text-muted-foreground tnum">
            {edition ? <><span className="font-semibold text-foreground">{edition.name}</span> · {fmtDate(edition.starts_on)} a {fmtDate(edition.ends_on)}</> : "Nenhuma edição configurada"}
          </span>
        </div>
        <main className="min-w-0 flex-1">
          {isLoading ? <Loading /> : me && me.roles.length === 0 ? (
            <div className="m-8 max-w-lg rounded-lg border bg-card p-6">
              <h1 className="text-xl font-extrabold">Acesso aguardando liberação</h1>
              <p className="mt-2 text-sm text-muted-foreground">Sua conta ({me.email}) foi criada, mas ainda não possui perfil. Peça à administração para atribuir um perfil em Administração › Usuários.</p>
            </div>
          ) : <Outlet />}
        </main>
      </div>
    </div>
  );
}
