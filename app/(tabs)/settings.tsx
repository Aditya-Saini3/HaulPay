import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";

import * as expensesRepo from "@/db/repositories/expenses";
import * as loadsRepo from "@/db/repositories/loads";
import * as shiftsRepo from "@/db/repositories/shifts";
import { configurationReport } from "@/lib/env";
import { isSupabaseConfigured } from "@/lib/supabase";
import { expensesCsv, loadsCsv, shareText, shiftsCsv } from "@/features/export";
import type { Currency, DistanceUnit, Role, WeekStart } from "@/earnings";
import { useAuth } from "@/store/auth";
import { useProfile } from "@/store/profile";
import { runSync } from "@/sync";
import { useTheme } from "@/theme";
import {
  Button,
  Card,
  DetailRow,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Select,
  TextField,
  Toggle,
  Txt,
} from "@/ui";

const ROLE_OPTIONS = [
  { value: "company_driver" as Role, label: "Company Driver" },
  { value: "owner_operator" as Role, label: "Owner-Operator" },
  { value: "small_carrier" as Role, label: "Small Carrier" },
];

export default function Settings() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const trucks = useProfile((s) => s.trucks);
  const drivers = useProfile((s) => s.drivers);
  const update = useProfile((s) => s.update);
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);

  const [companyName, setCompanyName] = useState(profile?.companyName ?? "");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setCompanyName(profile?.companyName ?? "");
  }, [profile?.companyName]);

  const config = configurationReport();

  const exportEverything = async () => {
    setExporting(true);
    try {
      const [loads, expenses, shifts, categories] = await Promise.all([
        loadsRepo.listLoads(),
        expensesRepo.listExpenses({ includeTemplates: true }),
        shiftsRepo.listShifts(),
        expensesRepo.listCategories(),
      ]);
      const name = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorised";
      await shareText("haulpay-loads.csv", loadsCsv(loads, profile?.units ?? "mi"));
      await shareText("haulpay-expenses.csv", expensesCsv(expenses, name));
      if (shifts.length > 0) await shareText("haulpay-shifts.csv", shiftsCsv(shifts));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen scroll>
      <SectionHeader title="Profile" />
      <Card>
        <Txt variant="body" color={colors.textMuted}>
          {user?.email ?? "Signed out — running on this device only"}
        </Txt>
      </Card>

      <View style={{ height: space.lg }} />
      {/* Role is changeable at any time and nothing is deleted when it changes. */}
      <Select
        label="Role"
        hint="Changing this keeps all your data"
        options={ROLE_OPTIONS}
        value={profile?.role ?? "owner_operator"}
        onChange={(role) => role && void update({ role })}
      />

      {profile?.role !== "company_driver" ? (
        <TextField
          label="Company name"
          value={companyName}
          onChangeText={setCompanyName}
          placeholder="Bluebird Transport"
        />
      ) : null}

      <SectionHeader title="Setup" />
      <Card padded={false}>
        <SettingsLink
          icon="bus-outline"
          label="Trucks"
          detail={`${trucks.length}`}
          onPress={() => router.push("/settings/trucks")}
        />
        <Divider />
        <SettingsLink
          icon="people-outline"
          label="Drivers"
          detail={`${drivers.length}`}
          onPress={() => router.push("/settings/drivers")}
        />
        <Divider />
        <SettingsLink
          icon="wallet-outline"
          label="Pay structure"
          detail={profile?.payStructure?.kind.replace("_", " ") ?? "Not set"}
          onPress={() => router.push("/settings/pay")}
        />
        <Divider />
        <SettingsLink
          icon="repeat-outline"
          label="Fixed costs"
          onPress={() => router.push("/settings/fixed-costs")}
        />
        <Divider />
        <SettingsLink
          icon="pricetags-outline"
          label="Expense categories"
          onPress={() => router.push("/settings/categories")}
        />
      </Card>

      <SectionHeader title="Preferences" />
      <Segmented<Currency>
        label="Currency"
        value={profile?.currency ?? "USD"}
        options={[
          { value: "USD", label: "USD" },
          { value: "CAD", label: "CAD" },
        ]}
        onChange={(currency) => void update({ currency })}
      />
      <Segmented<DistanceUnit>
        label="Units"
        value={profile?.units ?? "mi"}
        options={[
          { value: "mi", label: "Miles" },
          { value: "km", label: "Kilometres" },
        ]}
        onChange={(units) => void update({ units })}
      />
      <Segmented<WeekStart>
        label="Settlement week starts"
        value={profile?.weekStart ?? "sunday"}
        options={[
          { value: "sunday", label: "Sunday" },
          { value: "monday", label: "Monday" },
        ]}
        onChange={(weekStart) => void update({ weekStart })}
      />

      <Toggle
        label="Charge fixed costs to each load"
        description="Load profit after the truck's daily fixed cost, rather than before it"
        value={profile?.allocateFixedCosts ?? true}
        onChange={(allocateFixedCosts) => void update({ allocateFixedCosts })}
      />

      {/* ------------------------------------------------------- services */}
      <SectionHeader title="Services" />
      <Card>
        {config.map((entry) => (
          <DetailRow
            key={entry.key}
            label={entry.key}
            value={entry.ok ? "Configured" : "Not set"}
            valueColor={entry.ok ? colors.accent : colors.warning}
            numeric={false}
          />
        ))}
        <Divider />
        <Txt variant="caption" color={colors.textFaint}>
          Mapping, geocoding and routing all run on OpenStreetMap data. Each sits behind its own
          adapter, so swapping a provider is an env change.
        </Txt>
      </Card>

      {/* ----------------------------------------------------------- data */}
      <SectionHeader title="Data" />
      <Button
        label="Export everything (CSV)"
        icon="download-outline"
        variant="secondary"
        loading={exporting}
        onPress={exportEverything}
        full
      />
      {isSupabaseConfigured ? (
        <>
          <View style={{ height: space.md }} />
          <Button label="Sync now" icon="sync-outline" variant="secondary" onPress={() => void runSync()} full />
        </>
      ) : null}

      <View style={{ height: space.xl }} />
      {isSupabaseConfigured ? (
        <Button
          label="Sign out"
          variant="ghost"
          onPress={() => {
            Alert.alert("Sign out", "Your local copy is cleared. Anything not synced is lost.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                style: "destructive",
                // Clearing the session is enough: the gate sends us to sign-in.
                onPress: () => void signOut(),
              },
            ]);
          }}
          full
        />
      ) : null}

      <View style={{ height: space.md }} />
      <Button
        label="Delete account"
        variant="destructive"
        onPress={() => {
          Alert.alert(
            "Delete account",
            "This permanently deletes your account and every load, shift and expense on it. Export first if you want a copy.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () =>
                  Alert.alert(
                    "Confirm deletion",
                    "Deletion runs server-side and cannot be undone. Contact support@haulpay.app to complete it, or sign out to remove this device's copy.",
                  ),
              },
            ],
          );
        }}
        full
      />

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}

function SettingsLink({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: space.tap,
        paddingHorizontal: space.lg,
        backgroundColor: pressed ? colors.surfaceRaised : "transparent",
        justifyContent: "center",
      })}
    >
      <Row gap={space.md}>
        <Ionicons name={icon} size={20} color={colors.textMuted} />
        <Txt variant="body" style={{ flex: 1 }}>
          {label}
        </Txt>
        {detail ? (
          <Txt variant="caption" color={colors.textMuted}>
            {detail}
          </Txt>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Row>
    </Pressable>
  );
}
