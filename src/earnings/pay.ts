import { computeHourlyPay, type HourlyPayResult } from "./hours";
import { perHour, roundCents, type Cents } from "./money";
import { accessorialByCode, computeLoadHours, computeLoadMiles, grossCents } from "./load";
import { dayKeyOf, occupiedDays, roundHours } from "./time";
import type {
  DriverAccessorialPay,
  HourlyStructure,
  LoadInput,
  PayStructure,
  SimpleStructure,
  WorkDay,
} from "./types";
import { NO_ACCESSORIAL_PAY } from "./types";

/**
 * Company drivers do not have revenue, they have pay. Everything in this file
 * replaces the revenue math in `load.ts` for the driver role.
 */

export type PayBasisLabel =
  | "per_mile"
  | "percentage"
  | "hourly"
  | "flat"
  | "hybrid_primary"
  | "hybrid_floor";

export interface PayBreakdown {
  /** Which structure actually produced the number — matters for hybrid. */
  basis: PayBasisLabel;
  structurePayCents: Cents;
  accessorialPayCents: Cents;
  grossPayCents: Cents;
  hoursWorked: number | null;
  /** gross pay ÷ hours worked, in cents. Null when hours are unknown. */
  effectiveHourlyCents: number | null;
  hourly: HourlyPayResult | null;
  /** Populated on hybrid so the UI can show what the other side would have paid. */
  alternatePayCents: Cents | null;
}

/** Everything a pay structure can need from a load or a day of shifts. */
export interface PayableWork {
  /** Miles the payer paid on. */
  paidMiles: number;
  /** Base rate the percentage structures pay on. */
  linehaulCents: Cents;
  /** Fuel surcharge, for the `after_fuel_surcharge` percentage basis. */
  fuelSurchargeCents: Cents;
  /** Work days feeding the hourly structure. */
  workDays: WorkDay[];
  /** Total stops, pickups and drops included. */
  stopCount: number;
  /** Hours the driver sat at a shipper or receiver. */
  waitingHours: number;
  /** Nights away that pay layover. */
  layoverDays: number;
  /** Hours worked, for the effective hourly rate. */
  hoursWorked: number | null;
}

export const EMPTY_WORK: PayableWork = {
  paidMiles: 0,
  linehaulCents: 0,
  fuelSurchargeCents: 0,
  workDays: [],
  stopCount: 0,
  waitingHours: 0,
  layoverDays: 0,
  hoursWorked: null,
};

/** Turns a load into the shape the pay structures consume. */
export function loadToPayableWork(load: LoadInput): PayableWork {
  const miles = computeLoadMiles(load);
  const hoursWorked = computeLoadHours(load);
  const day = dayKeyOf(load.startedAt ?? load.endedAt ?? "") ?? "1970-01-01";
  const breakHours = Math.max(0, load.hours.unpaidBreak ?? 0);
  return {
    paidMiles: miles.paidMiles,
    linehaulCents: load.linehaulCents,
    fuelSurchargeCents: accessorialByCode(load.lineItems, "fuel_surcharge"),
    workDays:
      hoursWorked === null ? [] : [{ day, workedHours: hoursWorked, breakHours }],
    stopCount: load.stopCount,
    waitingHours: Math.max(0, load.hours.waiting ?? 0),
    // A load that ran more than one calendar day spent its nights out.
    layoverDays: Math.max(0, occupiedDays(load.startedAt, load.endedAt) - 1),
    hoursWorked,
  };
}

/* -------------------------------------------------------------------------- */
/* Individual structures                                                       */
/* -------------------------------------------------------------------------- */

export function mileagePayCents(work: PayableWork, cpmCents: number): Cents {
  return roundCents(work.paidMiles * cpmCents);
}

export function percentagePayCents(
  work: PayableWork,
  percent: number,
  basis: "before_fuel_surcharge" | "after_fuel_surcharge",
): Cents {
  const base =
    basis === "after_fuel_surcharge"
      ? work.linehaulCents + work.fuelSurchargeCents
      : work.linehaulCents;
  return roundCents((base * percent) / 100);
}

export function flatPayCents(
  work: PayableWork,
  flatCents: number,
  stopRateCents: number,
  freeStops: number,
): Cents {
  const extraStops = Math.max(0, work.stopCount - Math.max(0, freeStops));
  return roundCents(flatCents + extraStops * stopRateCents);
}

export function hourlyPayFor(
  work: PayableWork,
  structure: HourlyStructure,
  priorPayableHours = 0,
): HourlyPayResult {
  return computeHourlyPay(work.workDays, structure, { priorPayableHours });
}

