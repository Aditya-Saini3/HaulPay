import { AdapterError, isPosition, type Place, type Position } from "../types";
import type { AutocompleteOptions, GeocodeAdapter } from "./types";

/**
 * Photon — OSM-based and purpose-built for type-ahead, which is why it is the
 * default. The public instance at photon.komoot.io is fine for development;
 * point PHOTON_BASE_URL at a self-hosted instance or a paid OSM geocoder for
 * production volume.
 */

interface PhotonProperties {
  osm_id?: number;
  osm_type?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: PhotonProperties;
}

export interface PhotonConfig {
  baseUrl: string;
  /** Sent as User-Agent. Nominatim requires one; Photon is happier with one. */
  userAgent: string;
  defaultCountries?: string[];
}

/** US and Canadian state/province names to their two-letter codes. */
const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC",
  alberta: "AB", "british columbia": "BC", manitoba: "MB", "new brunswick": "NB",
  "newfoundland and labrador": "NL", "nova scotia": "NS", ontario: "ON",
  "prince edward island": "PE", quebec: "QC", québec: "QC", saskatchewan: "SK",
  "northwest territories": "NT", nunavut: "NU", yukon: "YT",
};

/** Turns "Illinois" into "IL" — a lane reads as "Joliet, IL", never "Joliet, Illinois". */
export function toStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  const trimmed = state.trim();
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  return STATE_CODES[trimmed.toLowerCase()] ?? trimmed;
}

/** Builds the one-line label shown in the address list. */
export function formatPlaceLabel(parts: {
  name?: string | null;
  street?: string | null;
  housenumber?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
}): string {
  const street = [parts.housenumber, parts.street].filter(Boolean).join(" ").trim();
  const head = street || parts.name || "";
  const cityState = [parts.city, toStateCode(parts.state)].filter(Boolean).join(", ");
  const tail = [cityState, parts.postcode].filter(Boolean).join(" ");
  // A named place whose name duplicates the street line should show once.
  const segments = [head, tail].filter((s) => s && s.length > 0);
  return segments.join(" · ") || "Unknown location";
}

export function photonFeatureToPlace(feature: PhotonFeature): Place | null {
  const coords = feature.geometry?.coordinates;
  if (!isPosition(coords)) return null;
  const p = feature.properties ?? {};
  return {
    id: p.osm_id ? `photon:${p.osm_type ?? "n"}${p.osm_id}` : `photon:${coords[0]},${coords[1]}`,
    label: formatPlaceLabel({
      name: p.name,
      street: p.street,
      housenumber: p.housenumber,
      city: p.city ?? p.district ?? p.county,
      state: p.state,
      postcode: p.postcode,
    }),
    street: [p.housenumber, p.street].filter(Boolean).join(" ").trim() || p.name || null,
    city: p.city ?? p.district ?? p.county ?? null,
    state: toStateCode(p.state),
    postalCode: p.postcode ?? null,
    country: p.countrycode?.toUpperCase() ?? p.country ?? null,
    position: coords,
    source: "photon",
  };
}

/**
 * Photon takes `q`, a `lon`/`lat` bias, `bbox`, `limit`, `lang` and `osm_tag`.
 * It has no country filter, so countries are applied to the response instead —
 * see `filterByCountry`.
 */
export function buildPhotonUrl(
  baseUrl: string,
  query: string,
  options: AutocompleteOptions = {},
): string {
  const url = new URL("/api", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(options.limit ?? 8));
  url.searchParams.set("lang", "en");
  if (options.near) {
    // Bias toward where the map is looking without excluding anything else.
    url.searchParams.set("lon", String(options.near[0]));
    url.searchParams.set("lat", String(options.near[1]));
  }
  if (options.bbox) {
    url.searchParams.set("bbox", options.bbox.join(","));
  }
  return url.toString();
}

/** Photon cannot filter by country server-side, so the results are filtered here. */
export function filterByCountry(places: Place[], countries?: string[]): Place[] {
  if (!countries || countries.length === 0) return places;
  const wanted = new Set(countries.map((c) => c.toUpperCase()));
  return places.filter((place) => !place.country || wanted.has(place.country.toUpperCase()));
}

export function createPhotonAdapter(config: PhotonConfig): GeocodeAdapter {
  const request = async (url: string, signal?: AbortSignal): Promise<PhotonFeature[]> => {
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
    const body = (await response.json()) as { features?: unknown };
    return Array.isArray(body.features) ? (body.features as PhotonFeature[]) : [];
  };

  const lookup = async (query: string, options: AutocompleteOptions = {}) => {
    const trimmed = query.trim();
    // Below three characters the results are noise and the request is waste.
    if (trimmed.length < 3) return [];
    const url = buildPhotonUrl(config.baseUrl, trimmed, options);
    const features = await request(url, options.signal);
    const places = features.map(photonFeatureToPlace).filter((p): p is Place => p !== null);
    return filterByCountry(places, options.countries ?? config.defaultCountries);
  };

  return {
    name: "photon",
    autocomplete: lookup,
    search: lookup,
    async reverse(position: Position, options = {}) {
      const url = new URL("/reverse", config.baseUrl);
      url.searchParams.set("lon", String(position[0]));
      url.searchParams.set("lat", String(position[1]));
      const features = await request(url.toString(), options.signal);
      const first = features[0];
      return first ? photonFeatureToPlace(first) : null;
    },
  };
}
