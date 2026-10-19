import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_app/vistorias")({
  component: () => <Outlet />,
});
