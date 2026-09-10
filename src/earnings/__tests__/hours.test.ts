import {
  computeHourlyPay,
  computeHourlyPayOverRange,
  mergeWorkDays,
  overtimeRateOf,
  payableHoursOf,
  shiftToWorkDay,
} from "../hours";
import { day, hourly, makeShift } from "./helpers";

describe("shift to work day", () => {
  it("handles a shift that crosses midnight", () => {
    // Clock in 21:00 Monday, clock out 05:30 Tuesday, 30-minute break.
    const shift = makeShift({
      workDate: "2026-03-02",
      startAt: "2026-03-02T21:00:00-06:00",
      endAt: "2026-03-03T05:30:00-06:00",
      unpaidBreakHours: 0.5,
    });
    const work = shiftToWorkDay(shift);

    expect(work.day).toBe("2026-03-02");
    expect(work.workedHours).toBe(8);
    expect(work.breakHours).toBe(0.5);
  });

  it("books a midnight-crossing shift entirely to the day it started", () => {
    // The hours do not get split across two settlement days, and they do not
    // land on the day the driver happened to clock out.
    const shift = makeShift({
      workDate: "2026-03-02",
      startAt: "2026-03-02T22:00:00-06:00",
      endAt: "2026-03-03T08:00:00-06:00",
      unpaidBreakHours: 0,
    });
    const structure = hourly({ overtimeBasis: "daily", overtimeThresholdHours: 8 });
    const result = computeHourlyPay([shiftToWorkDay(shift)], structure);

    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.day).toBe("2026-03-02");
    expect(result.days[0]!.payableHours).toBe(10);
    expect(result.days[0]!.overtimeHours).toBe(2);
  });

  it("prefers a manual hours entry over the span", () => {
    const shift = makeShift({ hoursWorked: 6.25, unpaidBreakHours: 0.5 });
    expect(shiftToWorkDay(shift).workedHours).toBe(6.25);
  });

  it("falls back to zero hours rather than NaN on an unfinished shift", () => {
    expect(shiftToWorkDay(makeShift({ startAt: "2026-03-02T06:00:00-06:00", endAt: null })).workedHours).toBe(0);
  });

  it("merges two entries on the same calendar day into one day of work", () => {
    const merged = mergeWorkDays([day("2026-03-02", 5), day("2026-03-02", 4, 0.5), day("2026-03-03", 3)]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ day: "2026-03-02", workedHours: 9, breakHours: 0.5 });
    expect(merged[1]!.day).toBe("2026-03-03");
  });
});

describe("paid and unpaid breaks", () => {
  it("keeps break time off the clock by default", () => {
    const structure = hourly({ breaksPaid: false });
    expect(payableHoursOf(day("2026-03-02", 9.5, 0.5), structure)).toBe(9.5);
  });

  it("puts break time back on the clock when the employer pays breaks", () => {
    const structure = hourly({ breaksPaid: true });
    expect(payableHoursOf(day("2026-03-02", 9.5, 0.5), structure)).toBe(10);
  });

  it("can push a day into overtime purely because breaks are paid", () => {
    const worked = [day("2026-03-02", 8, 0.5)];
    const unpaidBreaks = computeHourlyPay(worked, hourly({ overtimeBasis: "daily", overtimeThresholdHours: 8, breaksPaid: false }));
    const paidBreaks = computeHourlyPay(worked, hourly({ overtimeBasis: "daily", overtimeThresholdHours: 8, breaksPaid: true }));

    expect(unpaidBreaks.overtimeHours).toBe(0);
    expect(paidBreaks.overtimeHours).toBe(0.5);
  });
});

describe("overtime basis", () => {
  const week = [
    day("2026-03-01", 10),
    day("2026-03-02", 10),
    day("2026-03-03", 10),
    day("2026-03-04", 10),
  ];

  it("pays daily overtime on each day past the threshold", () => {
    const result = computeHourlyPay(week, hourly({ overtimeBasis: "daily", overtimeThresholdHours: 8 }));

    // Four 10-hour days: 32 regular, 8 overtime.
    expect(result.regularHours).toBe(32);
    expect(result.overtimeHours).toBe(8);
    expect(result.regularPayCents).toBe(32 * 2500);
    expect(result.overtimePayCents).toBe(8 * 3750);
    expect(result.totalCents).toBe(80_000 + 30_000);
  });

  it("pays weekly overtime only past the weekly threshold, on the same hours", () => {
    const result = computeHourlyPay(week, hourly({ overtimeBasis: "weekly", overtimeThresholdHours: 40 }));

    // Same 40 hours, but none of them clear a 40-hour week.
    expect(result.regularHours).toBe(40);
    expect(result.overtimeHours).toBe(0);
    expect(result.totalCents).toBe(40 * 2500);
  });

  it("lands weekly overtime on the end of the week", () => {
    const result = computeHourlyPay(
      [...week, day("2026-03-05", 10)],
      hourly({ overtimeBasis: "weekly", overtimeThresholdHours: 40 }),
    );

    expect(result.regularHours).toBe(40);
    expect(result.overtimeHours).toBe(10);
    const friday = result.days.find((d) => d.day === "2026-03-05")!;
    expect(friday.regularHours).toBe(0);
    expect(friday.overtimeHours).toBe(10);
    expect(result.days.find((d) => d.day === "2026-03-04")!.overtimeHours).toBe(0);
  });

  it("pays no overtime at all when the basis is none", () => {
    const result = computeHourlyPay(
      [...week, day("2026-03-05", 12)],
      hourly({ overtimeBasis: "none", overtimeThresholdHours: 40 }),
    );
    expect(result.overtimeHours).toBe(0);
    expect(result.totalCents).toBe(52 * 2500);
  });

  it("prices a load against hours already worked earlier in the week", () => {
    const structure = hourly({ overtimeBasis: "weekly", overtimeThresholdHours: 40 });
    const friday = [day("2026-03-06", 9)];

    const alone = computeHourlyPay(friday, structure);
    expect(alone.overtimeHours).toBe(0);

    const afterAFullWeek = computeHourlyPay(friday, structure, { priorPayableHours: 36 });
    expect(afterAFullWeek.regularHours).toBe(4);
    expect(afterAFullWeek.overtimeHours).toBe(5);
  });

  it("uses an explicit overtime rate over time-and-a-half", () => {
    expect(overtimeRateOf(hourly({ hourlyRateCents: 2500 }))).toBe(3750);
    expect(overtimeRateOf(hourly({ hourlyRateCents: 2500, overtimeRateCents: 4000 }))).toBe(4000);
  });
});

