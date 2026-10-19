import { AccessGate } from "@/components/app/AccessGate";
import { NavigationProgress } from "@/components/app/NavigationProgress";
import { useSignOut } from "@/components/app/session";
import { PortalTopBar } from "./PortalTopBar";
import { PortalHero } from "./PortalHero";
import { PortalPage } from "./PortalPage";
import "./portal.css";

/** Layout próprio do portal: sem sidebar nem AppShell, apenas conta e saída. */
export function PortalLayout({ userId }: { userId: string }) {
  const signOut = useSignOut();
  return (
    <AccessGate userId={userId}>
      {(me) => (
        <div className="portal">
          <a href="#conteudo" className="portal-skip sr-only focus:not-sr-only">
            Pular para o conteúdo
          </a>
          <NavigationProgress />
          <div className="portal-stage">
            <PortalTopBar me={me} onSignOut={signOut} />
            <PortalHero />
          </div>
          <main id="conteudo" tabIndex={-1} className="portal-main" aria-labelledby="portal-title">
            <PortalPage me={me} />
          </main>
        </div>
      )}
    </AccessGate>
  );
}
