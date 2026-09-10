import { useState } from "react";
import { View } from "react-native";

import type { Driver } from "@/db/models";
import { defaultStructure, PayStructureForm } from "@/features/pay-structure-form";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import { Button, Card, EmptyState, Row, Screen, Sheet, TextField, Txt } from "@/ui";

/**
 * Drivers, for the carrier role. Each driver carries their own pay structure,
 * which is what lets one company pay per mile, hourly and hybrid at once.
 */
export default function Drivers() {
  const { colors, space } = useTheme();
  const drivers = useProfile((s) => s.drivers);
  const saveDriver = useProfile((s) => s.saveDriver);
  const removeDriver = useProfile((s) => s.removeDriver);

  const [editing, setEditing] = useState<Partial<Driver> | null>(null);

  return (
    <Screen scroll>
      {drivers.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No drivers yet"
          message="Add a driver to assign loads and split reports by who ran them."
          action={<Button label="Add a driver" onPress={() => setEditing({})} />}
        />
      ) : null}

      {drivers.map((driver) => (
        <Card key={driver.id} onPress={() => setEditing(driver)} style={{ marginBottom: space.sm }}>
          <Txt variant="heading">{driver.name}</Txt>
          <Txt variant="caption" color={colors.textMuted}>
            {driver.payStructure?.kind.replace("_", " ") ?? "No pay structure set"}
          </Txt>
        </Card>
      ))}

      {drivers.length > 0 ? (
        <Button label="Add a driver" icon="add" variant="secondary" onPress={() => setEditing({})} full />
      ) : null}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Driver">
        {editing ? (
          <Screen scroll edges={[]} contentStyle={{ padding: 0, maxHeight: 520 }}>
            <TextField
              label="Name"
              value={editing.name ?? ""}
              onChangeText={(name) => setEditing({ ...editing, name })}
            />
            <TextField
              label="Phone"
              value={editing.phone ?? ""}
              onChangeText={(phone) => setEditing({ ...editing, phone })}
              keyboardType="phone-pad"
            />
            <TextField
              label="Email"
              value={editing.email ?? ""}
              onChangeText={(email) => setEditing({ ...editing, email })}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <PayStructureForm
              value={editing.payStructure ?? defaultStructure("per_mile")}
              onChange={(payStructure) => setEditing({ ...editing, payStructure })}
            />

            <View style={{ height: space.lg }} />
            <Row gap={space.md}>
              {editing.id ? (
                <Button
                  label="Delete"
                  variant="destructive"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    if (editing.id) await removeDriver(editing.id);
                    setEditing(null);
                  }}
                />
              ) : null}
              <Button
                label="Save"
                style={{ flex: 2 }}
                onPress={async () => {
                  await saveDriver(editing);
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
