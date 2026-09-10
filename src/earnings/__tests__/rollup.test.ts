import {
  bucketByCategory,
  bucketByWeek,
  collectWorkDays,
  computeRollup,
  computeShiftPay,
} from "../rollup";
import type { ExpenseInput, FixedCostInput, PayStructure } from "../types";
import { accessorial, deduction, hourly, makeLoad, makeShift } from "./helpers";

const fixedCosts: FixedCostInput[] = [
  { id: "truck", label: "Truck payment", amountCents: 220_000, frequency: "monthly", truckId: null },
  { id: "ins", label: "Insurance", amountCents: 145_000, frequency: "monthly", truckId: null },
  { id: "plates", label: "IRP plates", amountCents: 190_000, frequency: "annually", truckId: null },
];

const expense = (
  amountCents: number,
  incurredOn: string,
  categoryName = "Fuel",
  truckId: string | null = null,
): ExpenseInput => ({
  id: `${incurredOn}-${categoryName}-${amountCents}`,
  amountCents,
  incurredOn,
  isFixed: false,
  categoryId: categoryName,
  categoryName,
  truckId,
  loadId: null,
});

describe("owner-operator rollup", () => {
  const range = { from: "2026-03-01", to: "2026-03-31" };
  const loads = [
    makeLoad({
      linehaulCents: 250_000,
      lineItems: [accessorial("fuel_surcharge", 45_000), deduction("dispatch", { percentOfGross: 10 })],
      loadedMiles: 1_100,
      deadheadMiles: 150,
      startedAt: "2026-03-02T08:00:00-06:00",
      endedAt: "2026-03-04T14:00:00-06:00",
    }),
    makeLoad({
      linehaulCents: 180_000,
      lineItems: [deduction("dispatch", { percentOfGross: 10 })],
      loadedMiles: 700,
      deadheadMiles: 90,
      startedAt: "2026-03-09T06:00:00-05:00",
      endedAt: "2026-03-10T17:00:00-05:00",
    }),
  ];

  it("rolls gross, expenses, profit and the rates that follow", () => {
    const rollup = computeRollup({
      role: "owner_operator",
      range,
      loads,
      shifts: [],
      expenses: [expense(180_000, "2026-03-04"), expense(52_000, "2026-03-10", "Tolls")],
      fixedCosts,
      payStructure: null,
    });

    const r = rollup.revenue;
    expect(r.loadCount).toBe(2);
    expect(r.grossCents).toBe(295_000 + 180_000);
    // 10% dispatch off each load's gross.
    expect(r.netRevenueCents).toBe(475_000 - 29_500 - 18_000);
    expect(r.loadedMiles).toBe(1_800);
    expect(r.deadheadMiles).toBe(240);
    expect(r.totalMiles).toBe(2_040);
    expect(r.deadheadPercent).toBeCloseTo((240 / 2040) * 100, 6);
    expect(r.ratePerMile).toBeCloseTo(475_000 / 1_800, 6);
    expect(r.allInRatePerMile).toBeCloseTo(475_000 / 2_040, 6);
  });

  it("charges the range its amortized fixed cost, not the month's fixed expenses", () => {
    const rollup = computeRollup({
      role: "owner_operator",
      range,
      loads,
      shifts: [],
      expenses: [expense(180_000, "2026-03-04")],
      fixedCosts,
      payStructure: null,
    });

    // $3,650/mo of monthlies plus $158.33/mo amortized from the plates.
    expect(rollup.revenue.fixedCostCents).toBe(365_000 + 15_833);
    expect(rollup.revenue.totalExpenseCents).toBe(365_000 + 15_833 + 180_000);
    expect(rollup.revenue.netProfitCents).toBe(
      rollup.revenue.netRevenueCents - rollup.revenue.totalExpenseCents,
    );
  });

  it("prices loads with allocated fixed cost by default for owner-operators", () => {
    const rollup = computeRollup({
      role: "owner_operator",
      range,
      loads,
      shifts: [],
      expenses: [],
      fixedCosts,
      payStructure: null,
    });
    // First load occupied three calendar days of the truck.
    expect(rollup.loadResults[0]!.occupiedDays).toBe(3);
    expect(rollup.loadResults[0]!.allocatedFixedCents).toBeGreaterThan(0);
  });

  it("excludes loads and expenses outside the range", () => {
    const rollup = computeRollup({
      role: "owner_operator",
      range: { from: "2026-03-01", to: "2026-03-05" },
      loads,
      shifts: [],
      expenses: [expense(180_000, "2026-03-04"), expense(999_000, "2026-04-04")],
      fixedCosts,
      payStructure: null,
    });
    expect(rollup.revenue.loadCount).toBe(1);
    expect(rollup.revenue.variableExpenseCents).toBe(180_000);
  });

  it("filters every figure to one truck for the carrier per-truck view", () => {
    const truckLoads = [
      { ...loads[0]!, truckId: "truck-101" },
      { ...loads[1]!, truckId: "truck-102" },
    ];

    const rollup = computeRollup({
      role: "small_carrier",
      range,
      loads: truckLoads,
      shifts: [],
      expenses: [expense(180_000, "2026-03-04", "Fuel", "truck-101"), expense(90_000, "2026-03-10", "Fuel", "truck-102")],
      fixedCosts,
      payStructure: null,
      truckId: "truck-101",
    });

    expect(rollup.revenue.loadCount).toBe(1);
    expect(rollup.revenue.grossCents).toBe(295_000);
    expect(rollup.revenue.variableExpenseCents).toBe(180_000);
  });
});

