import {
  computeCostPerMile,
  dailyFixedCostCents,
  fixedCostForRange,
  monthlyFixedCostCents,
  variableExpenseCents,
} from "./costs";
import { computeHourlyPayOverRange, shiftToWorkDay, mergeWorkDays } from "./hours";
import { computeLoad, type LoadResult } from "./load";
import { perHour, perMile, roundCents, roundMiles, type Cents, type Miles } from "./money";
import { computePay, loadToPayableWork, netPayCents, perDiemCents, type PayBreakdown } from "./pay";
import {
  dayKeyOf,
  rangeContains,
  startOfWeek,
  type DateRange,
  type DayKey,
  type WeekStart,
} from "./time";
import type {
  ExpenseInput,
  FixedCostInput,
  LoadInput,
  PayStructure,
  PerDiem,
  Role,
  ShiftInput,
  DriverAccessorialPay,
  WorkDay,
} from "./types";

/**
 * Range rollups: the same set of loads, shifts and expenses reduced to the
 * numbers a dashboard or a P&L needs, in either of the two worlds the app
 * models — revenue for people who own the truck, pay for people who drive
 * someone else's.
 */

export interface RollupInput {
  role: Role;
  range: DateRange;
  loads: readonly LoadInput[];
  shifts: readonly ShiftInput[];
  expenses: readonly ExpenseInput[];
  fixedCosts: readonly FixedCostInput[];
  payStructure: PayStructure | null;
  accessorialPay?: DriverAccessorialPay;
  perDiem?: PerDiem | null;
  weekStart?: WeekStart;
  /** Fixed-cost allocation onto individual loads. Off for company drivers. */
  includeFixedCostsOnLoads?: boolean;
  /** Restricts every figure to one truck, for the carrier per-truck views. */
  truckId?: string | null;
}

export interface RevenueRollup {
  grossCents: Cents;
  netRevenueCents: Cents;
  variableExpenseCents: Cents;
  fixedCostCents: Cents;
  totalExpenseCents: Cents;
  netProfitCents: Cents;
  loadedMiles: Miles;
  deadheadMiles: Miles;
  paidMiles: Miles;
  totalMiles: Miles;
  deadheadPercent: number | null;
  ratePerMile: number | null;
  allInRatePerMile: number | null;
  profitPerMile: number | null;
  costPerMile: number | null;
  breakevenRpm: number | null;
  loadCount: number;
  hoursWorked: number;
  effectiveHourlyCents: number | null;
}

export interface DriverRollup {
  grossPayCents: Cents;
  /** Included in gross pay, broken out because it is not taxed the same way. */
  perDiemCents: Cents;
  personalExpenseCents: Cents;
  netPayCents: Cents;
  regularHours: number;
  overtimeHours: number;
  hoursWorked: number;
  effectiveHourlyCents: number | null;
  paidMiles: Miles;
  totalMiles: Miles;
  loadCount: number;
  shiftCount: number;
  centsPerPaidMile: number | null;
}

export interface Rollup {
  range: DateRange;
  role: Role;
  revenue: RevenueRollup;
  driver: DriverRollup | null;
  loadResults: LoadResult[];
  payResults: { loadId: string; pay: PayBreakdown }[];
}

function loadDay(load: LoadInput): DayKey | null {
  return dayKeyOf(load.startedAt ?? load.endedAt ?? "");
}

export function loadsInRange(loads: readonly LoadInput[], range: DateRange): LoadInput[] {
  return loads.filter((load) => {
    const day = loadDay(load);
    return day !== null && rangeContains(range, day);
  });
}

export function shiftsInRange(shifts: readonly ShiftInput[], range: DateRange): ShiftInput[] {
  return shifts.filter((shift) => rangeContains(range, shift.workDate));
}

export function expensesInRange(expenses: readonly ExpenseInput[], range: DateRange): ExpenseInput[] {
  return expenses.filter((expense) => rangeContains(range, expense.incurredOn));
}

