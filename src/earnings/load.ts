import { perHour, perMile, roundCents, roundMiles, sumCents, type Cents, type Miles } from "./money";
import { hoursBetween, occupiedDays } from "./time";
import type { LoadInput, LoadLineItem } from "./types";

export interface LoadMoney {
  linehaulCents: Cents;
  accessorialsCents: Cents;
  deductionsCents: Cents;
  grossCents: Cents;
  netRevenueCents: Cents;
}

export interface LoadMiles {
  loadedMiles: Miles;
  deadheadMiles: Miles;
  paidMiles: Miles;
  totalMiles: Miles;
  /** Miles run that nobody paid for: total minus paid. Often the whole story. */
  unpaidMiles: Miles;
  deadheadPercent: number | null;
}

export interface LoadResult {
  loadId: string;
  money: LoadMoney;
  miles: LoadMiles;
  hoursWorked: number | null;
  loadExpensesCents: Cents;
  allocatedFixedCents: Cents;
  occupiedDays: number;
  profitCents: Cents;
  /** gross ÷ loaded miles — the number on the load board. */
  ratePerMile: number | null;
  /** gross ÷ total miles — the honest number, deadhead included. */
  allInRatePerMile: number | null;
  profitPerMile: number | null;
  effectiveHourlyCents: number | null;
}

export interface LoadOptions {
  /**
   * Charge the load its share of the truck's daily fixed cost. On by default
   * for owner-operators and carriers, off for company drivers — some people
   * want load profit before fixed costs, some after.
   */
  includeFixedCosts: boolean;
  /** The truck's fixed cost for one day, from `dailyFixedCostCents`. */
  dailyFixedCostCents: Cents;
}

export const DEFAULT_LOAD_OPTIONS: LoadOptions = {
  includeFixedCosts: false,
  dailyFixedCostCents: 0,
};

export function isAccessorial(item: LoadLineItem): boolean {
  return item.kind === "accessorial";
}

export function isDeduction(item: LoadLineItem): boolean {
  return item.kind === "deduction";
}

export function accessorialsTotal(items: readonly LoadLineItem[]): Cents {
  return sumCents(items.filter(isAccessorial).map((i) => i.amountCents ?? 0));
}

/** The subtotal an accessorial code contributed, e.g. the fuel surcharge. */
export function accessorialByCode(items: readonly LoadLineItem[], code: string): Cents {
  return sumCents(
    items.filter((i) => isAccessorial(i) && i.code === code).map((i) => i.amountCents ?? 0),
  );
}

export function grossCents(load: Pick<LoadInput, "linehaulCents" | "lineItems">): Cents {
  return roundCents(load.linehaulCents + accessorialsTotal(load.lineItems));
}

/**
 * Deductions resolve against gross. A line with a percentage uses it; a line
 * with only an amount uses the amount. Percentage wins when a line carries
 * both, matching how a settlement sheet reads.
 */
export function deductionsTotal(items: readonly LoadLineItem[], gross: Cents): Cents {
  let total = 0;
  for (const item of items) {
    if (!isDeduction(item)) continue;
    if (item.percentOfGross !== null && Number.isFinite(item.percentOfGross)) {
      total += (gross * item.percentOfGross) / 100;
    } else {
      total += item.amountCents ?? 0;
    }
  }
  return roundCents(total);
}

export function computeLoadMoney(load: LoadInput): LoadMoney {
  const linehaulCents = roundCents(load.linehaulCents);
  const accessorials = accessorialsTotal(load.lineItems);
  const gross = roundCents(linehaulCents + accessorials);
  const deductions = deductionsTotal(load.lineItems, gross);
  return {
    linehaulCents,
    accessorialsCents: accessorials,
    deductionsCents: deductions,
    grossCents: gross,
    netRevenueCents: roundCents(gross - deductions),
  };
}

export function computeLoadMiles(load: LoadInput): LoadMiles {
  const loaded = roundMiles(Math.max(0, load.loadedMiles));
  const deadhead = roundMiles(Math.max(0, load.deadheadMiles));
  const paid = roundMiles(Math.max(0, load.paidMiles ?? loaded));
  const total = roundMiles(loaded + deadhead);
  return {
    loadedMiles: loaded,
    deadheadMiles: deadhead,
    paidMiles: paid,
    totalMiles: total,
    unpaidMiles: roundMiles(Math.max(0, total - paid)),
    deadheadPercent: total > 0 ? (deadhead / total) * 100 : null,
  };
}

/**
 * Hours on a load: the manual entry wins, otherwise the start/end span less any
 * unpaid break. Returns null when there is nothing to go on, so the effective
 * hourly rate stays honestly blank rather than dividing by a guess.
 */
export function computeLoadHours(load: LoadInput): number | null {
  if (load.hours.worked !== null && Number.isFinite(load.hours.worked)) {
    return Math.max(0, load.hours.worked);
  }
  if (load.startedAt && load.endedAt) {
    const span = hoursBetween(load.startedAt, load.endedAt);
    if (span === null) return null;
    return Math.max(0, span - (load.hours.unpaidBreak ?? 0));
  }
  return null;
}

/** The truck's fixed cost for the calendar days this load tied it up. */
export function allocatedFixedCents(load: LoadInput, dailyFixedCostCents: Cents): Cents {
  return roundCents(occupiedDays(load.startedAt, load.endedAt) * dailyFixedCostCents);
}

/**
 * Full per-load picture for owner-operators and carriers: revenue in, costs
 * out, and the rates that follow. Company-driver loads run through `pay.ts`
 * instead, where revenue math is replaced with pay math.
 */
export function computeLoad(
  load: LoadInput,
  options: LoadOptions = DEFAULT_LOAD_OPTIONS,
): LoadResult {
  const money = computeLoadMoney(load);
  const miles = computeLoadMiles(load);
  const hoursWorked = computeLoadHours(load);
  const days = occupiedDays(load.startedAt, load.endedAt);
  const fixed = options.includeFixedCosts
    ? roundCents(days * options.dailyFixedCostCents)
    : 0;
  const loadExpenses = roundCents(load.loadExpensesCents);
  const profit = roundCents(money.netRevenueCents - loadExpenses - fixed);

  return {
    loadId: load.id,
    money,
    miles,
    hoursWorked,
    loadExpensesCents: loadExpenses,
    allocatedFixedCents: fixed,
    occupiedDays: days,
    profitCents: profit,
    ratePerMile: perMile(money.grossCents, miles.loadedMiles),
    allInRatePerMile: perMile(money.grossCents, miles.totalMiles),
    profitPerMile: perMile(profit, miles.totalMiles),
    effectiveHourlyCents: hoursWorked === null ? null : perHour(money.netRevenueCents, hoursWorked),
  };
}
