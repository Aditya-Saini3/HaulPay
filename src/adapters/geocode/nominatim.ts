import { AdapterError, type Place, type Position } from "../types";
import { formatPlaceLabel, toStateCode } from "./photon";
import type { AutocompleteOptions, GeocodeAdapter } from "./types";

/**
 * Nominatim — the fallback for full-address lookups Photon fumbles.
 *
 * The public instance allows roughly one request per second and requires a
 * descriptive User-Agent, so this adapter refuses to be wired to keystrokes:
 * `autocomplete` throws rather than quietly hammering the service, and every
 * call goes through a serial one-per-second queue. Point NOMINATIM_BASE_URL at
 * a self-hosted instance to lift the limit.
 */

interface NominatimResult {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
}

export interface NominatimConfig {
  baseUrl: string;
  /** Required by the public instance's usage policy. Be descriptive. */
  userAgent: string;
  /** Minimum gap between requests, in ms. The public policy is one per second. */
  minIntervalMs?: number;
  email?: string;
}

/**
 * Serialises calls and spaces them out. Every request waits its turn, so a
 * burst of five lookups takes five seconds rather than getting the app banned.
 */
export function createRateLimiter(minIntervalMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = Math.max(0, lastStart + minIntervalMs - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      return task();
    });
    // Keep the chain alive even when a link rejects, or one failure stalls
    // every request behind it forever.
    chain = run.catch(() => undefined);
    return run;
  };
}

export function nominatimResultToPlace(result: NominatimResult): Place | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const a = result.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county ?? null;
  return {
    id: result.place_id ? `nominatim:${result.place_id}` : `nominatim:${lng},${lat}`,
    label: formatPlaceLabel({
      housenumber: a.house_number,
      street: a.road,
      city,
      state: a.state,
      postcode: a.postcode,
    }),
    street: [a.house_number, a.road].filter(Boolean).join(" ").trim() || null,
    city,
    state: toStateCode(a.state),
    postalCode: a.postcode ?? null,
    country: a.country_code?.toUpperCase() ?? null,
    position: [lng, lat],
    source: "nominatim",
  };
}

export function buildNominatimSearchUrl(
  baseUrl: string,
  query: string,
  options: AutocompleteOptions = {},
  email?: string,
): string {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(options.limit ?? 5));
  if (options.countries?.length) {
    url.searchParams.set("countrycodes", options.countries.join(",").toLowerCase());
  }
  if (options.bbox) {
    const [west, south, east, north] = options.bbox;
    url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
    url.searchParams.set("bounded", "1");
  }
  if (email) url.searchParams.set("email", email);
  return url.toString();
}

export function createNominatimAdapter(config: NominatimConfig): GeocodeAdapter {
  const schedule = createRateLimiter(config.minIntervalMs ?? 1000);

  const request = async <T>(url: string, signal?: AbortSignal): Promise<T> =>
    schedule(async () => {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": config.userAgent },
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        throw new AdapterError("Could not reach the address service", "network", error);
      }
      if (response.status === 429) {
        throw new AdapterError("Address lookups are rate limited right now", "rate_limited");
      }
      if (!response.ok) {
        throw new AdapterError(`Address service returned ${response.status}`, "bad_response");
      }
      return (await response.json()) as T;
    });

  return {
    name: "nominatim",
    async autocomplete() {
      // Deliberate. Nominatim's usage policy forbids type-ahead traffic, and a
      // silent fallback here is how an app gets its IP blocked.
      throw new AdapterError(
        "Nominatim must not be wired to keystrokes; use Photon for autocomplete",
        "not_configured",
      );
    },
    async search(query, options = {}) {
      const trimmed = query.trim();
      if (trimmed.length < 3) return [];
      const results = await request<NominatimResult[]>(
        buildNominatimSearchUrl(config.baseUrl, trimmed, options, config.email),
        options.signal,
      );
      return (Array.isArray(results) ? results : [])
        .map(nominatimResultToPlace)
        .filter((p): p is Place => p !== null);
    },
    async reverse(position: Position, options = {}) {
      const url = new URL("/reverse", config.baseUrl);
      url.searchParams.set("lon", String(position[0]));
      url.searchParams.set("lat", String(position[1]));
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      if (config.email) url.searchParams.set("email", config.email);
      const result = await request<NominatimResult>(url.toString(), options.signal);
      return result ? nominatimResultToPlace(result) : null;
    },
  };
}
