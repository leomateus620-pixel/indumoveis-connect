import type { ReactNode } from "react";
import { useMe, type Me } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { BootScreen } from "./BootScreen";
import { useSignOut } from "./session";

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-workspace p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-display text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/**
 * Estados de conta comuns ao portal e ao layout operacional: carregando perfil,
 * falha de consulta e conta sem perfil. Só renderiza `children` com perfil liberado.
 */
export function AccessGate({
  userId,
  children,
}: {
  userId: string;
  children: (me: Me) => ReactNode;
}) {
  const { data: me, isLoading, refetch, isRefetching } = useMe(userId);
  const signOut = useSignOut();

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
  return <>{children(me)}</>;
}
