import type { Position } from "../types";

/**
 * Google-style encoded polyline, at the precision the caller asks for.
 *
 * Valhalla returns polyline6 — six decimal places, not the five the original
 * Google format used. Decoding polyline6 with a precision-5 decoder yields a
 * shape compressed into a tenth of its real extent, which looks like a routing
 * bug and is not one, so the precision is an explicit argument here.
 */

export function decodePolyline(encoded: string, precision = 6): Position[] {
  const factor = 10 ** precision;
  const positions: Position[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      if (Number.isNaN(byte)) return positions;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      if (Number.isNaN(byte)) return positions;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    positions.push([lng / factor, lat / factor]);
  }

  return positions;
}

export function encodePolyline(positions: readonly Position[], precision = 6): string {
  const factor = 10 ** precision;
  let output = "";
  let lastLat = 0;
  let lastLng = 0;

  for (const [lng, lat] of positions) {
    const roundedLat = Math.round(lat * factor);
    const roundedLng = Math.round(lng * factor);
    output += encodeValue(roundedLat - lastLat);
    output += encodeValue(roundedLng - lastLng);
    lastLat = roundedLat;
    lastLng = roundedLng;
  }

  return output;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let output = "";
  while (v >= 0x20) {
    output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  output += String.fromCharCode(v + 63);
  return output;
}

/**
 * Drops points that sit within `toleranceDegrees` of the line between their
 * neighbours. A cross-country route comes back with tens of thousands of
 * points; the map does not need them and the phone should not carry them.
 */
export function simplify(positions: readonly Position[], toleranceDegrees = 0.0005): Position[] {
  if (positions.length <= 2) return [...positions];

  const keep = new Uint8Array(positions.length);
  keep[0] = 1;
  keep[positions.length - 1] = 1;

  const stack: [number, number][] = [[0, positions.length - 1]];
  while (stack.length > 0) {
    const segment = stack.pop()!;
    const [first, last] = segment;
    let maxDistance = 0;
    let index = -1;

    for (let i = first + 1; i < last; i += 1) {
      const distance = perpendicularDistance(positions[i]!, positions[first]!, positions[last]!);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (index !== -1 && maxDistance > toleranceDegrees) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return positions.filter((_, i) => keep[i] === 1);
}

function perpendicularDistance(point: Position, start: Position, end: Position): number {
  const [px, py] = point;
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  if (dx === 0 && dy === 0) return Math.hypot(px - sx, py - sy);
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}