function byTruck<T extends { truckId?: string | null }>(rows: readonly T[], truckId?: string | null): T[] {
  if (truckId === undefined || truckId === null) return [...rows];
  return rows.filter((row) => row.truckId === truckId);
}

/**
 * Work days for the hourly engine, pulled from shifts and from any load hours
 * that are not already covered by a shift on the same day. A driver who logs
 * both would otherwise be paid twice for the same afternoon.
 */
export function collectWorkDays(
  loads: readonly LoadInput[],
  shifts: readonly ShiftInput[],
): WorkDay[] {
  const shiftDays = shifts.map(shiftToWorkDay);
  const covered = new Set(shiftDays.map((d) => d.day));
  const loadDays: WorkDay[] = [];
  for (const load of loads) {
    const work = loadToPayableWork(load);
    for (const day of work.workDays) {
      if (!covered.has(day.day)) loadDays.push(day);
    }
  }
  return mergeWorkDays([...shiftDays, ...loadDays]);
}

export function computeRollup(input: RollupInput): Rollup {
  const truckId = input.truckId ?? null;
  const loads = byTruck(loadsInRange(input.loads, input.range), truckId);
  const shifts = byTruck(shiftsInRange(input.shifts, input.range), truckId);
  const expenses = byTruck(expensesInRange(input.expenses, input.range), truckId);

  const monthlyFixed = monthlyFixedCostCents(input.fixedCosts, truckId);
  const dailyFixed = dailyFixedCostCents(monthlyFixed);
  const includeFixedOnLoads =
    input.includeFixedCostsOnLoads ?? input.role !== "company_driver";

  const loadResults = loads.map((load) =>
    computeLoad(load, {
      includeFixedCosts: includeFixedOnLoads,
      dailyFixedCostCents: dailyFixed,
    }),
  );

  const gross = roundCents(loadResults.reduce((s, r) => s + r.money.grossCents, 0));
  const netRevenue = roundCents(loadResults.reduce((s, r) => s + r.money.netRevenueCents, 0));
  const loadedMiles = roundMiles(loadResults.reduce((s, r) => s + r.miles.loadedMiles, 0));
  const deadheadMiles = roundMiles(loadResults.reduce((s, r) => s + r.miles.deadheadMiles, 0));
  const paidMiles = roundMiles(loadResults.reduce((s, r) => s + r.miles.paidMiles, 0));
  const totalMiles = roundMiles(loadedMiles + deadheadMiles);

  const variableCents = variableExpenseCents(expenses);
  // Fixed cost for the range comes from the recurring-cost setup, prorated
  // across the months it touches — not from whatever fixed expenses happen to
  // have been keyed inside the window.
  const fixedCents = fixedCostForRange(input.range, monthlyFixed);
  const totalExpenses = roundCents(variableCents + fixedCents);
  const netProfit = roundCents(netRevenue - totalExpenses);

  const workDays = collectWorkDays(loads, shifts);
  const hoursWorked = roundHoursSum(workDays);

  const cpm = computeCostPerMile({
    range: input.range,
    miles: totalMiles,
    monthlyFixedCents: monthlyFixed,
    variableExpenses: expenses,
  });

  const revenue: RevenueRollup = {
    grossCents: gross,
    netRevenueCents: netRevenue,
    variableExpenseCents: variableCents,
    fixedCostCents: fixedCents,
    totalExpenseCents: totalExpenses,
    netProfitCents: netProfit,
    loadedMiles,
    deadheadMiles,
    paidMiles,
    totalMiles,
    deadheadPercent: totalMiles > 0 ? (deadheadMiles / totalMiles) * 100 : null,
    ratePerMile: perMile(gross, loadedMiles),
    allInRatePerMile: perMile(gross, totalMiles),
    profitPerMile: perMile(netProfit, totalMiles),
    costPerMile: cpm.totalCpm,
    breakevenRpm: cpm.breakevenRpm,
    loadCount: loadResults.length,
    hoursWorked,
    effectiveHourlyCents: perHour(netProfit, hoursWorked),
  };

  let driver: DriverRollup | null = null;
  const payResults: { loadId: string; pay: PayBreakdown }[] = [];

  if (input.role === "company_driver" && input.payStructure) {
    driver = computeDriverRollup({
      loads,
      shifts,
      expenses,
      structure: input.payStructure,
      accessorialPay: input.accessorialPay,
      perDiem: input.perDiem ?? null,
      weekStart: input.weekStart ?? "sunday",
      payResults,
      paidMiles,
      totalMiles,
    });
  }

  return { range: input.range, role: input.role, revenue, driver, loadResults, payResults };
}

