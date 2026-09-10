import { PlaceCache, createDebouncedSearch } from "../geocode/cache";
import {
  buildPhotonUrl,
  filterByCountry,
  formatPlaceLabel,
  photonFeatureToPlace,
  toStateCode,
} from "../geocode/photon";
import { buildNominatimSearchUrl, createRateLimiter, nominatimResultToPlace } from "../geocode/nominatim";
import { createStubGeocodeAdapter } from "../geocode/stub";
import type { Place } from "../types";

describe("place formatting", () => {
  it("shortens a state name to the code a lane is written in", () => {
    expect(toStateCode("Illinois")).toBe("IL");
    expect(toStateCode("illinois")).toBe("IL");
    expect(toStateCode("IL")).toBe("IL");
    expect(toStateCode("British Columbia")).toBe("BC");
    expect(toStateCode("Québec")).toBe("QC");
    expect(toStateCode(null)).toBeNull();
  });

  it("leaves an unrecognised region alone rather than mangling it", () => {
    expect(toStateCode("Jalisco")).toBe("Jalisco");
  });

  it("builds a one-line label from whatever parts the provider returned", () => {
    expect(
      formatPlaceLabel({ housenumber: "1401", street: "Cherry Hill Rd", city: "Joliet", state: "Illinois", postcode: "60431" }),
    ).toBe("1401 Cherry Hill Rd · Joliet, IL 60431");

    expect(formatPlaceLabel({ city: "Joliet", state: "Illinois" })).toBe("Joliet, IL");
    expect(formatPlaceLabel({ name: "CenterPoint Intermodal", city: "Elwood", state: "IL" }))
      .toBe("CenterPoint Intermodal · Elwood, IL");
    expect(formatPlaceLabel({})).toBe("Unknown location");
  });
});

describe("Photon", () => {
  it("builds a type-ahead URL with a location bias", () => {
    const url = new URL(buildPhotonUrl("https://photon.komoot.io", "joliet", { near: [-88.08, 41.52], limit: 5 }));
    expect(url.pathname).toBe("/api");
    expect(url.searchParams.get("q")).toBe("joliet");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("lon")).toBe("-88.08");
    expect(url.searchParams.get("lat")).toBe("41.52");
  });

  it("passes a bounding box through when the map is zoomed somewhere", () => {
    const url = new URL(buildPhotonUrl("https://photon.komoot.io", "cherry", { bbox: [-89, 41, -87, 42] }));
    expect(url.searchParams.get("bbox")).toBe("-89,41,-87,42");
  });

  it("converts a feature into a place", () => {
    const place = photonFeatureToPlace({
      geometry: { coordinates: [-88.0817, 41.525] },
      properties: {
        osm_id: 12345,
        osm_type: "W",
        housenumber: "1401",
        street: "Cherry Hill Rd",
        city: "Joliet",
        state: "Illinois",
        postcode: "60431",
        countrycode: "us",
      },
    });

    expect(place).toMatchObject({
      id: "photon:W12345",
      label: "1401 Cherry Hill Rd · Joliet, IL 60431",
      street: "1401 Cherry Hill Rd",
      city: "Joliet",
      state: "IL",
      country: "US",
      position: [-88.0817, 41.525],
      source: "photon",
    });
  });

  it("rejects a feature with no usable coordinates", () => {
    expect(photonFeatureToPlace({ properties: { city: "Nowhere" } })).toBeNull();
    expect(photonFeatureToPlace({ geometry: { coordinates: [999, 999] } })).toBeNull();
    expect(photonFeatureToPlace({ geometry: { coordinates: ["a", "b"] } })).toBeNull();
  });

  it("filters countries client-side, because Photon has no country parameter", () => {
    const places = [
      { country: "US" } as Place,
      { country: "DE" } as Place,
      { country: null } as unknown as Place,
    ];
    expect(filterByCountry(places, ["us", "ca"])).toHaveLength(2);
    expect(filterByCountry(places, [])).toHaveLength(3);
    expect(filterByCountry(places)).toHaveLength(3);
  });
});

describe("Nominatim", () => {
  it("builds a search URL with address details and a country restriction", () => {
    const url = new URL(
      buildNominatimSearchUrl(
        "https://nominatim.openstreetmap.org",
        "1401 Cherry Hill Rd Joliet IL",
        { countries: ["us"], limit: 3 },
        "ops@haulpay.app",
      ),
    );

    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("addressdetails")).toBe("1");
    expect(url.searchParams.get("countrycodes")).toBe("us");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("email")).toBe("ops@haulpay.app");
  });

  it("writes a viewbox in Nominatim's own corner order", () => {
    // Nominatim wants left,top,right,bottom — not the west,south,east,north
    // order the rest of the app uses.
    const url = new URL(
      buildNominatimSearchUrl("https://nominatim.openstreetmap.org", "x", { bbox: [-89, 41, -87, 42] }),
    );
    expect(url.searchParams.get("viewbox")).toBe("-89,42,-87,41");
    expect(url.searchParams.get("bounded")).toBe("1");
  });

  it("converts a result into a place", () => {
    const place = nominatimResultToPlace({
      place_id: 987,
      lat: "41.525031",
      lon: "-88.081727",
      address: { house_number: "1401", road: "Cherry Hill Rd", city: "Joliet", state: "Illinois", postcode: "60431", country_code: "us" },
    });

    expect(place).toMatchObject({
      id: "nominatim:987",
      city: "Joliet",
      state: "IL",
      country: "US",
      source: "nominatim",
    });
    expect(place!.position[0]).toBeCloseTo(-88.081727, 6);
  });

  it("falls back through town, village and county for the city", () => {
    expect(nominatimResultToPlace({ lat: "41", lon: "-88", address: { town: "Elwood" } })!.city).toBe("Elwood");
    expect(nominatimResultToPlace({ lat: "41", lon: "-88", address: { village: "Manhattan" } })!.city).toBe("Manhattan");
    expect(nominatimResultToPlace({ lat: "41", lon: "-88", address: { county: "Will County" } })!.city).toBe("Will County");
  });

  it("refuses to be wired to keystrokes", async () => {
    // Nominatim's usage policy forbids type-ahead traffic. A silent fallback
    // here is how an app gets its IP blocked, so the adapter throws instead.
    const { createNominatimAdapter } = await import("../geocode/nominatim");
    const adapter = createNominatimAdapter({ baseUrl: "https://nominatim.openstreetmap.org", userAgent: "test" });
    await expect(adapter.autocomplete("jol")).rejects.toThrow(/must not be wired to keystrokes/);
  });
});

