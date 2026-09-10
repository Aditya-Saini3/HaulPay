import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { Expense, Load, Shift } from "@/db/models";
import {
  bucketByCategory,
  computeLoad,
  formatHours,
  formatMiles,
  formatMoney,
  formatRate,
  shiftToWorkDay,
  type Currency,
  type DateRange,
  type DistanceUnit,
  type ExpenseInput,
  type Rollup,
} from "@/earnings";

/**
 * CSV and PDF export, shareable to email or a bookkeeper.
 *
 * CSV is written for a spreadsheet, so money is a plain decimal number with no
 * currency symbol and no thousands separator — an accountant should be able to
 * sum the column without cleaning it first.
 */

/** RFC 4180 quoting: a broker named "Smith, Jones & Co" must not split a row. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** Cents as a plain decimal for a spreadsheet column. */
function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function loadsCsv(loads: Load[], units: DistanceUnit): string {
  const rows: unknown[][] = [
    [
      "Load number", "Broker", "Status", "Started", "Ended",
      "Origin city", "Origin state", "Destination city", "Destination state",
      "Linehaul", "Accessorials", "Gross", "Deductions", "Net revenue",
      `Loaded ${units}`, `Deadhead ${units}`, `Paid ${units}`, `Total ${units}`,
      "Rate per mile", "All-in RPM", "Hours", "Effective hourly",
    ],
  ];

  for (const load of loads) {
    const result = computeLoad(load);
    const first = load.stops[0];
    const last = load.stops[load.stops.length - 1];
    rows.push([
      load.loadNumber, load.broker, load.status, load.startedAt, load.endedAt,
      first?.city, first?.state, last?.city, last?.state,
      money(result.money.linehaulCents),
      money(result.money.accessorialsCents),
      money(result.money.grossCents),
      money(result.money.deductionsCents),
      money(result.money.netRevenueCents),
      result.miles.loadedMiles, result.miles.deadheadMiles,
      result.miles.paidMiles, result.miles.totalMiles,
      result.ratePerMile === null ? "" : (result.ratePerMile / 100).toFixed(3),
      result.allInRatePerMile === null ? "" : (result.allInRatePerMile / 100).toFixed(3),
      result.hoursWorked ?? "",
      result.effectiveHourlyCents === null ? "" : money(Math.round(result.effectiveHourlyCents)),
    ]);
  }

  return toCsv(rows);
}

export function expensesCsv(expenses: Expense[], categoryName: (id: string | null) => string): string {
  const rows: unknown[][] = [
    ["Date", "Category", "Vendor", "Amount", "Truck", "Load", "Gallons", "Price/gal", "State", "Odometer", "Notes", "Auto-generated"],
  ];

  for (const expense of expenses) {
    rows.push([
      expense.incurredOn,
      categoryName(expense.categoryId),
      expense.vendor,
      money(expense.amountCents),
      expense.truckId,
      expense.loadId,
      expense.fuel?.gallons ?? "",
      expense.fuel?.pricePerGallonCents ? money(expense.fuel.pricePerGallonCents) : "",
      expense.fuel?.state ?? "",
      expense.fuel?.odometer ?? "",
      expense.notes,
      expense.generatedFromId ? "yes" : "no",
    ]);
  }

  return toCsv(rows);
}

export function shiftsCsv(shifts: Shift[]): string {
  const rows: unknown[][] = [["Date", "Clock in", "Clock out", "Unpaid break", "Hours worked", "Notes"]];
  for (const shift of shifts) {
    rows.push([
      shift.workDate,
      shift.startAt,
      shift.endAt,
      shift.unpaidBreakHours,
      shiftToWorkDay(shift).workedHours,
      shift.notes,
    ]);
  }
  return toCsv(rows);
}