describe("guaranteed daily minimum", () => {
  it("tops a short day up to the guarantee", () => {
    const structure = hourly({ overtimeBasis: "daily", overtimeThresholdHours: 8, guaranteedDailyHours: 8 });
    const result = computeHourlyPay([day("2026-03-02", 2)], structure);

    expect(result.days[0]!.guaranteeApplied).toBe(true);
    expect(result.days[0]!.guaranteedTopUpCents).toBe(6 * 2500);
    expect(result.totalCents).toBe(8 * 2500);
    // The guarantee pays for hours that were never worked, so it must not
    // create overtime.
    expect(result.overtimeHours).toBe(0);
  });

  it("does nothing on a day that already earns more than the guarantee", () => {
    const structure = hourly({ overtimeBasis: "daily", overtimeThresholdHours: 8, guaranteedDailyHours: 8 });
    const result = computeHourlyPay([day("2026-03-02", 10)], structure);

    expect(result.days[0]!.guaranteeApplied).toBe(false);
    expect(result.guaranteedTopUpCents).toBe(0);
    expect(result.totalCents).toBe(8 * 2500 + 2 * 3750);
  });

  it("never manufactures overtime out of guaranteed hours in a weekly week", () => {
    // Five two-hour days on an eight-hour guarantee pays 40 hours of money, but
    // only 10 hours were worked, so nothing crosses a 40-hour threshold.
    const structure = hourly({
      overtimeBasis: "weekly",
      overtimeThresholdHours: 40,
      guaranteedDailyHours: 8,
    });
    const result = computeHourlyPay(
      [
        day("2026-03-01", 2),
        day("2026-03-02", 2),
        day("2026-03-03", 2),
        day("2026-03-04", 2),
        day("2026-03-05", 2),
      ],
      structure,
    );

    expect(result.overtimeHours).toBe(0);
    expect(result.overtimePayCents).toBe(0);
    expect(result.totalCents).toBe(5 * 8 * 2500);
  });
});

describe("weekly overtime across a reporting range", () => {
  it("keeps a week that straddles two months as one overtime period", () => {
    // Sunday 30 August 2026 to Saturday 5 September 2026: 45 hours in one
    // workweek, split 2 days in August and 5 in September.
    const structure = hourly({ overtimeBasis: "weekly", overtimeThresholdHours: 40 });
    const days = [
      day("2026-08-30", 5),
      day("2026-08-31", 10),
      day("2026-09-01", 10),
      day("2026-09-02", 10),
      day("2026-09-03", 10),
    ];

    const result = computeHourlyPayOverRange(days, structure, "sunday");

    expect(result.payableHours).toBe(45);
    expect(result.regularHours).toBe(40);
    expect(result.overtimeHours).toBe(5);
    expect(result.totalCents).toBe(40 * 2500 + 5 * 3750);
  });

  it("resets the overtime threshold at each week boundary", () => {
    // 35 hours in one week and 35 in the next is 70 hours and no overtime,
    // even though the range holds far more than 40.
    const structure = hourly({ overtimeBasis: "weekly", overtimeThresholdHours: 40 });
    const days = [
      day("2026-09-07", 35),
      // 2026-09-13 is the following Sunday, so a new settlement week.
      day("2026-09-13", 35),
    ];

    const result = computeHourlyPayOverRange(days, structure, "sunday");
    expect(result.overtimeHours).toBe(0);
    expect(result.totalCents).toBe(70 * 2500);
  });

  it("moves the boundary when the settlement week starts on Monday", () => {
    // Sunday 13 September belongs to the previous week under a Monday start, so
    // the two 35-hour blocks now share a week and 30 hours go to overtime.
    const structure = hourly({ overtimeBasis: "weekly", overtimeThresholdHours: 40 });
    const days = [day("2026-09-07", 35), day("2026-09-13", 35)];

    const result = computeHourlyPayOverRange(days, structure, "monday");
    expect(result.regularHours).toBe(40);
    expect(result.overtimeHours).toBe(30);
  });
});
