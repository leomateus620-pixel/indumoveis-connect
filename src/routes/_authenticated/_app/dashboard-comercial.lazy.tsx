import { createLazyFileRoute } from "@tanstack/react-router";
import { CommercialDashboard } from "@/features/commercial-dashboard/CommercialDashboard";

export const Route = createLazyFileRoute("/_authenticated/_app/dashboard-comercial")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CommercialDashboard
      search={search}
      onSearch={(patch, replace) => {
        void navigate({
          to: ".",
          search: (current) => ({ ...current, ...patch }),
          resetScroll: false,
          replace,
        });
      }}
    />
  );
}
