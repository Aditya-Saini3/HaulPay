import type {
  HourlyStructure,
  LoadInput,
  LoadLineItem,
  ShiftInput,
} from "../types";

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

export function accessorial(
  code: LoadLineItem["code"],
  amountCents: number,
  label = String(code),
): LoadLineItem {
  return { id: id("acc"), kind: "accessorial", code, label, amountCents, percentOfGross: null };
}

export function deduction(
  code: LoadLineItem["code"],
  opts: { amountCents?: number; percentOfGross?: number },
  label = String(code),
): LoadLineItem {
  return {
    id: id("ded"),
    kind: "deduction",
    code,
    label,
    amountCents: opts.amountCents ?? null,
    percentOfGross: opts.percentOfGross ?? null,
  };
}

export function makeLoad(overrides: Partial<LoadInput> = {}): LoadInput {
  return {
    id: id("load"),
    status: "delivered",
    truckId: null,
    driverId: null,
    linehaulCents: 200_000,
    lineItems: [],
    loadedMiles: 500,
    deadheadMiles: 0,
    paidMiles: null,
    startedAt: "2026-03-02T08:00:00-06:00",
    endedAt: "2026-03-02T18:00:00-06:00",
    hours: { worked: null, driving: null, loading: null, waiting: null, unpaidBreak: null },
    stopCount: 2,
    loadExpensesCents: 0,
    ...overrides,
  };
}

export function makeShift(overrides: Partial<ShiftInput> = {}): ShiftInput {
  return {
    id: id("shift"),
    truckId: null,
    driverId: null,
    workDate: "2026-03-02",
    startAt: "2026-03-02T06:00:00-06:00",
    endAt: "2026-03-02T16:00:00-06:00",
    unpaidBreakHours: 0,
    hoursWorked: null,
    ...overrides,
  };
}

export function hourly(overrides: Partial<HourlyStructure> = {}): HourlyStructure {
  return {
    kind: "hourly",
    hourlyRateCents: 2500,
    overtimeRateCents: null,
    overtimeBasis: "weekly",
    overtimeThresholdHours: 40,
    breaksPaid: false,
    guaranteedDailyHours: null,
    ...overrides,
  };
}

export const day = (d: string, workedHours: number, breakHours = 0) => ({
  day: d,
  workedHours,
  breakHours,
});
