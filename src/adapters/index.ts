import { env } from "@/lib/env";

import { createOsmMapAdapter } from "./map/osm";
import { createStubMapAdapter } from "./map/stub";
import type { MapAdapter } from "./map/types";

import { createNominatimAdapter } from "./geocode/nominatim";
import { createPhotonAdapter } from "./geocode/photon";
import { createStubGeocodeAdapter } from "./geocode/stub";
import type { GeocodeAdapter } from "./geocode/types";
import { PlaceCache } from "./geocode/cache";

import { createStubRouteAdapter } from "./route/stub";
import { createValhallaAdapter } from "./route/valhalla";
import type { RouteAdapter } from "./route/types";

import { AdapterError, type Place, type Position } from "./types";
import type { AutocompleteOptions } from "./geocode/types";

/**
 * The adapter registry. Screens import from here and never from a concrete
 * provider, which is the whole point of the interfaces: swapping MapTiler for
 * Protomaps, or Photon for LocationIQ, is an env change and a line in this
 * file, not a change to any UI code.
 */

export * from "./types";
export type { MapAdapter, MapPin, MapViewport } from "./map/types";
export type { GeocodeAdapter, AutocompleteOptions } from "./geocode/types";
export type { RouteAdapter, RouteRequest, RouteResult, TruckProfile } from "./route/types";
export { OSM_ATTRIBUTION } from "./map/osm";
export { MAP_COLORS, STATUS_COLORS, rasterStyle } from "./map/styles";
export { decodePolyline, encodePolyline, simplify } from "./route/polyline";
export { createDebouncedSearch, PlaceCache } from "./geocode/cache";
export { STUB_PLACES } from "./geocode/stub";
export { haversineMiles } from "./route/stub";
export { toStateCode, formatPlaceLabel } from "./geocode/photon";

const useStubs = env.useStubAdapters;

export const mapAdapter: MapAdapter =
  useStubs || !(env.mapStyleUrlLight ?? env.mapStyleUrlDark)
    ? createStubMapAdapter()
    : createOsmMapAdapter({
        lightStyleUrl: env.mapStyleUrlLight,
        darkStyleUrl: env.mapStyleUrlDark,
        apiKey: env.mapTileApiKey,
        providerName: env.mapProviderName,
      });

const photon = createPhotonAdapter({
  baseUrl: env.photonBaseUrl,
  userAgent: env.geocoderUserAgent,
  defaultCountries: ["us", "ca", "mx"],
});

const nominatim = createNominatimAdapter({
  baseUrl: env.nominatimBaseUrl,
  userAgent: env.geocoderUserAgent,
  minIntervalMs: 1100,
  ...(env.nominatimEmail ? { email: env.nominatimEmail } : {}),
});

const stubGeocoder = createStubGeocodeAdapter();

/**
 * Photon for type-ahead, Nominatim for full-address lookups Photon comes back
 * empty on, and the stub when neither can be reached. Results are cached
 * locally so backspacing through a query costs nothing.
 */
export function createCompositeGeocoder(): GeocodeAdapter & { cache: PlaceCache } {
  const cache = new PlaceCache();
  const primary = useStubs ? stubGeocoder : photon;
  const secondary = useStubs ? null : nominatim;

  const cacheKey = (options?: AutocompleteOptions) =>
    options?.near ? `${options.near[0].toFixed(1)},${options.near[1].toFixed(1)}` : "";

  return {
    name: `composite(${primary.name})`,
    cache,
    async autocomplete(query, options = {}) {
      const cached = cache.get(query, cacheKey(options));
      if (cached) return cached;
      const places = await primary.autocomplete(query, options);
      cache.set(query, places, cacheKey(options));
      return places;
    },
    async search(query, options = {}) {
      const cached = cache.get(query, `search|${cacheKey(options)}`);
      if (cached) return cached;

      let places: Place[] = [];
      try {
        places = await primary.search(query, options);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        if (!(error instanceof AdapterError)) throw error;
      }

      // Photon is built for prefixes and can miss a fully typed street address.
      // Nominatim is slower and rate limited, so it only runs when it is needed.
      if (places.length === 0 && secondary) {
        try {
          places = await secondary.search(query, options);
        } catch (error) {
          if ((error as Error)?.name === "AbortError") throw error;
          if (!(error instanceof AdapterError)) throw error;
        }
      }

      if (places.length === 0 && !useStubs) {
        places = await stubGeocoder.search(query, options);
      }

      cache.set(query, places, `search|${cacheKey(options)}`);
      return places;
    },
    async reverse(position: Position, options = {}) {
      try {
        return await primary.reverse(position, options);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        if (!secondary) return null;
        return secondary.reverse(position, options).catch(() => null);
      }
    },
  };
}

export const geocodeAdapter = createCompositeGeocoder();

export const routeAdapter: RouteAdapter =
  useStubs || !env.valhallaBaseUrl
    ? createStubRouteAdapter()
    : createValhallaAdapter({
        baseUrl: env.valhallaBaseUrl,
        apiKey: env.valhallaApiKey,
        userAgent: env.geocoderUserAgent,
      });

/** True when routing comes from the estimator rather than a real road network. */
export const routingIsEstimated = routeAdapter.name === "stub";
