import {
  checkBreakeven,
  computeCostPerMile,
  computeFuelStats,
  dailyFixedCostCents,
  dailyFixedCostForRange,
  fixedCostForRange,
  monthlyEquivalentCents,
  monthlyFixedCostCents,
} from "../costs";
import type { ExpenseInput, FixedCostInput } from "../types";

const cost = (
  label: string,
  amountCents: number,
  frequency: FixedCostInput["frequency"],
  truckId: string | null = null,
): FixedCostInput => ({ id: label, label, amountCents, frequency, truckId });

const expense = (
  amountCents: number,
  incurredOn: string,
  isFixed = false,
  truckId: string | null = null,
): ExpenseInput => ({
  id: `${incurredOn}-${amountCents}`,
  amountCents,
  incurredOn,
  isFixed,
  categoryId: null,
  categoryName: "Fuel",
  truckId,
  loadId: null,
});

describe("amortization", () => {
  it("spreads an annual cost across twelve months instead of one", () => {
    // Form 2290 is $550 once a year. July should not eat all of it.
    expect(monthlyEquivalentCents(55_000, "annually")).toBe(4_583);
  });

  it("converts every recurrence onto a month", () => {
    expect(monthlyEquivalentCents(30_000, "weekly")).toBe(130_000);
    expect(monthlyEquivalentCents(30_000, "biweekly")).toBe(65_000);
    expect(monthlyEquivalentCents(30_000, "monthly")).toBe(30_000);
    expect(monthlyEquivalentCents(30_000, "quarterly")).toBe(10_000);
    expect(monthlyEquivalentCents(30_000, "none")).toBe(0);
  });

  it("adds up a real owner-operator fixed-cost sheet", () => {
    const costs = [
      cost("truck payment", 220_000, "monthly"),
      cost("insurance", 145_000, "monthly"),
      cost("plates (IRP)", 190_000, "annually"),
      cost("2290 HVUT", 55_000, "annually"),
      cost("parking", 25_000, "monthly"),
      cost("ELD", 4_500, "monthly"),
      cost("drug consortium", 12_000, "annually"),
    ];
    // 3,945.00/mo of true monthlies plus 4,716.67/mo amortized from annuals.
    expect(monthlyFixedCostCents(costs)).toBe(394_500 + 15_833 + 4_583 + 1_000);
  });

  it("keeps a truck's own costs separate for carriers", () => {
    const costs = [
      cost("shared insurance", 100_000, "monthly", null),
      cost("truck 101 payment", 200_000, "monthly", "truck-101"),
      cost("truck 102 payment", 180_000, "monthly", "truck-102"),
    ];
    // Costs with no truck are company-wide overhead and follow every truck.
    expect(monthlyFixedCostCents(costs, "truck-101")).toBe(300_000);
    expect(monthlyFixedCostCents(costs, "truck-102")).toBe(280_000);
    expect(monthlyFixedCostCents(costs)).toBe(480_000);
  });

  it("derives a daily fixed cost off the year so February is not more expensive", () => {
    // $6,000/mo is $72,000/yr, or $197.26/day in every month.
    expect(dailyFixedCostCents(600_000)).toBe(19_726);
  });
});

describe("fixed cost across a range", () => {
  it("charges a whole month its whole monthly figure", () => {
    expect(fixedCostForRange({ from: "2026-03-01", to: "2026-03-31" }, 600_000)).toBe(600_000);
    expect(fixedCostForRange({ from: "2026-02-01", to: "2026-02-28" }, 600_000)).toBe(600_000);
  });

  it("prorates a week that straddles two months by the days in each", () => {
    // 30-31 August (2 of 31 days) plus 1-5 September (5 of 30 days).
    const week = { from: "2026-08-30", to: "2026-09-05" };
    const expected = Math.round((600_000 * 2) / 31 + (600_000 * 5) / 30);
    expect(fixedCostForRange(week, 600_000)).toBe(expected);
  });

  it("charges a single day one day's worth", () => {
    expect(fixedCostForRange({ from: "2026-04-10", to: "2026-04-10" }, 600_000)).toBe(20_000);
  });

  it("averages back to a daily figure over any range", () => {
    expect(dailyFixedCostForRange({ from: "2026-04-01", to: "2026-04-30" }, 600_000)).toBe(20_000);
  });
});

