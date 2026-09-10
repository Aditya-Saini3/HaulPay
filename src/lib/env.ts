import Constants from "expo-constants";

/**
 * Environment configuration.
 *
 * Every EXPO_PUBLIC_* variable is referenced **statically**. Metro inlines
 * these at build time by matching the literal text `process.env.EXPO_PUBLIC_X`,
 * so a dynamic `process.env[key]` lookup compiles to a read of an object that
 * does not exist at runtime and silently yields undefined. The verbose map
 * below is the price of the values actually being there in a release build.
 *
 * Each falls back to `expo.extra`, so an EAS build profile can override without
 * rebuilding the JS. Nothing secret lives here: the Supabase anon key is
 * designed to be public and is protected by RLS, and the tile and routing keys
 * are restricted by referrer at the provider.
 */

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

function pick(fromEnv: string | undefined, key: string): string | null {
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  const fromExtra = extra[key];
  if (typeof fromExtra === "string" && fromExtra.length > 0) return fromExtra;
  return null;
}

export const env = {
  supabaseUrl: pick(process.env.EXPO_PUBLIC_SUPABASE_URL, "EXPO_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: pick(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, "EXPO_PUBLIC_SUPABASE_ANON_KEY"),

  mapStyleUrlLight: pick(process.env.EXPO_PUBLIC_MAP_STYLE_URL_LIGHT, "EXPO_PUBLIC_MAP_STYLE_URL_LIGHT"),
  mapStyleUrlDark: pick(process.env.EXPO_PUBLIC_MAP_STYLE_URL_DARK, "EXPO_PUBLIC_MAP_STYLE_URL_DARK"),
  mapTileApiKey: pick(process.env.EXPO_PUBLIC_MAP_TILE_API_KEY, "EXPO_PUBLIC_MAP_TILE_API_KEY"),
  mapProviderName: pick(process.env.EXPO_PUBLIC_MAP_PROVIDER_NAME, "EXPO_PUBLIC_MAP_PROVIDER_NAME"),

  photonBaseUrl:
    pick(process.env.EXPO_PUBLIC_PHOTON_BASE_URL, "EXPO_PUBLIC_PHOTON_BASE_URL") ??
    "https://photon.komoot.io",
  nominatimBaseUrl:
    pick(process.env.EXPO_PUBLIC_NOMINATIM_BASE_URL, "EXPO_PUBLIC_NOMINATIM_BASE_URL") ??
    "https://nominatim.openstreetmap.org",
  // Nominatim's usage policy requires a descriptive User-Agent identifying the
  // app and a contact. A generic one gets the app blocked.
  geocoderUserAgent:
    pick(process.env.EXPO_PUBLIC_GEOCODER_USER_AGENT, "EXPO_PUBLIC_GEOCODER_USER_AGENT") ??
    "HaulPay/1.0 (+https://haulpay.app)",
  nominatimEmail: pick(process.env.EXPO_PUBLIC_NOMINATIM_EMAIL, "EXPO_PUBLIC_NOMINATIM_EMAIL"),

  valhallaBaseUrl: pick(process.env.EXPO_PUBLIC_VALHALLA_BASE_URL, "EXPO_PUBLIC_VALHALLA_BASE_URL"),
  valhallaApiKey: pick(process.env.EXPO_PUBLIC_VALHALLA_API_KEY, "EXPO_PUBLIC_VALHALLA_API_KEY"),

  /** Forces the stub adapters, for tests and offline demos. */
  useStubAdapters:
    pick(process.env.EXPO_PUBLIC_USE_STUB_ADAPTERS, "EXPO_PUBLIC_USE_STUB_ADAPTERS") === "true",
  /** Receipt OCR ships behind a flag so it can land later. */
  ocrEnabled:
    pick(process.env.EXPO_PUBLIC_ENABLE_RECEIPT_OCR, "EXPO_PUBLIC_ENABLE_RECEIPT_OCR") === "true",
} as const;

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isMapConfigured = Boolean(env.mapStyleUrlLight ?? env.mapStyleUrlDark);
export const isRoutingConfigured = Boolean(env.valhallaBaseUrl);

/** What Settings shows so a user can see which services are wired up. */
export function configurationReport() {
  return [
    { key: "Supabase", ok: isSupabaseConfigured, hint: "EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY" },
    { key: "Map tiles", ok: isMapConfigured, hint: "EXPO_PUBLIC_MAP_STYLE_URL_LIGHT / _DARK" },
    { key: "Geocoding", ok: true, hint: env.photonBaseUrl },
    { key: "Routing", ok: isRoutingConfigured, hint: "EXPO_PUBLIC_VALHALLA_BASE_URL" },
  ];
}
