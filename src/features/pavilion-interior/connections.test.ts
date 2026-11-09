import { describe, expect, it } from "vitest";
import { pavilionDestination, pavilionDestinationHref } from "./connections";
import { PAVILION_13_PLAN } from "./pavilion13";
import { PAVILION_PRESENTATIONS } from "./presentation";

describe("Pavilhão 13 lateral connections", () => {
  it("attaches P3 on the left and P8 on the right, with a working exterior destination", () => {
    const plan = PAVILION_13_PLAN;
    const center = (plan.bounds.minX + plan.bounds.maxX) / 2;
    const links = PAVILION_PRESENTATIONS[13].connections?.map((connection) => {
      const passage = plan.architecture.find((element) => element.id === connection.elementId);
      expect(passage?.labelAt, connection.elementId).toBeDefined();
      return {
        side: passage!.labelAt![0] < center ? "left" : "right",
        href: pavilionDestinationHref(connection.destination),
      };
    });
    expect(links).toEqual([
      { side: "left", href: "/mapa?pavilhao=3" },
      { side: "right", href: "/mapa?pavilhao=8" },
    ]);
  });

  it("opens registered interiors through their dedicated routes", () => {
    expect(pavilionDestination(1)).toEqual({ to: "/mapa/pavilhoes/1/interior" });
    expect(pavilionDestination(13)).toEqual({ to: "/mapa/pavilhoes/13/interior" });
  });
});
