import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { BootScreen } from "@/components/app/BootScreen";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, context }) => {
    // Server-verified user cached so menu clicks don't wait on the network;
    // the root auth listener clears/invalidates it on sign-in/out changes.
    const user = await context.queryClient
      .ensureQueryData({
        queryKey: ["auth", "user"],
        queryFn: async () => {
          const { data, error } = await supabase.auth.getUser();
          return error ? null : data.user;
        },
        staleTime: 5 * 60_000,
      })
      .catch(() => null);
    if (!user) {
      context.queryClient.removeQueries({ queryKey: ["auth", "user"] });
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user };
  },
  pendingComponent: () => <BootScreen />,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  return <AppShell userId={user.id} />;
}
