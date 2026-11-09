import { describe, expect, it } from "vitest";
import {
  PAVILION_PRESENTATIONS,
  interiorPavilionNumber,
  normalizedLotCode,
  validatePavilion8Search,
  validatePavilion13Search,
} from "./presentation";

describe("pavilion-specific presentation and P13 URL", () => {
  it("preserves Mostra data display while giving Salão a separate identity and no area presentation", () => {
    expect(PAVILION_PRESENTATIONS[1]).toMatchObject({
      title: "Mostra ARQ & Design",
      showAreas: true,
      mode: "environments",
      commercialCount: 14,
    });
    expect(PAVILION_PRESENTATIONS[13]).toMatchObject({
      title: "Salão de Imóveis",
      brandAlt: "Salão de IMÓVEIS",
      showAreas: false,
      mode: "lots",
      commercialCount: 80,
    });
    expect(PAVILION_PRESENTATIONS[13].brandPath).not.toBe(PAVILION_PRESENTATIONS[1].brandPath);
  });

  it.each([
    [1, 1],
    ["1", 1],
    [8, 8],
    ["8", 8],
    [13, 13],
    ["13", 13],
  ])("identifies supported pavilion %s", (value, expected) => {
    expect(interiorPavilionNumber(value)).toBe(expected);
  });
  it.each([0, 14, "14", "01", "13<script>", null, {}, [13]])(
    "rejects unsupported pavilion %j",
    (value) => {
      expect(interiorPavilionNumber(value)).toBeUndefined();
    },
  );

  it.each([
    ["01", "01"],
    ["1", "01"],
    [1, "01"],
    ["09", "09"],
    [9, "09"],
    ["18", "18"],
    ["35", "35"],
    ["63", "63"],
    ["66", "66"],
    ["70", "70"],
    ["80", "80"],
    [80, "80"],
    [" 35 ", "35"],
  ])("normalizes a typed or direct URL lot %j to %s", (value, code) => {
    expect(normalizedLotCode(value)).toBe(code);
    expect(validatePavilion13Search({ lote: value, espaco: "09", zoom: 2, x: 50 })).toEqual({
      lote: code,
    });
  });
  it.each([
    "00",
    0,
    "81",
    81,
    "800",
    "1.5",
    1.5,
    -1,
    "01/04",
    "salon",
    "salao",
    "1<script>",
    ["01"],
    {},
    null,
    undefined,
    NaN,
    Infinity,
  ])("rejects an invalid lot %j without accepting presentation or movement parameters", (value) => {
    expect(
      validatePavilion13Search({ lote: value, espaco: "salon", pavilhao: 1, zoom: 4 }),
    ).toEqual({ lote: undefined });
  });

  it("validates only the seven documented P8 lot codes", () => {
    for (const lot of ["01", "03", "04", "05", "06", "07", "08"]) {
      expect(validatePavilion8Search({ lote: lot })).toEqual({ lote: lot });
    }
    expect(validatePavilion8Search({ lote: 7 })).toEqual({ lote: "07" });
    for (const lote of ["02", 2, "09", "13", ["07"], "07/08"]) {
      expect(validatePavilion8Search({ lote, zoom: 2 })).toEqual({ lote: undefined });
    }
  });
});
