import Constants from "expo-constants";

/**
 * Environment configuration.
 *
 * Every value is read once, at module load, from EXPO_PUBLIC_* variables (which
 * Metro inlines at build time) with a fallback to `expo.extra` so an EAS build
 * profile can override without a rebuild of the JS. Nothing secret lives here:
 * the Supabase anon key is designed to be public and is protected by RLS, and
 * the tile and routing keys are restricted by referrer at the provider.
 */

type Extra = Record<string, string | undefined>;

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function read(key: string): string | null {
  const fromEnv = process.env[key];
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  const fromExtra = extra[key];
  if (typeof fromExtra === "string" && fromExtra.length > 0) return fromExtra;
  return null;
}

export const env = {
  supabaseUrl: read("EXPO_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: read("EXPO_PUBLIC_SUPABASE_ANON_KEY"),

  mapStyleUrlLight: read("EXPO_PUBLIC_MAP_STYLE_URL_LIGHT"),
  mapStyleUrlDark: read("EXPO_PUBLIC_MAP_STYLE_URL_DARK"),
  mapTileApiKey: read("EXPO_PUBLIC_MAP_TILE_API_KEY"),
  mapProviderName: read("EXPO_PUBLIC_MAP_PROVIDER_NAME"),

  photonBaseUrl: read("EXPO_PUBLIC_PHOTON_BASE_URL") ?? "https://photon.komoot.io",
  nominatimBaseUrl: read("EXPO_PUBLIC_NOMINATIM_BASE_URL") ?? "https://nominatim.openstreetmap.org",
  // Nominatim's usage policy requires a descriptive User-Agent that identifies
  // the app and a contact. A generic one gets the app blocked.
  geocoderUserAgent:
    read("EXPO_PUBLIC_GEOCODER_USER_AGENT") ?? "HaulPay/1.0 (+https://haulpay.app)",
  nominatimEmail: read("EXPO_PUBLIC_NOMINATIM_EMAIL"),

  valhallaBaseUrl: read("EXPO_PUBLIC_VALHALLA_BASE_URL"),
  valhallaApiKey: read("EXPO_PUBLIC_VALHALLA_API_KEY"),

  /** Forces the stub adapters, for tests and offline demos. */
  useStubAdapters: read("EXPO_PUBLIC_USE_STUB_ADAPTERS") === "true",
  /** Receipt OCR ships behind a flag so it can land later. */
  ocrEnabled: read("EXPO_PUBLIC_ENABLE_RECEIPT_OCR") === "true",
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
