import { create } from "zustand";

import type { Expense, ExpenseCategory, Load, Shift } from "@/db/models";
import * as expensesRepo from "@/db/repositories/expenses";
import * as loadsRepo from "@/db/repositories/loads";
import * as shiftsRepo from "@/db/repositories/shifts";
import {
  computeRollup,
  type DateRange,
  type ExpenseInput,
  type FixedCostInput,
  type Rollup,
} from "@/earnings";

import { ownerId, useProfile } from "./profile";

/**
 * The working data set: everything in the selected range, plus the rollup the
 * dashboard and reports read from.
 *
 * Loaded once per range change rather than per screen, so switching tabs does
 * not re-query SQLite and every screen agrees on the same numbers.
 */

interface DataState {
  range: DateRange | null;
  loads: Load[];
  shifts: Shift[];
  expenses: Expense[];
  expenseInputs: ExpenseInput[];
  fixedCosts: FixedCostInput[];
  categories: ExpenseCategory[];
  rollup: Rollup | null;
  loading: boolean;

  loadRange: (range: DateRange) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useData = create<DataState>((set, get) => ({
  range: null,
  loads: [],
  shifts: [],
  expenses: [],
  expenseInputs: [],
  fixedCosts: [],
  categories: [],
  rollup: null,
  loading: false,

  async loadRange(range) {
    set({ loading: true, range });
    const owner = ownerId();
    const profile = useProfile.getState().profile;

    const [loads, shifts, expenses, inputs, fixedCosts, categories] = await Promise.all([
      loadsRepo.listLoads({ from: range.from, to: range.to }),
      shiftsRepo.listShifts(range.from, range.to),
      expensesRepo.listExpenses({ from: range.from, to: range.to }),
      expensesRepo.expenseInputs(range.from, range.to),
      expensesRepo.fixedCostInputs(owner),
      expensesRepo.listCategories(),
    ]);

    const rollup = computeRollup({
      role: profile?.role ?? "owner_operator",
      range,
      loads,
      shifts,
      expenses: inputs,
      fixedCosts,
      payStructure: profile?.payStructure ?? null,
      ...(profile?.accessorialPay ? { accessorialPay: profile.accessorialPay } : {}),
      weekStart: profile?.weekStart ?? "sunday",
      includeFixedCostsOnLoads: profile?.allocateFixedCosts ?? true,
    });

    set({
      loads,
      shifts,
      expenses,
      expenseInputs: inputs,
      fixedCosts,
      categories,
      rollup,
      loading: false,
    });
  },

  async refresh() {
    const range = get().range;
    if (range) await get().loadRange(range);
  },
}));

export { computeRollup };
