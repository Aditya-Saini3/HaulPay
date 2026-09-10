import {
  dollarsToCents,
  parseDollarsToCents,
  parseMiles,
  perHour,
  perMile,
  percentOf,
  roundCents,
  roundMiles,
  sumCents,
} from "../money";

describe("money", () => {
  it("rounds half away from zero in both directions", () => {
    expect(roundCents(0.5)).toBe(1);
    expect(roundCents(1.5)).toBe(2);
    expect(roundCents(-0.5)).toBe(-1);
    expect(roundCents(-1.5)).toBe(-2);
    expect(roundCents(2.4)).toBe(2);
    expect(roundCents(-2.4)).toBe(-2);
  });

  it("never leaks a float into a cents value", () => {
    // 0.1 + 0.2 style drift is the whole reason money is integer cents.
    const total = sumCents([10_000, 3_333, 3_333, 3_334]);
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(20_000);
  });

  it("takes a percentage of an amount as a human percent", () => {
    expect(percentOf(200_000, 10)).toBe(20_000);
    expect(percentOf(200_000, 3.5)).toBe(7_000);
    expect(percentOf(100_001, 33.33)).toBe(33_330);
  });

  it("returns null instead of Infinity when there is nothing to divide by", () => {
    expect(perMile(100_000, 0)).toBeNull();
    expect(perMile(100_000, -5)).toBeNull();
    expect(perHour(100_000, 0)).toBeNull();
    expect(perMile(100_000, 500)).toBe(200);
  });

  it("rounds miles to one decimal", () => {
    expect(roundMiles(512.44)).toBe(512.4);
    expect(roundMiles(512.45)).toBe(512.5);
    expect(roundMiles(512.449)).toBe(512.4);
  });

  it("parses what a driver actually types", () => {
    expect(parseDollarsToCents("$1,250.50")).toBe(125_050);
    expect(parseDollarsToCents("1250")).toBe(125_000);
    expect(parseDollarsToCents("  2,000 ")).toBe(200_000);
    expect(parseDollarsToCents("-40")).toBe(-4_000);
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("1.2.3")).toBeNull();
    expect(dollarsToCents(19.99)).toBe(1999);
  });

  it("parses miles and rejects negatives", () => {
    expect(parseMiles("1,024.6")).toBe(1024.6);
    expect(parseMiles("-5")).toBeNull();
    expect(parseMiles("x")).toBeNull();
  });
});
