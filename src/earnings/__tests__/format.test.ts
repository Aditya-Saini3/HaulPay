import {
  formatHourlyRate,
  formatHours,
  formatMiles,
  formatMoney,
  formatPercent,
  formatRate,
  kmToMiles,
  metersToMiles,
  milesToKm,
} from "../format";

describe("format", () => {
  it("formats money with thousands separators", () => {
    expect(formatMoney(475_000)).toBe("$4,750.00");
    expect(formatMoney(1_234_567)).toBe("$12,345.67");
    expect(formatMoney(-29_500)).toBe("-$295.00");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(475_000, "USD", { decimals: 0 })).toBe("$4,750");
    expect(formatMoney(475_000, "USD", { signed: true })).toBe("+$4,750.00");
  });

  it("shows an em dash rather than NaN for missing money", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(Number.NaN)).toBe("—");
  });

  it("formats rates per mile and per hour", () => {
    expect(formatRate(247.5)).toBe("$2.48/mi");
    expect(formatRate(247.5, "USD", "km")).toBe("$2.48/km");
    expect(formatRate(null)).toBe("—");
    expect(formatHourlyRate(2_875)).toBe("$28.75/hr");
  });

  it("formats miles and converts to km on request", () => {
    expect(formatMiles(1_842.4)).toBe("1,842 mi");
    expect(formatMiles(100, "km")).toBe("161 km");
    expect(formatMiles(null)).toBe("—");
  });

  it("formats hours as hours and minutes", () => {
    expect(formatHours(8.5)).toBe("8h 30m");
    expect(formatHours(0.25)).toBe("0h 15m");
    expect(formatHours(11.996)).toBe("12h 00m");
    expect(formatHours(null)).toBe("—");
  });

  it("formats percentages", () => {
    expect(formatPercent(11.764, 1)).toBe("11.8%");
    expect(formatPercent(11.764)).toBe("12%");
    expect(formatPercent(null)).toBe("—");
  });

  it("converts distance units round trip", () => {
    expect(milesToKm(100)).toBeCloseTo(160.9344, 4);
    expect(kmToMiles(milesToKm(100))).toBeCloseTo(100, 6);
    expect(metersToMiles(1_609.344)).toBeCloseTo(1, 6);
  });
});
