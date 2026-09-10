import { perMile, roundCents, roundMiles, type Cents, type Miles } from "./money";
import {
  daysInMonth,
  daysOfRangeInMonth,
  monthsInRange,
  rangeLengthDays,
  type DateRange,
} from "./time";
import type { CostPerMileResult, ExpenseInput, FixedCostInput, RecurrenceFrequency } from "./types";

/**
 * Cost-per-mile and breakeven.
 *
 * The rule that makes these numbers trustworthy: annual costs are amortized,
 * never dumped into the month they were paid. A driver who buys plates and a
 * 2290 in July should not see July run at a loss and every other month look
 * artificially cheap.
 */

/** Occurrences per year for each recurrence, used to amortize onto a month. */
const OCCURRENCES_PER_YEAR: Record<RecurrenceFrequency, number> = {
  none: 0,
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

const DAYS_PER_YEAR = 365;

/** What one recurring cost works out to per month. */
export function monthlyEquivalentCents(amountCents: Cents, frequency: RecurrenceFrequency): Cents {
  const perYear = OCCURRENCES_PER_YEAR[frequency];
  if (!perYear) return 0;
  return roundCents((amountCents * perYear) / 12);
}

export function monthlyFixedCostCents(
  costs: readonly FixedCostInput[],
  truckId?: string | null,
): Cents {
  let total = 0;
  for (const cost of costs) {
    if (truckId !== undefined && truckId !== null && cost.truckId !== null && cost.truckId !== truckId) {
      continue;
    }
    total += monthlyEquivalentCents(cost.amountCents, cost.frequency);
  }
  return roundCents(total);
}

/**
 * The truck's fixed cost for one day. Built off the annual figure rather than
 * dividing a month, so February and July cost the same per day.
 */
export function dailyFixedCostCents(monthlyFixedCents: Cents): Cents {
  return roundCents((monthlyFixedCents * 12) / DAYS_PER_YEAR);
}

/**
 * Fixed cost attributable to a date range.
 *
 * A range is charged month by month, each month contributing its own monthly
 * figure prorated by the days of the range that fall inside it. A settlement
 * week running 30 August to 5 September therefore pulls two days from August
 * and five from September, instead of guessing which month owns the week.
 */
export function fixedCostForRange(range: DateRange, monthlyFixedCents: Cents): Cents {
  if (monthlyFixedCents === 0) return 0;
  let total = 0;
  for (const monthKey of monthsInRange(range)) {
    const monthStart = `${monthKey}-01`;
    const daysInThisMonth = daysInMonth(monthStart);
    const overlap = daysOfRangeInMonth(range, monthKey);
    if (overlap <= 0) continue;
    total += (monthlyFixedCents * overlap) / daysInThisMonth;
  }
  return roundCents(total);
}

export function variableExpenseCents(expenses: readonly ExpenseInput[]): Cents {
  return roundCents(
    expenses.filter((e) => !e.isFixed).reduce((sum, e) => sum + e.amountCents, 0),
  );
}

export function fixedExpenseCents(expenses: readonly ExpenseInput[]): Cents {
  return roundCents(expenses.filter((e) => e.isFixed).reduce((sum, e) => sum + e.amountCents, 0));
}

export interface CostPerMileInput {
  range: DateRange;
  miles: Miles;
  monthlyFixedCents: Cents;
  variableExpenses: readonly ExpenseInput[];
}

/**
 * Fixed CPM, variable CPM, total CPM, and the breakeven rate they imply.
 *
 * Every rate comes back null when there are no miles to divide by, rather than
 * Infinity — a truck that ran zero miles has no cost per mile, and the UI says
 * so instead of printing a nonsense number.
 */
export function computeCostPerMile(input: CostPerMileInput): CostPerMileResult {
  const miles = roundMiles(Math.max(0, input.miles));
  const fixedCents = fixedCostForRange(input.range, input.monthlyFixedCents);
  const variableCents = variableExpenseCents(input.variableExpenses);

  const fixedCpm = perMile(fixedCents, miles);
  const variableCpm = perMile(variableCents, miles);
  const totalCpm = fixedCpm === null || variableCpm === null ? null : fixedCpm + variableCpm;

  return {
    fixedCpm,
    variableCpm,
    totalCpm,
    breakevenRpm: totalCpm,
    monthlyFixedCents: input.monthlyFixedCents,
    variableCents,
    miles,
  };
}

export interface BreakevenCheck {
  /** All-in rate per mile for the load being checked, in cents. */
  loadRpm: number | null;
  breakevenRpm: number | null;
  /** Positive means the load clears breakeven. */
  marginPerMile: number | null;
  belowBreakeven: boolean;
}

/**
 * Compares a load against the truck's breakeven so the load form can flag a
 * bad rate while it is still being entered.
 */
export function checkBreakeven(loadRpm: number | null, breakevenRpm: number | null): BreakevenCheck {
  if (loadRpm === null || breakevenRpm === null) {
    return { loadRpm, breakevenRpm, marginPerMile: null, belowBreakeven: false };
  }
  const margin = loadRpm - breakevenRpm;
  return { loadRpm, breakevenRpm, marginPerMile: margin, belowBreakeven: margin < 0 };
}

/** Average daily fixed cost across a range, for allocating onto loads inside it. */
export function dailyFixedCostForRange(range: DateRange, monthlyFixedCents: Cents): Cents {
  const days = rangeLengthDays(range);
  if (days <= 0) return 0;
  return roundCents(fixedCostForRange(range, monthlyFixedCents) / days);
}

export interface FuelStats {
  gallons: number;
  fuelCents: Cents;
  miles: Miles;
  mpg: number | null;
  costPerGallonCents: number | null;
  fuelCostPerMile: number | null;
}

/** Rolling MPG and fuel cost per mile from fuel entries against miles run. */
export function computeFuelStats(
  entries: readonly { gallons: number; amountCents: Cents }[],
  miles: Miles,
): FuelStats {
  const gallons = entries.reduce((sum, e) => sum + Math.max(0, e.gallons), 0);
  const fuelCents = roundCents(entries.reduce((sum, e) => sum + e.amountCents, 0));
  const safeMiles = roundMiles(Math.max(0, miles));
  return {
    gallons: Math.round(gallons * 1000) / 1000,
    fuelCents,
    miles: safeMiles,
    mpg: gallons > 0 && safeMiles > 0 ? safeMiles / gallons : null,
    costPerGallonCents: gallons > 0 ? fuelCents / gallons : null,
    fuelCostPerMile: perMile(fuelCents, safeMiles),
  };
}
