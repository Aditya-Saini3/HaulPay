import type { Bounds, Position } from "../types";

/** Truck dimensions Valhalla's truck costing model accepts. */
export interface TruckProfile {
  /** Metres. */
  heightM?: number | null;
  widthM?: number | null;
  lengthM?: number | null;
  /** Metric tonnes. */
  weightT?: number | null;
  axleLoadT?: number | null;
  hazmat?: boolean;
}

export interface RouteRequest {
  /** Every stop, in order. Sent as one request, never chained pairwise. */
  stops: readonly Position[];
  truck?: TruckProfile;
  signal?: AbortSignal;
  /** Shortest rather than fastest, for drivers paid on HHG/shortest miles. */
  shortest?: boolean;
}

export interface RouteLeg {
  miles: number;
  /** Hours, from the routing engine's own estimate. */
  hours: number;
}

export interface RouteResult {
  /** Total distance in miles, to one decimal. */
  miles: number;
  hours: number;
  /** Decoded line for the map, `[lng, lat]` throughout. */
  geometry: Position[];
  /** The provider's own encoded shape, stored so the map need not re-route. */
  encodedGeometry: string | null;
  legs: RouteLeg[];
  bounds: Bounds | null;
  provider: string;
  /**
   * Always true for every implementation here, and surfaced in the UI.
   * OSM truck-restriction tagging is good in some regions and sparse in
   * others, so this is reliable for mileage and shape but must never be
   * presented as turn-by-turn navigation a driver can follow blind.
   */
  previewOnly: true;
}

export interface RouteAdapter {
  readonly name: string;
  route(request: RouteRequest): Promise<RouteResult>;
}
