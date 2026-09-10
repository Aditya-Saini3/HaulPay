import {
  addDays,
  monthlyEquivalentCents,
  type DayKey,
  type ExpenseInput,
  type FixedCostInput,
  type RecurrenceFrequency,
} from "@/earnings";
import { newId } from "../ids";
import {
  categoryToRow,
  expenseToRow,
  fuelToRow,
  rowToCategory,
  rowToExpense,
  rowToFuel,
} from "../mappers";
import type { Expense, ExpenseCategory, FuelEntry } from "../models";
import { PRIMARY_KEYS } from "../schema";
import { buildUpsert, getDatabase, nowIso, toBind, type Row } from "../sqlite";
import { query, queryOne } from "./base";

export interface ExpenseFilters {
  from?: string | null;
  to?: string | null;
  categoryId?: string | null;
  truckId?: string | null;
  loadId?: string | null;
  includeTemplates?: boolean;
}

export async function listCategories(): Promise<ExpenseCategory[]> {
  const rows = await query<Row>(
    "SELECT * FROM expense_categories WHERE _deleted = 0 ORDER BY sort_order, name",
  );
  return rows.map(rowToCategory);
}

export async function saveCategory(category: ExpenseCategory): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const { sql, values } = buildUpsert(
    "expense_categories",
    { ...categoryToRow(category), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
    PRIMARY_KEYS.expense_categories,
  );
  await db.runAsync(sql, values);
}

export async function listExpenses(filters: ExpenseFilters = {}): Promise<Expense[]> {
  const where: string[] = ["e._deleted = 0"];
  const params: unknown[] = [];

  // Templates describe a recurrence; they are not money that was spent, so they
  // stay out of every total unless asked for by name.
  if (!filters.includeTemplates) where.push("e.is_template = 0");
  if (filters.from) {
    where.push("e.incurred_on >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("e.incurred_on <= ?");
    params.push(filters.to);
  }
  if (filters.categoryId) {
    where.push("e.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.truckId) {
    where.push("e.truck_id = ?");
    params.push(filters.truckId);
  }
  if (filters.loadId) {
    where.push("e.load_id = ?");
    params.push(filters.loadId);
  }

  const rows = await query<Row>(
    `SELECT * FROM expenses e WHERE ${where.join(" AND ")} ORDER BY e.incurred_on DESC, e.created_at DESC`,
    params,
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => String(r.id));
  const placeholders = ids.map(() => "?").join(",");
  const fuelRows = await query<Row>(
    `SELECT * FROM fuel_entries WHERE _deleted = 0 AND expense_id IN (${placeholders})`,
    ids,
  );
  const fuelById = new Map(fuelRows.map((r) => [String(r.expense_id), rowToFuel(r)]));

  return rows.map((row) => rowToExpense(row, fuelById.get(String(row.id)) ?? null));
}

export async function getExpense(id: string): Promise<Expense | null> {
  const row = await queryOne<Row>("SELECT * FROM expenses WHERE id = ? AND _deleted = 0", [id]);
  if (!row) return null;
  const fuelRow = await queryOne<Row>(
    "SELECT * FROM fuel_entries WHERE expense_id = ? AND _deleted = 0",
    [id],
  );
  return rowToExpense(row, fuelRow ? rowToFuel(fuelRow) : null);
}

/** Writes an expense and its fuel detail together. */
export async function saveExpense(expense: Expense): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    const upsert = buildUpsert(
      "expenses",
      { ...expenseToRow(expense), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
      PRIMARY_KEYS.expenses,
    );
    await db.runAsync(upsert.sql, upsert.values);

    if (expense.fuel) {
      const fuel = buildUpsert(
        "fuel_entries",
        {
          ...fuelToRow({ ...expense.fuel, expenseId: expense.id }, expense.ownerId),
          created_at: now,
          updated_at: now,
          _dirty: 1,
          _deleted: 0,
        },
        PRIMARY_KEYS.fuel_entries,
      );
      await db.runAsync(fuel.sql, fuel.values);
    } else {
      await db.runAsync(
        "UPDATE fuel_entries SET _deleted = 1, _dirty = 1, updated_at = ? WHERE expense_id = ?",
        [now, expense.id],
      );
    }
  });
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE expenses SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?", toBind([now, id]));
    await db.runAsync(
      "UPDATE fuel_entries SET _deleted = 1, _dirty = 1, updated_at = ? WHERE expense_id = ?",
      [now, id],
    );
  });
}

/** Marks one generated occurrence as skipped without touching the series. */
export async function skipGeneratedExpense(id: string, skipped = true): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE expenses SET skipped = ?, _dirty = 1, updated_at = ? WHERE id = ?", toBind([
    skipped ? 1 : 0,
    nowIso(),
    id,
  ]));
}

/* -------------------------------------------------------------------------- */
/* Recurring expenses                                                          */
/* -------------------------------------------------------------------------- */

const STEP_DAYS: Partial<Record<RecurrenceFrequency, number>> = { weekly: 7, biweekly: 14 };

