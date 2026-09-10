import { Stack } from "expo-router";

import { useTheme } from "@/theme";

export default function OnboardingLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="role" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ title: "Set up" }} />
    </Stack>
  );
}
