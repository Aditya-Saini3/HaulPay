import type { MapAdapter } from "./types";

/**
 * OSM vector tiles from a hosted provider.
 *
 * Deliberately not pointed at tile.openstreetmap.org: its tile usage policy
 * forbids app traffic of this kind. Configure MAP_STYLE_URL_LIGHT and
 * MAP_STYLE_URL_DARK for MapTiler, Stadia Maps or Protomaps, or point them at a
 * self-hosted `.pmtiles` file for zero per-request cost.
 */

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export interface OsmMapConfig {
  lightStyleUrl: string | null;
  darkStyleUrl: string | null;
  /** Appended as `?key=` when the provider needs one. */
  apiKey?: string | null;
  /** Named for the attribution line, e.g. "MapTiler". */
  providerName?: string | null;
}

function withKey(url: string, apiKey?: string | null): string {
  if (!apiKey) return url;
  if (url.includes("{key}")) return url.replace("{key}", apiKey);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}key=${encodeURIComponent(apiKey)}`;
}

export function createOsmMapAdapter(config: OsmMapConfig): MapAdapter {
  const isConfigured = Boolean(config.lightStyleUrl || config.darkStyleUrl);
  return {
    name: "osm",
    isConfigured,
    attribution: config.providerName
      ? `${OSM_ATTRIBUTION} · ${config.providerName}`
      : OSM_ATTRIBUTION,
    styleFor(theme) {
      const url =
        theme === "dark"
          ? (config.darkStyleUrl ?? config.lightStyleUrl)
          : (config.lightStyleUrl ?? config.darkStyleUrl);
      if (!url) {
        throw new Error(
          "No map style is configured. Set MAP_STYLE_URL_LIGHT / MAP_STYLE_URL_DARK in .env",
        );
      }
      return withKey(url, config.apiKey);
    },
  };
}
