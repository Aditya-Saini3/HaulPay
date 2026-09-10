import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, View } from "react-native";

import {
  computeLoad,
  formatMiles,
  formatMoney,
  formatRate,
  startOfWeek,
  type DateRange,
  type LoadStatus,
} from "@/earnings";
import type { Load } from "@/db/models";
import { LOAD_STATUSES } from "@/db/models";
import * as loadsRepo from "@/db/repositories/loads";
import { useData } from "@/store/data";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Row,
  Screen,
  Sheet,
  StatusChip,
  SwipeableRow,
  TextField,
  Txt,
  rangeFor,
  shortLane,
  type SwipeAction,
} from "@/ui";

/**
 * The loads list, grouped by settlement week.
 *
 * Each row shows the lane the way a rate confirmation writes it — city, ST →
 * city, ST — with the gross and the rate. Swipe substitutes are explicit
 * buttons in the row's action sheet: a swipe that fires while a truck is moving
 * is a mis-tap waiting to happen.
 */
export default function LoadsScreen() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const trucks = useProfile((s) => s.trucks);
  const drivers = useProfile((s) => s.drivers);
  const { loads, loadRange } = useData();

  const weekStart = profile?.weekStart ?? "sunday";
  const currency = profile?.currency ?? "USD";
  const units = profile?.units ?? "mi";

  const [range] = useState<DateRange>(() => rangeFor("quarter", weekStart));
  const [status, setStatus] = useState<LoadStatus | null>(null);
  const [truckId, setTruckId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [actionsFor, setActionsFor] = useState<Load | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadRange(range);
    }, [range, loadRange]),
  );

  const swipeActionsFor = useCallback(
    (load: Load): SwipeAction[] => [
      ...(load.status === "delivered" || load.status === "invoiced" || load.status === "paid"
        ? []
        : [
            {
              label: "Delivered",
              icon: "checkmark-circle-outline" as const,
              tone: "accent" as const,
              onPress: async () => {
                await loadsRepo.updateLoadStatus(load.id, "delivered");
                await loadRange(range);
              },
            },
          ]),
      {
        label: "Duplicate",
        icon: "copy-outline" as const,
        tone: "info" as const,
        onPress: async () => {
          const newId = await loadsRepo.duplicateLoad(load.id);
          await loadRange(range);
          if (newId) router.push(`/loads/edit?id=${newId}`);
        },
      },
    ],
    [range, loadRange],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return loads.filter((load) => {
      if (status && load.status !== status) return false;
      if (truckId && load.truckId !== truckId) return false;
      if (driverId && load.driverId !== driverId) return false;
      if (!needle) return true;
      return (
        (load.loadNumber ?? "").toLowerCase().includes(needle) ||
        (load.broker ?? "").toLowerCase().includes(needle)
      );
    });
  }, [loads, status, truckId, driverId, search]);

  const sections = useMemo(() => {
    const byWeek = new Map<string, Load[]>();
    for (const load of filtered) {
      const day = (load.startedAt ?? load.endedAt ?? "").slice(0, 10) || "undated";
      const key = day === "undated" ? "undated" : startOfWeek(day, weekStart);
      const bucket = byWeek.get(key);
      if (bucket) bucket.push(load);
      else byWeek.set(key, [load]);
    }
    return [...byWeek.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([week, data]) => ({
        title: week === "undated" ? "No date" : `Week of ${week}`,
        grossCents: data.reduce((sum, l) => sum + computeLoad(l).money.grossCents, 0),
        data,
      }));
  }, [filtered, weekStart]);

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Load number or broker"
          autoCapitalize="none"
          right={<Ionicons name="search" size={18} color={colors.textMuted} />}
        />
        <Row gap={space.sm} wrap style={{ marginBottom: space.md }}>
          <Chip label="All" selected={status === null} onPress={() => setStatus(null)} />
          {LOAD_STATUSES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={status === option.value}
              onPress={() => setStatus(status === option.value ? null : option.value)}
            />
          ))}
          {trucks.map((truck) => (
            <Chip
              key={truck.id}
              icon="bus-outline"
              label={truck.unitNumber ?? truck.nickname ?? "Truck"}
              selected={truckId === truck.id}
              onPress={() => setTruckId(truckId === truck.id ? null : truck.id)}
            />
          ))}
          {drivers.map((driver) => (
            <Chip
              key={driver.id}
              icon="person-outline"
              label={driver.name}
              selected={driverId === driver.id}
              onPress={() => setDriverId(driverId === driver.id ? null : driver.id)}
            />
          ))}
        </Row>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 120 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <EmptyState
            icon="cube-outline"
            title="No loads yet"
            message="Adding one should take under a minute."
            action={<Button label="Add a load" onPress={() => router.push("/loads/edit")} />}
          />
        }
        renderSectionHeader={({ section }) => (
          <Row justify="space-between" style={{ marginTop: space.lg, marginBottom: space.sm }}>
            <Txt variant="label" color={colors.textMuted}>
              {section.title.toUpperCase()}
            </Txt>
            <Txt variant="label" numeric color={colors.textMuted}>
              {formatMoney(section.grossCents, currency, { decimals: 0 })}
            </Txt>
          </Row>
        )}
        renderItem={({ item }) => (
          <SwipeableRow actions={swipeActionsFor(item)}>
            <LoadRow
              load={item}
              currency={currency}
              units={units}
              onPress={() => router.push(`/loads/${item.id}`)}
              onLongPress={() => setActionsFor(item)}
            />
          </SwipeableRow>
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a load"
        onPress={() => router.push("/loads/edit")}
        style={{
          position: "absolute",
          right: space.lg,
          bottom: space.xl,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
          elevation: 4,
        }}
      >
        <Ionicons name="add" size={30} color={colors.textOnAccent} />
      </Pressable>

      <Sheet
        open={actionsFor !== null}
        onClose={() => setActionsFor(null)}
        title={actionsFor?.loadNumber ?? actionsFor?.broker ?? "Load"}
      >
        <Button
          label="Mark delivered"
          variant="secondary"
          full
          onPress={async () => {
            if (actionsFor) await loadsRepo.updateLoadStatus(actionsFor.id, "delivered");
            setActionsFor(null);
            await loadRange(range);
          }}
        />
        <View style={{ height: space.sm }} />
        <Button
          label="Duplicate"
          variant="secondary"
          full
          onPress={async () => {
            if (actionsFor) {
              const id = await loadsRepo.duplicateLoad(actionsFor.id);
              setActionsFor(null);
              await loadRange(range);
              if (id) router.push(`/loads/edit?id=${id}`);
              return;
            }
            setActionsFor(null);
          }}
        />
        <View style={{ height: space.sm }} />
        <Button
          label="Delete"
          variant="destructive"
          full
          onPress={async () => {
            if (actionsFor) await loadsRepo.deleteLoad(actionsFor.id);
            setActionsFor(null);
            await loadRange(range);
          }}
        />
      </Sheet>
    </Screen>
  );
}

