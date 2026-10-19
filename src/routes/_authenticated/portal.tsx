import { createFileRoute } from "@tanstack/react-router";
import { PortalLayout } from "@/components/portal/PortalLayout";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({
    meta: [
      { title: "Portal — Sistema Indumóveis" },
      { name: "description", content: "Entrada do sistema de gestão da feira Indumóveis." },
      { property: "og:title", content: "Portal — Sistema Indumóveis" },
      { property: "og:description", content: "Entrada do sistema de gestão da feira Indumóveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalRoute,
});

function PortalRoute() {
  const { user } = Route.useRouteContext();
  return <PortalLayout userId={user.id} />;
}
