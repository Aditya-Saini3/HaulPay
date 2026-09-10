import { useMemo, useState } from "react";
import { View } from "react-native";

import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  type DateRange,
  type WeekStart,
} from "@/earnings";
import { useTheme } from "@/theme";

import { DateTimeField, Sheet, todayKey } from "./fields";
import { Button, Chip, Row } from "./primitives";

/**
 * The date-range selector that heads the dashboard and reports.
 *
 * Week presets honour the account's settlement week start, so "this week"
 * means the same seven days the overtime threshold is measured over.
 */

export type RangePreset = "week" | "month" | "quarter" | "ytd" | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "ytd", label: "YTD" },
  { value: "custom", label: "Custom" },
];

export function rangeFor(preset: RangePreset, weekStart: WeekStart = "sunday"): DateRange {
  const today = todayKey();
  switch (preset) {
    case "week":
      return { from: startOfWeek(today, weekStart), to: endOfWeek(today, weekStart) };
    case "month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "quarter":
      return { from: startOfQuarter(today), to: today };
    case "ytd":
      return { from: startOfYear(today), to: today };
    case "custom":
      return { from: addDays(today, -30), to: today };
  }
}

export function DateRangeSelector({
  preset,
  range,
  weekStart = "sunday",
  onChange,
}: {
  preset: RangePreset;
  range: DateRange;
  weekStart?: WeekStart;
  onChange: (preset: RangePreset, range: DateRange) => void;
}) {
  const { space } = useTheme();
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(range);

  const label = useMemo(() => `${range.from} → ${range.to}`, [range]);

  return (
    <View>
      <Row gap={space.sm} wrap>
        {RANGE_PRESETS.map((option) => (
          <Chip
            key={option.value}
            label={option.value === "custom" ? label.length > 24 ? "Custom" : option.label : option.label}
            selected={preset === option.value}
            onPress={() => {
              if (option.value === "custom") {
                setDraft(range);
                setCustomOpen(true);
                return;
              }
              onChange(option.value, rangeFor(option.value, weekStart));
            }}
          />
        ))}
      </Row>

      <Sheet
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom range"
        footer={
          <Button
            label="Apply"
            full
            onPress={() => {
              // Swapped dates are a slip, not an error — reorder rather than refuse.
              const ordered =
                draft.from <= draft.to ? draft : { from: draft.to, to: draft.from };
              onChange("custom", ordered);
              setCustomOpen(false);
            }}
          />
        }
      >
        <DateTimeField
          label="From"
          mode="date"
          clearable={false}
          value={`${draft.from}T12:00:00Z`}
          onChange={(iso) => iso && setDraft((d) => ({ ...d, from: iso.slice(0, 10) }))}
        />
        <DateTimeField
          label="To"
          mode="date"
          clearable={false}
          value={`${draft.to}T12:00:00Z`}
          onChange={(iso) => iso && setDraft((d) => ({ ...d, to: iso.slice(0, 10) }))}
        />
      </Sheet>
    </View>
  );
}
