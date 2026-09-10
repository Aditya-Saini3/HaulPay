import {
  accessorialPayCents,
  computeLoadPay,
  computePay,
  effectiveHourlyCents,
  loadToPayableWork,
  netPayCents,
  EMPTY_WORK,
} from "../pay";
import type { HybridStructure, PayStructure } from "../types";
import { accessorial, hourly, makeLoad } from "./helpers";

describe("per-mile pay", () => {
  it("pays on the payer's miles, not the miles actually run", () => {
    const load = makeLoad({ loadedMiles: 812, deadheadMiles: 60, paidMiles: 780 });
    const structure: PayStructure = { kind: "per_mile", cpmCents: 62, mileageBasis: "practical" };

    const pay = computeLoadPay(load, structure);
    expect(pay.structurePayCents).toBe(Math.round(780 * 62));
    expect(pay.basis).toBe("per_mile");
  });

  it("falls back to loaded miles when the paid figure was not entered", () => {
    const load = makeLoad({ loadedMiles: 500, paidMiles: null });
    const pay = computeLoadPay(load, { kind: "per_mile", cpmCents: 55, mileageBasis: "shortest" });
    expect(pay.structurePayCents).toBe(500 * 55);
  });

  it("pays nothing on a zero-mile load but still books the accessorials", () => {
    // A TONU under a per-mile structure: no miles, but the driver is owed the
    // stop pay their configuration promises.
    const load = makeLoad({
      linehaulCents: 0,
      lineItems: [accessorial("tonu", 15_000)],
      loadedMiles: 0,
      deadheadMiles: 0,
      paidMiles: 0,
      stopCount: 1,
    });
    const pay = computeLoadPay(load, { kind: "per_mile", cpmCents: 62, mileageBasis: "practical" }, {
      accessorials: {
        detentionPerHourCents: 2000,
        detentionFreeHours: 2,
        stopPayCents: 3500,
        freeStops: 0,
        layoverPerDayCents: 0,
      },
    });

    expect(pay.structurePayCents).toBe(0);
    expect(pay.accessorialPayCents).toBe(3_500);
    expect(pay.grossPayCents).toBe(3_500);
  });
});

describe("percentage pay", () => {
  const load = makeLoad({
    linehaulCents: 200_000,
    lineItems: [accessorial("fuel_surcharge", 40_000), accessorial("detention", 10_000)],
  });

  it("pays on linehaul alone before the fuel surcharge", () => {
    const pay = computeLoadPay(load, { kind: "percentage", percent: 27, basis: "before_fuel_surcharge" });
    expect(pay.structurePayCents).toBe(54_000);
  });

  it("pays on linehaul plus fuel surcharge after it", () => {
    const pay = computeLoadPay(load, { kind: "percentage", percent: 27, basis: "after_fuel_surcharge" });
    expect(pay.structurePayCents).toBe(64_800);
  });

  it("ignores accessorials that are not the fuel surcharge", () => {
    // Detention is $100 on this load and never enters the percentage base.
    const pay = computeLoadPay(load, { kind: "percentage", percent: 100, basis: "after_fuel_surcharge" });
    expect(pay.structurePayCents).toBe(240_000);
  });
});

describe("flat pay", () => {
  it("adds per-stop pay past the stops the flat rate covers", () => {
    const load = makeLoad({ stopCount: 5 });
    const pay = computeLoadPay(load, {
      kind: "flat",
      flatCents: 25_000,
      stopRateCents: 3_500,
      freeStops: 2,
    });
    expect(pay.structurePayCents).toBe(25_000 + 3 * 3_500);
  });

  it("pays the flat rate alone on a straight pickup-and-drop", () => {
    const pay = computeLoadPay(makeLoad({ stopCount: 2 }), {
      kind: "flat",
      flatCents: 25_000,
      stopRateCents: 3_500,
      freeStops: 2,
    });
    expect(pay.structurePayCents).toBe(25_000);
  });
});

