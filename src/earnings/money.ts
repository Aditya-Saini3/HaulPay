/**
 * Money is integer cents. Always. No floats reach storage or display.
 *
 * Every helper here rounds half away from zero, which is what people expect
 * when they check the math on a rate confirmation: $0.005 becomes $0.01, and
 * -$0.005 becomes -$0.01.
 */

export type Cents = number;

/** Miles are stored to one decimal. */
export type Miles = number;

export function roundCents(value: number): Cents {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Miles to one decimal place, the precision every mileage source agrees on. */
export function roundMiles(value: number): Miles {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * 10;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / 10;
}

/** `percent` is a human percentage: 12.5 means 12.5%, not 0.125. */
export function percentOf(amount: Cents, percent: number): Cents {
  return roundCents((amount * percent) / 100);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return roundCents(total);
}

/**
 * Cents per mile, kept as a float because a rate per mile is a ratio, not an
 * amount of money — `2.4783` dollars/mile rounds to `$2.48` only at display
 * time. Returns null rather than Infinity when there are no miles to divide by,
 * so callers must decide what an undefined rate looks like.
 */
export function perMile(amount: Cents, miles: Miles): number | null {
  if (!Number.isFinite(miles) || miles <= 0) return null;
  return amount / miles;
}

/** Same contract as perMile, for hours. */
export function perHour(amount: Cents, hours: number): number | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return amount / hours;
}

export function centsToDollars(cents: Cents): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): Cents {
  return roundCents(dollars * 100);
}

/**
 * Parses what a driver actually types: "1,250", "$1250.5", "1250.50", "-40".
 * Returns null for anything it cannot read, so the form can show an error
 * instead of silently booking a zero.
 */
export function parseDollarsToCents(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return dollarsToCents(value);
}

export function parseMiles(input: string): Miles | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return roundMiles(value);
}
