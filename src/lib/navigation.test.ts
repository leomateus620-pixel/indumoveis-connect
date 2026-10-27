import { describe, expect, it } from "vitest";
import {
  NAV_CATEGORIES,
  NAV_DESTINATIONS,
  destinationName,
  matchDestination,
  visibleCategories,
} from "./navigation";

const perms = (...modules: string[]) =>
  Object.fromEntries(modules.map((m) => [m, { read: true, write: false }]));

describe("navigation registry", () => {
  it("groups the ten existing modules in six categories without changing routes", () => {
    expect(NAV_CATEGORIES.map((c) => c.title)).toEqual([
      "Agenda",
      "Mapa Comercial",
      "Empresas / Expositores",
      "Financeiro",
      "Vistorias",
      "Administração",
    ]);
    expect(NAV_DESTINATIONS.map((d) => d.to).sort()).toEqual(
      [
        "/admin",
        "/agenda",
        "/comercializacao",
        "/contratos",
        "/dashboard",
        "/documentos",
        "/empresas",
        "/financeiro",
        "/mapa",
        "/vistorias",
      ].sort(),
    );
  });

  it("matches detail routes to their module and never the portal", () => {
    expect(matchDestination("/empresas/abc-1")?.module).toBe("empresas");
    expect(matchDestination("/contratos")?.module).toBe("contratos");
    expect(matchDestination("/")).toBeUndefined();
    expect(matchDestination("/portal")).toBeUndefined();
    expect(destinationName("/portal")).toBe("Portal");
    expect(destinationName("/vistorias/abc")).toBe("Vistorias");
    expect(matchDestination("/mapas")).toBeUndefined();
  });

  it("identifies Agenda consistently while preserving its route and permission", () => {
    expect(matchDestination("/agenda")).toMatchObject({
      to: "/agenda",
      module: "agenda",
      label: "Agenda Indumóveis",
      title: "Agenda Indumóveis",
    });
  });

  it("keeps every destination behind its own permission", () => {
    const v = visibleCategories(perms("documentos", "comercial"));
    expect(v.map((c) => c.category.id)).toEqual(["mapa", "administracao"]);
    expect(v[0].destinations.map((d) => d.to)).toEqual(["/comercializacao"]);
    expect(v[1].destinations.map((d) => d.to)).toEqual(["/documentos"]);
  });

  it("does not require admin to reveal the Administração group", () => {
    const v = visibleCategories(perms("dashboard"));
    expect(v).toHaveLength(1);
    expect(v[0].destinations.map((d) => d.module)).toEqual(["dashboard"]);
    expect(visibleCategories(undefined)).toEqual([]);
  });
});
