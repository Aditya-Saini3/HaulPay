import { roundCents, type Cents } from "./money";
import {
  compareDays,
  hoursBetween,
  roundHours,
  startOfWeek,
  type DayKey,
  type WeekStart,
} from "./time";
import type { HourlyStructure, ShiftInput, WorkDay } from "./types";

export interface HourlyDayBreakdown {
  day: DayKey;
  payableHours: number;
  regularHours: number;
  overtimeHours: number;
  regularPayCents: Cents;
  overtimePayCents: Cents;
  /** What the guarantee added on a short day. Zero on a normal one. */
  guaranteedTopUpCents: Cents;
  totalCents: Cents;
  /** True when show-up pay, not hours worked, set this day's pay. */
  guaranteeApplied: boolean;
}

export interface HourlyPayResult {
  payableHours: number;
  regularHours: number;
  overtimeHours: number;
  regularPayCents: Cents;
  overtimePayCents: Cents;
  guaranteedTopUpCents: Cents;
  totalCents: Cents;
  days: HourlyDayBreakdown[];
}

export function overtimeRateOf(structure: HourlyStructure): number {
  if (structure.overtimeRateCents !== null && Number.isFinite(structure.overtimeRateCents)) {
    return structure.overtimeRateCents;
  }
  return structure.hourlyRateCents * 1.5;
}

/**
 * Hours the employer pays for. Break time comes back on the clock when the
 * structure says breaks are paid — the field is still called "unpaid break"
 * everywhere else because that is what the driver is recording: time off the
 * wheel. Whether it gets paid is the employer's policy, not the driver's entry.
 */
export function payableHoursOf(day: WorkDay, structure: HourlyStructure): number {
  const base = Math.max(0, day.workedHours);
  const breaks = Math.max(0, day.breakHours);
  return roundHours(structure.breaksPaid ? base + breaks : base);
}

/**
 * A shift reduced to a work day. The manual hours entry wins when present;
 * otherwise the start/end span less the break. Because the span is the
 * difference between two instants, a shift that clocks in at 21:00 and out at
 * 05:00 the next morning is eight hours, with no midnight special case.
 */
export function shiftToWorkDay(shift: ShiftInput): WorkDay {
  const breakHours = Math.max(0, shift.unpaidBreakHours || 0);
  if (shift.hoursWorked !== null && Number.isFinite(shift.hoursWorked)) {
    return {
      day: shift.workDate,
      workedHours: roundHours(Math.max(0, shift.hoursWorked)),
      breakHours,
    };
  }
  if (shift.startAt && shift.endAt) {
    const span = hoursBetween(shift.startAt, shift.endAt);
    if (span !== null) {
      return {
        day: shift.workDate,
        workedHours: roundHours(Math.max(0, span - breakHours)),
        breakHours,
      };
    }
  }
  return { day: shift.workDate, workedHours: 0, breakHours };
}

/** Two entries on the same calendar day are one day of work for overtime. */
export function mergeWorkDays(days: readonly WorkDay[]): WorkDay[] {
  const byDay = new Map<DayKey, WorkDay>();
  for (const entry of days) {
    const existing = byDay.get(entry.day);
    if (existing) {
      existing.workedHours = roundHours(existing.workedHours + entry.workedHours);
      existing.breakHours = roundHours(existing.breakHours + entry.breakHours);
    } else {
      byDay.set(entry.day, { ...entry });
    }
  }
  return [...byDay.values()].sort((a, b) => compareDays(a.day, b.day));
}

interface DaySplit {
  day: DayKey;
  payableHours: number;
  regularHours: number;
  overtimeHours: number;
}

/**
 * Splits payable hours into regular and overtime.
 *
 * `daily` compares each day against the threshold on its own. `weekly` walks
 * the days in order and puts every hour past the threshold into overtime, so
 * the overtime lands on the end of the week the way a timesheet reads it. The
 * caller is responsible for handing in exactly one week's days when the basis
 * is weekly — `computeWeeklyHourlyPay` does that grouping.
 */
function splitRegularAndOvertime(
  days: readonly WorkDay[],
  structure: HourlyStructure,
  priorPayableHours: number,
): DaySplit[] {
  const threshold = structure.overtimeThresholdHours;
  const hasThreshold =
    structure.overtimeBasis !== "none" && threshold !== null && Number.isFinite(threshold) && threshold >= 0;

  if (!hasThreshold) {
    return days.map((d) => {
      const payable = payableHoursOf(d, structure);
      return { day: d.day, payableHours: payable, regularHours: payable, overtimeHours: 0 };
    });
  }

  if (structure.overtimeBasis === "daily") {
    return days.map((d) => {
      const payable = payableHoursOf(d, structure);
      const regular = Math.min(payable, threshold);
      return {
        day: d.day,
        payableHours: payable,
        regularHours: roundHours(regular),
        overtimeHours: roundHours(Math.max(0, payable - regular)),
      };
    });
  }

  // Weekly: overtime accrues once the running total passes the threshold.
  let running = Math.max(0, priorPayableHours);
  return days.map((d) => {
    const payable = payableHoursOf(d, structure);
    const remainingRegular = Math.max(0, threshold - running);
    const regular = Math.min(payable, remainingRegular);
    running += payable;
    return {
      day: d.day,
      payableHours: payable,
      regularHours: roundHours(regular),
      overtimeHours: roundHours(Math.max(0, payable - regular)),
    };
  });
}

export interface HourlyPayOptions {
  /**
   * Payable hours already booked earlier in the same overtime period. Lets a
   * single load or shift be priced correctly against a week that is already
   * partly spent, instead of pretending it is the only work of the week.
   */
  priorPayableHours?: number;
}

