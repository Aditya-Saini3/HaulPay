import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { env, isSupabaseConfigured } from "./env";

/**
 * The Supabase client.
 *
 * Session tokens live in SecureStore (Keychain on iOS, EncryptedSharedPreferences
 * on Android) rather than AsyncStorage, because a refresh token in plaintext on
 * a rooted device is a real account takeover. SecureStore caps a value at 2KB,
 * so long tokens are chunked; AsyncStorage is used only as the fallback for
 * anything that will not fit and for web, where SecureStore does not exist.
 */

const CHUNK_SIZE = 1800;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    try {
      const head = await SecureStore.getItemAsync(key);
      if (head === null) return AsyncStorage.getItem(key);
      if (!head.startsWith("__chunks__:")) return head;

      const count = Number(head.slice("__chunks__:".length));
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(`${key}.${i}`);
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    } catch {
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      const chunks = Math.ceil(value.length / CHUNK_SIZE);
      await SecureStore.setItemAsync(key, `__chunks__:${chunks}`);
      for (let i = 0; i < chunks; i += 1) {
        await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") return AsyncStorage.removeItem(key);
    try {
      const head = await SecureStore.getItemAsync(key);
      if (head?.startsWith("__chunks__:")) {
        const count = Number(head.slice("__chunks__:".length));
        for (let i = 0; i < count; i += 1) {
          await SecureStore.deleteItemAsync(`${key}.${i}`);
        }
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      // fall through
    }
    await AsyncStorage.removeItem(key);
  },
};

function createSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no URL to parse a session out of in a native app.
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    global: {
      headers: { "x-application-name": "haulpay" },
    },
  });
}

export const supabase = createSupabaseClient();

/**
 * The app is fully usable before Supabase is configured: everything reads from
 * SQLite and sync simply does nothing. This is what lets a fresh clone run
 * without a backend.
 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env",
    );
  }
  return supabase;
}

export { isSupabaseConfigured };
