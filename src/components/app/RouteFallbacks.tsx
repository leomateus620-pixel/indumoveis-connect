import { useEffect } from "react";
import { Link, useRouter, useRouterState, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { destinationName, PORTAL_PATH } from "@/lib/navigation";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "./BrandLoader";

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed/i;

/** Erro de rota ou de carregamento de componente, exibido no lugar da página que falhou. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const chunk = CHUNK_ERROR.test(String((error as Error)?.message ?? error));
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_route_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6 py-12">
      <div role="alert" className="max-w-md text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-danger-soft text-destructive">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <h1 className="font-display text-xl font-bold">
          {chunk ? "Esta página foi atualizada" : "Não foi possível abrir esta página"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {chunk
            ? "Uma nova versão do sistema está disponível. Recarregue para continuar."
            : "Ocorreu uma falha ao carregar o conteúdo. Seus dados não foram alterados."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {chunk ? (
            <Button onClick={() => window.location.reload()}>Recarregar página</Button>
          ) : (
            <Button
              onClick={() => {
                reset();
                void router.invalidate();
              }}
            >
              Tentar novamente
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={PORTAL_PATH}>Voltar ao portal</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Entrada no layout operacional vinda do portal, enquanto o módulo ainda carrega:
 * antecipa a geometria do sistema (sidebar e cabeçalho) e nomeia o destino.
 */
export function ModuleOpening() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const name = destinationName(path);
  return (
    <div className="flex min-h-dvh w-full bg-workspace" aria-busy="true">
      <div className="hidden w-64 shrink-0 bg-sidebar md:block" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-12 border-b bg-card" aria-hidden="true" />
        <div className="flex flex-1 items-center justify-center p-6">
          <p role="status" className="flex items-center gap-3 font-display text-base font-semibold">
            <BrandLoader className="size-8" />
            {name ? `Abrindo ${name}` : "Abrindo módulo"}
          </p>
        </div>
      </div>
    </div>
  );
}