/** Miles by state, for IFTA prep, derived from the states on the fuel entries. */
export function milesByStateCsv(
  fuel: { gallons: number; amountCents: number; state: string | null }[],
): string {
  const byState = new Map<string, { gallons: number; cents: number }>();
  for (const entry of fuel) {
    const key = entry.state ?? "Unknown";
    const row = byState.get(key) ?? { gallons: 0, cents: 0 };
    row.gallons += entry.gallons;
    row.cents += entry.amountCents;
    byState.set(key, row);
  }

  const rows: unknown[][] = [["State", "Gallons", "Fuel spend"]];
  for (const [state, row] of [...byState.entries()].sort()) {
    rows.push([state, row.gallons.toFixed(3), money(row.cents)]);
  }
  return toCsv(rows);
}

export interface ProfitAndLossInput {
  range: DateRange;
  rollup: Rollup;
  expenses: ExpenseInput[];
  currency: Currency;
  units: DistanceUnit;
  companyName: string | null;
}

/**
 * The P&L, rendered as HTML and printed to PDF.
 *
 * Deliberately plain: this goes to a bookkeeper, and it should read like a
 * statement rather than like an app screenshot.
 */
export function profitAndLossHtml(input: ProfitAndLossInput): string {
  const { rollup, currency, units, range } = input;
  const r = rollup.revenue;
  const categories = bucketByCategory(input.expenses);

  const row = (label: string, value: string, strong = false) =>
    `<tr class="${strong ? "strong" : ""}"><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #666;
       margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 5px 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong td { font-weight: 700; border-top: 1px solid #ddd; }
  .foot { margin-top: 32px; font-size: 11px; color: #888; }
</style></head>
<body>
  <h1>${escapeHtml(input.companyName ?? "Profit &amp; loss")}</h1>
  <div class="sub">${escapeHtml(range.from)} to ${escapeHtml(range.to)}</div>

  <h2>Revenue</h2>
  <table>
    ${row("Gross", formatMoney(r.grossCents, currency))}
    ${row("Deductions", formatMoney(-(r.grossCents - r.netRevenueCents), currency))}
    ${row("Net revenue", formatMoney(r.netRevenueCents, currency), true)}
  </table>

  <h2>Expenses</h2>
  <table>
    ${categories.map((c) => row(c.categoryName, formatMoney(-c.amountCents, currency))).join("")}
    ${row("Fixed costs (amortized)", formatMoney(-r.fixedCostCents, currency))}
    ${row("Total expenses", formatMoney(-r.totalExpenseCents, currency), true)}
  </table>

  <h2>Result</h2>
  <table>
    ${row("Net profit", formatMoney(r.netProfitCents, currency), true)}
  </table>

  <h2>Operations</h2>
  <table>
    ${row("Loads", String(r.loadCount))}
    ${row("Loaded miles", formatMiles(r.loadedMiles, units))}
    ${row("Deadhead miles", formatMiles(r.deadheadMiles, units))}
    ${row("Total miles", formatMiles(r.totalMiles, units), true)}
    ${row("Rate per mile", formatRate(r.ratePerMile, currency, units))}
    ${row("All-in rate per mile", formatRate(r.allInRatePerMile, currency, units))}
    ${row("Cost per mile", formatRate(r.costPerMile, currency, units))}
    ${row("Breakeven", formatRate(r.breakevenRpm, currency, units), true)}
    ${row("Hours worked", formatHours(r.hoursWorked))}
  </table>

  <div class="foot">
    Generated by HaulPay. Fixed costs are amortized across the period rather than charged to the
    month they were paid. Mileage from OpenStreetMap data via Valhalla, or entered manually.
  </div>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Writes a file to the cache and opens the share sheet. */
export async function shareText(
  fileName: string,
  contents: string,
  mimeType = "text/csv",
): Promise<void> {
  const file = new FileSystem.File(FileSystem.Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName, UTI: "public.plain-text" });
  }
}

export async function sharePdf(fileName: string, html: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: fileName,
      UTI: "com.adobe.pdf",
    });
  }
}
