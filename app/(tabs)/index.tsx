import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";

import {
  bucketByCategory,
  bucketByWeek,
  formatHourlyRate,
  formatHours,
  formatMiles,
  formatMoney,
  formatPercent,
  formatRate,
  type DateRange,
} from "@/earnings";
import { SyncBadge } from "@/features/sync-badge";
import { useData } from "@/store/data";
import { headlineMetrics, useProfile } from "@/store/profile";
import { runSync } from "@/sync";
import { moneyColor, useTheme } from "@/theme";
import {
  BarChart,
  Banner,
  Button,
  Card,
  DateRangeSelector,
  DetailRow,
  DonutChart,
  EmptyState,
  Meter,
  Row,
  Screen,
  SectionHeader,
  StatCard,
  Txt,
  rangeFor,
  type RangePreset,
} from "@/ui";

/**
 * The dashboard.
 *
 * Which cards lead is decided by role and pay structure. An hourly driver gets
 * hours, effective hourly rate and overtime up front with mileage demoted; a
 * per-mile driver gets the reverse. RPM is never the headline for someone paid
 * by the hour.
 */
export default function Dashboard() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const trucks = useProfile((s) => s.trucks);
  const { rollup, loads, expenses, shifts, expenseInputs, loading, loadRange } = useData();

  const weekStart = profile?.weekStart ?? "sunday";
  const currency = profile?.currency ?? "USD";
  const units = profile?.units ?? "mi";

  const [preset, setPreset] = useState<RangePreset>("month");
  const [range, setRange] = useState<DateRange>(() => rangeFor("month", weekStart));
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadRange(range);
    }, [range, loadRange]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await runSync();
    await loadRange(range);
    setRefreshing(false);
  };

  const weekBuckets = useMemo(
    () => bucketByWeek(loads, expenseInputs, shifts, weekStart),
    [loads, expenseInputs, shifts, weekStart],
  );
  const categoryBuckets = useMemo(() => bucketByCategory(expenseInputs), [expenseInputs]);

  const layout = headlineMetrics(profile?.role, profile?.payStructure);
  const driver = rollup?.driver ?? null;
  const revenue = rollup?.revenue ?? null;

  if (!rollup) {
    return (
      <Screen scroll>
        <EmptyState icon="speedometer-outline" title="Loading your numbers" />
      </Screen>
    );
  }

  const isEmpty = loads.length === 0 && shifts.length === 0 && expenses.length === 0;

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <Row justify="space-between" style={{ marginBottom: space.md }}>
        <View style={{ flex: 1 }}>
          <Txt variant="title">{greeting()}</Txt>
          <Txt variant="caption" color={colors.textFaint} numeric>
            {range.from} → {range.to}
          </Txt>
        </View>
        <SyncBadge />
      </Row>

      <DateRangeSelector
        preset={preset}
        range={range}
        weekStart={weekStart}
        onChange={(nextPreset, nextRange) => {
          setPreset(nextPreset);
          setRange(nextRange);
        }}
      />

      <View style={{ height: space.lg }} />

      {isEmpty && !loading ? (
        <EmptyState
          icon="cube-outline"
          title="Nothing here yet"
          message="Add your first load or shift and this fills in."
          action={<Button label="Add a load" onPress={() => router.push("/loads/edit")} />}
        />
      ) : null}

      {/* Company driver, paid hourly or hybrid: hours lead. */}
      {layout === "hours" && driver ? (
        <>
          <Row gap={space.md}>
            <StatCard label="Gross pay" value={formatMoney(driver.grossPayCents, currency)} tone={colors.accent} />
            <StatCard label="Hours" value={formatHours(driver.hoursWorked)} />
          </Row>
          <View style={{ height: space.md }} />
          <Row gap={space.md}>
            <StatCard
              label="Effective hourly"
              value={formatHourlyRate(driver.effectiveHourlyCents, currency)}
              compact
            />
            <StatCard
              label="Overtime"
              value={formatHours(driver.overtimeHours)}
              tone={driver.overtimeHours > 0 ? colors.warning : undefined}
              sub={`${formatHours(driver.regularHours)} regular`}
              compact
            />
          </Row>
          <View style={{ height: space.md }} />
          <Row gap={space.md}>
            <StatCard label="Net pay" value={formatMoney(driver.netPayCents, currency)} signedCents={driver.netPayCents} compact />
            {driver.perDiemCents > 0 ? (
              <StatCard label="Per diem" value={formatMoney(driver.perDiemCents, currency)} compact />
            ) : (
              <StatCard label="Miles" value={formatMiles(driver.totalMiles, units)} compact />
            )}
          </Row>
        </>
      ) : null}

      {/* Company driver, paid by mile or percentage: mileage leads. */}
      {layout === "miles" && driver ? (
        <>
          <Row gap={space.md}>
            <StatCard label="Gross pay" value={formatMoney(driver.grossPayCents, currency)} tone={colors.accent} />
            <StatCard label="Paid miles" value={formatMiles(driver.paidMiles, units)} />
          </Row>
          <View style={{ height: space.md }} />
          <Row gap={space.md}>
            <StatCard
              label="Cents per mile"
              value={formatRate(driver.centsPerPaidMile, currency, units)}
              compact
            />
            <StatCard
              label="Effective hourly"
              value={formatHourlyRate(driver.effectiveHourlyCents, currency)}
              sub={formatHours(driver.hoursWorked)}
              compact
            />
          </Row>
          <View style={{ height: space.md }} />
          <Row gap={space.md}>
            <StatCard label="Net pay" value={formatMoney(driver.netPayCents, currency)} signedCents={driver.netPayCents} compact />
            {driver.perDiemCents > 0 ? (
              <StatCard label="Per diem" value={formatMoney(driver.perDiemCents, currency)} compact />
            ) : (
              <StatCard
                label="Unpaid miles"
                value={formatMiles(Math.max(0, driver.totalMiles - driver.paidMiles), units)}
                tone={driver.totalMiles > driver.paidMiles ? colors.warning : undefined}
                compact
              />
            )}
          </Row>
        </>
      ) : null}

      {/* Owner-operator and carrier: revenue leads. */}
      {layout === "revenue" && revenue ? (
        <>
          <Row gap={space.md}>
            <StatCard label="Gross" value={formatMoney(revenue.grossCents, currency)} tone={colors.accent} />
            <StatCard
              label="Net profit"
              value={formatMoney(revenue.netProfitCents, currency)}
              signedCents={revenue.netProfitCents}
            />
          </Row>
          <View style={{ height: space.md }} />
          <Row gap={space.md}>
            <StatCard
              label="All-in RPM"
              value={formatRate(revenue.allInRatePerMile, currency, units)}
              sub={`${formatRate(revenue.ratePerMile, currency, units)} loaded`}
              compact
            />
            <StatCard
              label="Cost per mile"
              value={formatRate(revenue.costPerMile, currency, units)}
              sub="breakeven"
              compact
            />
          </Row>
          <View style={{ height: space.md }} />
          <Row gap={space.md}>
            <StatCard label="Expenses" value={formatMoney(revenue.totalExpenseCents, currency)} compact />
            <StatCard
              label="Total miles"
              value={formatMiles(revenue.totalMiles, units)}
              sub={`${formatPercent(revenue.deadheadPercent)} deadhead`}
              compact
            />
          </Row>

          {revenue.breakevenRpm !== null && revenue.allInRatePerMile !== null ? (
            <Card style={{ marginTop: space.md }}>
              <Meter
                label={`All-in ${formatRate(revenue.allInRatePerMile, currency, units)} against a ${formatRate(revenue.breakevenRpm, currency, units)} breakeven`}
                value={revenue.allInRatePerMile}
                target={revenue.breakevenRpm}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {revenue && revenue.breakevenRpm !== null && revenue.allInRatePerMile !== null &&
      revenue.allInRatePerMile < revenue.breakevenRpm ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="negative" icon="trending-down-outline">
            {`This range ran at ${formatRate(revenue.allInRatePerMile, currency, units)} against a ${formatRate(revenue.breakevenRpm, currency, units)} breakeven.`}
          </Banner>
        </View>
      ) : null}

      <SectionHeader title="Net by week" />
      <Card>
        <BarChart
          currency={currency}
          data={weekBuckets.map((b) => ({ label: b.weekStart.slice(5), value: b.netCents }))}
        />
      </Card>

      <SectionHeader
        title="Where the money went"
        action={<Button label="All" variant="ghost" onPress={() => router.push("/(tabs)/expenses")} />}
      />
      <Card>
        <DonutChart
          currency={currency}
          slices={categoryBuckets.map((c) => ({ label: c.categoryName, value: c.amountCents }))}
          centerValue={formatMoney(
            categoryBuckets.reduce((sum, c) => sum + c.amountCents, 0),
            currency,
            { decimals: 0 },
          )}
          centerLabel="expenses"
        />
      </Card>

      {profile?.role === "small_carrier" && trucks.length > 0 ? (
        <>
          <SectionHeader title="By truck" />
          <Card>
            {trucks.map((truck, index) => {
              const truckLoads = loads.filter((l) => l.truckId === truck.id);
              const gross = truckLoads.reduce(
                (sum, l) =>
                  sum +
                  l.linehaulCents +
                  l.lineItems
                    .filter((i) => i.kind === "accessorial")
                    .reduce((t, i) => t + (i.amountCents ?? 0), 0),
                0,
              );
              const miles = truckLoads.reduce((sum, l) => sum + l.loadedMiles + l.deadheadMiles, 0);
              return (
                <DetailRow
                  key={truck.id}
                  label={truck.unitNumber ?? truck.nickname ?? `Truck ${index + 1}`}
                  value={`${formatMoney(gross, currency, { decimals: 0 })} · ${formatMiles(miles, units)}`}
                  valueColor={moneyColor(colors, gross)}
                />
              );
            })}
          </Card>
        </>
      ) : null}

      <View style={{ height: space.xl }} />
    </Screen>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still rolling";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