describe("company driver rollup", () => {
  const range = { from: "2026-03-01", to: "2026-03-31" };
  const perMile: PayStructure = { kind: "per_mile", cpmCents: 62, mileageBasis: "practical" };

  it("replaces revenue math with pay math", () => {
    const loads = [
      makeLoad({ linehaulCents: 250_000, loadedMiles: 1_100, paidMiles: 1_080, deadheadMiles: 150 }),
      makeLoad({
        linehaulCents: 180_000,
        loadedMiles: 700,
        paidMiles: 690,
        deadheadMiles: 90,
        startedAt: "2026-03-09T06:00:00-05:00",
        endedAt: "2026-03-09T18:00:00-05:00",
      }),
    ];

    const rollup = computeRollup({
      role: "company_driver",
      range,
      loads,
      shifts: [],
      expenses: [expense(12_000, "2026-03-05", "Meals")],
      fixedCosts,
      payStructure: perMile,
    });

    expect(rollup.driver).not.toBeNull();
    expect(rollup.driver!.grossPayCents).toBe(Math.round(1_080 * 62) + Math.round(690 * 62));
    expect(rollup.driver!.netPayCents).toBe(rollup.driver!.grossPayCents - 12_000);
    expect(rollup.driver!.centsPerPaidMile).toBeCloseTo(62, 6);
  });

  it("does not allocate fixed costs onto a company driver's loads", () => {
    const rollup = computeRollup({
      role: "company_driver",
      range,
      loads: [makeLoad({})],
      shifts: [],
      expenses: [],
      fixedCosts,
      payStructure: perMile,
    });
    expect(rollup.loadResults[0]!.allocatedFixedCents).toBe(0);
  });

  it("settles an hourly driver week by week so overtime lands on the workweek", () => {
    // 45 hours in the settlement week of 30 August, which straddles two months.
    const shifts = [
      makeShift({ workDate: "2026-08-30", startAt: "2026-08-30T08:00:00-05:00", endAt: "2026-08-30T13:00:00-05:00" }),
      makeShift({ workDate: "2026-08-31", startAt: "2026-08-31T06:00:00-05:00", endAt: "2026-08-31T16:00:00-05:00" }),
      makeShift({ workDate: "2026-09-01", startAt: "2026-09-01T06:00:00-05:00", endAt: "2026-09-01T16:00:00-05:00" }),
      makeShift({ workDate: "2026-09-02", startAt: "2026-09-02T06:00:00-05:00", endAt: "2026-09-02T16:00:00-05:00" }),
      makeShift({ workDate: "2026-09-03", startAt: "2026-09-03T06:00:00-05:00", endAt: "2026-09-03T16:00:00-05:00" }),
    ];

    const rollup = computeRollup({
      role: "company_driver",
      range: { from: "2026-08-30", to: "2026-09-05" },
      loads: [],
      shifts,
      expenses: [],
      fixedCosts: [],
      payStructure: hourly({ overtimeBasis: "weekly", overtimeThresholdHours: 40 }),
      weekStart: "sunday",
    });

    expect(rollup.driver!.hoursWorked).toBe(45);
    expect(rollup.driver!.regularHours).toBe(40);
    expect(rollup.driver!.overtimeHours).toBe(5);
    expect(rollup.driver!.grossPayCents).toBe(40 * 2500 + 5 * 3750);
  });

  it("splits the same hours into two weeks when the month boundary is not the week boundary", () => {
    // Identical hours, but a range that cuts the week: each half is its own
    // settlement week, so nothing reaches 40 and no overtime is owed.
    const shifts = [
      makeShift({ workDate: "2026-09-01", hoursWorked: 10, startAt: null, endAt: null }),
      makeShift({ workDate: "2026-09-02", hoursWorked: 10, startAt: null, endAt: null }),
      makeShift({ workDate: "2026-09-03", hoursWorked: 10, startAt: null, endAt: null }),
      makeShift({ workDate: "2026-09-07", hoursWorked: 10, startAt: null, endAt: null }),
      makeShift({ workDate: "2026-09-08", hoursWorked: 10, startAt: null, endAt: null }),
    ];

    const rollup = computeRollup({
      role: "company_driver",
      range: { from: "2026-09-01", to: "2026-09-30" },
      loads: [],
      shifts,
      expenses: [],
      fixedCosts: [],
      payStructure: hourly({ overtimeBasis: "weekly", overtimeThresholdHours: 40 }),
      weekStart: "sunday",
    });

    expect(rollup.driver!.hoursWorked).toBe(50);
    expect(rollup.driver!.overtimeHours).toBe(0);
    expect(rollup.driver!.grossPayCents).toBe(50 * 2500);
  });

  it("runs on shifts alone with no loads at all", () => {
    const rollup = computeRollup({
      role: "company_driver",
      range: { from: "2026-03-01", to: "2026-03-07" },
      loads: [],
      shifts: [makeShift({ workDate: "2026-03-02", hoursWorked: 9, startAt: null, endAt: null })],
      expenses: [],
      fixedCosts: [],
      payStructure: hourly({ overtimeBasis: "daily", overtimeThresholdHours: 8 }),
    });

    expect(rollup.driver!.loadCount).toBe(0);
    expect(rollup.driver!.shiftCount).toBe(1);
    expect(rollup.driver!.grossPayCents).toBe(8 * 2500 + 1 * 3750);
  });

  it("counts shift hours toward the effective hourly rate of a per-mile driver", () => {
    const rollup = computeRollup({
      role: "company_driver",
      range: { from: "2026-03-01", to: "2026-03-07" },
      loads: [makeLoad({ loadedMiles: 400, paidMiles: 400, hours: { worked: 6, driving: null, loading: null, waiting: null, unpaidBreak: null } })],
      shifts: [makeShift({ workDate: "2026-03-05", hoursWorked: 4, startAt: null, endAt: null })],
      expenses: [],
      fixedCosts: [],
      payStructure: perMile,
    });

    expect(rollup.driver!.hoursWorked).toBe(10);
    expect(rollup.driver!.effectiveHourlyCents).toBeCloseTo((400 * 62) / 10, 6);
  });
});