/** Detention, stop pay and layover, per the driver's own configuration. */
export function accessorialPayCents(
  work: PayableWork,
  config: DriverAccessorialPay = NO_ACCESSORIAL_PAY,
): Cents {
  const detentionHours = Math.max(0, work.waitingHours - Math.max(0, config.detentionFreeHours));
  const extraStops = Math.max(0, work.stopCount - Math.max(0, config.freeStops));
  return roundCents(
    detentionHours * config.detentionPerHourCents +
      extraStops * config.stopPayCents +
      Math.max(0, work.layoverDays) * config.layoverPerDayCents,
  );
}

interface StructureOutcome {
  basis: PayBasisLabel;
  cents: Cents;
  hourly: HourlyPayResult | null;
}

function runSimpleStructure(
  work: PayableWork,
  structure: SimpleStructure,
  priorPayableHours: number,
): StructureOutcome {
  switch (structure.kind) {
    case "per_mile":
      return { basis: "per_mile", cents: mileagePayCents(work, structure.cpmCents), hourly: null };
    case "percentage":
      return {
        basis: "percentage",
        cents: percentagePayCents(work, structure.percent, structure.basis),
        hourly: null,
      };
    case "hourly": {
      const hourly = hourlyPayFor(work, structure, priorPayableHours);
      return { basis: "hourly", cents: hourly.totalCents, hourly };
    }
    case "flat":
      return {
        basis: "flat",
        cents: flatPayCents(work, structure.flatCents, structure.stopRateCents, structure.freeStops),
        hourly: null,
      };
  }
}

export interface PayOptions {
  accessorials?: DriverAccessorialPay;
  /**
   * Payable hours already booked in the same overtime period, so an hourly load
   * added on Friday is priced against the week that came before it.
   */
  priorPayableHours?: number;
}

/**
 * Gross pay for one unit of work under any structure.
 *
 * Hybrid runs both sides over the same work and takes the larger, which is what
 * "hourly, or $0.55/mi, whichever is greater" means on a drayage settlement.
 * Accessorial pay is added after the structure resolves, so it is never part of
 * the hybrid comparison — it is owed either way.
 */
export function computePay(
  work: PayableWork,
  structure: PayStructure,
  options: PayOptions = {},
): PayBreakdown {
  const priorHours = options.priorPayableHours ?? 0;
  let outcome: StructureOutcome;
  let alternate: Cents | null = null;

  if (structure.kind === "hybrid") {
    const primary = runSimpleStructure(work, structure.primary, priorHours);
    const floor = runSimpleStructure(work, structure.floor, priorHours);
    const primaryWins = primary.cents >= floor.cents;
    const winner = primaryWins ? primary : floor;
    outcome = {
      basis: primaryWins ? "hybrid_primary" : "hybrid_floor",
      cents: winner.cents,
      hourly: winner.hourly,
    };
    alternate = primaryWins ? floor.cents : primary.cents;
  } else {
    outcome = runSimpleStructure(work, structure, priorHours);
  }

  const accessorialPay = accessorialPayCents(work, options.accessorials);
  const grossPay = roundCents(outcome.cents + accessorialPay);

  // Hourly structures know their own payable hours, including paid breaks and
  // any guarantee; everything else falls back to the recorded hours worked.
  const hoursWorked =
    outcome.hourly !== null
      ? outcome.hourly.payableHours
      : work.hoursWorked !== null
        ? roundHours(work.hoursWorked)
        : sumWorkDayHours(work.workDays);

  return {
    basis: outcome.basis,
    structurePayCents: outcome.cents,
    accessorialPayCents: accessorialPay,
    grossPayCents: grossPay,
    hoursWorked,
    effectiveHourlyCents: hoursWorked === null ? null : perHour(grossPay, hoursWorked),
    hourly: outcome.hourly,
    alternatePayCents: alternate,
  };
}

function sumWorkDayHours(days: readonly WorkDay[]): number | null {
  if (days.length === 0) return null;
  return roundHours(days.reduce((sum, d) => sum + d.workedHours, 0));
}

/** Convenience wrapper: pay for a single load. */
export function computeLoadPay(
  load: LoadInput,
  structure: PayStructure,
  options: PayOptions = {},
): PayBreakdown {
  return computePay(loadToPayableWork(load), structure, options);
}

/**
 * Net pay is gross pay less the driver's own out-of-pocket expenses. There is
 * no fixed-cost allocation here — a company driver does not carry the truck.
 */
export function netPayCents(grossPay: Cents, personalExpenses: Cents): Cents {
  return roundCents(grossPay - personalExpenses);
}

/**
 * The number that is often the most useful thing the app can say: what an hour
 * of this load was actually worth. Computed for every driver regardless of how
 * they are paid — a per-mile driver who sat six hours at a receiver made a
 * specific, knowable amount per hour.
 */
export function effectiveHourlyCents(grossPay: Cents, hoursWorked: number | null): number | null {
  if (hoursWorked === null) return null;
  return perHour(grossPay, hoursWorked);
}

/** Gross revenue on a load, exposed here so driver screens can show the spread. */
export function loadGrossCents(load: LoadInput): Cents {
  return grossCents(load);
}
