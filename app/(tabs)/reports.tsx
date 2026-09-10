import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import * as expensesRepo from "@/db/repositories/expenses";
import {
  bucketByCategory,
  computeCostPerMile,
  computeFuelStats,
  formatHourlyRate,
  formatHours,
  formatMiles,
  formatMoney,
  formatPercent,
  formatRate,
  monthlyFixedCostCents,
  type DateRange,
} from "@/earnings";
import {
  expensesCsv,
  loadsCsv,
  milesByStateCsv,
  profitAndLossHtml,
  sharePdf,
  shareText,
  shiftsCsv,
} from "@/features/export";
import { useData } from "@/store/data";
import { useProfile } from "@/store/profile";
import { moneyColor, useTheme } from "@/theme";
import {
  Banner,
  Button,
  Card,
  DateRangeSelector,
  DetailRow,
  Divider,
  DonutChart,
  Row,
  Screen,
  SectionHeader,
  Txt,
  rangeFor,
  type RangePreset,
} from "@/ui";

/**
 * Reports: P&L, cost per mile, expenses by category, miles by state for IFTA
 * prep, hours and effective hourly, and per-truck P&L for carriers. Everything
 * exports to CSV or PDF and shares straight to email or a bookkeeper.
 */
export default function Reports() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const trucks = useProfile((s) => s.trucks);
  const { rollup, loads, shifts, expenses, expenseInputs, fixedCosts, categories, loadRange } = useData();

  const weekStart = profile?.weekStart ?? "sunday";
  const currency = profile?.currency ?? "USD";
  const units = profile?.units ?? "mi";

  const [preset, setPreset] = useState<RangePreset>("month");
  const [range, setRange] = useState<DateRange>(() => rangeFor("month", weekStart));
  const [fuel, setFuel] = useState<{ gallons: number; amountCents: number; state: string | null }[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadRange(range);
    }, [range, loadRange]),
  );

  useEffect(() => {
    void expensesRepo.fuelInputs(range.from, range.to).then(setFuel);
  }, [range]);

  const categoryName = useCallback(
    (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorised",
    [categories],
  );

  const cpm = useMemo(
    () =>
      computeCostPerMile({
        range,
        miles: rollup?.revenue.totalMiles ?? 0,
        monthlyFixedCents: monthlyFixedCostCents(fixedCosts),
        variableExpenses: expenseInputs,
      }),
    [range, rollup, fixedCosts, expenseInputs],
  );

  const fuelStats = useMemo(
    () => computeFuelStats(fuel, rollup?.revenue.totalMiles ?? 0),
    [fuel, rollup],
  );

  const byState = useMemo(() => {
    const map = new Map<string, { gallons: number; cents: number }>();
    for (const entry of fuel) {
      const key = entry.state ?? "Unknown";
      const row = map.get(key) ?? { gallons: 0, cents: 0 };
      row.gallons += entry.gallons;
      row.cents += entry.amountCents;
      map.set(key, row);
    }
    return [...map.entries()].sort((a, b) => b[1].gallons - a[1].gallons);
  }, [fuel]);

  const run = async (key: string, task: () => Promise<void>) => {
    setExporting(key);
    try {
      await task();
    } finally {
      setExporting(null);
    }
  };

  if (!rollup) return <Screen scroll><Txt variant="body">Loading…</Txt></Screen>;
  const r = rollup.revenue;
  const stamp = `${range.from}_${range.to}`;

  return (
    <Screen scroll>
      <DateRangeSelector
        preset={preset}
        range={range}
        weekStart={weekStart}
        onChange={(nextPreset, nextRange) => {
          setPreset(nextPreset);
          setRange(nextRange);
        }}
      />

      {/* ------------------------------------------------------------ P&L */}
      <SectionHeader title="Profit & loss" />
      <Card>
        <DetailRow label="Gross" value={formatMoney(r.grossCents, currency)} />
        <DetailRow
          label="Deductions"
          value={formatMoney(-(r.grossCents - r.netRevenueCents), currency)}
          valueColor={colors.negative}
        />
        <DetailRow label="Net revenue" value={formatMoney(r.netRevenueCents, currency)} strong />
        <Divider />
        <DetailRow
          label="Variable expenses"
          value={formatMoney(-r.variableExpenseCents, currency)}
          valueColor={colors.negative}
        />
        <DetailRow
          label="Fixed costs (amortized)"
          value={formatMoney(-r.fixedCostCents, currency)}
          valueColor={colors.negative}
        />
        <Divider />
        <DetailRow
          label="Net profit"
          value={formatMoney(r.netProfitCents, currency)}
          valueColor={moneyColor(colors, r.netProfitCents)}
          strong
        />
      </Card>

      <Banner tone="info" icon="information-circle-outline">
        Annual bills like plates and your 2290 are spread across the year rather than landing in the
        month they were paid.
      </Banner>

      {/* -------------------------------------------------- cost per mile */}
      <SectionHeader title="Cost per mile" />
      <Card>
        <DetailRow label="Fixed" value={formatRate(cpm.fixedCpm, currency, units)} />
        <DetailRow label="Variable" value={formatRate(cpm.variableCpm, currency, units)} />
        <DetailRow label="Total" value={formatRate(cpm.totalCpm, currency, units)} strong />
        <Divider />
        <DetailRow
          label="Breakeven rate"
          value={formatRate(cpm.breakevenRpm, currency, units)}
          valueColor={colors.warning}
          strong
        />
        <DetailRow
          label="All-in rate achieved"
          value={formatRate(r.allInRatePerMile, currency, units)}
          valueColor={
            r.allInRatePerMile !== null && cpm.breakevenRpm !== null
              ? r.allInRatePerMile >= cpm.breakevenRpm
                ? colors.accent
                : colors.negative
              : undefined
          }
          strong
        />
      </Card>

      {/* ---------------------------------------------------------- hours */}
      <SectionHeader title="Hours" />
      <Card>
        <DetailRow label="Hours worked" value={formatHours(r.hoursWorked)} />
        {rollup.driver ? (
          <>
            <DetailRow label="Regular" value={formatHours(rollup.driver.regularHours)} />
            <DetailRow
              label="Overtime"
              value={formatHours(rollup.driver.overtimeHours)}
              valueColor={rollup.driver.overtimeHours > 0 ? colors.warning : undefined}
            />
            {rollup.driver.perDiemCents > 0 ? (
              <DetailRow
                label="Per diem (included)"
                value={formatMoney(rollup.driver.perDiemCents, currency)}
              />
            ) : null}
            <DetailRow label="Gross pay" value={formatMoney(rollup.driver.grossPayCents, currency)} strong />
            <DetailRow
              label="Effective hourly"
              value={formatHourlyRate(rollup.driver.effectiveHourlyCents, currency)}
              strong
            />
          </>
        ) : (
          <DetailRow
            label="Profit per hour"
            value={formatHourlyRate(r.effectiveHourlyCents, currency)}
            strong
          />
        )}
      </Card>

      {/* ------------------------------------------------------- expenses */}
      <SectionHeader title="Expenses by category" />
      <Card>
        <DonutChart
          currency={currency}
          slices={bucketByCategory(expenseInputs).map((c) => ({
            label: c.categoryName,
            value: c.amountCents,
          }))}
          centerValue={formatMoney(r.variableExpenseCents, currency, { decimals: 0 })}
          centerLabel="variable"
        />
      </Card>

      {/* ----------------------------------------------- IFTA / by state */}
      <SectionHeader title="Fuel by state" />
      <Card>
        {byState.length === 0 ? (
          <Txt variant="body" color={colors.textMuted}>
            No fuel entries with a state in this range. Add the state on a fuel expense and it shows
            up here for IFTA prep.
          </Txt>
        ) : (
          <>
            {byState.map(([state, row]) => (
              <DetailRow
                key={state}
                label={state}
                value={`${row.gallons.toFixed(1)} gal · ${formatMoney(row.cents, currency, { decimals: 0 })}`}
              />
            ))}
            <Divider />
            <DetailRow
              label="Rolling MPG"
              value={fuelStats.mpg === null ? "—" : fuelStats.mpg.toFixed(2)}
              strong
            />
            <DetailRow
              label="Fuel cost per mile"
              value={formatRate(fuelStats.fuelCostPerMile, currency, units)}
            />
          </>
        )}
      </Card>

      {/* ------------------------------------------------------ per truck */}
      {profile?.role === "small_carrier" && trucks.length > 0 ? (
        <>
          <SectionHeader title="Per-truck P&L" />
          <Card>
            {trucks.map((truck, index) => {
              const truckLoads = loads.filter((l) => l.truckId === truck.id);
              const truckExpenses = expenses.filter((e) => e.truckId === truck.id);
              const gross = truckLoads.reduce(
                (sum, l) =>
                  sum +
                  l.linehaulCents +
                  l.lineItems
                    .filter((i) => i.kind === "accessorial")
                    .reduce((t, i) => t + (i.amountCents ?? 0), 0),
                0,
              );
              const spend = truckExpenses.reduce((sum, e) => sum + e.amountCents, 0);
              const miles = truckLoads.reduce((sum, l) => sum + l.loadedMiles + l.deadheadMiles, 0);
              return (
                <View key={truck.id}>
                  {index > 0 ? <Divider /> : null}
                  <Txt variant="heading">{truck.unitNumber ?? truck.nickname ?? "Truck"}</Txt>
                  <DetailRow label="Gross" value={formatMoney(gross, currency)} />
                  <DetailRow
                    label="Expenses"
                    value={formatMoney(-spend, currency)}
                    valueColor={colors.negative}
                  />
                  <DetailRow
                    label="Net"
                    value={formatMoney(gross - spend, currency)}
                    valueColor={moneyColor(colors, gross - spend)}
                    strong
                  />
                  <DetailRow label="Miles" value={formatMiles(miles, units)} />
                  <DetailRow
                    label="All-in RPM"
                    value={formatRate(miles > 0 ? gross / miles : null, currency, units)}
                  />
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {/* --------------------------------------------------------- export */}
      <SectionHeader title="Export" />
      <Row gap={space.md} wrap>
        <Button
          label="P&L (PDF)"
          icon="document-outline"
          variant="secondary"
          loading={exporting === "pdf"}
          style={{ flexGrow: 1, flexBasis: "45%" }}
          onPress={() =>
            run("pdf", () =>
              sharePdf(
                `haulpay-pl-${stamp}.pdf`,
                profitAndLossHtml({
                  range,
                  rollup,
                  expenses: expenseInputs,
                  currency,
                  units,
                  companyName: profile?.companyName ?? null,
                }),
              ),
            )
          }
        />
        <Button
          label="Loads (CSV)"
          icon="grid-outline"
          variant="secondary"
          loading={exporting === "loads"}
          style={{ flexGrow: 1, flexBasis: "45%" }}
          onPress={() => run("loads", () => shareText(`haulpay-loads-${stamp}.csv`, loadsCsv(loads, units)))}
        />
        <Button
          label="Expenses (CSV)"
          icon="grid-outline"
          variant="secondary"
          loading={exporting === "expenses"}
          style={{ flexGrow: 1, flexBasis: "45%" }}
          onPress={() =>
            run("expenses", () =>
              shareText(`haulpay-expenses-${stamp}.csv`, expensesCsv(expenses, categoryName)),
            )
          }
        />
        <Button
          label="Fuel by state (CSV)"
          icon="grid-outline"
          variant="secondary"
          loading={exporting === "ifta"}
          style={{ flexGrow: 1, flexBasis: "45%" }}
          onPress={() => run("ifta", () => shareText(`haulpay-ifta-${stamp}.csv`, milesByStateCsv(fuel)))}
        />
        {shifts.length > 0 ? (
          <Button
            label="Shifts (CSV)"
            icon="grid-outline"
            variant="secondary"
            loading={exporting === "shifts"}
            style={{ flexGrow: 1, flexBasis: "45%" }}
            onPress={() => run("shifts", () => shareText(`haulpay-shifts-${stamp}.csv`, shiftsCsv(shifts)))}
          />
        ) : null}
      </Row>

      <Txt variant="caption" color={colors.textFaint} style={{ marginTop: space.md }}>
        {formatPercent(r.deadheadPercent, 1)} of miles in this range ran empty.
      </Txt>

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}
