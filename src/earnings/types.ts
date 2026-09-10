import type { Cents, Miles } from "./money";
import type { DayKey, Instant } from "./time";

export type Role = "company_driver" | "owner_operator" | "small_carrier";

export type Currency = "USD" | "CAD";

export type DistanceUnit = "mi" | "km";

export type LoadStatus =
  | "booked"
  | "in_transit"
  | "delivered"
  | "invoiced"
  | "paid";

export type TrailerType =
  | "dry_van"
  | "reefer"
  | "flatbed"
  | "step_deck"
  | "tanker"
  | "power_only";

/* -------------------------------------------------------------------------- */
/* Load money                                                                  */
/* -------------------------------------------------------------------------- */

export type AccessorialCode =
  | "detention"
  | "layover"
  | "tonu"
  | "lumper"
  | "stop_off"
  | "fuel_surcharge"
  | "tarp"
  | "other";

export type DeductionCode =
  | "dispatch"
  | "factoring"
  | "escrow"
  | "insurance"
  | "advance"
  | "trailer_rental"
  | "other";

export type LineItemKind = "accessorial" | "deduction";

/**
 * One money line on a load.
 *
 * Accessorials are flat amounts added to gross — a percentage-of-gross
 * accessorial would be self-referential, since gross is what accessorials feed.
 * Deductions may be flat or a percentage of gross; when both are present the
 * percentage wins, because that is what a settlement sheet actually applies.
 */
export interface LoadLineItem {
  id: string;
  kind: LineItemKind;
  code: AccessorialCode | DeductionCode;
  label: string;
  amountCents: Cents | null;
  percentOfGross: number | null;
}

export interface LoadHours {
  /** Authoritative. Defaults to the start/end span at entry, then stays editable. */
  worked: number | null;
  driving: number | null;
  loading: number | null;
  waiting: number | null;
  unpaidBreak: number | null;
}

export interface LoadInput {
  id: string;
  status: LoadStatus;
  /** Which truck ran it. Null when the user has not set up trucks. */
  truckId: string | null;
  /** Which driver ran it, for carrier-role filtering. */
  driverId: string | null;
  linehaulCents: Cents;
  lineItems: readonly LoadLineItem[];
  loadedMiles: Miles;
  deadheadMiles: Miles;
  /** What the payer actually paid on. Falls back to loaded miles. */
  paidMiles: Miles | null;
  startedAt: Instant | null;
  endedAt: Instant | null;
  hours: LoadHours;
  /** Every stop on the load, pickups and drops included. A basic run is 2. */
  stopCount: number;
  /** Expenses tagged to this load, already summed. */
  loadExpensesCents: Cents;
}

/* -------------------------------------------------------------------------- */
/* Pay structures                                                              */
/* -------------------------------------------------------------------------- */

export type MileageBasis = "practical" | "shortest";

export interface PerMileStructure {
  kind: "per_mile";
  /** Cents per mile: 62 means $0.62/mi. */
  cpmCents: number;
  mileageBasis: MileageBasis;
}

export type PercentageBasis = "before_fuel_surcharge" | "after_fuel_surcharge";

export interface PercentageStructure {
  kind: "percentage";
  /** Human percentage: 27 means 27%. */
  percent: number;
  /**
   * `after_fuel_surcharge` adds the fuel-surcharge accessorial to the base the
   * percentage is taken on. `before_fuel_surcharge` pays on linehaul alone.
   */
  basis: PercentageBasis;
}

export type OvertimeBasis = "weekly" | "daily" | "none";

export interface HourlyStructure {
  kind: "hourly";
  hourlyRateCents: number;
  /** Null means time-and-a-half off the base rate. */
  overtimeRateCents: number | null;
  overtimeBasis: OvertimeBasis;
  overtimeThresholdHours: number | null;
  /** When true, break time is on the clock and gets paid. */
  breaksPaid: boolean;
  /** Show-up pay: the day pays at least this many hours at the base rate. */
  guaranteedDailyHours: number | null;
}

export interface FlatStructure {
  kind: "flat";
  flatCents: number;
  stopRateCents: number;
  /** Stops covered by the flat rate before per-stop pay starts. */
  freeStops: number;
}

export type SimpleStructure =
  | PerMileStructure
  | PercentageStructure
  | HourlyStructure
  | FlatStructure;

/**
 * Local and drayage work often pays "hourly, or $0.55/mi, whichever is
 * greater". Both sides are computed over the same work and the larger wins.
 */
export interface HybridStructure {
  kind: "hybrid";
  primary: SimpleStructure;
  floor: SimpleStructure;
}

export type PayStructure = SimpleStructure | HybridStructure;

/** Accessorials a company driver is paid on, independent of the load's billing. */
export interface DriverAccessorialPay {
  detentionPerHourCents: number;
  /** Hours at a shipper before detention starts accruing. */
  detentionFreeHours: number;
  stopPayCents: number;
  /** Stops before stop pay starts. */
  freeStops: number;
  layoverPerDayCents: number;
}

export const NO_ACCESSORIAL_PAY: DriverAccessorialPay = {
  detentionPerHourCents: 0,
  detentionFreeHours: 0,
  stopPayCents: 0,
  freeStops: 2,
  layoverPerDayCents: 0,
};

/* -------------------------------------------------------------------------- */
/* Shifts                                                                      */
/* -------------------------------------------------------------------------- */

export interface ShiftInput {
  id: string;
  truckId: string | null;
  driverId: string | null;
  /** The driver's own calendar day, which is what a settlement week is built from. */
  workDate: DayKey;
  startAt: Instant | null;
  endAt: Instant | null;
  unpaidBreakHours: number;
  /** Overrides the start/end span when set. */
  hoursWorked: number | null;
}

/** A day of work reduced to the only two numbers the hourly engine needs. */
export interface WorkDay {
  day: DayKey;
  /** On the clock, break already removed. */
  workedHours: number;
  /** Break time that was removed, so `breaksPaid` can put it back. */
  breakHours: number;
}

/* -------------------------------------------------------------------------- */
/* Costs                                                                       */
/* -------------------------------------------------------------------------- */

export type RecurrenceFrequency =
  | "none"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "annually";

export interface FixedCostInput {
  id: string;
  label: string;
  amountCents: Cents;
  frequency: RecurrenceFrequency;
  truckId: string | null;
}

export interface ExpenseInput {
  id: string;
  amountCents: Cents;
  incurredOn: DayKey;
  /** Fixed costs are amortized; variable costs land on the day they happened. */
  isFixed: boolean;
  categoryId: string | null;
  categoryName: string;
  truckId: string | null;
  loadId: string | null;
}

export interface CostPerMileResult {
  fixedCpm: number | null;
  variableCpm: number | null;
  totalCpm: number | null;
  /** Same number as totalCpm, named for the question a driver is actually asking. */
  breakevenRpm: number | null;
  monthlyFixedCents: Cents;
  variableCents: Cents;
  miles: Miles;
}
