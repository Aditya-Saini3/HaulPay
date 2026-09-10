import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";

import type { Expense, ExpenseCategory } from "@/db/models";
import * as expensesRepo from "@/db/repositories/expenses";
import {
  dailyFixedCostCents,
  formatMoney,
  monthlyEquivalentCents,
  monthlyFixedCostCents,
  type FixedCostInput,
} from "@/earnings";
import { ownerId, useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import {
  Banner,
  Button,
  Card,
  DetailRow,
  Divider,
  EmptyState,
  Row,
  Screen,
  SectionHeader,
  Txt,
} from "@/ui";

/**
 * Recurring fixed costs.
 *
 * These are what cost-per-mile and breakeven are built on, and the screen shows
 * the monthly equivalent of each one so an annual bill reads as what it
 * actually costs per month.
 */
export default function FixedCosts() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const currency = profile?.currency ?? "USD";

  const [templates, setTemplates] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [inputs, setInputs] = useState<FixedCostInput[]>([]);

  const reload = useCallback(async () => {
    const owner = ownerId();
    const [all, cats, fixed] = await Promise.all([
      expensesRepo.listExpenses({ includeTemplates: true }),
      expensesRepo.listCategories(),
      expensesRepo.fixedCostInputs(owner),
    ]);
    setTemplates(all.filter((e) => e.isTemplate));
    setCategories(cats);
    setInputs(fixed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const monthly = monthlyFixedCostCents(inputs);
  const daily = dailyFixedCostCents(monthly);

  return (
    <Screen scroll>
      <Card>
        <DetailRow label="Per month" value={formatMoney(monthly, currency)} strong />
        <DetailRow label="Per day" value={formatMoney(daily, currency)} />
        <Divider />
        <Txt variant="caption" color={colors.textFaint}>
          The daily figure comes off the year, so February and July cost the same per day. It is what
          gets charged to a load when fixed-cost allocation is on.
        </Txt>
      </Card>

      <Banner tone="info" icon="calendar-outline">
        Annual costs like IRP plates and Form 2290 are spread across twelve months here rather than
        landing entirely in the month they were paid.
      </Banner>

      <SectionHeader
        title="Recurring costs"
        action={<Button label="Add" variant="ghost" icon="add" onPress={() => router.push("/expenses/edit")} />}
      />

      {templates.length === 0 ? (
        <EmptyState
          icon="repeat-outline"
          title="No recurring costs yet"
          message="Add a truck payment, insurance or your plates and set them to repeat."
          action={<Button label="Add a recurring cost" onPress={() => router.push("/expenses/edit")} />}
        />
      ) : (
        <Card>
          {templates.map((template, index) => {
            const category = categories.find((c) => c.id === template.categoryId);
            const perMonth = monthlyEquivalentCents(template.amountCents, template.recurrenceRule);
            return (
              <View key={template.id}>
                {index > 0 ? <Divider /> : null}
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <Txt variant="body">{template.vendor ?? category?.name ?? "Fixed cost"}</Txt>
                    <Txt variant="caption" color={colors.textMuted} numeric>
                      {formatMoney(template.amountCents, currency)} {template.recurrenceRule}
                      {category?.isFixed ? "" : " · variable category"}
                    </Txt>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Txt variant="body" numeric>
                      {formatMoney(perMonth, currency)}
                    </Txt>
                    <Txt variant="caption" color={colors.textFaint}>
                      / month
                    </Txt>
                  </View>
                </Row>
                <Button
                  label="Edit"
                  variant="ghost"
                  onPress={() => router.push(`/expenses/edit?id=${template.id}`)}
                />
              </View>
            );
          })}
        </Card>
      )}

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}
