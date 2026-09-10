import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, View } from "react-native";

import type { Expense, ExpenseCategory } from "@/db/models";
import { formatMoney, type DateRange } from "@/earnings";
import { useData } from "@/store/data";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  Button,
  Card,
  Chip,
  DateRangeSelector,
  EmptyState,
  Row,
  Screen,
  StatCard,
  Txt,
  rangeFor,
  type RangePreset,
} from "@/ui";

export default function ExpensesScreen() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const trucks = useProfile((s) => s.trucks);
  const { expenses, categories, loadRange } = useData();

  const weekStart = profile?.weekStart ?? "sunday";
  const currency = profile?.currency ?? "USD";

  const [preset, setPreset] = useState<RangePreset>("month");
  const [range, setRange] = useState<DateRange>(() => rangeFor("month", weekStart));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [truckId, setTruckId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadRange(range);
    }, [range, loadRange]),
  );

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filtered = useMemo(
    () =>
      expenses.filter((e) => {
        if (categoryId && e.categoryId !== categoryId) return false;
        if (truckId && e.truckId !== truckId) return false;
        return true;
      }),
    [expenses, categoryId, truckId],
  );

  const total = filtered.reduce((sum, e) => sum + e.amountCents, 0);
  const fixed = filtered
    .filter((e) => categoryById.get(e.categoryId ?? "")?.isFixed)
    .reduce((sum, e) => sum + e.amountCents, 0);

  const sections = useMemo(() => {
    const byDay = new Map<string, Expense[]>();
    for (const expense of filtered) {
      const bucket = byDay.get(expense.incurredOn);
      if (bucket) bucket.push(expense);
      else byDay.set(expense.incurredOn, [expense]);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, data]) => ({
        title: day,
        total: data.reduce((sum, e) => sum + e.amountCents, 0),
        data,
      }));
  }, [filtered]);

  // Only top-level categories go in the filter row; subtypes would make it
  // unusable at 35 entries.
  const topLevel = useMemo(() => categories.filter((c) => !c.parentId), [categories]);

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <DateRangeSelector
          preset={preset}
          range={range}
          weekStart={weekStart}
          onChange={(nextPreset, nextRange) => {
            setPreset(nextPreset);
            setRange(nextRange);
          }}
        />

        <View style={{ height: space.md }} />
        <Row gap={space.md}>
          <StatCard label="Total" value={formatMoney(total, currency)} />
          <StatCard label="Fixed" value={formatMoney(fixed, currency)} compact />
          <StatCard label="Variable" value={formatMoney(total - fixed, currency)} compact />
        </Row>

        <View style={{ height: space.md }} />
        <Row gap={space.sm} wrap>
          <Chip label="All" selected={categoryId === null} onPress={() => setCategoryId(null)} />
          {topLevel.slice(0, 8).map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              tone={category.color}
              selected={categoryId === category.id}
              onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
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
        </Row>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 120 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="No expenses in this range"
            message="Adding one takes about fifteen seconds."
            action={<Button label="Add an expense" onPress={() => router.push("/expenses/edit")} />}
          />
        }
        renderSectionHeader={({ section }) => (
          <Row justify="space-between" style={{ marginTop: space.lg, marginBottom: space.sm }}>
            <Txt variant="label" numeric color={colors.textMuted}>
              {section.title}
            </Txt>
            <Txt variant="label" numeric color={colors.textMuted}>
              {formatMoney(section.total, currency, { decimals: 0 })}
            </Txt>
          </Row>
        )}
        renderItem={({ item }) => (
          <ExpenseRow
            expense={item}
            category={categoryById.get(item.categoryId ?? "") ?? null}
            currency={currency}
            onPress={() => router.push(`/expenses/edit?id=${item.id}`)}
          />
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add an expense"
        onPress={() => router.push("/expenses/edit")}
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
    </Screen>
  );
}

function ExpenseRow({
  expense,
  category,
  currency,
  onPress,
}: {
  expense: Expense;
  category: ExpenseCategory | null;
  currency: "USD" | "CAD";
  onPress: () => void;
}) {
  const { colors, space, radius } = useTheme();
  const color = category?.color ?? colors.textFaint;

  return (
    <Card onPress={onPress} style={{ marginBottom: space.sm }}>
      <Row gap={space.md}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${color}22`,
          }}
        >
          <Ionicons
            name={(category?.icon ?? "ellipse-outline") as keyof typeof Ionicons.glyphMap}
            size={20}
            color={color}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Txt variant="body" numberOfLines={1}>
            {expense.vendor ?? category?.name ?? "Expense"}
          </Txt>
          <Row gap={space.sm}>
            <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
              {category?.name ?? "Uncategorised"}
            </Txt>
            {/* Auto-generated occurrences are marked so they can be told apart
                from something the driver actually keyed in. */}
            {expense.generatedFromId ? (
              <Txt variant="caption" color={colors.info}>
                auto
              </Txt>
            ) : null}
            {expense.fuel ? (
              <Txt variant="caption" numeric color={colors.textFaint}>
                {expense.fuel.gallons} gal{expense.fuel.state ? ` · ${expense.fuel.state}` : ""}
              </Txt>
            ) : null}
          </Row>
        </View>

        <Txt variant="moneySmall" numeric>
          {formatMoney(expense.amountCents, currency)}
        </Txt>
      </Row>
    </Card>
  );
}
