import { useMemo } from "react";
import { View } from "react-native";

import type {
  DriverAccessorialPay,
  HourlyStructure,
  OvertimeBasis,
  PayStructure,
  SimpleStructure,
} from "@/earnings";
import { NO_ACCESSORIAL_PAY } from "@/earnings";
import { useTheme } from "@/theme";
import { Banner, Card, MoneyField, NumberField, Segmented, Select, Toggle, Txt, type Option } from "@/ui";

/**
 * The pay structure editor.
 *
 * The structure choice changes the rest of the form, which is the whole point:
 * a per-mile driver should never be asked about overtime thresholds, and an
 * hourly driver should never be asked whether they are paid on practical or
 * HHG miles.
 */

export type StructureKind = PayStructure["kind"];

const KIND_OPTIONS: Option<StructureKind>[] = [
  { value: "per_mile", label: "Per mile", description: "Cents per mile" },
  { value: "percentage", label: "Percentage", description: "A share of the linehaul" },
  { value: "hourly", label: "Hourly", description: "With overtime and guarantees" },
  { value: "flat", label: "Flat per load", description: "Plus per-stop pay" },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Two structures, whichever pays more — common on local and drayage",
  },
];

export const DEFAULT_STRUCTURES: Record<SimpleStructure["kind"], SimpleStructure> = {
  per_mile: { kind: "per_mile", cpmCents: 60, mileageBasis: "practical" },
  percentage: { kind: "percentage", percent: 27, basis: "before_fuel_surcharge" },
  hourly: {
    kind: "hourly",
    hourlyRateCents: 2500,
    overtimeRateCents: null,
    overtimeBasis: "weekly",
    overtimeThresholdHours: 40,
    breaksPaid: false,
    guaranteedDailyHours: null,
  },
  flat: { kind: "flat", flatCents: 25000, stopRateCents: 3500, freeStops: 2 },
};

export function defaultStructure(kind: StructureKind): PayStructure {
  if (kind === "hybrid") {
    return {
      kind: "hybrid",
      primary: DEFAULT_STRUCTURES.hourly,
      floor: DEFAULT_STRUCTURES.per_mile,
    };
  }
  return DEFAULT_STRUCTURES[kind];
}

export function PayStructureForm({
  value,
  onChange,
}: {
  value: PayStructure;
  onChange: (structure: PayStructure) => void;
}) {
  const { space } = useTheme();

  return (
    <View>
      <Select
        label="How are you paid?"
        options={KIND_OPTIONS}
        value={value.kind}
        onChange={(kind) => kind && onChange(defaultStructure(kind))}
      />

      {value.kind === "hybrid" ? (
        <>
          <Banner tone="info" icon="git-compare-outline">
            Both sides are worked out on the same load and the larger one pays. Accessorials are
            added after, so they never tip the comparison.
          </Banner>
          <View style={{ height: space.lg }} />

          <Card style={{ marginBottom: space.md }}>
            <Txt variant="label">PRIMARY</Txt>
            <View style={{ height: space.sm }} />
            <SimpleStructureFields
              value={value.primary}
              onChange={(primary) => onChange({ ...value, primary })}
              allowKindChange
            />
          </Card>

          <Card>
            <Txt variant="label">FLOOR</Txt>
            <View style={{ height: space.sm }} />
            <SimpleStructureFields
              value={value.floor}
              onChange={(floor) => onChange({ ...value, floor })}
              allowKindChange
            />
          </Card>
        </>
      ) : (
        <SimpleStructureFields value={value} onChange={onChange} />
      )}
    </View>
  );
}

function SimpleStructureFields({
  value,
  onChange,
  allowKindChange = false,
}: {
  value: SimpleStructure;
  onChange: (structure: SimpleStructure) => void;
  allowKindChange?: boolean;
}) {
  const simpleKinds = useMemo(
    () => KIND_OPTIONS.filter((o) => o.value !== "hybrid") as Option<SimpleStructure["kind"]>[],
    [],
  );

  return (
    <View>
      {allowKindChange ? (
        <Select
          options={simpleKinds}
          value={value.kind}
          onChange={(kind) => kind && onChange(DEFAULT_STRUCTURES[kind])}
        />
      ) : null}

      {value.kind === "per_mile" ? (
        <>
          <NumberField
            label="Rate"
            suffix="¢ / mi"
            decimals={1}
            value={value.cpmCents}
            onChange={(cents) => onChange({ ...value, cpmCents: cents ?? 0 })}
          />
          <Segmented
            label="Paid on"
            value={value.mileageBasis}
            options={[
              { value: "practical", label: "Practical" },
              { value: "shortest", label: "HHG / shortest" },
            ]}
            onChange={(mileageBasis) => onChange({ ...value, mileageBasis })}
          />
        </>
      ) : null}

      {value.kind === "percentage" ? (
        <>
          <NumberField
            label="Share of linehaul"
            suffix="%"
            decimals={1}
            value={value.percent}
            onChange={(percent) => onChange({ ...value, percent: percent ?? 0 })}
          />
          <Segmented
            label="Calculated"
            value={value.basis}
            options={[
              { value: "before_fuel_surcharge", label: "Before FSC" },
              { value: "after_fuel_surcharge", label: "After FSC" },
            ]}
            onChange={(basis) => onChange({ ...value, basis })}
          />
        </>
      ) : null}

      {value.kind === "hourly" ? <HourlyFields value={value} onChange={onChange} /> : null}

      {value.kind === "flat" ? (
        <>
          <MoneyField
            label="Per load"
            cents={value.flatCents}
            onChange={(flatCents) => onChange({ ...value, flatCents: flatCents ?? 0 })}
          />
          <MoneyField
            label="Per extra stop"
            cents={value.stopRateCents}
            onChange={(stopRateCents) => onChange({ ...value, stopRateCents: stopRateCents ?? 0 })}
          />
          <NumberField
            label="Stops covered by the flat rate"
            hint="A straight pickup and drop is 2"
            decimals={0}
            value={value.freeStops}
            onChange={(freeStops) => onChange({ ...value, freeStops: freeStops ?? 0 })}
          />
        </>
      ) : null}
    </View>
  );
}

