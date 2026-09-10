import { AdapterError, boundsOf, type Position } from "../types";
import { decodePolyline, simplify } from "./polyline";
import type { RouteAdapter, RouteRequest, RouteResult } from "./types";

/**
 * Valhalla, using its `truck` costing model.
 *
 * Truck costing accepts height, width, length, weight, axle_load and hazmat,
 * which map one-for-one onto the truck profile in Settings. Because a load can
 * have many stops, every stop goes into a single route request as ordered
 * locations rather than chaining pairwise calls — one request, correct
 * through-routing at intermediate stops, one bill.
 */

interface ValhallaSummary {
  length?: number;
  time?: number;
  min_lat?: number;
  min_lon?: number;
  max_lat?: number;
  max_lon?: number;
}

interface ValhallaLeg {
  shape?: string;
  summary?: ValhallaSummary;
}

interface ValhallaResponse {
  trip?: {
    legs?: ValhallaLeg[];
    summary?: ValhallaSummary;
    status?: number;
    status_message?: string;
    units?: string;
  };
  error?: string;
  error_code?: number;
}

export interface ValhallaConfig {
  baseUrl: string;
  /** Appended as `api_key` when the host requires one (Stadia Maps does). */
  apiKey?: string | null;
  userAgent?: string;
}

/**
 * Builds the Valhalla request body.
 *
 * Units are requested in miles so `summary.length` needs no conversion. Only
 * the truck dimensions that were actually filled in are sent — passing a zero
 * height would tell Valhalla the truck cannot fit under anything.
 */
export function buildValhallaRequest(request: RouteRequest): Record<string, unknown> {
  if (request.stops.length < 2) {
    throw new AdapterError("A route needs at least two stops", "no_result");
  }

  const truck = request.truck ?? {};
  const costingOptions: Record<string, unknown> = {};
  assignIfPositive(costingOptions, "height", truck.heightM);
  assignIfPositive(costingOptions, "width", truck.widthM);
  assignIfPositive(costingOptions, "length", truck.lengthM);
  assignIfPositive(costingOptions, "weight", truck.weightT);
  assignIfPositive(costingOptions, "axle_load", truck.axleLoadT);
  if (truck.hazmat) costingOptions.hazmat = true;
  if (request.shortest) costingOptions.shortest = true;

  return {
    locations: request.stops.map((position, index) => ({
      lon: position[0],
      lat: position[1],
      // Intermediate stops are `through` so Valhalla routes past them without
      // treating each as a fresh origin.
      type: index === 0 || index === request.stops.length - 1 ? "break" : "through",
    })),
    costing: "truck",
    costing_options: { truck: costingOptions },
    directions_options: { units: "miles" },
    // The route preview needs the shape but none of the manoeuvre text.
    shape_format: "polyline6",
    id: "haulpay",
  };
}

function assignIfPositive(target: Record<string, unknown>, key: string, value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) target[key] = value;
}

export function parseValhallaResponse(body: ValhallaResponse): RouteResult {
  if (body.error) {
    throw new AdapterError(body.error, body.error_code === 442 ? "no_result" : "bad_response");
  }
  const trip = body.trip;
  if (!trip?.legs?.length) {
    throw new AdapterError("No route was found between these stops", "no_result");
  }

  const legs = trip.legs.map((leg) => ({
    miles: round1(leg.summary?.length ?? 0),
    hours: round2((leg.summary?.time ?? 0) / 3600),
  }));

  const geometry: Position[] = [];
  let encodedGeometry: string | null = null;
  for (const leg of trip.legs) {
    if (!leg.shape) continue;
    encodedGeometry = encodedGeometry === null ? leg.shape : encodedGeometry;
    const decoded = decodePolyline(leg.shape, 6);
    // Legs share their junction point; dropping the duplicate keeps the line
    // from doubling back on itself at every stop.
    geometry.push(...(geometry.length > 0 ? decoded.slice(1) : decoded));
  }

  const simplified = simplify(geometry);
  const summary = trip.summary;
  const bounds =
    summary?.min_lon !== undefined &&
    summary.min_lat !== undefined &&
    summary.max_lon !== undefined &&
    summary.max_lat !== undefined
      ? ([summary.min_lon, summary.min_lat, summary.max_lon, summary.max_lat] as const)
      : null;

  return {
    miles: round1(summary?.length ?? legs.reduce((sum, leg) => sum + leg.miles, 0)),
    hours: round2((summary?.time ?? 0) / 3600 || legs.reduce((sum, leg) => sum + leg.hours, 0)),
    geometry: simplified,
    encodedGeometry,
    legs,
    bounds: bounds ? [bounds[0], bounds[1], bounds[2], bounds[3]] : boundsOf(simplified),
    provider: "valhalla",
    previewOnly: true,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createValhallaAdapter(config: ValhallaConfig): RouteAdapter {
  return {
    name: "valhalla",
    async route(request: RouteRequest): Promise<RouteResult> {
      const url = new URL("/route", config.baseUrl);
      if (config.apiKey) url.searchParams.set("api_key", config.apiKey);

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(config.userAgent ? { "User-Agent": config.userAgent } : {}),
          },
          body: JSON.stringify(buildValhallaRequest(request)),
          ...(request.signal ? { signal: request.signal } : {}),
        });
      } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        throw new AdapterError("Could not reach the routing service", "network", error);
      }

      if (response.status === 429) {
        throw new AdapterError("Routing is rate limited right now", "rate_limited");
      }
      if (!response.ok) {
        // Valhalla puts a readable reason in the body even on a 4xx.
        const text = await response.text().catch(() => "");
        let parsed: ValhallaResponse | null = null;
        try {
          parsed = JSON.parse(text) as ValhallaResponse;
        } catch {
          parsed = null;
        }
        throw new AdapterError(
          parsed?.error ?? `Routing service returned ${response.status}`,
          response.status === 400 ? "no_result" : "bad_response",
        );
      }

      return parseValhallaResponse((await response.json()) as ValhallaResponse);
    },
  };
}
