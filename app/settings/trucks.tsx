import { useState } from "react";
import { View } from "react-native";

import type { Truck } from "@/db/models";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  NumberField,
  Row,
  Screen,
  SectionHeader,
  Select,
  Sheet,
  TextField,
  Toggle,
  Txt,
} from "@/ui";

/**
 * Trucks. Dimensions and weight here are the Valhalla truck-costing inputs, in
 * metric because that is what Valhalla takes — the labels say so.
 */
export default function Trucks() {
  const { colors, space } = useTheme();
  const trucks = useProfile((s) => s.trucks);
  const drivers = useProfile((s) => s.drivers);
  const saveTruck = useProfile((s) => s.saveTruck);
  const removeTruck = useProfile((s) => s.removeTruck);

  const [editing, setEditing] = useState<Partial<Truck> | null>(null);

  return (
    <Screen scroll>
      {trucks.length === 0 ? (
        <EmptyState
          icon="bus-outline"
          title="No trucks yet"
          message="Adding one lets routing use its real dimensions and lets every report split by truck."
          action={<Button label="Add a truck" onPress={() => setEditing({})} />}
        />
      ) : null}

      {trucks.map((truck) => (
        <Card key={truck.id} onPress={() => setEditing(truck)} style={{ marginBottom: space.sm }}>
          <Row justify="space-between">
            <View style={{ flex: 1 }}>
              <Txt variant="heading">{truck.unitNumber ?? truck.nickname ?? "Truck"}</Txt>
              <Txt variant="caption" color={colors.textMuted}>
                {[truck.year, truck.make, truck.model].filter(Boolean).join(" ") || "No details"}
              </Txt>
              <Txt variant="caption" numeric color={colors.textFaint}>
                {truck.heightM ? `${truck.heightM}m high · ` : ""}
                {truck.weightT ? `${truck.weightT}t · ` : ""}
                {truck.hazmat ? "hazmat" : "no hazmat"}
              </Txt>
            </View>
          </Row>
        </Card>
      ))}

      {trucks.length > 0 ? (
        <Button label="Add a truck" icon="add" variant="secondary" onPress={() => setEditing({})} full />
      ) : null}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Truck">
        {editing ? (
          <Screen scroll edges={[]} contentStyle={{ padding: 0, maxHeight: 520 }}>
            <TextField
              label="Unit number"
              value={editing.unitNumber ?? ""}
              onChangeText={(unitNumber) => setEditing({ ...editing, unitNumber })}
            />
            <TextField
              label="Nickname"
              value={editing.nickname ?? ""}
              onChangeText={(nickname) => setEditing({ ...editing, nickname })}
            />
            <Row gap={space.md}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Make"
                  value={editing.make ?? ""}
                  onChangeText={(make) => setEditing({ ...editing, make })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Model"
                  value={editing.model ?? ""}
                  onChangeText={(model) => setEditing({ ...editing, model })}
                />
              </View>
            </Row>

            {drivers.length > 0 ? (
              <Select
                label="Assigned driver"
                options={drivers.map((d) => ({ value: d.id, label: d.name }))}
                value={editing.assignedDriverId ?? null}
                onChange={(assignedDriverId) => setEditing({ ...editing, assignedDriverId })}
                clearable
                placeholder="Unassigned"
              />
            ) : null}

            <SectionHeader title="Truck routing" />
            <Banner tone="info" icon="information-circle-outline">
              These feed Valhalla&apos;s truck costing. Metric, because that is the unit it takes.
            </Banner>
            <View style={{ height: space.md }} />

            <Row gap={space.md}>
              <View style={{ flex: 1 }}>
                <NumberField
                  label="Height"
                  suffix="m"
                  value={editing.heightM ?? null}
                  onChange={(heightM) => setEditing({ ...editing, heightM })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <NumberField
                  label="Width"
                  suffix="m"
                  value={editing.widthM ?? null}
                  onChange={(widthM) => setEditing({ ...editing, widthM })}
                />
              </View>
            </Row>
            <Row gap={space.md}>
              <View style={{ flex: 1 }}>
                <NumberField
                  label="Length"
                  suffix="m"
                  value={editing.lengthM ?? null}
                  onChange={(lengthM) => setEditing({ ...editing, lengthM })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <NumberField
                  label="Weight"
                  suffix="t"
                  value={editing.weightT ?? null}
                  onChange={(weightT) => setEditing({ ...editing, weightT })}
                />
              </View>
            </Row>
            <NumberField
              label="Axle load"
              suffix="t"
              value={editing.axleLoadT ?? null}
              onChange={(axleLoadT) => setEditing({ ...editing, axleLoadT })}
            />
            <Toggle
              label="Hazmat"
              value={editing.hazmat ?? false}
              onChange={(hazmat) => setEditing({ ...editing, hazmat })}
            />

            <SectionHeader title="Fuel" />
            <NumberField
              label="Average MPG"
              suffix="mpg"
              value={editing.avgMpg ?? null}
              onChange={(avgMpg) => setEditing({ ...editing, avgMpg })}
            />

            <View style={{ height: space.lg }} />
            <Row gap={space.md}>
              {editing.id ? (
                <Button
                  label="Delete"
                  variant="destructive"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    if (editing.id) await removeTruck(editing.id);
                    setEditing(null);
                  }}
                />
              ) : null}
              <Button
                label="Save"
                style={{ flex: 2 }}
                onPress={async () => {
                  await saveTruck(editing);
                  setEditing(null);
                }}
              />
            </Row>
          </Screen>
        ) : null}
      </Sheet>
    </Screen>
  );
}
