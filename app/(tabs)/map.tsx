import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import type { MapPin } from "@/adapters";
import { computeLoad, formatMoney, type DateRange } from "@/earnings";
import { useData } from "@/store/data";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  Button,
  Card,
  DateRangeSelector,
  EmptyState,
  MapView,
  Row,
  Screen,
  StatusChip,
  Txt,
  rangeFor,
  shortLane,
  type RangePreset,
} from "@/ui";

/**
 * Every load in a date range as map pins, colour-coded by status and clustered
 * at low zoom. Drawn entirely from stored addresses — no device location is
 * requested here at any point.
 */
export default function LoadsMap() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const { loads, loadRange } = useData();

  const weekStart = profile?.weekStart ?? "sunday";
  const currency = profile?.currency ?? "USD";

  const [preset, setPreset] = useState<RangePreset>("month");
  const [range, setRange] = useState<DateRange>(() => rangeFor("month", weekStart));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadRange(range);
    }, [range, loadRange]),
  );

  // One pin per stop that has coordinates, so a multi-stop load shows its whole
  // lane rather than a single dot in the middle of nowhere.
  const pins = useMemo<MapPin[]>(
    () =>
      loads.flatMap((load) =>
        load.stops
          .filter((stop) => stop.lat !== null && stop.lng !== null)
          .map((stop) => ({
            id: load.id,
            position: [stop.lng!, stop.lat!] as [number, number],
            status: load.status,
            title: load.loadNumber ?? load.broker ?? "Load",
            subtitle: shortLane(stop),
          })),
      ),
    [loads],
  );

  const selected = useMemo(() => loads.find((l) => l.id === selectedId) ?? null, [loads, selectedId]);

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md }}>
        <DateRangeSelector
          preset={preset}
          range={range}
          weekStart={weekStart}
          onChange={(nextPreset, nextRange) => {
            setPreset(nextPreset);
            setRange(nextRange);
            setSelectedId(null);
          }}
        />
      </View>

      <View style={{ flex: 1, paddingHorizontal: space.lg }}>
        <MapView pins={pins} height="fill" onPinPress={setSelectedId} interactive>
          <EmptyState
            icon="map-outline"
            title="Add your first load to see it here"
            message="Pins come from the addresses on your stops."
            action={<Button label="Add a load" onPress={() => router.push("/loads/edit")} />}
          />
        </MapView>
      </View>

      {selected ? (
        <View style={{ padding: space.lg }}>
          <Card onPress={() => router.push(`/loads/${selected.id}`)}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, paddingRight: space.md }}>
                <Txt variant="heading" numberOfLines={1}>
                  {selected.stops.length > 1
                    ? `${shortLane(selected.stops[0]!)} → ${shortLane(selected.stops[selected.stops.length - 1]!)}`
                    : (selected.broker ?? "Load")}
                </Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  {[selected.broker, selected.loadNumber].filter(Boolean).join(" · ")}
                </Txt>
              </View>
              <Txt variant="moneySmall" numeric>
                {formatMoney(computeLoad(selected).money.grossCents, currency, { decimals: 0 })}
              </Txt>
            </Row>
            <Row style={{ marginTop: space.sm }}>
              <StatusChip status={selected.status} label={selected.status.replace("_", " ")} />
            </Row>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
