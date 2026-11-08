import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readParkReturn, saveParkReturn, validCamera, type ParkReturn } from "./parkReturn";

const session: ParkReturn = {
  editionId: "edition-current",
  selectionId: "indumoveis:pavilion:1",
  camera: { kind: "3d", position: [50, 30, 20], target: [22, 0, 17] },
  view: "perspective",
  orientationFree: true,
  search: { status: "disponivel", space: "existing-space-uuid" },
};
const KEY = "indumoveis:pavilion-1:park-return:v1";
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("return from Mostra to the park", () => {
  it("roundtrips the existing external camera, selection and commercial filter context", () => {
    saveParkReturn(session);
    expect(readParkReturn("edition-current")).toEqual(session);
    const twoDimensional: ParkReturn = {
      ...session,
      view: "top",
      orientationFree: false,
      camera: { kind: "2d", x: 120, y: 57, width: 22, height: 14 },
    };
    saveParkReturn(twoDimensional);
    expect(readParkReturn("edition-current")).toEqual(twoDimensional);
  });

  it("uses no stale selection or camera when accessed directly or after changing editions", () => {
    expect(readParkReturn("edition-current")).toBeNull();
    saveParkReturn(session);
    expect(readParkReturn("another-edition")).toBeNull();
    expect(readParkReturn()).toBeNull();
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...session, selectionId: "indumoveis:pavilion:14" }),
    );
    expect(readParkReturn("edition-current")).toBeNull();
  });

  it("discards corrupt or incompatible saved context", () => {
    for (const saved of [
      "{",
      "null",
      "[]",
      JSON.stringify({ ...session, view: "orbit" }),
      JSON.stringify({ ...session, camera: { kind: "2d", x: 0, y: 0, width: 0, height: 4 } }),
    ]) {
      sessionStorage.setItem(KEY, saved);
      expect(readParkReturn("edition-current")).toBeNull();
    }
  });

  it("rejects nonfinite or degenerate camera snapshots", () => {
    for (const camera of [
      null,
      {},
      { kind: "2d", x: Infinity, y: 0, width: 5, height: 5 },
      { kind: "2d", x: 0, y: 0, width: -5, height: 5 },
      { kind: "3d", position: [1, 2], target: [0, 0, 0] },
      { kind: "3d", position: [0, 0, 0], target: [0, 0, 0] },
      { kind: "3d", position: [NaN, 5, 8], target: [0, 0, 0] },
    ])
      expect(validCamera(camera)).toBe(false);
  });

  it("leaves navigation usable if browser session storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => saveParkReturn(session)).not.toThrow();
    expect(readParkReturn("edition-current")).toBeNull();
  });
});
