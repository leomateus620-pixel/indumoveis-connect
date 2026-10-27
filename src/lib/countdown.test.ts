import { describe, expect, it } from "vitest";
import {
  countdownAt,
  formatEditionPeriod,
  formatOpeningLabel,
  formatOpeningShort,
  nextTickDelay,
  resolveOpening,
  timeZoneShortLabel,
  zonedTimeToUtc,
} from "./countdown";

const edition = {
  starts_on: "2027-05-14",
  ends_on: "2027-05-23",
  timezone: "America/Sao_Paulo",
};

describe("edition countdown", () => {
  it("stays unconfigured while only the civil start date exists", () => {
    expect(resolveOpening(edition)).toEqual({ status: "unconfigured" });
    expect(resolveOpening({ ...edition, opening_time: null })).toEqual({ status: "unconfigured" });
    expect(resolveOpening(null)).toEqual({ status: "unconfigured" });
  });

  it("converts the official civil time using the edition timezone", () => {
    expect(zonedTimeToUtc("2027-05-14", "15:00", "America/Sao_Paulo")).toBe(
      Date.UTC(2027, 4, 14, 18, 0, 0),
    );
    expect(zonedTimeToUtc("2027-05-14", "15:00:00", "Europe/Lisbon")).toBe(
      Date.UTC(2027, 4, 14, 14, 0, 0),
    );
    expect(zonedTimeToUtc("2027-02-30", "15:00", "America/Sao_Paulo")).toBeNull();
    expect(zonedTimeToUtc("2027-05-14", "15:00", "Not/AZone")).toBeNull();
  });

  it("resolves opening and the end of the last civil day", () => {
    const r = resolveOpening({ ...edition, opening_time: "15:00:00" });
    expect(r).toEqual({
      status: "configured",
      openingAt: Date.UTC(2027, 4, 14, 18),
      closingAt: Date.UTC(2027, 4, 24, 3),
      timeZone: "America/Sao_Paulo",
    });
    expect(
      resolveOpening({ ...edition, ends_on: "2027-05-01", opening_time: "15:00" }).status,
    ).toBe("invalid");
  });

  it("counts down from the clock and never goes negative", () => {
    const open = Date.UTC(2027, 4, 14, 18);
    const close = Date.UTC(2027, 4, 24, 3);
    expect(countdownAt(open - (2 * 86_400 + 3 * 3600 + 4 * 60 + 5) * 1000, open, close)).toEqual({
      phase: "countdown",
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
    expect(countdownAt(open - 400, open, close)).toMatchObject({ phase: "countdown", seconds: 1 });
    expect(countdownAt(open, open, close).phase).toBe("open");
    expect(countdownAt(close - 1, open, close).phase).toBe("open");
    expect(countdownAt(close, open, close)).toEqual({
      phase: "closed",
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it("aligns ticks to the next second", () => {
    expect(nextTickDelay(10_000)).toBe(1012);
    expect(nextTickDelay(10_750)).toBe(262);
  });

  it("formats dates in Brazilian Portuguese", () => {
    expect(formatOpeningLabel(Date.UTC(2027, 4, 14, 18), "America/Sao_Paulo")).toBe(
      "14 de maio de 2027, às 15h",
    );
    expect(formatOpeningLabel(Date.UTC(2027, 4, 14, 18, 30), "America/Sao_Paulo")).toBe(
      "14 de maio de 2027, às 15h30",
    );
    expect(formatOpeningShort(Date.UTC(2027, 4, 14, 18), "America/Sao_Paulo")).toBe(
      "14/05, às 15h",
    );
    expect(formatOpeningShort(Date.UTC(2027, 4, 14, 18, 30), "America/Sao_Paulo")).toBe(
      "14/05, às 15h30",
    );
    expect(formatEditionPeriod("2027-05-14", "2027-05-23")).toBe("14 a 23 de maio de 2027");
    expect(formatEditionPeriod("2027-05-30", "2027-06-02")).toBe("30 de maio a 2 de junho de 2027");
    expect(formatEditionPeriod(undefined, undefined)).toBeNull();
  });

  it("uses the official Indumóveis 2027 opening: 14/05/2027 15h in Brasília", () => {
    const r = resolveOpening({ ...edition, opening_time: "15:00:00" });
    expect(r.status).toBe("configured");
    if (r.status !== "configured") return;
    expect(r.openingAt).toBe(Date.parse("2027-05-14T15:00:00-03:00"));
    expect(formatOpeningLabel(r.openingAt, r.timeZone)).toBe("14 de maio de 2027, às 15h");
    expect(formatOpeningShort(r.openingAt, r.timeZone)).toBe("14/05, às 15h");
    expect(timeZoneShortLabel(r.timeZone, r.openingAt)).toBe("Brasília");
    // O horário anteriormente informado de 10h ainda deve estar em contagem.
    expect(
      countdownAt(Date.parse("2027-05-14T10:00:00-03:00"), r.openingAt, r.closingAt),
    ).toMatchObject({ phase: "countdown", days: 0, hours: 5, minutes: 0, seconds: 0 });
    expect(countdownAt(r.openingAt - 1, r.openingAt, r.closingAt)).toMatchObject({
      phase: "countdown",
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
    expect(countdownAt(r.openingAt + 1, r.openingAt, r.closingAt).phase).toBe("open");
  });
});