/**
 * Hourly pay across a set of work days.
 *
 * The guaranteed daily minimum is a floor on the *day's pay*, not on its hours.
 * A driver who shows up, works two hours and goes home on an eight-hour
 * guarantee is paid eight hours straight time. It does not inflate the hours
 * that count toward the overtime threshold, because overtime is owed on hours
 * worked, not hours paid — so a guarantee never manufactures overtime.
 */
export function computeHourlyPay(
  workDays: readonly WorkDay[],
  structure: HourlyStructure,
  options: HourlyPayOptions = {},
): HourlyPayResult {
  const merged = mergeWorkDays(workDays);
  const splits = splitRegularAndOvertime(merged, structure, options.priorPayableHours ?? 0);
  const otRate = overtimeRateOf(structure);
  const guaranteeHours =
    structure.guaranteedDailyHours !== null && structure.guaranteedDailyHours > 0
      ? structure.guaranteedDailyHours
      : 0;
  const guaranteeFloorCents = roundCents(guaranteeHours * structure.hourlyRateCents);

  const days: HourlyDayBreakdown[] = splits.map((split) => {
    const regularPay = roundCents(split.regularHours * structure.hourlyRateCents);
    const overtimePay = roundCents(split.overtimeHours * otRate);
    const earned = roundCents(regularPay + overtimePay);
    const guaranteeApplied = guaranteeFloorCents > earned;
    const topUp = guaranteeApplied ? roundCents(guaranteeFloorCents - earned) : 0;
    return {
      day: split.day,
      payableHours: split.payableHours,
      regularHours: split.regularHours,
      overtimeHours: split.overtimeHours,
      regularPayCents: regularPay,
      overtimePayCents: overtimePay,
      guaranteedTopUpCents: topUp,
      totalCents: roundCents(earned + topUp),
      guaranteeApplied,
    };
  });

  const acc = days.reduce(
    (sum, d) => ({
      payableHours: sum.payableHours + d.payableHours,
      regularHours: sum.regularHours + d.regularHours,
      overtimeHours: sum.overtimeHours + d.overtimeHours,
      regularPayCents: sum.regularPayCents + d.regularPayCents,
      overtimePayCents: sum.overtimePayCents + d.overtimePayCents,
      guaranteedTopUpCents: sum.guaranteedTopUpCents + d.guaranteedTopUpCents,
      totalCents: sum.totalCents + d.totalCents,
    }),
    {
      payableHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      regularPayCents: 0,
      overtimePayCents: 0,
      guaranteedTopUpCents: 0,
      totalCents: 0,
    },
  );

  return {
    payableHours: roundHours(acc.payableHours),
    regularHours: roundHours(acc.regularHours),
    overtimeHours: roundHours(acc.overtimeHours),
    regularPayCents: roundCents(acc.regularPayCents),
    overtimePayCents: roundCents(acc.overtimePayCents),
    guaranteedTopUpCents: roundCents(acc.guaranteedTopUpCents),
    totalCents: roundCents(acc.totalCents),
    days,
  };
}

/**
 * Hourly pay over any span of days, grouping into overtime periods first.
 *
 * With a weekly basis the days are cut into settlement weeks before overtime is
 * applied, so a week that straddles a month or quarter boundary is still priced
 * as one week — the overtime threshold belongs to the workweek, not to the
 * reporting range that happens to be on screen.
 */
export function computeHourlyPayOverRange(
  workDays: readonly WorkDay[],
  structure: HourlyStructure,
  weekStart: WeekStart = "sunday",
): HourlyPayResult {
  if (structure.overtimeBasis !== "weekly") {
    return computeHourlyPay(workDays, structure);
  }

  const merged = mergeWorkDays(workDays);
  const byWeek = new Map<DayKey, WorkDay[]>();
  for (const day of merged) {
    const key = startOfWeek(day.day, weekStart);
    const bucket = byWeek.get(key);
    if (bucket) bucket.push(day);
    else byWeek.set(key, [day]);
  }

  const weekResults = [...byWeek.entries()]
    .sort((a, b) => compareDays(a[0], b[0]))
    .map(([, days]) => computeHourlyPay(days, structure));

  return mergeHourlyResults(weekResults);
}

export function mergeHourlyResults(results: readonly HourlyPayResult[]): HourlyPayResult {
  const days = results.flatMap((r) => r.days).sort((a, b) => compareDays(a.day, b.day));
  const acc = results.reduce(
    (sum, r) => ({
      payableHours: sum.payableHours + r.payableHours,
      regularHours: sum.regularHours + r.regularHours,
      overtimeHours: sum.overtimeHours + r.overtimeHours,
      regularPayCents: sum.regularPayCents + r.regularPayCents,
      overtimePayCents: sum.overtimePayCents + r.overtimePayCents,
      guaranteedTopUpCents: sum.guaranteedTopUpCents + r.guaranteedTopUpCents,
      totalCents: sum.totalCents + r.totalCents,
    }),
    {
      payableHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      regularPayCents: 0,
      overtimePayCents: 0,
      guaranteedTopUpCents: 0,
      totalCents: 0,
    },
  );
  return {
    payableHours: roundHours(acc.payableHours),
    regularHours: roundHours(acc.regularHours),
    overtimeHours: roundHours(acc.overtimeHours),
    regularPayCents: roundCents(acc.regularPayCents),
    overtimePayCents: roundCents(acc.overtimePayCents),
    guaranteedTopUpCents: roundCents(acc.guaranteedTopUpCents),
    totalCents: roundCents(acc.totalCents),
    days,
  };
}