describe("work day collection", () => {
  it("does not pay twice when a load and a shift cover the same day", () => {
    const days = collectWorkDays(
      [makeLoad({ startedAt: "2026-03-02T08:00:00-06:00", endedAt: "2026-03-02T18:00:00-06:00" })],
      [makeShift({ workDate: "2026-03-02", hoursWorked: 11, startAt: null, endAt: null })],
    );

    expect(days).toHaveLength(1);
    expect(days[0]!.workedHours).toBe(11);
  });

  it("keeps load hours on days the driver logged no shift", () => {
    const days = collectWorkDays(
      [makeLoad({ startedAt: "2026-03-03T08:00:00-06:00", endedAt: "2026-03-03T18:00:00-06:00" })],
      [makeShift({ workDate: "2026-03-02", hoursWorked: 11, startAt: null, endAt: null })],
    );
    expect(days).toHaveLength(2);
  });
});

describe("chart buckets", () => {
  it("groups weeks by settlement week start", () => {
    const buckets = bucketByWeek(
      [
        makeLoad({ linehaulCents: 100_000, startedAt: "2026-08-31T08:00:00-05:00", endedAt: "2026-08-31T18:00:00-05:00" }),
        makeLoad({ linehaulCents: 150_000, startedAt: "2026-09-02T08:00:00-05:00", endedAt: "2026-09-02T18:00:00-05:00" }),
        makeLoad({ linehaulCents: 120_000, startedAt: "2026-09-08T08:00:00-05:00", endedAt: "2026-09-08T18:00:00-05:00" }),
      ],
      [],
      [],
      "sunday",
    );

    // The first two loads straddle a month but share a week.
    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.weekStart).toBe("2026-08-30");
    expect(buckets[0]!.grossCents).toBe(250_000);
    expect(buckets[1]!.weekStart).toBe("2026-09-06");
  });

  it("takes expenses off the week's net", () => {
    const buckets = bucketByWeek(
      [makeLoad({ linehaulCents: 100_000, startedAt: "2026-09-08T08:00:00-05:00", endedAt: "2026-09-08T18:00:00-05:00" })],
      [expense(30_000, "2026-09-09")],
      [],
      "sunday",
    );
    expect(buckets[0]!.netCents).toBe(70_000);
  });

  it("groups expenses by category, largest first", () => {
    const rows = bucketByCategory([
      expense(180_000, "2026-03-04", "Fuel"),
      expense(52_000, "2026-03-10", "Tolls"),
      expense(90_000, "2026-03-14", "Fuel"),
    ]);

    expect(rows[0]).toMatchObject({ categoryName: "Fuel", amountCents: 270_000, count: 2 });
    expect(rows[1]).toMatchObject({ categoryName: "Tolls", amountCents: 52_000 });
  });
});