describe("cost per mile and breakeven", () => {
  const range = { from: "2026-03-01", to: "2026-03-31" };

  it("splits fixed and variable cost per mile and adds them to a breakeven", () => {
    const expenses = [
      expense(180_000, "2026-03-04"),
      expense(165_000, "2026-03-11"),
      expense(45_000, "2026-03-18"),
      expense(60_000, "2026-03-25"),
    ];
    const result = computeCostPerMile({
      range,
      miles: 10_000,
      monthlyFixedCents: 600_000,
      variableExpenses: expenses,
    });

    expect(result.variableCents).toBe(450_000);
    // $6,000 fixed over 10,000 miles is $0.60; $4,500 variable is $0.45.
    expect(result.fixedCpm).toBeCloseTo(60, 6);
    expect(result.variableCpm).toBeCloseTo(45, 6);
    expect(result.totalCpm).toBeCloseTo(105, 6);
    expect(result.breakevenRpm).toBe(result.totalCpm);
  });

  it("ignores fixed expense rows so amortized fixed cost is not double-counted", () => {
    const result = computeCostPerMile({
      range,
      miles: 10_000,
      monthlyFixedCents: 600_000,
      variableExpenses: [expense(180_000, "2026-03-04"), expense(220_000, "2026-03-01", true)],
    });
    expect(result.variableCents).toBe(180_000);
  });

  it("reports no cost per mile at all when the truck ran no miles", () => {
    const result = computeCostPerMile({
      range,
      miles: 0,
      monthlyFixedCents: 600_000,
      variableExpenses: [expense(180_000, "2026-03-04")],
    });
    expect(result.fixedCpm).toBeNull();
    expect(result.variableCpm).toBeNull();
    expect(result.totalCpm).toBeNull();
    expect(result.breakevenRpm).toBeNull();
  });

  it("flags a load booked under breakeven", () => {
    // $1.85/mi against a $2.05/mi breakeven loses twenty cents a mile.
    const check = checkBreakeven(185, 205);
    expect(check.belowBreakeven).toBe(true);
    expect(check.marginPerMile).toBeCloseTo(-20, 6);
  });

  it("clears a load booked above breakeven", () => {
    const check = checkBreakeven(240, 205);
    expect(check.belowBreakeven).toBe(false);
    expect(check.marginPerMile).toBeCloseTo(35, 6);
  });

  it("does not flag anything when breakeven is unknown", () => {
    expect(checkBreakeven(185, null).belowBreakeven).toBe(false);
    expect(checkBreakeven(null, 205).belowBreakeven).toBe(false);
  });
});

describe("fuel", () => {
  it("derives MPG and fuel cost per mile from fuel entries", () => {
    const stats = computeFuelStats(
      [
        { gallons: 120.5, amountCents: 45_800 },
        { gallons: 98.2, amountCents: 37_100 },
      ],
      1_400,
    );
    expect(stats.gallons).toBeCloseTo(218.7, 3);
    expect(stats.fuelCents).toBe(82_900);
    expect(stats.mpg).toBeCloseTo(1400 / 218.7, 6);
    expect(stats.fuelCostPerMile).toBeCloseTo(82_900 / 1_400, 6);
  });

  it("reports no MPG when there is nothing to divide", () => {
    expect(computeFuelStats([], 1_000).mpg).toBeNull();
    expect(computeFuelStats([{ gallons: 100, amountCents: 40_000 }], 0).mpg).toBeNull();
  });
});
