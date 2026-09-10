import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { getDatabase } from "@/db/sqlite";
import * as expensesRepo from "@/db/repositories/expenses";
import { useAuth } from "@/store/auth";
import { ownerId, useProfile } from "@/store/profile";
import { startSyncManager } from "@/sync";
import { ThemeProvider, useTheme } from "@/theme";
import { todayKey } from "@/ui";

void SplashScreen.preventAutoHideAsync();

/**
 * App shell.
 *
 * Startup order matters: the local database opens first, then the profile, and
 * only then does sync start. Every screen reads from SQLite, so the UI is ready
 * before the network is ever consulted.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const initialize = useAuth((s) => s.initialize);
  const loadProfile = useProfile((s) => s.load);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await getDatabase();
      await initialize();
      await loadProfile();
      // Fills in any recurring expenses the app owes since it was last opened.
      await expensesRepo.generateRecurringExpenses(ownerId(), todayKey()).catch(() => 0);
      if (cancelled) return;
      setReady(true);
      await SplashScreen.hideAsync().catch(() => undefined);
    })();

    const stopSync = startSyncManager();
    return () => {
      cancelled = true;
      stopSync();
    };
  }, [initialize, loadProfile]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedStack />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStack() {
  const { colors, name } = useTheme();
  return (
    <>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="loads/[id]" options={{ title: "Load" }} />
        <Stack.Screen name="loads/edit" options={{ title: "Load", presentation: "modal" }} />
        <Stack.Screen name="shifts/edit" options={{ title: "Shift", presentation: "modal" }} />
        <Stack.Screen name="expenses/edit" options={{ title: "Expense", presentation: "modal" }} />
        <Stack.Screen name="settings/trucks" options={{ title: "Trucks" }} />
        <Stack.Screen name="settings/drivers" options={{ title: "Drivers" }} />
        <Stack.Screen name="settings/fixed-costs" options={{ title: "Fixed costs" }} />
        <Stack.Screen name="settings/pay" options={{ title: "Pay structure" }} />
        <Stack.Screen name="settings/categories" options={{ title: "Categories" }} />
      </Stack>
    </>
  );
}
