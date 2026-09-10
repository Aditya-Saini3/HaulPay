import type { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { create } from "zustand";

import { resetDatabase } from "@/db/sqlite";
import { supabase } from "@/lib/supabase";

/**
 * Authentication.
 *
 * Email and password, Sign in with Apple (required for App Store review when
 * any other social sign-in is offered) and Google. Apple runs through the
 * native credential flow rather than a web redirect, which is what Apple's own
 * guidelines expect and what avoids a browser bounce on iOS.
 */

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  busy: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (email: string, password: string) => Promise<boolean>;
  signInWithApple: () => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  initializing: true,
  busy: false,
  error: null,

  async initialize() {
    if (!supabase) {
      // With no backend configured the app still runs entirely on the local
      // mirror; there is simply no account behind it.
      set({ initializing: false });
      return;
    }

    const { data } = await supabase.auth.getSession();
    set({ session: data.session, user: data.session?.user ?? null, initializing: false });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
    });
  },

  async signInWithEmail(email, password) {
    if (!supabase) return false;
    set({ busy: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    set({ busy: false, error: error?.message ?? null });
    return !error;
  },

  async signUpWithEmail(email, password) {
    if (!supabase) return false;
    set({ busy: true, error: null });
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    set({ busy: false, error: error?.message ?? null });
    return !error;
  },

  async signInWithApple() {
    if (!supabase) return false;
    if (Platform.OS !== "ios") {
      set({ error: "Sign in with Apple is only available on iOS" });
      return false;
    }

    set({ busy: true, error: null });
    try {
      // Apple signs the nonce it is given; Supabase verifies the SHA-256 of it
      // against the token, so the raw value goes to Supabase and the digest to
      // Apple.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        set({ busy: false, error: "Apple did not return an identity token" });
        return false;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });

      set({ busy: false, error: error?.message ?? null });
      return !error;
    } catch (error) {
      const message = (error as { code?: string }).code === "ERR_REQUEST_CANCELED"
        ? null
        : (error as Error).message;
      set({ busy: false, error: message });
      return false;
    }
  },

  async signInWithGoogle() {
    if (!supabase) return false;
    set({ busy: true, error: null });
    try {
      const redirectTo = AuthSession.makeRedirectUri({ scheme: "haulpay", path: "auth/callback" });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data?.url) {
        set({ busy: false, error: error?.message ?? "Could not start Google sign-in" });
        return false;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") {
        set({ busy: false });
        return false;
      }

      // PKCE: the browser comes back with a code, which is exchanged for the
      // session using the verifier the client kept.
      const code = new URL(result.url).searchParams.get("code");
      if (!code) {
        set({ busy: false, error: "Google sign-in did not return a code" });
        return false;
      }

      const exchange = await supabase.auth.exchangeCodeForSession(code);
      set({ busy: false, error: exchange.error?.message ?? null });
      return !exchange.error;
    } catch (error) {
      set({ busy: false, error: (error as Error).message });
      return false;
    }
  },

  async resetPassword(email) {
    if (!supabase) return false;
    set({ busy: true, error: null });
    const redirectTo = AuthSession.makeRedirectUri({ scheme: "haulpay", path: "auth/reset" });
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    set({ busy: false, error: error?.message ?? null });
    return !error;
  },

  async signOut() {
    set({ busy: true });
    await supabase?.auth.signOut();
    // The local mirror is wiped so the next account on this device does not
    // open to someone else's loads.
    await resetDatabase();
    set({ session: null, user: null, busy: false, error: null });
  },

  clearError() {
    set({ error: null });
  },
}));

export function currentUserId(): string | null {
  return useAuth.getState().user?.id ?? null;
}