function HourlyFields({
  value,
  onChange,
}: {
  value: HourlyStructure;
  onChange: (structure: HourlyStructure) => void;
}) {
  const { colors, space } = useTheme();

  return (
    <View>
      <MoneyField
        label="Hourly rate"
        cents={value.hourlyRateCents}
        onChange={(cents) => onChange({ ...value, hourlyRateCents: cents ?? 0 })}
      />

      <Segmented<OvertimeBasis>
        label="Overtime kicks in"
        value={value.overtimeBasis}
        options={[
          { value: "weekly", label: "Weekly" },
          { value: "daily", label: "Daily" },
          { value: "none", label: "None" },
        ]}
        onChange={(overtimeBasis) =>
          onChange({
            ...value,
            overtimeBasis,
            overtimeThresholdHours:
              overtimeBasis === "none" ? null : overtimeBasis === "daily" ? 8 : 40,
          })
        }
      />

      {value.overtimeBasis !== "none" ? (
        <>
          <NumberField
            label={value.overtimeBasis === "daily" ? "After hours per day" : "After hours per week"}
            suffix="hrs"
            decimals={1}
            value={value.overtimeThresholdHours}
            onChange={(overtimeThresholdHours) => onChange({ ...value, overtimeThresholdHours })}
          />
          <MoneyField
            label="Overtime rate"
            hint="Leave blank for time and a half"
            cents={value.overtimeRateCents}
            onChange={(overtimeRateCents) => onChange({ ...value, overtimeRateCents })}
          />
        </>
      ) : null}

      <Toggle
        label="Breaks are paid"
        description="Break time counts toward the hours you're paid for"
        value={value.breaksPaid}
        onChange={(breaksPaid) => onChange({ ...value, breaksPaid })}
      />

      <View style={{ height: space.md }} />

      <NumberField
        label="Guaranteed daily minimum"
        hint="Show-up pay. Blank for none."
        suffix="hrs"
        decimals={1}
        value={value.guaranteedDailyHours}
        onChange={(guaranteedDailyHours) => onChange({ ...value, guaranteedDailyHours })}
      />

      {value.guaranteedDailyHours ? (
        <Txt variant="caption" color={colors.textMuted} style={{ marginTop: -space.sm }}>
          A short day pays at least {value.guaranteedDailyHours} hours. Guaranteed hours pay at the
          base rate and never count toward overtime.
        </Txt>
      ) : null}
    </View>
  );
}

/** Detention, stop pay and layover, which are owed whatever the structure. */
export function AccessorialPayForm({
  value,
  onChange,
}: {
  value: DriverAccessorialPay;
  onChange: (value: DriverAccessorialPay) => void;
}) {
  return (
    <View>
      <MoneyField
        label="Detention per hour"
        cents={value.detentionPerHourCents}
        onChange={(cents) => onChange({ ...value, detentionPerHourCents: cents ?? 0 })}
      />
      <NumberField
        label="Free hours before detention"
        suffix="hrs"
        decimals={1}
        value={value.detentionFreeHours}
        onChange={(hours) => onChange({ ...value, detentionFreeHours: hours ?? 0 })}
      />
      <MoneyField
        label="Stop pay"
        cents={value.stopPayCents}
        onChange={(cents) => onChange({ ...value, stopPayCents: cents ?? 0 })}
      />
      <NumberField
        label="Stops before stop pay"
        decimals={0}
        value={value.freeStops}
        onChange={(stops) => onChange({ ...value, freeStops: stops ?? 0 })}
      />
      <MoneyField
        label="Layover per day"
        cents={value.layoverPerDayCents}
        onChange={(cents) => onChange({ ...value, layoverPerDayCents: cents ?? 0 })}
      />
    </View>
  );
}

export { NO_ACCESSORIAL_PAY };
