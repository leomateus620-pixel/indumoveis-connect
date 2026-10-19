import { LogOut } from "lucide-react";
import type { Me } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function PortalTopBar({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const display = me.name || me.email || "Conta";
  const roles = me.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ");
  return (
    <header className="portal-topbar">
      <div className="portal-wrap portal-topbar__row">
        <p className="portal-topbar__brand">Sistema Indumóveis</p>
        <div className="portal-account" role="group" aria-label="Conta conectada">
          <span className="portal-account__avatar" aria-hidden="true">
            {initials(display)}
          </span>
          <span className="portal-account__copy">
            <span className="portal-account__name">{display}</span>
            {roles && <span className="portal-account__role">{roles}</span>}
          </span>
        </div>
        <button type="button" className="portal-signout" onClick={onSignOut}>
          <LogOut aria-hidden="true" />
          <span>Sair</span>
        </button>
      </div>
    </header>
  );
}
