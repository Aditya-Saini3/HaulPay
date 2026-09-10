/**
 * Shared geography types for the three adapters.
 *
 * Coordinates are `[longitude, latitude]` throughout, which is the order
 * GeoJSON, MapLibre and Valhalla all use. Nothing in the app carries a
 * `{ lat, lng }` object, so there is no pair to get backwards.
 */

export type Position = [longitude: number, latitude: number];

/** `[west, south, east, north]`, matching MapLibre's bounds order. */
export type Bounds = [west: number, south: number, east: number, north: number];

export interface Place {
  /** Stable id from the provider, when it has one. */
  id: string;
  /** One-line label for a list row: "Joliet, IL 60431". */
  label: string;
  /** Street line, when the provider resolved one. */
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  position: Position;
  /** Which adapter produced it, for attribution and debugging. */
  source: string;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "rate_limited" | "not_configured" | "bad_response" | "no_result",
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

export function boundsOf(positions: readonly Position[]): Bounds | null {
  if (positions.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of positions) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

/** Pads a bounds box so pins are not flush against the edge of the map. */
export function padBounds(bounds: Bounds, factor = 0.15): Bounds {
  const [west, south, east, north] = bounds;
  const lngPad = Math.max((east - west) * factor, 0.05);
  const latPad = Math.max((north - south) * factor, 0.05);
  return [west - lngPad, south - latPad, east + lngPad, north + latPad];
}

export function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}
