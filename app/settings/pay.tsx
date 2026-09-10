import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { NO_ACCESSORIAL_PAY, type DriverAccessorialPay, type PayStructure } from "@/earnings";
import { AccessorialPayForm, defaultStructure, PayStructureForm } from "@/features/pay-structure-form";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import { Banner, BottomBar, Button, Screen, SectionHeader, Txt } from "@/ui";

export default function PaySettings() {
  const { colors, space } = useTheme();
  const profile = useProfile((s) => s.profile);
  const update = useProfile((s) => s.update);

  const [structure, setStructure] = useState<PayStructure>(
    profile?.payStructure ?? defaultStructure("per_mile"),
  );
  const [accessorials, setAccessorials] = useState<DriverAccessorialPay>(
    profile?.accessorialPay ?? NO_ACCESSORIAL_PAY,
  );
  const [saving, setSaving] = useState(false);

  if (profile?.role !== "company_driver") {
    return (
      <Screen scroll>
        <Banner tone="info" icon="information-circle-outline">
          Pay structures belong to drivers. As an owner-operator or carrier you set your own
          drivers&apos; pay under Settings → Drivers.
        </Banner>
        <View style={{ height: space.lg }} />
        <Button label="Go to Drivers" onPress={() => router.replace("/settings/drivers")} full />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <Screen scroll edges={[]}>
        <Txt variant="body" color={colors.textMuted} style={{ marginBottom: space.lg }}>
          This decides which numbers lead your dashboard and how every load is priced.
        </Txt>

        <PayStructureForm value={structure} onChange={setStructure} />

        <SectionHeader title="Accessorial pay" />
        <AccessorialPayForm value={accessorials} onChange={setAccessorials} />
      </Screen>

      <BottomBar>
        <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => router.back()} />
        <Button
          label="Save"
          style={{ flex: 2 }}
          loading={saving}
          onPress={async () => {
            setSaving(true);
            try {
              await update({ payStructure: structure, accessorialPay: accessorials });
              router.back();
            } finally {
              setSaving(false);
            }
          }}
        />
      </BottomBar>
    </Screen>
  );
}
