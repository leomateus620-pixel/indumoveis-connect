import { createFileRoute, redirect } from "@tanstack/react-router";

// A entrada do sistema é o portal; a proteção de sessão acontece em /portal.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/portal", replace: true });
  },
});
