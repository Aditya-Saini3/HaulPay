import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { NO_ACCESSORIAL_PAY, type DriverAccessorialPay, type PayStructure } from "@/earnings";
import { AccessorialPayForm, PayStructureForm, defaultStructure } from "@/features/pay-structure-form";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import { Banner, BottomBar, Button, MoneyField, NumberField, Screen, SectionHeader, TextField, Txt } from "@/ui";

/**
 * The role-specific setup wizard.
 *
 * Skippable and resumable: every step writes as it goes, and Settings reaches
 * the same forms later. A driver in a fuel line should be able to bail out
 * halfway and lose nothing.
 */
export default function Setup() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const update = useProfile((s) => s.update);
  const saveTruck = useProfile((s) => s.saveTruck);
  const completeOnboarding = useProfile((s) => s.completeOnboarding);

  const role = profile?.role ?? "owner_operator";

  const [structure, setStructure] = useState<PayStructure>(
    profile?.payStructure ?? defaultStructure(role === "company_driver" ? "per_mile" : "percentage"),
  );
  const [accessorials, setAccessorials] = useState<DriverAccessorialPay>(
    profile?.accessorialPay ?? NO_ACCESSORIAL_PAY,
  );
  const [companyName, setCompanyName] = useState(profile?.companyName ?? "");
  const [unitNumber, setUnitNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [dispatchPercent, setDispatchPercent] = useState<number | null>(null);
  const [factoringPercent, setFactoringPercent] = useState<number | null>(null);
  const [fuelPriceCents, setFuelPriceCents] = useState<number | null>(null);
  const [mpg, setMpg] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const finish = async (skip = false) => {
    setSaving(true);
    try {
      if (!skip) {
        await update({
          payStructure: role === "company_driver" ? structure : null,
          accessorialPay: role === "company_driver" ? accessorials : null,
          companyName: companyName.trim() || null,
          // Fixed-cost allocation defaults on for people who own the truck and
          // off for drivers, who do not carry it.
          allocateFixedCosts: role !== "company_driver",
        });

        if (role !== "company_driver" && (unitNumber.trim() || nickname.trim() || mpg)) {
          await saveTruck({
            unitNumber: unitNumber.trim() || null,
            nickname: nickname.trim() || null,
            avgMpg: mpg,
            avgFuelPriceCents: fuelPriceCents,
          });
        }
      }
      await completeOnboarding();
      router.replace("/(tabs)");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <Screen scroll edges={[]}>
        {role === "company_driver" ? (
          <>
            <Txt variant="title">How you get paid</Txt>
            <Txt variant="body" color={colors.textMuted} style={{ marginBottom: space.lg }}>
              This decides which numbers lead your dashboard.
            </Txt>
            <PayStructureForm value={structure} onChange={setStructure} />

            <SectionHeader title="Accessorial pay" />
            <Txt variant="body" color={colors.textMuted} style={{ marginBottom: space.md }}>
              What you&apos;re owed on top, whichever way the load pays.
            </Txt>
            <AccessorialPayForm value={accessorials} onChange={setAccessorials} />
          </>
        ) : null}

        {role === "owner_operator" ? (
          <>
            <Txt variant="title">Your truck</Txt>
            <Txt variant="body" color={colors.textMuted} style={{ marginBottom: space.lg }}>
              Dimensions and weight go in Settings later; they feed truck routing.
            </Txt>
            <TextField label="Unit number" value={unitNumber} onChangeText={setUnitNumber} placeholder="101" />
            <TextField label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Big Blue" />

            <SectionHeader title="What comes off the top" />
            <NumberField
              label="Dispatch fee"
              suffix="%"
              decimals={1}
              value={dispatchPercent}
              onChange={setDispatchPercent}
            />
            <NumberField
              label="Factoring fee"
              suffix="%"
              decimals={1}
              value={factoringPercent}
              onChange={setFactoringPercent}
            />

            <SectionHeader title="Fuel" />
            <MoneyField label="Average fuel price / gal" cents={fuelPriceCents} onChange={setFuelPriceCents} />
            <NumberField label="Truck MPG" suffix="mpg" decimals={1} value={mpg} onChange={setMpg} />

            <Banner tone="info" icon="information-circle-outline">
              Add your recurring fixed costs in Settings → Fixed costs. Annual bills like plates and
              your 2290 get spread across the year rather than landing in one month.
            </Banner>
          </>
        ) : null}

        {role === "small_carrier" ? (
          <>
            <Txt variant="title">Your company</Txt>
            <Txt variant="body" color={colors.textMuted} style={{ marginBottom: space.lg }}>
              Add trucks and drivers next; each truck carries its own fixed costs.
            </Txt>
            <TextField
              label="Company name"
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="Bluebird Transport"
            />
            <TextField label="First truck unit number" value={unitNumber} onChangeText={setUnitNumber} placeholder="101" />

            <Banner tone="info" icon="information-circle-outline">
              Settings → Trucks and Settings → Drivers let you add the rest and assign a driver to
              each truck. Every report can then be filtered by truck.
            </Banner>
          </>
        ) : null}

        <View style={{ height: space.xl }} />
      </Screen>

      <BottomBar>
        <Button label="Skip for now" variant="ghost" onPress={() => finish(true)} style={{ flex: 1 }} />
        <Button label="Done" onPress={() => finish(false)} loading={saving} style={{ flex: 2 }} />
      </BottomBar>
    </Screen>
  );
}
