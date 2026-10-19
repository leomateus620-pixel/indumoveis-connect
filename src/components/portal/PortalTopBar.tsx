import { ChevronDown, LogOut, Menu } from "lucide-react";
import type { Me } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function PortalTopBar({
  me,
  onOpenMenu,
  onSignOut,
}: {
  me: Me;
  onOpenMenu: () => void;
  onSignOut: () => void;
}) {
  const display = me.name || me.email || "Conta";
  const roles = me.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ");
  return (
    <header className="portal-topbar">
      <div className="portal-wrap portal-topbar__row">
        <button
          type="button"
          className="portal-icon-button"
          aria-label="Abrir navegação"
          onClick={onOpenMenu}
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <p className="portal-topbar__brand">
          <span>Portal</span>
          <small>Sistema Indumóveis</small>
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger className="portal-account" aria-label={`Conta: ${display}`}>
            <span className="portal-account__avatar" aria-hidden="true">
              {initials(display)}
            </span>
            <span className="portal-account__name hidden sm:inline">{display}</span>
            <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 motion-reduce:animate-none motion-reduce:transition-none"
          >
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-semibold">{display}</p>
              {me.email && me.email !== display && (
                <p className="truncate text-xs text-muted-foreground">{me.email}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {roles || "Sem perfil atribuído"}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={onSignOut}>
              <LogOut className="size-4" aria-hidden="true" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