describe("hourly pay on a load", () => {
  it("pays the load's hours and reports the hourly breakdown", () => {
    const load = makeLoad({
      startedAt: "2026-03-02T06:00:00-06:00",
      endedAt: "2026-03-02T18:00:00-06:00",
    });
    const pay = computeLoadPay(load, hourly({ overtimeBasis: "daily", overtimeThresholdHours: 8 }));

    expect(pay.hourly).not.toBeNull();
    expect(pay.hourly!.regularHours).toBe(8);
    expect(pay.hourly!.overtimeHours).toBe(4);
    expect(pay.structurePayCents).toBe(8 * 2500 + 4 * 3750);
  });
});

describe("hybrid pay", () => {
  const drayage: HybridStructure = {
    kind: "hybrid",
    primary: hourly({ hourlyRateCents: 2800, overtimeBasis: "none", overtimeThresholdHours: null }),
    floor: { kind: "per_mile", cpmCents: 55, mileageBasis: "practical" },
  };

  it("takes the hourly side when a long day beats the mileage floor", () => {
    // 11 hours at $28 = $308 against 300 miles at $0.55 = $165.
    const load = makeLoad({
      loadedMiles: 300,
      paidMiles: 300,
      startedAt: "2026-03-02T05:00:00-06:00",
      endedAt: "2026-03-02T16:00:00-06:00",
    });
    const pay = computePay(loadToPayableWork(load), drayage);

    expect(pay.basis).toBe("hybrid_primary");
    expect(pay.structurePayCents).toBe(30_800);
    expect(pay.alternatePayCents).toBe(16_500);
  });

  it("takes the mileage floor when a fast long run beats the clock", () => {
    // 9 hours at $28 = $252 against 700 miles at $0.55 = $385.
    const load = makeLoad({
      loadedMiles: 700,
      paidMiles: 700,
      startedAt: "2026-03-02T05:00:00-06:00",
      endedAt: "2026-03-02T14:00:00-06:00",
    });
    const pay = computePay(loadToPayableWork(load), drayage);

    expect(pay.basis).toBe("hybrid_floor");
    expect(pay.structurePayCents).toBe(38_500);
    expect(pay.alternatePayCents).toBe(25_200);
  });

  it("keeps the primary when both sides land on exactly the same number", () => {
    // 10 hours at $28 = $280, and 500 miles at $0.56 = $280 as well.
    const load = makeLoad({
      loadedMiles: 500,
      paidMiles: 500,
      startedAt: "2026-03-02T05:00:00-06:00",
      endedAt: "2026-03-02T15:00:00-06:00",
    });
    const pay = computePay(loadToPayableWork(load), {
      kind: "hybrid",
      primary: hourly({ hourlyRateCents: 2800, overtimeBasis: "none", overtimeThresholdHours: null }),
      floor: { kind: "per_mile", cpmCents: 56, mileageBasis: "practical" },
    });
    expect(pay.structurePayCents).toBe(28_000);
    expect(pay.alternatePayCents).toBe(28_000);
    expect(pay.basis).toBe("hybrid_primary");
  });

  it("adds accessorials after the comparison, never inside it", () => {
    // Detention is owed whichever side of the hybrid wins, so it must not tip
    // the comparison.
    const load = makeLoad({
      loadedMiles: 700,
      paidMiles: 700,
      startedAt: "2026-03-02T05:00:00-06:00",
      endedAt: "2026-03-02T14:00:00-06:00",
      hours: { worked: 9, driving: 6, loading: 1, waiting: 4, unpaidBreak: null },
    });
    const pay = computePay(loadToPayableWork(load), drayage, {
      accessorials: {
        detentionPerHourCents: 2_000,
        detentionFreeHours: 2,
        stopPayCents: 0,
        freeStops: 2,
        layoverPerDayCents: 0,
      },
    });

    expect(pay.basis).toBe("hybrid_floor");
    expect(pay.structurePayCents).toBe(38_500);
    expect(pay.accessorialPayCents).toBe(2 * 2_000);
    expect(pay.grossPayCents).toBe(42_500);
  });

  it("carries the hourly breakdown through when the hourly side wins", () => {
    const load = makeLoad({
      loadedMiles: 100,
      paidMiles: 100,
      startedAt: "2026-03-02T05:00:00-06:00",
      endedAt: "2026-03-02T16:00:00-06:00",
    });
    const pay = computePay(loadToPayableWork(load), {
      kind: "hybrid",
      primary: hourly({ hourlyRateCents: 2800, overtimeBasis: "daily", overtimeThresholdHours: 8 }),
      floor: { kind: "per_mile", cpmCents: 55, mileageBasis: "practical" },
    });
    expect(pay.basis).toBe("hybrid_primary");
    expect(pay.hourly!.overtimeHours).toBe(3);
  });
});

