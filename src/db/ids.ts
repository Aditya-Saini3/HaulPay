import * as Crypto from "expo-crypto";

/**
 * Ids are generated on the device, not by the server.
 *
 * A load created in a dead zone needs a real primary key immediately: its
 * stops, line items and photos all reference it before anything reaches
 * Postgres. UUIDv4 from the platform CSPRNG makes that collision-free without
 * a round trip.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
