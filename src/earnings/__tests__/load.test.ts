import { computeLoad, computeLoadHours, deductionsTotal, grossCents } from "../load";
import { accessorial, deduction, makeLoad } from "./helpers";

describe("per-load revenue math", () => {
  it("adds accessorials into gross and takes deductions off it", () => {
    const load = makeLoad({
      linehaulCents: 200_000,
      lineItems: [
        accessorial("detention", 15_000),
        accessorial("lumper", 12_500),
        deduction("dispatch", { percentOfGross: 10 }),
        deduction("factoring", { percentOfGross: 3 }),
        deduction("escrow", { amountCents: 5_000 }),
      ],
      loadedMiles: 800,
      deadheadMiles: 120,
    });

    const result = computeLoad(load);
    expect(result.money.grossCents).toBe(227_500);
    // 13% of gross plus a $50 flat escrow.
    expect(result.money.deductionsCents).toBe(29_575 + 5_000);
    expect(result.money.netRevenueCents).toBe(227_500 - 34_575);
  });

  it("lets a percentage deduction win when a line carries both a percent and an amount", () => {
    const items = [deduction("factoring", { amountCents: 9_999, percentOfGross: 3 })];
    expect(deductionsTotal(items, 200_000)).toBe(6_000);
  });

  it("separates rate per mile from the all-in rate that includes deadhead", () => {
    const load = makeLoad({
      linehaulCents: 200_000,
      lineItems: [],
      loadedMiles: 800,
      deadheadMiles: 200,
    });
    const result = computeLoad(load);

    // $2,000 on 800 loaded miles looks like $2.50/mi on the load board...
    expect(result.ratePerMile).toBeCloseTo(250, 6);
    // ...but the truck ran 1,000 miles to earn it.
    expect(result.allInRatePerMile).toBeCloseTo(200, 6);
    expect(result.miles.deadheadPercent).toBeCloseTo(20, 6);
  });

  it("surfaces the gap between paid miles and miles actually run", () => {
    const load = makeLoad({ loadedMiles: 812, deadheadMiles: 60, paidMiles: 780 });
    const result = computeLoad(load);
    expect(result.miles.totalMiles).toBe(872);
    expect(result.miles.paidMiles).toBe(780);
    expect(result.miles.unpaidMiles).toBe(92);
  });

  it("defaults paid miles to loaded miles when the payer's number was not entered", () => {
    const result = computeLoad(makeLoad({ loadedMiles: 640, paidMiles: null }));
    expect(result.miles.paidMiles).toBe(640);
  });

  it("returns null rates on a load with zero loaded miles instead of dividing by zero", () => {
    // A TONU pays real money for no miles at all.
    const load = makeLoad({
      linehaulCents: 0,
      lineItems: [accessorial("tonu", 25_000)],
      loadedMiles: 0,
      deadheadMiles: 0,
      paidMiles: 0,
    });
    const result = computeLoad(load);

    expect(result.money.grossCents).toBe(25_000);
    expect(result.miles.totalMiles).toBe(0);
    expect(result.ratePerMile).toBeNull();
    expect(result.allInRatePerMile).toBeNull();
    expect(result.profitPerMile).toBeNull();
    expect(result.miles.deadheadPercent).toBeNull();
    // The load still made money, and profit still reports it.
    expect(result.profitCents).toBe(25_000);
  });

  it("still reports an all-in rate when a zero-mile load ran deadhead to get there", () => {
    const load = makeLoad({
      linehaulCents: 0,
      lineItems: [accessorial("tonu", 25_000)],
      loadedMiles: 0,
      deadheadMiles: 140,
    });
    const result = computeLoad(load);
    expect(result.ratePerMile).toBeNull();
    expect(result.allInRatePerMile).toBeCloseTo(25_000 / 140, 6);
    expect(result.miles.deadheadPercent).toBe(100);
  });

  it("charges allocated fixed cost only when the toggle is on", () => {
    const load = makeLoad({
      linehaulCents: 200_000,
      loadExpensesCents: 45_000,
      startedAt: "2026-03-02T20:00:00-06:00",
      endedAt: "2026-03-04T09:00:00-06:00",
    });

    const off = computeLoad(load, { includeFixedCosts: false, dailyFixedCostCents: 20_000 });
    expect(off.occupiedDays).toBe(3);
    expect(off.allocatedFixedCents).toBe(0);
    expect(off.profitCents).toBe(200_000 - 45_000);

    const on = computeLoad(load, { includeFixedCosts: true, dailyFixedCostCents: 20_000 });
    expect(on.allocatedFixedCents).toBe(60_000);
    expect(on.profitCents).toBe(200_000 - 45_000 - 60_000);
  });

  it("prefers the manual hours entry over the start/end span", () => {
    const spanned = makeLoad({
      startedAt: "2026-03-02T08:00:00-06:00",
      endedAt: "2026-03-02T18:00:00-06:00",
    });
    expect(computeLoadHours(spanned)).toBe(10);

    const manual = makeLoad({
      startedAt: "2026-03-02T08:00:00-06:00",
      endedAt: "2026-03-02T18:00:00-06:00",
      hours: { worked: 7.5, driving: null, loading: null, waiting: null, unpaidBreak: null },
    });
    expect(computeLoadHours(manual)).toBe(7.5);
  });

  it("removes unpaid break time from a derived span", () => {
    const load = makeLoad({
      startedAt: "2026-03-02T08:00:00-06:00",
      endedAt: "2026-03-02T18:00:00-06:00",
      hours: { worked: null, driving: null, loading: null, waiting: null, unpaidBreak: 0.5 },
    });
    expect(computeLoadHours(load)).toBe(9.5);
  });

  it("leaves hours null when there is nothing to derive them from", () => {
    const load = makeLoad({ startedAt: null, endedAt: null });
    expect(computeLoadHours(load)).toBeNull();
    expect(computeLoad(load).effectiveHourlyCents).toBeNull();
  });

  it("computes the effective hourly rate on a load that sat all day", () => {
    // $1,850 net on a 14-hour day is $132.14/hr, and that is the number the
    // driver actually wants to see.
    const load = makeLoad({
      linehaulCents: 185_000,
      hours: { worked: 14, driving: 8, loading: 2, waiting: 4, unpaidBreak: null },
    });
    const result = computeLoad(load);
    expect(result.effectiveHourlyCents).toBeCloseTo(185_000 / 14, 6);
  });

  it("keeps gross independent of deductions", () => {
    const load = makeLoad({
      linehaulCents: 150_000,
      lineItems: [accessorial("fuel_surcharge", 30_000), deduction("dispatch", { percentOfGross: 10 })],
    });
    expect(grossCents(load)).toBe(180_000);
  });
});
