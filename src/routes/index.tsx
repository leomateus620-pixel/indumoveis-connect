import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sistema Indumóveis" },
      { name: "description", content: "Acesso ao sistema de gestão da feira Indumóveis." },
      { property: "og:title", content: "Sistema Indumóveis" },
      { property: "og:description", content: "Acesso ao sistema de gestão da feira Indumóveis." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
