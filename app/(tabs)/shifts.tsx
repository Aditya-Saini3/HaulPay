import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, View } from "react-native";

import { newId } from "@/db/ids";
import type { Shift } from "@/db/models";
import * as shiftsRepo from "@/db/repositories/shifts";
import {
  addDays,
  computeShiftPay,
  endOfWeek,
  formatHours,
  formatMoney,
  shiftToWorkDay,
  startOfWeek,
} from "@/earnings";
import { ownerId, useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  Button,
  Card,
  Chip,
  DetailRow,
  EmptyState,
  Row,
  Screen,
  StatCard,
  Txt,
  toLocalIso,
  todayKey,
} from "@/ui";

/**
 * Shifts.
 *
 * Local, drayage and yard drivers work shifts that do not map to discrete
 * loads, and this screen exists so they can run the whole app without ever
 * creating one. Clock in and clock out stamp local time into the form — there
 * is no background process and no location involved.
 */
export default function ShiftsScreen() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const weekStart = profile?.weekStart ?? "sunday";
  const currency = profile?.currency ?? "USD";

  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(todayKey(), weekStart));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [busy, setBusy] = useState(false);

  const weekEnd = useMemo(() => endOfWeek(weekAnchor, weekStart), [weekAnchor, weekStart]);

  const reload = useCallback(async () => {
    setShifts(await shiftsRepo.listShifts(weekAnchor, weekEnd));
  }, [weekAnchor, weekEnd]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const pay = useMemo(
    () => (profile?.payStructure ? computeShiftPay(shifts, profile.payStructure, weekStart) : null),
    [shifts, profile?.payStructure, weekStart],
  );

  const today = todayKey();
  const openShift = useMemo(
    () => shifts.find((s) => s.workDate === today && s.startAt && !s.endAt) ?? null,
    [shifts, today],
  );

  /** Stamps the current local time. No background process, no location. */
  const clock = async () => {
    setBusy(true);
    try {
      const now = toLocalIso(new Date());
      if (openShift) {
        await shiftsRepo.saveShift({ ...openShift, endAt: now, hoursWorked: null });
      } else {
        const existing = await shiftsRepo.getShiftForDate(today);
        if (existing && !existing.startAt) {
          await shiftsRepo.saveShift({ ...existing, startAt: now });
        } else {
          await shiftsRepo.saveShift({
            id: newId(),
            ownerId: ownerId(),
            driverId: null,
            truckId: null,
            workDate: today,
            startAt: now,
            endAt: null,
            unpaidBreakHours: 0,
            hoursWorked: null,
            notes: null,
            loadIds: [],
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const days = useMemo(() => {
    const out: { day: string; shift: Shift | null }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(weekAnchor, i);
      out.push({ day, shift: shifts.find((s) => s.workDate === day) ?? null });
    }
    return out;
  }, [weekAnchor, shifts]);

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <Row justify="space-between" style={{ marginBottom: space.md }}>
          <Chip icon="chevron-back" label="Prev" onPress={() => setWeekAnchor(addDays(weekAnchor, -7))} />
          <Txt variant="label" numeric color={colors.textMuted}>
            {weekAnchor} → {weekEnd}
          </Txt>
          <Chip icon="chevron-forward" label="Next" onPress={() => setWeekAnchor(addDays(weekAnchor, 7))} />
        </Row>

        {pay ? (
          <>
            <Row gap={space.md}>
              <StatCard label="Week pay" value={formatMoney(pay.totalCents, currency)} tone={colors.accent} />
              <StatCard label="Hours" value={formatHours(pay.payableHours)} />
            </Row>
            {pay.overtimeHours > 0 || pay.guaranteedTopUpCents > 0 ? (
              <Card style={{ marginTop: space.md }}>
                {pay.overtimeHours > 0 ? (
                  <DetailRow
                    label="Overtime"
                    value={`${formatHours(pay.overtimeHours)} · ${formatMoney(pay.overtimePayCents, currency)}`}
                    valueColor={colors.warning}
                  />
                ) : null}
                {pay.guaranteedTopUpCents > 0 ? (
                  <DetailRow
                    label="Guarantee top-up"
                    value={formatMoney(pay.guaranteedTopUpCents, currency)}
                  />
                ) : null}
              </Card>
            ) : null}
          </>
        ) : null}

        <View style={{ height: space.lg }} />
        <Button
          label={openShift ? "Clock out" : "Clock in"}
          icon={openShift ? "stop-circle-outline" : "play-circle-outline"}
          variant={openShift ? "destructive" : "primary"}
          onPress={clock}
          loading={busy}
          full
        />
        <View style={{ height: space.lg }} />
      </View>

      <FlatList
        data={days}
        keyExtractor={(item) => item.day}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        ListEmptyComponent={<EmptyState icon="time-outline" title="No shifts this week" />}
        renderItem={({ item }) => {
          const worked = item.shift ? shiftToWorkDay(item.shift).workedHours : 0;
          const dayPay = pay?.days.find((d) => d.day === item.day) ?? null;
          const open = Boolean(item.shift?.startAt && !item.shift.endAt);

          return (
            <Card
              style={{ marginBottom: space.sm }}
              onPress={() =>
                router.push(
                  item.shift ? `/shifts/edit?id=${item.shift.id}` : `/shifts/edit?date=${item.day}`,
                )
              }
            >
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <Txt variant="heading">{weekdayLabel(item.day)}</Txt>
                  <Txt variant="caption" numeric color={colors.textMuted}>
                    {item.shift?.startAt
                      ? `${timeLabel(item.shift.startAt)} – ${item.shift.endAt ? timeLabel(item.shift.endAt) : "open"}`
                      : "No shift"}
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Txt variant="moneySmall" numeric color={open ? colors.info : colors.text}>
                    {worked > 0 ? formatHours(worked) : "—"}
                  </Txt>
                  {dayPay ? (
                    <Row gap={space.xs}>
                      <Txt variant="caption" numeric color={colors.textMuted}>
                        {formatMoney(dayPay.totalCents, currency, { decimals: 0 })}
                      </Txt>
                      {dayPay.overtimeHours > 0 ? (
                        <Txt variant="caption" color={colors.warning}>
                          OT
                        </Txt>
                      ) : null}
                    </Row>
                  ) : null}
                </View>
              </Row>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

function weekdayLabel(day: string): string {
  // Parsed as UTC noon so the weekday cannot slip across a timezone boundary.
  const date = new Date(`${day}T12:00:00Z`);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
