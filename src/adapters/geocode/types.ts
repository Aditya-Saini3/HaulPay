import type { Bounds, Place, Position } from "../types";

/**
 * Address search, behind one interface so the OSM implementations can be
 * swapped for a self-hosted or paid instance by changing an env var.
 */
export interface GeocodeAdapter {
  readonly name: string;
  /**
   * Type-ahead. Called on every debounced keystroke, so implementations must be
   * cheap and must honour the abort signal.
   */
  autocomplete(query: string, options?: AutocompleteOptions): Promise<Place[]>;
  /** Full-address lookup, for when the user commits to a string. */
  search(query: string, options?: AutocompleteOptions): Promise<Place[]>;
  /** Coordinates to an address, for the one-time "use my location" button. */
  reverse(position: Position, options?: { signal?: AbortSignal }): Promise<Place | null>;
}

export interface AutocompleteOptions {
  /** Biases results toward where the user is looking. */
  near?: Position;
  bbox?: Bounds;
  limit?: number;
  signal?: AbortSignal;
  /** Two-letter country codes to restrict to, e.g. ["us", "ca"]. */
  countries?: string[];
}