describe("rate limiter", () => {
  it("spaces requests out by the configured interval", async () => {
    const schedule = createRateLimiter(50);
    const startedAt: number[] = [];
    const task = () => {
      startedAt.push(Date.now());
      return Promise.resolve(true);
    };

    const begin = Date.now();
    await Promise.all([schedule(task), schedule(task), schedule(task)]);

    expect(startedAt).toHaveLength(3);
    expect(startedAt[1]! - startedAt[0]!).toBeGreaterThanOrEqual(45);
    expect(startedAt[2]! - startedAt[1]!).toBeGreaterThanOrEqual(45);
    expect(Date.now() - begin).toBeGreaterThanOrEqual(90);
  });

  it("keeps the queue moving after a request fails", async () => {
    // One rejection must not stall every request behind it forever.
    const schedule = createRateLimiter(10);
    const failure = schedule(() => Promise.reject(new Error("boom")));
    await expect(failure).rejects.toThrow("boom");
    await expect(schedule(() => Promise.resolve("through"))).resolves.toBe("through");
  });
});

describe("place cache", () => {
  const place = (label: string): Place => ({
    id: label,
    label,
    street: null,
    city: label,
    state: "IL",
    postalCode: null,
    country: "US",
    position: [-88, 41],
    source: "test",
  });

  it("returns a hit for the same query regardless of case or padding", () => {
    const cache = new PlaceCache();
    cache.set("Joliet", [place("Joliet")]);
    expect(cache.get("joliet")).toHaveLength(1);
    expect(cache.get("  JOLIET  ")).toHaveLength(1);
  });

  it("keeps separate entries per location bias", () => {
    const cache = new PlaceCache();
    cache.set("main st", [place("a")], "-88.1,41.5");
    expect(cache.get("main st", "-88.1,41.5")).toHaveLength(1);
    expect(cache.get("main st", "-95.4,29.8")).toBeNull();
  });

  it("evicts the least recently used entry past its limit", () => {
    const cache = new PlaceCache(2);
    cache.set("a", [place("a")]);
    cache.set("b", [place("b")]);
    cache.get("a"); // touch a, so b becomes the oldest
    cache.set("c", [place("c")]);

    expect(cache.size).toBe(2);
    expect(cache.get("a")).not.toBeNull();
    expect(cache.get("b")).toBeNull();
    expect(cache.get("c")).not.toBeNull();
  });

  it("expires entries past their TTL", () => {
    const cache = new PlaceCache(10, 5);
    cache.set("a", [place("a")]);
    expect(cache.get("a")).not.toBeNull();
    jest.useFakeTimers().setSystemTime(Date.now() + 10);
    expect(cache.get("a")).toBeNull();
    jest.useRealTimers();
  });
});

describe("debounced search", () => {
  it("only runs the last query in a burst of keystrokes", async () => {
    const calls: string[] = [];
    const search = createDebouncedSearch(async (q) => {
      calls.push(q);
      return q;
    }, 20);

    const first = search("jol");
    const second = search("joli");
    const third = search("joliet");

    await expect(third).resolves.toBe("joliet");
    expect(calls).toEqual(["joliet"]);
    // The superseded promises never settle with a stale value.
    void first;
    void second;
  });

  it("aborts the in-flight request when a newer query arrives", async () => {
    const aborted: boolean[] = [];
    const search = createDebouncedSearch(async (q, signal) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      aborted.push(signal.aborted);
      return q;
    }, 5);

    const stale = search("jol");
    await new Promise((resolve) => setTimeout(resolve, 15));
    const fresh = search("joliet");

    await expect(fresh).resolves.toBe("joliet");
    // The first call saw its signal aborted rather than repopulating the list.
    await expect(stale).resolves.toBeNull();
    expect(aborted[0]).toBe(true);
  });

  it("cancels cleanly", async () => {
    const calls: string[] = [];
    const search = createDebouncedSearch(async (q) => {
      calls.push(q);
      return q;
    }, 20);

    void search("joliet");
    search.cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).toEqual([]);
  });
});

describe("stub geocoder", () => {
  const adapter = createStubGeocodeAdapter();

  it("finds a city by prefix with no network at all", async () => {
    const results = await adapter.autocomplete("jol");
    expect(results[0]!.city).toBe("Joliet");
    expect(results[0]!.state).toBe("IL");
  });

  it("stays quiet below two characters", async () => {
    expect(await adapter.autocomplete("j")).toEqual([]);
  });

  it("reverses to the nearest fixture", async () => {
    const place = await adapter.reverse([-88.05, 41.5]);
    expect(place!.city).toBe("Joliet");
  });

  it("proves the interface holds", () => {
    expect(typeof adapter.autocomplete).toBe("function");
    expect(typeof adapter.search).toBe("function");
    expect(typeof adapter.reverse).toBe("function");
    expect(adapter.name).toBe("stub");
  });
});
