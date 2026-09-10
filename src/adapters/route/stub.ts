import { boundsOf, type Position } from "../types";
import { encodePolyline } from "./polyline";
import type { RouteAdapter, RouteRequest, RouteResult } from "./types";

/**
 * Great-circle routing with a road-network fudge factor. No network, no
 * service, no key — it exists to prove the interface holds and to keep the
 * load form usable when routing is unreachable.
 *
 * The mileage it produces is an estimate and the app labels it as one; the
 * mileage field stays editable either way, which is the same contract the real
 * adapter operates under.
 */

const EARTH_RADIUS_MILES = 3958.7613;
/** Roads are not straight lines. This is the usual planning approximation. */
const ROAD_FACTOR = 1.18;
/** Truck average including stops, for the time estimate. */
const AVG_MPH = 48;

export function haversineMiles(a: Position, b: Position): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Points along the great circle between two positions, for a drawable line. */
function interpolate(a: Position, b: Position, steps = 24): Position[] {
  const out: Position[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

export function createStubRouteAdapter(): RouteAdapter {
  return {
    name: "stub",
    async route(request: RouteRequest): Promise<RouteResult> {
      const stops = request.stops;
      const legs: { miles: number; hours: number }[] = [];
      const geometry: Position[] = [];

      for (let i = 0; i < stops.length - 1; i += 1) {
        const from = stops[i]!;
        const to = stops[i + 1]!;
        const miles = Math.round(haversineMiles(from, to) * ROAD_FACTOR * 10) / 10;
        legs.push({ miles, hours: Math.round((miles / AVG_MPH) * 100) / 100 });
        const segment = interpolate(from, to);
        geometry.push(...(geometry.length > 0 ? segment.slice(1) : segment));
      }

      const miles = Math.round(legs.reduce((sum, leg) => sum + leg.miles, 0) * 10) / 10;
      return {
        miles,
        hours: Math.round((miles / AVG_MPH) * 100) / 100,
        geometry,
        encodedGeometry: encodePolyline(geometry, 6),
        legs,
        bounds: boundsOf(geometry),
        provider: "stub",
        previewOnly: true,
      };
    },
  };
}
