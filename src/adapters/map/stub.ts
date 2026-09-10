import type { MapAdapter } from "./types";
import { OSM_ATTRIBUTION } from "./osm";
import { rasterStyle } from "./styles";

/**
 * A map adapter that resolves to an inline style with no network source at all.
 * It renders as an empty graticule-free background, which is exactly what the
 * map component should show in tests and screenshots without reaching a tile
 * server.
 */
export function createStubMapAdapter(): MapAdapter {
  return {
    name: "stub",
    isConfigured: true,
    attribution: OSM_ATTRIBUTION,
    styleFor(theme) {
      return {
        version: 8,
        name: `HaulPay stub ${theme}`,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": theme === "dark" ? "#111B22" : "#E7ECF0" },
          },
        ],
      };
    },
  };
}

/** Exported so a self-hosted deployment can start from a working raster style. */
export { rasterStyle };
