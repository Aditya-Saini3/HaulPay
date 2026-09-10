import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { newId } from "@/db/ids";
import * as shiftsRepo from "@/db/repositories/shifts";
import { formatHours, hoursBetween } from "@/earnings";
import { ownerId, useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  BottomBar,
  Button,
  DateTimeField,
  NumberField,
  Row,
  Screen,
  Select,
  TextField,
  Txt,
  toLocalIso,
  todayKey,
} from "@/ui";

export default function ShiftEditor() {
  const { colors, space } = useTheme();
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const trucks = useProfile((s) => s.trucks);

  const [workDate, setWorkDate] = useState(date ?? todayKey());
  const [startAt, setStartAt] = useState<string | null>(null);
  const [endAt, setEndAt] = useState<string | null>(null);
  const [breakHours, setBreakHours] = useState<number | null>(null);
  const [hoursWorked, setHoursWorked] = useState<number | null>(null);
  const [truckId, setTruckId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    void shiftsRepo.getShift(id).then((shift) => {
      if (!shift) return;
      setWorkDate(shift.workDate);
      setStartAt(shift.startAt);
      setEndAt(shift.endAt);
      setBreakHours(shift.unpaidBreakHours || null);
      setHoursWorked(shift.hoursWorked);
      setTruckId(shift.truckId);
      setNotes(shift.notes ?? "");
      setCreatedAt(shift.createdAt);
    });
  }, [id]);

  // A shift that clocks out after midnight is still one shift on the day it
  // started, and the span across the boundary is simply the difference.
  const span = startAt && endAt ? hoursBetween(startAt, endAt) : null;
  const derived = span === null ? null : Math.max(0, span - (breakHours ?? 0));
  const crossesMidnight = Boolean(
    startAt && endAt && startAt.slice(0, 10) !== endAt.slice(0, 10),
  );

  const save = async () => {
    setSaving(true);
    try {
      const now = toLocalIso(new Date());
      await shiftsRepo.saveShift({
        id: id ?? newId(),
        ownerId: ownerId(),
        driverId: null,
        truckId,
        workDate,
        startAt,
        endAt,
        unpaidBreakHours: breakHours ?? 0,
        hoursWorked,
        notes: notes.trim() || null,
        loadIds: [],
        createdAt: createdAt ?? now,
        updatedAt: now,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <Screen scroll edges={[]}>
        <DateTimeField
          label="Work date"
          mode="date"
          clearable={false}
          value={`${workDate}T12:00:00Z`}
          onChange={(iso) => iso && setWorkDate(iso.slice(0, 10))}
        />

        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Clock in" value={startAt} onChange={setStartAt} />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Clock out" value={endAt} onChange={setEndAt} />
          </View>
        </Row>

        {crossesMidnight ? (
          <Txt variant="caption" color={colors.textMuted} style={{ marginBottom: space.md }}>
            This shift runs past midnight. It stays on {workDate}, which is how the settlement week
            reads it.
          </Txt>
        ) : null}

        <NumberField
          label="Unpaid break"
          suffix="hrs"
          value={breakHours}
          onChange={setBreakHours}
        />

        <NumberField
          label="Hours worked"
          hint={derived !== null ? `Span less break is ${formatHours(derived)}` : undefined}
          suffix="hrs"
          value={hoursWorked}
          onChange={setHoursWorked}
        />

        {trucks.length > 0 ? (
          <Select
            label="Truck"
            options={trucks.map((t) => ({ value: t.id, label: t.unitNumber ?? t.nickname ?? "Truck" }))}
            value={truckId}
            onChange={setTruckId}
            clearable
            placeholder="No truck"
          />
        ) : null}

        <TextField label="Notes" value={notes} onChangeText={setNotes} multiline />
      </Screen>

      <BottomBar>
        {id ? (
          <Button
            label="Delete"
            variant="destructive"
            style={{ flex: 1 }}
            onPress={async () => {
              await shiftsRepo.deleteShift(id);
              router.back();
            }}
          />
        ) : (
          <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => router.back()} />
        )}
        <Button label="Save shift" onPress={save} loading={saving} style={{ flex: 2 }} />
      </BottomBar>
    </Screen>
  );
}
