/**
 * Date and time helpers for the earnings engine.
 *
 * Two representations, deliberately kept apart:
 *
 * - An **instant** is an ISO 8601 string that carries a UTC offset, e.g.
 *   `2026-03-14T22:30:00-05:00`. Durations are computed by subtracting
 *   instants, which is why a shift that runs from 22:00 to 06:00 comes out as
 *   eight hours without any special case for midnight.
 * - A **day key** is a plain `YYYY-MM-DD` local calendar date with no time and
 *   no zone. Grouping into days, weeks, months and quarters happens on day
 *   keys, so a driver in Denver and a driver in Newark both see their own
 *   Tuesday.
 *
 * All day arithmetic runs through UTC internally so daylight saving never
 * shifts a boundary; the day key itself is always local wall-clock.
 */

export type Instant = string;
export type DayKey = string;

export type WeekStart = "sunday" | "monday";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseInstant(iso: Instant): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Elapsed hours between two instants. Negative spans return null: an end
 * before its start is bad data, not negative work.
 */
export function hoursBetween(start: Instant, end: Instant): number | null {
  const a = parseInstant(start);
  const b = parseInstant(end);
  if (a === null || b === null) return null;
  const hours = (b - a) / MS_PER_HOUR;
  return hours < 0 ? null : roundHours(hours);
}

/** Hours are carried to two decimals — one minute is 0.017h, which matters on detention. */
export function roundHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  const scaled = hours * 100;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / 100;
}

/**
 * The local calendar date an instant falls on, read straight off the string.
 * `2026-03-14T23:30:00-05:00` is the 14th to the person who worked it, even
 * though it is the 15th in UTC.
 */
export function dayKeyOf(iso: Instant): DayKey | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match?.[1] ?? null;
}

export function isDayKey(value: string): boolean {
  return DAY_KEY_RE.test(value) && dayKeyToUtcMs(value) !== null;
}

function dayKeyToUtcMs(day: DayKey): number | null {
  const match = DAY_KEY_RE.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  const ms = Date.UTC(year, month - 1, date);
  const back = new Date(ms);
  // Rejects 2026-02-30 and friends, which JS would otherwise roll forward.
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== date) return null;
  return ms;
}

function utcMsToDayKey(ms: number): DayKey {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(day: DayKey, delta: number): DayKey {
  const ms = dayKeyToUtcMs(day);
  if (ms === null) return day;
  return utcMsToDayKey(ms + delta * MS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: DayKey, to: DayKey): number {
  const a = dayKeyToUtcMs(from);
  const b = dayKeyToUtcMs(to);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / MS_PER_DAY);
}

export function compareDays(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: DayKey): number {
  const ms = dayKeyToUtcMs(day);
  if (ms === null) return 0;
  return new Date(ms).getUTCDay();
}

export function startOfWeek(day: DayKey, weekStart: WeekStart = "sunday"): DayKey {
  const dow = dayOfWeek(day);
  const offset = weekStart === "sunday" ? dow : (dow + 6) % 7;
  return addDays(day, -offset);
}

export function endOfWeek(day: DayKey, weekStart: WeekStart = "sunday"): DayKey {
  return addDays(startOfWeek(day, weekStart), 6);
}

export function startOfMonth(day: DayKey): DayKey {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: DayKey): DayKey {
  const start = startOfMonth(day);
  return addDays(addDays(start, 32).slice(0, 7) + "-01", -1);
}

/** `YYYY-MM`, used to bucket monthly fixed costs. */
export function monthKeyOf(day: DayKey): string {
  return day.slice(0, 7);
}

export function daysInMonth(day: DayKey): number {
  return Number(endOfMonth(day).slice(8, 10));
}

export function startOfQuarter(day: DayKey): DayKey {
  const month = Number(day.slice(5, 7));
  const first = Math.floor((month - 1) / 3) * 3 + 1;
  return `${day.slice(0, 4)}-${String(first).padStart(2, "0")}-01`;
}

export function startOfYear(day: DayKey): DayKey {
  return `${day.slice(0, 4)}-01-01`;
}

export interface DateRange {
  /** Inclusive. */
  from: DayKey;
  /** Inclusive. */
  to: DayKey;
}

export function rangeContains(range: DateRange, day: DayKey): boolean {
  return day >= range.from && day <= range.to;
}

export function rangeLengthDays(range: DateRange): number {
  return Math.max(0, daysBetween(range.from, range.to) + 1);
}

/** Every day key in the range, inclusive of both ends. Capped so a typo'd year cannot hang the app. */
export function enumerateDays(range: DateRange, limit = 1000): DayKey[] {
  const out: DayKey[] = [];
  let cursor = range.from;
  while (compareDays(cursor, range.to) <= 0 && out.length < limit) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * The calendar days a load occupied, inclusive on both ends — a load picked up
 * Monday night and delivered Wednesday morning occupied three days of the
 * truck, and that is what fixed-cost allocation charges it for.
 *
 * Falls back to one day when the load has no end, because an open load still
 * costs the truck a day.
 */
export function occupiedDays(startedAt: Instant | null, endedAt: Instant | null): number {
  const startDay = startedAt ? dayKeyOf(startedAt) : null;
  const endDay = endedAt ? dayKeyOf(endedAt) : null;
  if (!startDay && !endDay) return 1;
  if (!startDay || !endDay) return 1;
  return Math.max(1, daysBetween(startDay, endDay) + 1);
}

/** The months a range touches, e.g. a week straddling a month boundary yields two. */
export function monthsInRange(range: DateRange): string[] {
  const seen: string[] = [];
  let cursor = startOfMonth(range.from);
  let guard = 0;
  while (compareDays(cursor, range.to) <= 0 && guard < 240) {
    seen.push(monthKeyOf(cursor));
    cursor = addDays(endOfMonth(cursor), 1);
    guard += 1;
  }
  return seen;
}

/**
 * How much of `range` falls inside the given month, in days. This is what lets
 * a Sunday-to-Saturday settlement week that straddles two months pull the
 * right share of fixed cost from each.
 */
export function daysOfRangeInMonth(range: DateRange, monthKey: string): number {
  const monthStart = `${monthKey}-01`;
  const monthEnd = endOfMonth(monthStart);
  const from = compareDays(range.from, monthStart) > 0 ? range.from : monthStart;
  const to = compareDays(range.to, monthEnd) < 0 ? range.to : monthEnd;
  if (compareDays(from, to) > 0) return 0;
  return daysBetween(from, to) + 1;
}