/** The next occurrence date after `from` under a recurrence rule. */
export function nextOccurrence(from: DayKey, frequency: RecurrenceFrequency): DayKey | null {
  const days = STEP_DAYS[frequency];
  if (days) return addDays(from, days);

  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const day = Number(from.slice(8, 10));
  const monthStep = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "annually" ? 12 : 0;
  if (monthStep === 0) return null;

  const targetMonthIndex = month - 1 + monthStep;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  // A truck payment due on the 31st still falls due in February.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);

  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

/**
 * Fills in the occurrences a recurring expense owes up to `throughDate`.
 *
 * Generated rows are marked with `generatedFromId` so the UI can label them and
 * so re-running this never duplicates one. It is safe to call on every launch.
 */
export async function generateRecurringExpenses(
  ownerId: string,
  throughDate: DayKey,
): Promise<number> {
  const templates = await query<Row>(
    "SELECT * FROM expenses WHERE _deleted = 0 AND is_template = 1 AND recurrence_rule != 'none' AND owner_id = ?",
    [ownerId],
  );
  if (templates.length === 0) return 0;

  const db = await getDatabase();
  const now = nowIso();
  let created = 0;

  for (const templateRow of templates) {
    const template = rowToExpense(templateRow);
    const start = template.recurrenceStartOn ?? template.incurredOn;
    const end = template.recurrenceEndOn;

    const existing = await query<{ incurred_on: string }>(
      "SELECT incurred_on FROM expenses WHERE generated_from_id = ?",
      [template.id],
    );
    const already = new Set(existing.map((r) => r.incurred_on));

    let cursor: DayKey | null = start;
    let guard = 0;
    while (cursor && cursor <= throughDate && guard < 500) {
      guard += 1;
      const withinSeries = !end || cursor <= end;
      if (withinSeries && !already.has(cursor)) {
        const occurrence: Expense = {
          ...template,
          id: newId(),
          incurredOn: cursor,
          recurrenceRule: "none",
          recurrenceStartOn: null,
          recurrenceEndOn: null,
          generatedFromId: template.id,
          isTemplate: false,
          fuel: null,
        };
        const upsert = buildUpsert(
          "expenses",
          { ...expenseToRow(occurrence), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
          PRIMARY_KEYS.expenses,
        );
        await db.runAsync(upsert.sql, upsert.values);
        created += 1;
      }
      cursor = nextOccurrence(cursor, template.recurrenceRule);
    }
  }

  return created;
}

/* -------------------------------------------------------------------------- */
/* Feeding the earnings engine                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Expenses in the shape the earnings module consumes, with the fixed/variable
 * flag resolved from the category. Skipped occurrences and templates are left
 * out, because neither is money that left the account.
 */
export async function expenseInputs(from: DayKey, to: DayKey): Promise<ExpenseInput[]> {
  const rows = await query<Row & { category_name: string | null; is_fixed: number | null }>(
    `SELECT e.*, c.name AS category_name, c.is_fixed AS is_fixed
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e._deleted = 0 AND e.is_template = 0 AND e.skipped = 0
       AND e.incurred_on >= ? AND e.incurred_on <= ?`,
    [from, to],
  );

  return rows.map((row) => ({
    id: String(row.id),
    amountCents: Number(row.amount_cents ?? 0),
    incurredOn: String(row.incurred_on),
    isFixed: row.is_fixed === 1,
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryName: row.category_name ?? "Uncategorised",
    truckId: row.truck_id ? String(row.truck_id) : null,
    loadId: row.load_id ? String(row.load_id) : null,
  }));
}

/**
 * The recurring fixed costs the cost-per-mile figures are built from.
 *
 * These come from the templates, not from generated rows: the template is the
 * statement of what the truck costs per period, and amortizing that is what
 * keeps an annual plate renewal out of a single month.
 */
export async function fixedCostInputs(ownerId: string): Promise<FixedCostInput[]> {
  const rows = await query<Row & { category_name: string | null; is_fixed: number | null }>(
    `SELECT e.*, c.name AS category_name, c.is_fixed AS is_fixed
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e._deleted = 0 AND e.is_template = 1 AND e.recurrence_rule != 'none'
       AND e.owner_id = ? AND c.is_fixed = 1`,
    [ownerId],
  );

  return rows.map((row) => ({
    id: String(row.id),
    label: row.category_name ?? row.vendor ? String(row.category_name ?? row.vendor) : "Fixed cost",
    amountCents: Number(row.amount_cents ?? 0),
    frequency: String(row.recurrence_rule) as RecurrenceFrequency,
    truckId: row.truck_id ? String(row.truck_id) : null,
  }));
}

/** Fuel entries in the shape the MPG and fuel-CPM helpers consume. */
export async function fuelInputs(
  from: DayKey,
  to: DayKey,
  truckId?: string | null,
): Promise<{ gallons: number; amountCents: number; state: string | null; odometer: number | null }[]> {
  const params: unknown[] = [from, to];
  let truckClause = "";
  if (truckId) {
    truckClause = " AND e.truck_id = ?";
    params.push(truckId);
  }

  const rows = await query<Row>(
    `SELECT f.gallons, f.state, f.odometer, e.amount_cents
     FROM fuel_entries f
     JOIN expenses e ON e.id = f.expense_id
     WHERE f._deleted = 0 AND e._deleted = 0 AND e.skipped = 0 AND f.is_def = 0
       AND e.incurred_on >= ? AND e.incurred_on <= ?${truckClause}`,
    params,
  );

  return rows.map((row) => ({
    gallons: Number(row.gallons ?? 0),
    amountCents: Number(row.amount_cents ?? 0),
    state: row.state ? String(row.state) : null,
    odometer: row.odometer === null || row.odometer === undefined ? null : Number(row.odometer),
  }));
}

/** Monthly fixed cost for a truck, for the load form's breakeven warning. */
export async function monthlyFixedFor(ownerId: string, truckId: string | null): Promise<number> {
  const costs = await fixedCostInputs(ownerId);
  return costs
    .filter((c) => c.truckId === null || truckId === null || c.truckId === truckId)
    .reduce((sum, c) => sum + monthlyEquivalentCents(c.amountCents, c.frequency), 0);
}

export type { FuelEntry };