function LoadRow({
  load,
  currency,
  units,
  onPress,
  onLongPress,
}: {
  load: Load;
  currency: "USD" | "CAD";
  units: "mi" | "km";
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors, space } = useTheme();
  const result = computeLoad(load);
  const first = load.stops[0];
  const last = load.stops[load.stops.length - 1];
  const lane =
    first && last && load.stops.length > 1
      ? `${shortLane(first)} → ${shortLane(last)}`
      : (load.broker ?? "No stops yet");

  const statusLabel = LOAD_STATUSES.find((s) => s.value === load.status)?.label ?? load.status;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={280}>
      <Card style={{ marginBottom: space.sm }}>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Txt variant="heading" numberOfLines={1}>
              {lane}
            </Txt>
            <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
              {[load.broker, load.loadNumber].filter(Boolean).join(" · ") || "—"}
            </Txt>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Txt variant="moneySmall" numeric>
              {formatMoney(result.money.grossCents, currency, { decimals: 0 })}
            </Txt>
            <Txt variant="caption" numeric color={colors.textMuted}>
              {formatRate(result.allInRatePerMile, currency, units)}
            </Txt>
          </View>
        </Row>

        <Row justify="space-between" style={{ marginTop: space.sm }}>
          <StatusChip status={load.status} label={statusLabel} />
          <Txt variant="caption" numeric color={colors.textFaint}>
            {formatMiles(result.miles.totalMiles, units)}
            {result.miles.deadheadMiles > 0
              ? ` · ${formatMiles(result.miles.deadheadMiles, units)} DH`
              : ""}
          </Txt>
        </Row>
      </Card>
    </Pressable>
  );
}
