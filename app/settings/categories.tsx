import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View } from "react-native";

import { newId } from "@/db/ids";
import type { ExpenseCategory } from "@/db/models";
import * as expensesRepo from "@/db/repositories/expenses";
import { ownerId } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  Button,
  Card,
  Chip,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Sheet,
  TextField,
  Toggle,
  Txt,
} from "@/ui";

/**
 * Expense categories.
 *
 * The shipped defaults have no owner and cannot be edited; a user's own
 * categories behave identically to them everywhere else in the app.
 */

const ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  "flame-outline", "construct-outline", "card-outline", "cube-outline", "bus-outline",
  "shield-checkmark-outline", "document-text-outline", "restaurant-outline", "business-outline",
  "water-outline", "people-outline", "calculator-outline",
];

const COLORS = ["#00D48A", "#4C8DFF", "#FFB224", "#FF6369", "#A78BFA", "#3DC7FF", "#F472B6", "#84CC16"];

export default function Categories() {
  const { colors, space } = useTheme();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [editing, setEditing] = useState<Partial<ExpenseCategory> | null>(null);

  const reload = useCallback(async () => {
    setCategories(await expensesRepo.listCategories());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const system = categories.filter((c) => c.ownerId === null && !c.parentId);
  const custom = categories.filter((c) => c.ownerId !== null);

  return (
    <Screen scroll>
      <SectionHeader
        title="Your categories"
        action={
          <Button
            label="Add"
            variant="ghost"
            icon="add"
            onPress={() => setEditing({ icon: ICONS[0], color: COLORS[0], isFixed: false })}
          />
        }
      />
      {custom.length === 0 ? (
        <Card>
          <Txt variant="body" color={colors.textMuted}>
            None yet. Anything you add works exactly like the built-in ones.
          </Txt>
        </Card>
      ) : (
        <Card>
          {custom.map((category, index) => (
            <View key={category.id}>
              {index > 0 ? <Divider /> : null}
              <Row gap={space.md}>
                <Ionicons
                  name={category.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={category.color}
                />
                <Txt variant="body" style={{ flex: 1 }}>
                  {category.name}
                </Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  {category.isFixed ? "Fixed" : "Variable"}
                </Txt>
                <Button label="Edit" variant="ghost" onPress={() => setEditing(category)} />
              </Row>
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title="Built in" />
      <Card>
        {system.map((category, index) => (
          <View key={category.id}>
            {index > 0 ? <Divider /> : null}
            <Row gap={space.md}>
              <Ionicons
                name={category.icon as keyof typeof Ionicons.glyphMap}
                size={20}
                color={category.color}
              />
              <Txt variant="body" style={{ flex: 1 }}>
                {category.name}
              </Txt>
              <Txt variant="caption" color={colors.textFaint}>
                {category.isFixed ? "Fixed" : "Variable"}
              </Txt>
            </Row>
          </View>
        ))}
      </Card>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Category">
        {editing ? (
          <View>
            <TextField
              label="Name"
              value={editing.name ?? ""}
              onChangeText={(name) => setEditing({ ...editing, name })}
              placeholder="Truck wash"
            />

            <Txt variant="label" color={colors.textMuted}>
              ICON
            </Txt>
            <Row gap={space.sm} wrap style={{ marginTop: space.sm, marginBottom: space.lg }}>
              {ICONS.map((icon) => (
                <Button
                  key={icon}
                  label=""
                  icon={icon}
                  variant={editing.icon === icon ? "primary" : "secondary"}
                  onPress={() => setEditing({ ...editing, icon })}
                  style={{ width: 52, paddingHorizontal: 0 }}
                />
              ))}
            </Row>

            <Txt variant="label" color={colors.textMuted}>
              COLOUR
            </Txt>
            <Row gap={space.sm} wrap style={{ marginTop: space.sm, marginBottom: space.lg }}>
              {COLORS.map((color) => (
                <Chip
                  key={color}
                  label=" "
                  tone={color}
                  selected={editing.color === color}
                  onPress={() => setEditing({ ...editing, color })}
                />
              ))}
            </Row>

            <Toggle
              label="Fixed cost"
              description="Fixed costs are amortized into your cost per mile; variable ones land on the day"
              value={editing.isFixed ?? false}
              onChange={(isFixed) => setEditing({ ...editing, isFixed })}
            />

            <View style={{ height: space.lg }} />
            <Button
              label="Save"
              full
              onPress={async () => {
                await expensesRepo.saveCategory({
                  id: editing.id ?? newId(),
                  ownerId: ownerId(),
                  parentId: editing.parentId ?? null,
                  name: editing.name?.trim() || "Category",
                  icon: editing.icon ?? "ellipse-outline",
                  color: editing.color ?? colors.textFaint,
                  isFixed: editing.isFixed ?? false,
                  sortOrder: editing.sortOrder ?? 500,
                });
                setEditing(null);
                await reload();
              }}
            />
          </View>
        ) : null}
      </Sheet>

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}