describe("shift pay helper", () => {
  it("prices a set of shifts under an hourly structure", () => {
    const result = computeShiftPay(
      [
        makeShift({ workDate: "2026-09-07", hoursWorked: 12, startAt: null, endAt: null }),
        makeShift({ workDate: "2026-09-08", hoursWorked: 12, startAt: null, endAt: null }),
      ],
      hourly({ overtimeBasis: "daily", overtimeThresholdHours: 10 }),
    );
    expect(result!.overtimeHours).toBe(4);
  });

  it("returns nothing for a structure with no hourly side", () => {
    expect(
      computeShiftPay([makeShift({})], { kind: "per_mile", cpmCents: 62, mileageBasis: "practical" }),
    ).toBeNull();
  });
});

describe("hybrid driver rollup", () => {
  // The drayage case the spec calls out: hourly, or $0.55/mi, whichever is greater.
  const drayage: PayStructure = {
    kind: "hybrid",
    primary: hourly({ hourlyRateCents: 2800, overtimeBasis: "weekly", overtimeThresholdHours: 40 }),
    floor: { kind: "per_mile", cpmCents: 55, mileageBasis: "practical" },
  };

  it("settles a hybrid week on the hourly side when the clock beats the miles", () => {
    // 45 hours in one week against 400 paid miles: $1,314 hourly vs $220 mileage.
    const shifts = [
      makeShift({ workDate: "2026-09-07", hoursWorked: 12, startAt: null, endAt: null }),
      makeShift({ workDate: "2026-09-08", hoursWorked: 11, startAt: null, endAt: null }),
      makeShift({ workDate: "2026-09-09", hoursWorked: 11, startAt: null, endAt: null }),
      makeShift({ workDate: "2026-09-10", hoursWorked: 11, startAt: null, endAt: null }),
    ];
    const loads = [
      makeLoad({
        loadedMiles: 400,
        paidMiles: 400,
        startedAt: "2026-09-07T06:00:00-05:00",
        endedAt: "2026-09-07T18:00:00-05:00",
      }),
    ];

    const rollup = computeRollup({
      role: "company_driver",
      range: { from: "2026-09-06", to: "2026-09-12" },
      loads,
      shifts,
      expenses: [],
      fixedCosts: [],
      payStructure: drayage,
      weekStart: "sunday",
    });

    expect(rollup.driver!.hoursWorked).toBe(45);
    expect(rollup.driver!.overtimeHours).toBe(5);
    expect(rollup.driver!.grossPayCents).toBe(40 * 2800 + 5 * 4200);
  });

  it("settles a hybrid week on the mileage floor when a long run beats the clock", () => {
    // 20 hours against 2,400 paid miles: $560 hourly vs $1,320 mileage.
    const loads = [
      makeLoad({
        loadedMiles: 2_400,
        paidMiles: 2_400,
        startedAt: "2026-09-07T06:00:00-05:00",
        endedAt: "2026-09-08T02:00:00-05:00",
        hours: { worked: 20, driving: 18, loading: 2, waiting: null, unpaidBreak: null },
      }),
    ];

    const rollup = computeRollup({
      role: "company_driver",
      range: { from: "2026-09-06", to: "2026-09-12" },
      loads,
      shifts: [],
      expenses: [],
      fixedCosts: [],
      payStructure: drayage,
      weekStart: "sunday",
    });

    expect(rollup.driver!.grossPayCents).toBe(2_400 * 55);
    // The mileage side won, so no overtime hours are reported even though the
    // hours are still counted for the effective hourly rate.
    expect(rollup.driver!.overtimeHours).toBe(0);
    expect(rollup.driver!.hoursWorked).toBe(20);
    expect(rollup.driver!.effectiveHourlyCents).toBeCloseTo((2_400 * 55) / 20, 6);
  });

  it("pays a hybrid week its detention on top of whichever side wins", () => {
    const loads = [
      makeLoad({
        loadedMiles: 2_400,
        paidMiles: 2_400,
        startedAt: "2026-09-07T06:00:00-05:00",
        endedAt: "2026-09-08T02:00:00-05:00",
        hours: { worked: 20, driving: 14, loading: 1, waiting: 5, unpaidBreak: null },
      }),
    ];

    const rollup = computeRollup({
      role: "company_driver",
      range: { from: "2026-09-06", to: "2026-09-12" },
      loads,
      shifts: [],
      expenses: [],
      fixedCosts: [],
      payStructure: drayage,
      accessorialPay: {
        detentionPerHourCents: 2_000,
        detentionFreeHours: 2,
        stopPayCents: 0,
        freeStops: 2,
        layoverPerDayCents: 0,
      },
      weekStart: "sunday",
    });

    expect(rollup.driver!.grossPayCents).toBe(2_400 * 55 + 3 * 2_000);
  });
});
