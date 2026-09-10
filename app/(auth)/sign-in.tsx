import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";

import { useAuth } from "@/store/auth";
import { useTheme } from "@/theme";
import { Banner, Button, Divider, Row, Screen, TextField, Txt } from "@/ui";

export default function SignIn() {
  const { colors, space } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { busy, error, signInWithEmail, signUpWithEmail, signInWithApple, signInWithGoogle, resetPassword, clearError } =
    useAuth();

  useEffect(() => {
    if (Platform.OS === "ios") void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const submit = async () => {
    clearError();
    setNotice(null);
    const ok =
      mode === "sign-in"
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password);
    if (!ok) return;
    if (mode === "sign-up") {
      setNotice("Check your email to confirm the account, then sign in.");
      setMode("sign-in");
      return;
    }
    router.replace("/");
  };

  const social = async (provider: "apple" | "google") => {
    clearError();
    const ok = provider === "apple" ? await signInWithApple() : await signInWithGoogle();
    if (ok) router.replace("/");
  };

  return (
    <Screen scroll contentStyle={{ justifyContent: "center", flexGrow: 1 }}>
      <View style={{ marginBottom: space.xl }}>
        <Txt variant="hero">HaulPay</Txt>
        <Txt variant="body" color={colors.textMuted}>
          After everything, what did you make on this load?
        </Txt>
      </View>

      {notice ? <Banner tone="accent" icon="mail-outline">{notice}</Banner> : null}
      {error ? <Banner tone="negative">{error}</Banner> : null}
      {notice || error ? <View style={{ height: space.lg }} /> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
        autoCapitalize="none"
      />

      <Button
        label={mode === "sign-in" ? "Sign in" : "Create account"}
        onPress={submit}
        loading={busy}
        full
      />

      <Row justify="space-between" style={{ marginTop: space.md }}>
        <Button
          label={mode === "sign-in" ? "Create an account" : "I have an account"}
          variant="ghost"
          onPress={() => {
            clearError();
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          }}
        />
        {mode === "sign-in" ? (
          <Button
            label="Reset password"
            variant="ghost"
            onPress={async () => {
              if (await resetPassword(email)) setNotice("Password reset sent to your email.");
            }}
          />
        ) : null}
      </Row>

      <Divider />

      {/* Sign in with Apple is required for App Store review whenever another
          social sign-in is offered. */}
      {appleAvailable ? (
        <Button
          label="Continue with Apple"
          icon="logo-apple"
          variant="secondary"
          onPress={() => social("apple")}
          full
          style={{ marginBottom: space.md }}
        />
      ) : null}
      <Button
        label="Continue with Google"
        icon="logo-google"
        variant="secondary"
        onPress={() => social("google")}
        full
      />
    </Screen>
  );
}
