import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import type { Role } from "@/earnings";
import { useProfile } from "@/store/profile";
import { useTheme } from "@/theme";
import { BottomBar, Button, Card, Row, Screen, Txt } from "@/ui";

/**
 * Role selection: required, and changeable later from Settings without losing
 * any data. Role drives which fields, screens and metrics appear.
 */

const ROLES: { value: Role; title: string; blurb: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    value: "company_driver",
    title: "Company Driver",
    blurb: "I drive for a carrier and get paid per mile, percentage, or hourly.",
    icon: "person-outline",
  },
  {
    value: "owner_operator",
    title: "Owner-Operator",
    blurb: "I own my truck and run under my own or someone else's authority.",
    icon: "bus-outline",
  },
  {
    value: "small_carrier",
    title: "Small Carrier",
    blurb: "I run 2 or more trucks and manage drivers.",
    icon: "people-outline",
  },
];

export default function RoleSelection() {
  const { colors, space, radius } = useTheme();
  const setRole = useProfile((s) => s.setRole);
  const current = useProfile((s) => s.profile?.role);
  const [selected, setSelected] = useState<Role | null>(current ?? null);

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flex: 1, padding: space.lg }}>
        <Txt variant="hero">What do you run?</Txt>
        <Txt variant="body" color={colors.textMuted} style={{ marginBottom: space.xl }}>
          This sets which numbers matter. You can change it later.
        </Txt>

        <View style={{ gap: space.md }}>
          {ROLES.map((role) => {
            const active = selected === role.value;
            return (
              <Pressable
                key={role.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setSelected(role.value)}
              >
                <Card
                  style={{
                    borderColor: active ? colors.accent : colors.border,
                    borderWidth: active ? 2 : 1,
                    backgroundColor: active ? colors.accentMuted : colors.surface,
                  }}
                >
                  <Row gap={space.md} align="flex-start">
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.md,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: active ? colors.accent : colors.surfaceRaised,
                      }}
                    >
                      <Ionicons
                        name={role.icon}
                        size={24}
                        color={active ? colors.textOnAccent : colors.textMuted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="heading">{role.title}</Txt>
                      <Txt variant="body" color={colors.textMuted}>
                        {role.blurb}
                      </Txt>
                    </View>
                  </Row>
                </Card>
              </Pressable>
            );
          })}
        </View>
      </View>

      <BottomBar>
        <Button
          label="Continue"
          full
          disabled={!selected}
          style={{ flex: 1 }}
          onPress={async () => {
            if (!selected) return;
            await setRole(selected);
            router.push("/(onboarding)/setup");
          }}
        />
      </BottomBar>
    </Screen>
  );
}
