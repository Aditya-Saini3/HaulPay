import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import type { Attachment, Expense, Load } from "@/db/models";
import { LOAD_STATUSES } from "@/db/models";
import * as attachmentsRepo from "@/db/repositories/attachments";
import * as expensesRepo from "@/db/repositories/expenses";
import * as loadsRepo from "@/db/repositories/loads";
import {
  computeLoad,
  computeLoadPay,
  dailyFixedCostCents,
  formatHours,
  formatMiles,
  formatMoney,
  formatPercent,
  formatRate,
} from "@/earnings";
import { ownerId, useProfile } from "@/store/profile";
import { moneyColor, useTheme } from "@/theme";
import {
  Button,
  Card,
  DetailRow,
  Divider,
  EmptyState,
  Loading,
  MapView,
  Row,
  RoutePreviewNote,
  Screen,
  SectionHeader,
  StatCard,
  StatusChip,
  Txt,
  shortLane,
} from "@/ui";

/**
 * Load detail: map, stops timeline, money, miles, attached expenses, documents.
 *
 * Company drivers see pay math in place of revenue math — a driver does not
 * have revenue, they have pay, and showing them the broker's gross as if it
 * were theirs would be the wrong number in the biggest type on the screen.
 */
export default function LoadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, space } = useTheme();
  const navigation = useNavigation();
  const profile = useProfile((s) => s.profile);

  const [load, setLoad] = useState<Load | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [monthlyFixedCents, setMonthlyFixedCents] = useState(0);
  const [loading, setLoading] = useState(true);

  const currency = profile?.currency ?? "USD";
  const units = profile?.units ?? "mi";
  const isDriver = profile?.role === "company_driver";

  useEffect(() => {
    void (async () => {
      const [found, loadExpenses, docs] = await Promise.all([
        loadsRepo.getLoad(id),
        expensesRepo.listExpenses({ loadId: id }),
        attachmentsRepo.listAttachments({ loadId: id }),
      ]);
      setLoad(found);
      setExpenses(loadExpenses);
      setAttachments(docs);
      if (found) setMonthlyFixedCents(await expensesRepo.monthlyFixedFor(ownerId(), found.truckId));
      setLoading(false);
    })();
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: load?.loadNumber ?? load?.broker ?? "Load",
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit load"
          onPress={() => router.push(`/loads/edit?id=${id}`)}
          hitSlop={10}
        >
          <Ionicons name="create-outline" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, load, id, colors.text]);

  const result = useMemo(
    () =>
      load
        ? computeLoad(load, {
            includeFixedCosts: profile?.allocateFixedCosts ?? false,
            dailyFixedCostCents: dailyFixedCostCents(monthlyFixedCents),
          })
        : null,
    [load, profile?.allocateFixedCosts, monthlyFixedCents],
  );

  const pay = useMemo(
    () => (load && isDriver && profile?.payStructure
      ? computeLoadPay(load, profile.payStructure, {
          ...(profile.accessorialPay ? { accessorials: profile.accessorialPay } : {}),
        })
      : null),
    [load, isDriver, profile],
  );

  if (loading) return <Screen><Loading /></Screen>;
  if (!load || !result) {
    return (
      <Screen scroll>
        <EmptyState icon="alert-circle-outline" title="Load not found" />
      </Screen>
    );
  }

  const positioned = load.stops
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => ({
      position: [s.lng!, s.lat!] as [number, number],
      type: s.type,
    }));

  const statusLabel = LOAD_STATUSES.find((s) => s.value === load.status)?.label ?? load.status;

  return (
    <Screen scroll>
      <MapView stops={positioned} routeGeometry={load.routeGeometry} height={200}>
        <EmptyState icon="map-outline" title="No stop coordinates yet" />
      </MapView>
      <RoutePreviewNote />

      <Row justify="space-between" style={{ marginTop: space.md }}>
        <StatusChip status={load.status} label={statusLabel} />
        <Txt variant="caption" color={colors.textMuted}>
          {[load.broker, load.commodity].filter(Boolean).join(" · ")}
        </Txt>
      </Row>

      {/* Headline numbers: pay for a driver, revenue for anyone who owns the truck. */}
      <View style={{ height: space.lg }} />
      {pay ? (
        <Row gap={space.md}>
          <StatCard label="Your pay" value={formatMoney(pay.grossPayCents, currency)} tone={colors.accent} />
          <StatCard
            label="Effective hourly"
            value={
              pay.effectiveHourlyCents !== null
                ? `${formatMoney(Math.round(pay.effectiveHourlyCents), currency)}/hr`
                : "—"
            }
            sub={formatHours(pay.hoursWorked)}
          />
        </Row>
      ) : (
        <Row gap={space.md}>
          <StatCard label="Gross" value={formatMoney(result.money.grossCents, currency)} tone={colors.accent} />
          <StatCard
            label="Profit"
            value={formatMoney(result.profitCents, currency)}
            signedCents={result.profitCents}
          />
        </Row>
      )}

      <View style={{ height: space.md }} />
      <Row gap={space.md}>
        <StatCard
          label="All-in RPM"
          value={formatRate(result.allInRatePerMile, currency, units)}
          sub={`${formatRate(result.ratePerMile, currency, units)} loaded`}
          compact
        />
        <StatCard
          label="Deadhead"
          value={formatPercent(result.miles.deadheadPercent)}
          sub={formatMiles(result.miles.deadheadMiles, units)}
          tone={
            result.miles.deadheadPercent !== null && result.miles.deadheadPercent > 20
              ? colors.warning
              : undefined
          }
          compact
        />
      </Row>

      {/* --------------------------------------------------------- stops */}
      <SectionHeader title="Stops" />
      <Card>
        {load.stops.map((stop, index) => (
          <View key={stop.id}>
            {index > 0 ? <Divider /> : null}
            <Row gap={space.md} align="flex-start">
              <View style={{ alignItems: "center", width: 24 }}>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor:
                      stop.type === "pickup"
                        ? colors.accent
                        : stop.type === "dropoff"
                          ? colors.negative
                          : colors.warning,
                  }}
                />
                {index < load.stops.length - 1 ? (
                  <View style={{ width: 2, flex: 1, minHeight: 24, backgroundColor: colors.border }} />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingBottom: space.sm }}>
                <Txt variant="body">{stop.address ?? shortLane(stop)}</Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  {shortLane(stop)}
                  {stop.postalCode ? ` ${stop.postalCode}` : ""}
                </Txt>
                {stop.appointmentAt ? (
                  <Txt variant="caption" numeric color={colors.textFaint}>
                    {new Date(stop.appointmentAt).toLocaleString()}
                    {stop.appointmentType === "fcfs" ? " · FCFS" : ""}
                  </Txt>
                ) : null}
                {stop.reference ? (
                  <Txt variant="caption" color={colors.textFaint}>
                    Ref {stop.reference}
                  </Txt>
                ) : null}
              </View>
            </Row>
          </View>
        ))}
      </Card>

      {/* --------------------------------------------------------- money */}
      <SectionHeader title="Money" />
      <Card>
        <DetailRow label="Linehaul" value={formatMoney(result.money.linehaulCents, currency)} />
        {load.lineItems
          .filter((i) => i.kind === "accessorial")
          .map((item) => (
            <DetailRow
              key={item.id}
              label={item.label}
              value={formatMoney(item.amountCents ?? 0, currency)}
              valueColor={colors.accent}
            />
          ))}
        <Divider />
        <DetailRow label="Gross" value={formatMoney(result.money.grossCents, currency)} strong />
        {load.lineItems
          .filter((i) => i.kind === "deduction")
          .map((item) => (
            <DetailRow
              key={item.id}
              label={
                item.percentOfGross !== null ? `${item.label} (${item.percentOfGross}%)` : item.label
              }
              value={formatMoney(
                -(item.percentOfGross !== null
                  ? Math.round((result.money.grossCents * item.percentOfGross) / 100)
                  : (item.amountCents ?? 0)),
                currency,
              )}
              valueColor={colors.negative}
            />
          ))}
        <DetailRow label="Net revenue" value={formatMoney(result.money.netRevenueCents, currency)} strong />
        {result.loadExpensesCents > 0 ? (
          <DetailRow
            label="Load expenses"
            value={formatMoney(-result.loadExpensesCents, currency)}
            valueColor={colors.negative}
          />
        ) : null}
        {result.allocatedFixedCents > 0 ? (
          <DetailRow
            label={`Fixed cost (${result.occupiedDays}d)`}
            value={formatMoney(-result.allocatedFixedCents, currency)}
            valueColor={colors.negative}
          />
        ) : null}
        <Divider />
        <DetailRow
          label="Profit"
          value={formatMoney(result.profitCents, currency)}
          valueColor={moneyColor(colors, result.profitCents)}
          strong
        />
      </Card>

      {/* Pay math for a company driver, alongside what the load actually billed. */}
      {pay ? (
        <>
          <SectionHeader title="Your pay" />
          <Card>
            <DetailRow
              label={payBasisLabel(pay.basis)}
              value={formatMoney(pay.structurePayCents, currency)}
            />
            {pay.alternatePayCents !== null ? (
              <DetailRow
                label="Other side of the hybrid"
                value={formatMoney(pay.alternatePayCents, currency)}
                valueColor={colors.textMuted}
              />
            ) : null}
            {pay.hourly ? (
              <>
                <DetailRow label="Regular hours" value={formatHours(pay.hourly.regularHours)} />
                {pay.hourly.overtimeHours > 0 ? (
                  <DetailRow
                    label="Overtime hours"
                    value={formatHours(pay.hourly.overtimeHours)}
                    valueColor={colors.warning}
                  />
                ) : null}
                {pay.hourly.guaranteedTopUpCents > 0 ? (
                  <DetailRow
                    label="Guarantee top-up"
                    value={formatMoney(pay.hourly.guaranteedTopUpCents, currency)}
                  />
                ) : null}
              </>
            ) : null}
            {pay.accessorialPayCents > 0 ? (
              <DetailRow label="Accessorials" value={formatMoney(pay.accessorialPayCents, currency)} />
            ) : null}
            <Divider />
            <DetailRow label="Gross pay" value={formatMoney(pay.grossPayCents, currency)} strong />
          </Card>
        </>
      ) : null}

      {/* --------------------------------------------------------- miles */}
      <SectionHeader title="Miles" />
      <Card>
        <DetailRow label="Loaded" value={formatMiles(result.miles.loadedMiles, units)} />
        <DetailRow label="Deadhead" value={formatMiles(result.miles.deadheadMiles, units)} />
        <DetailRow label="Total" value={formatMiles(result.miles.totalMiles, units)} strong />
        <DetailRow label="Paid on" value={formatMiles(result.miles.paidMiles, units)} />
        {result.miles.unpaidMiles > 0 ? (
          <DetailRow
            label="Run and not paid"
            value={formatMiles(result.miles.unpaidMiles, units)}
            valueColor={colors.warning}
          />
        ) : null}
      </Card>

      {/* ------------------------------------------------------ expenses */}
      <SectionHeader
        title="Expenses on this load"
        action={
          <Button
            label="Add"
            variant="ghost"
            icon="add"
            onPress={() => router.push(`/expenses/edit?loadId=${id}`)}
          />
        }
      />
      <Card>
        {expenses.length === 0 ? (
          <Txt variant="body" color={colors.textMuted}>
            None tagged to this load.
          </Txt>
        ) : (
          expenses.map((expense) => (
            <DetailRow
              key={expense.id}
              label={expense.vendor ?? expense.notes ?? "Expense"}
              value={formatMoney(expense.amountCents, currency)}
              valueColor={colors.negative}
            />
          ))
        )}
      </Card>

      {/* ----------------------------------------------------- documents */}
      <SectionHeader title="Documents" />
      <Card>
        {attachments.length === 0 ? (
          <Txt variant="body" color={colors.textMuted}>
            No rate confirmation or BOL attached.
          </Txt>
        ) : (
          attachments.map((doc) => (
            <Row key={doc.id} gap={space.md} style={{ paddingVertical: space.sm }}>
              <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Txt variant="body" numberOfLines={1}>
                  {doc.fileName ?? doc.kind}
                </Txt>
                {!doc.uploaded ? (
                  <Txt variant="caption" color={colors.warning}>
                    Waiting to upload
                  </Txt>
                ) : null}
              </View>
            </Row>
          ))
        )}
      </Card>

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}

function payBasisLabel(basis: string): string {
  switch (basis) {
    case "per_mile":
      return "Mileage pay";
    case "percentage":
      return "Percentage pay";
    case "hourly":
      return "Hourly pay";
    case "flat":
      return "Flat pay";
    case "hybrid_primary":
      return "Hybrid — primary won";
    case "hybrid_floor":
      return "Hybrid — floor won";
    default:
      return "Structure pay";
  }
}
