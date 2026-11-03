import { afterEach, describe, expect, it, vi } from "vitest";
import { readQualityPreference, writeQualityPreference } from "./qualityPreference";

describe("map quality preference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("restores a valid manual or automatic choice and ignores invalid stored values", () => {
    expect(readQualityPreference()).toBe("auto");
    writeQualityPreference("detailed");
    expect(readQualityPreference()).toBe("detailed");
    localStorage.setItem("indumoveis:map-quality", "unknown");
    expect(readQualityPreference()).toBe("auto");
  });

  it("keeps automatic usable when browser storage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readQualityPreference()).toBe("auto");
    expect(() => writeQualityPreference("light")).not.toThrow();
  });
});
