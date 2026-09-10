import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { OSM_ATTRIBUTION } from "./osm";

/**
 * Fallback MapLibre styles used when no hosted provider is configured, and as
 * the base for a self-hosted deployment.
 *
 * These are deliberately minimal raster styles over an OSM-derived tile source
 * so a fresh clone shows a working map after filling in one env var, rather
 * than a blank rectangle. A production build should point at vector tiles from
 * MapTiler, Stadia or a Protomaps `.pmtiles` file.
 */

export function rasterStyle(options: {
  tileUrl: string;
  theme: "light" | "dark";
  attribution?: string;
  maxZoom?: number;
}): StyleSpecification {
  const background = options.theme === "dark" ? "#0B1116" : "#EEF1F4";
  return {
    version: 8,
    name: `HaulPay OSM ${options.theme}`,
    sources: {
      osm: {
        type: "raster",
        tiles: [options.tileUrl],
        tileSize: 256,
        maxzoom: options.maxZoom ?? 19,
        attribution: options.attribution ?? OSM_ATTRIBUTION,
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": background } },
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          "raster-opacity": 1,
          // A real dark mode, not a tinted light theme: the tiles themselves
          // are inverted and desaturated so the map reads at 2am without
          // burning the cab.
          ...(options.theme === "dark"
            ? { "raster-brightness-max": 0.72, "raster-saturation": -0.35, "raster-contrast": 0.15 }
            : {}),
        },
      },
    ],
  };
}

/**
 * The colours the route line and the stop pins use, kept next to the styles so
 * the map reads as one piece in both themes.
 */
export const MAP_COLORS = {
  light: {
    route: "#1B6BFF",
    routeCasing: "#FFFFFF",
    pickup: "#00A96E",
    dropoff: "#E5484D",
    stop: "#F5A524",
    pinText: "#0B1116",
  },
  dark: {
    route: "#4C8DFF",
    routeCasing: "#0B1116",
    pickup: "#00D48A",
    dropoff: "#FF6369",
    stop: "#FFB224",
    pinText: "#F2F6FA",
  },
} as const;

/** Load-status pin colours, matching the status chips used in the loads list. */
export const STATUS_COLORS: Record<string, string> = {
  booked: "#7C8B99",
  in_transit: "#4C8DFF",
  delivered: "#00D48A",
  invoiced: "#FFB224",
  paid: "#00A96E",
};
