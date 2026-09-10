import { Redirect } from "expo-router";

import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { useProfile } from "@/store/profile";

/**
 * Entry gate: sign in, then choose a role, then the app.
 *
 * With no Supabase configured the auth step is skipped entirely — the app runs
 * on the local mirror alone, which is what makes a fresh clone usable.
 */
export default function Index() {
  const session = useAuth((s) => s.session);
  const profile = useProfile((s) => s.profile);

  if (isSupabaseConfigured && !session) return <Redirect href="/(auth)/sign-in" />;
  if (!profile?.onboardingCompletedAt) return <Redirect href="/(onboarding)/role" />;
  return <Redirect href="/(tabs)" />;
}