describe("driver accessorial pay", () => {
  it("pays detention only past the free hours", () => {
    const work = { ...EMPTY_WORK, waitingHours: 6, stopCount: 2 };
    expect(
      accessorialPayCents(work, {
        detentionPerHourCents: 2_500,
        detentionFreeHours: 2,
        stopPayCents: 0,
        freeStops: 2,
        layoverPerDayCents: 0,
      }),
    ).toBe(4 * 2_500);
  });

  it("pays nothing when the wait never clears the free window", () => {
    const work = { ...EMPTY_WORK, waitingHours: 1.5 };
    expect(
      accessorialPayCents(work, {
        detentionPerHourCents: 2_500,
        detentionFreeHours: 2,
        stopPayCents: 0,
        freeStops: 2,
        layoverPerDayCents: 0,
      }),
    ).toBe(0);
  });

  it("pays layover for each night a load ran past its first day", () => {
    const load = makeLoad({
      startedAt: "2026-03-02T20:00:00-06:00",
      endedAt: "2026-03-04T09:00:00-06:00",
    });
    const pay = computeLoadPay(load, { kind: "per_mile", cpmCents: 62, mileageBasis: "practical" }, {
      accessorials: {
        detentionPerHourCents: 0,
        detentionFreeHours: 0,
        stopPayCents: 0,
        freeStops: 2,
        layoverPerDayCents: 15_000,
      },
    });
    expect(pay.accessorialPayCents).toBe(2 * 15_000);
  });

  it("defaults to paying no accessorials when nothing is configured", () => {
    const work = { ...EMPTY_WORK, waitingHours: 8, stopCount: 6 };
    expect(accessorialPayCents(work)).toBe(0);
  });
});

describe("effective hourly rate", () => {
  it("is computed for a per-mile driver who sat all day", () => {
    // 400 paid miles at $0.62 is $248. Fourteen hours of it is $17.71/hr, and
    // that is the whole point of the number.
    const load = makeLoad({
      loadedMiles: 400,
      paidMiles: 400,
      hours: { worked: 14, driving: 7, loading: 1, waiting: 6, unpaidBreak: null },
    });
    const pay = computeLoadPay(load, { kind: "per_mile", cpmCents: 62, mileageBasis: "practical" });

    expect(pay.grossPayCents).toBe(24_800);
    expect(pay.hoursWorked).toBe(14);
    expect(pay.effectiveHourlyCents).toBeCloseTo(24_800 / 14, 6);
  });

  it("is blank rather than wrong when hours are unknown", () => {
    const load = makeLoad({ startedAt: null, endedAt: null });
    const pay = computeLoadPay(load, { kind: "per_mile", cpmCents: 62, mileageBasis: "practical" });
    expect(pay.hoursWorked).toBeNull();
    expect(pay.effectiveHourlyCents).toBeNull();
    expect(effectiveHourlyCents(50_000, null)).toBeNull();
    expect(effectiveHourlyCents(50_000, 0)).toBeNull();
  });

  it("uses payable hours, not worked hours, when breaks are paid", () => {
    const load = makeLoad({
      startedAt: "2026-03-02T06:00:00-06:00",
      endedAt: "2026-03-02T16:00:00-06:00",
      hours: { worked: null, driving: null, loading: null, waiting: null, unpaidBreak: 1 },
    });
    const pay = computeLoadPay(load, hourly({ breaksPaid: true, overtimeBasis: "none" }));
    expect(pay.hoursWorked).toBe(10);
    expect(pay.structurePayCents).toBe(10 * 2500);
  });
});

describe("net pay", () => {
  it("takes the driver's own expenses off gross pay", () => {
    expect(netPayCents(120_000, 18_500)).toBe(101_500);
  });
});
