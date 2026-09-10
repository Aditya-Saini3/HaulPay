import type { Place, Position } from "../types";
import type { AutocompleteOptions, GeocodeAdapter } from "./types";

/**
 * Offline geocoder over a fixed list of places. Exists to prove the interface
 * holds without a network, and to make the address field usable in tests, in
 * screenshots, and when a driver has no signal in a canyon in Wyoming.
 */

const FIXTURES: Place[] = [
  place("Joliet", "IL", "60431", [-88.0817, 41.5250], "1401 Cherry Hill Rd"),
  place("Laredo", "TX", "78045", [-99.5075, 27.5306], "8000 San Dario Ave"),
  place("Fontana", "CA", "92335", [-117.4360, 34.0922], "16000 Slover Ave"),
  place("Atlanta", "GA", "30336", [-84.5471, 33.7490], "4300 Fulton Industrial Blvd"),
  place("Chicago", "IL", "60632", [-87.7050, 41.8100], "4700 S Central Ave"),
  place("Dallas", "TX", "75212", [-96.8720, 32.7767], "2200 Singleton Blvd"),
  place("Columbus", "OH", "43217", [-82.9600, 39.8200], "5000 Rickenbacker Pkwy"),
  place("Harrisburg", "PA", "17111", [-76.7900, 40.2732], "3800 Paxton St"),
  place("Denver", "CO", "80216", [-104.9600, 39.7800], "5200 Franklin St"),
  place("Portland", "OR", "97218", [-122.5900, 45.5700], "6000 NE Columbia Blvd"),
  place("Memphis", "TN", "38118", [-89.9400, 35.0500], "3700 Lamar Ave"),
  place("Newark", "NJ", "07114", [-74.1700, 40.7000], "900 Doremus Ave"),
];

function place(
  city: string,
  state: string,
  postalCode: string,
  position: Position,
  street: string,
): Place {
  return {
    id: `stub:${city}-${state}`,
    label: `${street} · ${city}, ${state} ${postalCode}`,
    street,
    city,
    state,
    postalCode,
    country: "US",
    position,
    source: "stub",
  };
}

function score(place: Place, query: string): number {
  const q = query.trim().toLowerCase();
  const haystack = `${place.street} ${place.city} ${place.state} ${place.postalCode}`.toLowerCase();
  if (!haystack.includes(q)) return -1;
  return place.city!.toLowerCase().startsWith(q) ? 2 : 1;
}

export function createStubGeocodeAdapter(fixtures: Place[] = FIXTURES): GeocodeAdapter {
  const lookup = async (query: string, options: AutocompleteOptions = {}): Promise<Place[]> => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    return fixtures
      .map((p) => ({ p, s: score(p, trimmed) }))
      .filter((entry) => entry.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, options.limit ?? 8)
      .map((entry) => entry.p);
  };

  return {
    name: "stub",
    autocomplete: lookup,
    search: lookup,
    async reverse(position: Position) {
      // Nearest fixture by squared degrees. Good enough to prove the shape.
      let best: Place | null = null;
      let bestDistance = Infinity;
      for (const p of fixtures) {
        const dx = p.position[0] - position[0];
        const dy = p.position[1] - position[1];
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = p;
        }
      }
      return best;
    },
  };
}

export const STUB_PLACES = FIXTURES;
