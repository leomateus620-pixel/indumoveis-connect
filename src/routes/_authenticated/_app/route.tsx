import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ModuleOpening } from "@/components/app/RouteFallbacks";

// Layout operacional (sidebar + módulos). O portal não monta este layout.
export const Route = createFileRoute("/_authenticated/_app")({
  pendingComponent: ModuleOpening,
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  return <AppShell userId={user.id} />;
}
