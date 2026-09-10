import { centsToDollars, type Cents, type Miles } from "./money";
import type { Currency, DistanceUnit } from "./types";

/**
 * Display formatting. Pure string work — no Intl locale guessing beyond the
 * currency symbol, so the same numbers render identically on both platforms.
 */

const SYMBOLS: Record<Currency, string> = { USD: "$", CAD: "$" };

export function formatMoney(
  cents: Cents | null | undefined,
  currency: Currency = "USD",
  options: { decimals?: 0 | 2; signed?: boolean } = {},
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  const decimals = options.decimals ?? 2;
  const negative = cents < 0;
  const dollars = Math.abs(centsToDollars(cents));
  const fixed = dollars.toFixed(decimals);
  const [whole = "0", fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fraction ? `${grouped}.${fraction}` : grouped;
  const sign = negative ? "-" : options.signed ? "+" : "";
  return `${sign}${SYMBOLS[currency]}${body}`;
}

/** A rate per mile, which is a ratio in cents and always shows three digits: $2.475/mi. */
export function formatRate(
  centsPerMile: number | null | undefined,
  currency: Currency = "USD",
  unit: DistanceUnit = "mi",
): string {
  if (centsPerMile === null || centsPerMile === undefined || !Number.isFinite(centsPerMile)) {
    return "—";
  }
  const value = centsPerMile / 100;
  return `${SYMBOLS[currency]}${value.toFixed(2)}/${unit}`;
}

export function formatHourlyRate(
  centsPerHour: number | null | undefined,
  currency: Currency = "USD",
): string {
  if (centsPerHour === null || centsPerHour === undefined || !Number.isFinite(centsPerHour)) {
    return "—";
  }
  return `${SYMBOLS[currency]}${(centsPerHour / 100).toFixed(2)}/hr`;
}

export function formatMiles(miles: Miles | null | undefined, unit: DistanceUnit = "mi"): string {
  if (miles === null || miles === undefined || !Number.isFinite(miles)) return "—";
  const value = unit === "km" ? miles * 1.609344 : miles;
  return `${Math.round(value).toLocaleString("en-US")} ${unit}`;
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 60) return `${whole + 1}h 00m`;
  return `${whole}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatPercent(percent: number | null | undefined, decimals = 0): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return "—";
  return `${percent.toFixed(decimals)}%`;
}

export const MILES_PER_KM = 0.621371192;
export const KM_PER_MILE = 1.609344;

export function milesToKm(miles: Miles): number {
  return miles * KM_PER_MILE;
}

export function kmToMiles(km: number): Miles {
  return km * MILES_PER_KM;
}

/** Metres, which is what Valhalla reports when asked for them, to miles. */
export function metersToMiles(meters: number): Miles {
  return meters / 1609.344;
}
