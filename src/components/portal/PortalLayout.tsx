import { AccessGate } from "@/components/app/AccessGate";
import { NavigationProgress } from "@/components/app/NavigationProgress";
import { useSignOut } from "@/components/app/session";
import { useEdition, type Me } from "@/lib/api";
import { EditionCountdown } from "./EditionCountdown";
import { PortalTopBar } from "./PortalTopBar";
import { PortalHero } from "./PortalHero";
import { PortalPage } from "./PortalPage";
import "./portal.css";

/** A edição alimenta a composição; o relógio local fica isolado no contador. */
function PortalStage({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const edition = useEdition();
  return (
    <div className="portal-stage">
      <div className="portal-wrap">
        <div className="portal-stage__grid">
          <PortalHero year={edition.data?.year} />
          <PortalTopBar me={me} onSignOut={onSignOut} />
          <EditionCountdown
            edition={edition.data}
            isLoading={edition.isLoading}
            isError={edition.isError && !edition.data}
            onRetry={edition.refetch}
            canConfigure={!!me.perms?.admin?.write}
          />
        </div>
      </div>
    </div>
  );
}

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
          <PortalStage me={me} onSignOut={signOut} />
          <main id="conteudo" tabIndex={-1} className="portal-main" aria-labelledby="portal-title">
            <PortalPage me={me} />
          </main>
        </div>
      )}
    </AccessGate>
  );
}