function roundHoursSum(days: readonly WorkDay[]): number {
  return Math.round(days.reduce((sum, d) => sum + d.workedHours, 0) * 100) / 100;
}

interface DriverRollupArgs {
  loads: readonly LoadInput[];
  shifts: readonly ShiftInput[];
  expenses: readonly ExpenseInput[];
  structure: PayStructure;
  accessorialPay: DriverAccessorialPay | undefined;
  perDiem: PerDiem | null;
  weekStart: WeekStart;
  payResults: { loadId: string; pay: PayBreakdown }[];
  paidMiles: Miles;
  totalMiles: Miles;
}

/**
 * Driver pay across a range.
 *
 * Hourly and hybrid structures are settled per settlement week so the overtime
 * threshold lands where the workweek does, not where the reporting range does.
 * Non-hourly structures are settled per load, since that is the unit they are
 * quoted in.
 */
function computeDriverRollup(args: DriverRollupArgs): DriverRollup {
  const { structure, loads, shifts, weekStart } = args;
  const usesHours =
    structure.kind === "hourly" ||
    (structure.kind === "hybrid" &&
      (structure.primary.kind === "hourly" || structure.floor.kind === "hourly"));

  let grossPay = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let hoursWorked = 0;

  if (usesHours) {
    const workDays = collectWorkDays(loads, shifts);
    // Weeks are the overtime period, so each is priced whole and then summed.
    const weeks = new Map<DayKey, WorkDay[]>();
    for (const day of workDays) {
      const key = startOfWeek(day.day, weekStart);
      const bucket = weeks.get(key);
      if (bucket) bucket.push(day);
      else weeks.set(key, [day]);
    }

    for (const [weekKey, days] of weeks) {
      const weekLoads = loads.filter((l) => {
        const day = loadDay(l);
        return day !== null && startOfWeek(day, weekStart) === weekKey;
      });
      const weekWork = {
        paidMiles: roundMiles(
          weekLoads.reduce((s, l) => s + (l.paidMiles ?? l.loadedMiles), 0),
        ),
        linehaulCents: roundCents(weekLoads.reduce((s, l) => s + l.linehaulCents, 0)),
        fuelSurchargeCents: roundCents(
          weekLoads.reduce(
            (s, l) =>
              s +
              l.lineItems
                .filter((i) => i.kind === "accessorial" && i.code === "fuel_surcharge")
                .reduce((t, i) => t + (i.amountCents ?? 0), 0),
            0,
          ),
        ),
        workDays: days,
        stopCount: weekLoads.reduce((s, l) => s + l.stopCount, 0),
        waitingHours: weekLoads.reduce((s, l) => s + Math.max(0, l.hours.waiting ?? 0), 0),
        layoverDays: 0,
        hoursWorked: roundHoursSum(days),
      };

      const pay = computePay(weekWork, structure, {
        ...(args.accessorialPay ? { accessorials: args.accessorialPay } : {}),
      });
      grossPay += pay.grossPayCents;
      hoursWorked += pay.hoursWorked ?? 0;
      if (pay.hourly) {
        regularHours += pay.hourly.regularHours;
        overtimeHours += pay.hourly.overtimeHours;
      }
    }
  } else {
    for (const load of loads) {
      const pay = computePay(loadToPayableWork(load), structure, {
        ...(args.accessorialPay ? { accessorials: args.accessorialPay } : {}),
      });
      args.payResults.push({ loadId: load.id, pay });
      grossPay += pay.grossPayCents;
      hoursWorked += pay.hoursWorked ?? 0;
    }
    // Shifts still count as time on the clock for the effective hourly rate,
    // even when the structure does not pay by the hour.
    hoursWorked += roundHoursSum(shifts.map(shiftToWorkDay));
  }

  const personalExpenses = roundCents(args.expenses.reduce((s, e) => s + e.amountCents, 0));
  const perDiem = perDiemCents(collectWorkDays(loads, shifts), args.perDiem);
  const gross = roundCents(grossPay + perDiem);
  const hours = Math.round(hoursWorked * 100) / 100;

  return {
    grossPayCents: gross,
    perDiemCents: perDiem,
    personalExpenseCents: personalExpenses,
    netPayCents: netPayCents(gross, personalExpenses),
    regularHours: Math.round(regularHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    hoursWorked: hours,
    effectiveHourlyCents: perHour(gross, hours),
    paidMiles: args.paidMiles,
    totalMiles: args.totalMiles,
    loadCount: loads.length,
    shiftCount: shifts.length,
    centsPerPaidMile: perMile(gross, args.paidMiles),
  };
}

/** Weekly buckets for the dashboard bar chart. */
export interface WeekBucket {
  weekStart: DayKey;
  grossCents: Cents;
  netCents: Cents;
  miles: Miles;
  hours: number;
}

export function bucketByWeek(
  loads: readonly LoadInput[],
  expenses: readonly ExpenseInput[],
  shifts: readonly ShiftInput[],
  weekStart: WeekStart = "sunday",
): WeekBucket[] {
  const buckets = new Map<DayKey, WeekBucket>();
  const ensure = (day: DayKey): WeekBucket => {
    const key = startOfWeek(day, weekStart);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { weekStart: key, grossCents: 0, netCents: 0, miles: 0, hours: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const load of loads) {
    const day = loadDay(load);
    if (!day) continue;
    const result = computeLoad(load);
    const bucket = ensure(day);
    bucket.grossCents += result.money.grossCents;
    bucket.netCents += result.money.netRevenueCents;
    bucket.miles = roundMiles(bucket.miles + result.miles.totalMiles);
    bucket.hours = Math.round((bucket.hours + (result.hoursWorked ?? 0)) * 100) / 100;
  }
  for (const expense of expenses) {
    ensure(expense.incurredOn).netCents -= expense.amountCents;
  }
  for (const shift of shifts) {
    const bucket = ensure(shift.workDate);
    bucket.hours = Math.round((bucket.hours + shiftToWorkDay(shift).workedHours) * 100) / 100;
  }

  return [...buckets.values()]
    .map((b) => ({ ...b, grossCents: roundCents(b.grossCents), netCents: roundCents(b.netCents) }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));
}

/** Expenses grouped by category, for the dashboard donut and the P&L. */
export function bucketByCategory(
  expenses: readonly ExpenseInput[],
): { categoryId: string | null; categoryName: string; amountCents: Cents; count: number }[] {
  const map = new Map<string, { categoryId: string | null; categoryName: string; amountCents: Cents; count: number }>();
  for (const expense of expenses) {
    const key = expense.categoryId ?? expense.categoryName;
    const row = map.get(key);
    if (row) {
      row.amountCents = roundCents(row.amountCents + expense.amountCents);
      row.count += 1;
    } else {
      map.set(key, {
        categoryId: expense.categoryId,
        categoryName: expense.categoryName,
        amountCents: roundCents(expense.amountCents),
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.amountCents - a.amountCents);
}

/** Hourly pay across a range, for the Shifts screen header. */
export function computeShiftPay(
  shifts: readonly ShiftInput[],
  structure: PayStructure,
  weekStart: WeekStart = "sunday",
) {
  const hourly =
    structure.kind === "hourly"
      ? structure
      : structure.kind === "hybrid" && structure.primary.kind === "hourly"
        ? structure.primary
        : structure.kind === "hybrid" && structure.floor.kind === "hourly"
          ? structure.floor
          : null;
  if (!hourly) return null;
  return computeHourlyPayOverRange(shifts.map(shiftToWorkDay), hourly, weekStart);
}
