import { createOsmMapAdapter, OSM_ATTRIBUTION } from "../map/osm";
import { createStubMapAdapter } from "../map/stub";
import { rasterStyle, STATUS_COLORS } from "../map/styles";
import { createStubRouteAdapter, haversineMiles } from "../route/stub";
import { boundsOf, padBounds, isPosition, type Position } from "../types";

const JOLIET: Position = [-88.0817, 41.525];
const MEMPHIS: Position = [-89.94, 35.05];

describe("map adapter", () => {
  it("resolves separate light and dark styles", () => {
    const adapter = createOsmMapAdapter({
      lightStyleUrl: "https://tiles.example/light.json",
      darkStyleUrl: "https://tiles.example/dark.json",
      apiKey: null,
      providerName: "MapTiler",
    });

    expect(adapter.styleFor("light")).toBe("https://tiles.example/light.json");
    expect(adapter.styleFor("dark")).toBe("https://tiles.example/dark.json");
  });

  it("falls back to the style it has when only one is configured", () => {
    const adapter = createOsmMapAdapter({
      lightStyleUrl: "https://tiles.example/light.json",
      darkStyleUrl: null,
      apiKey: null,
      providerName: null,
    });
    expect(adapter.styleFor("dark")).toBe("https://tiles.example/light.json");
  });

  it("appends an API key, or substitutes the provider's placeholder", () => {
    const query = createOsmMapAdapter({
      lightStyleUrl: "https://tiles.example/light.json",
      darkStyleUrl: null,
      apiKey: "abc 123",
      providerName: null,
    });
    expect(query.styleFor("light")).toBe("https://tiles.example/light.json?key=abc%20123");

    const placeholder = createOsmMapAdapter({
      lightStyleUrl: "https://tiles.example/style/{key}/light.json",
      darkStyleUrl: null,
      apiKey: "abc123",
      providerName: null,
    });
    expect(placeholder.styleFor("light")).toBe("https://tiles.example/style/abc123/light.json");
  });

  it("always carries the OSM attribution, which is a licence condition", () => {
    const plain = createOsmMapAdapter({ lightStyleUrl: "x", darkStyleUrl: null, providerName: null });
    expect(plain.attribution).toBe(OSM_ATTRIBUTION);

    const branded = createOsmMapAdapter({ lightStyleUrl: "x", darkStyleUrl: null, providerName: "Stadia Maps" });
    expect(branded.attribution).toContain(OSM_ATTRIBUTION);
    expect(branded.attribution).toContain("Stadia Maps");

    expect(createStubMapAdapter().attribution).toBe(OSM_ATTRIBUTION);
  });

  it("reports itself unconfigured with no style at all, and says so when asked for one", () => {
    const adapter = createOsmMapAdapter({ lightStyleUrl: null, darkStyleUrl: null });
    expect(adapter.isConfigured).toBe(false);
    expect(() => adapter.styleFor("light")).toThrow(/MAP_STYLE_URL_LIGHT/);
  });

  it("never points at tile.openstreetmap.org, whose policy forbids this traffic", () => {
    const style = rasterStyle({ tileUrl: "https://tiles.example/{z}/{x}/{y}.png", theme: "dark" });
    const serialized = JSON.stringify(style);
    expect(serialized).not.toContain("tile.openstreetmap.org");
    expect(serialized).toContain(OSM_ATTRIBUTION);
  });

  it("darkens the dark style rather than tinting the light one", () => {
    const dark = rasterStyle({ tileUrl: "https://tiles.example/{z}/{x}/{y}.png", theme: "dark" });
    const light = rasterStyle({ tileUrl: "https://tiles.example/{z}/{x}/{y}.png", theme: "light" });
    const darkPaint = dark.layers[1]!.paint as Record<string, unknown>;
    const lightPaint = light.layers[1]!.paint as Record<string, unknown>;

    expect(darkPaint["raster-brightness-max"]).toBeLessThan(1);
    expect(lightPaint["raster-brightness-max"]).toBeUndefined();
  });

  it("proves the stub honours the same interface", () => {
    const stub = createStubMapAdapter();
    expect(stub.isConfigured).toBe(true);
    expect(typeof stub.styleFor("light")).toBe("object");
    expect(typeof stub.styleFor("dark")).toBe("object");
  });

  it("has a pin colour for every load status", () => {
    for (const status of ["booked", "in_transit", "delivered", "invoiced", "paid"]) {
      expect(STATUS_COLORS[status]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("stub route adapter", () => {
  it("measures a real-world distance within the road fudge factor", async () => {
    // Joliet to Memphis is about 530 miles of great circle and about 540 by road.
    const straight = haversineMiles(JOLIET, MEMPHIS);
    expect(straight).toBeGreaterThan(440);
    expect(straight).toBeLessThan(480);

    const route = await createStubRouteAdapter().route({ stops: [JOLIET, MEMPHIS] });
    expect(route.miles).toBeGreaterThan(straight);
    expect(route.miles).toBeLessThan(straight * 1.3);
  });

  it("produces a drawable line and legs for a multi-stop run", async () => {
    const route = await createStubRouteAdapter().route({
      stops: [JOLIET, [-88.8, 38.4], MEMPHIS],
    });

    expect(route.legs).toHaveLength(2);
    expect(route.geometry.length).toBeGreaterThan(10);
    expect(route.geometry[0]).toEqual(JOLIET);
    expect(route.geometry[route.geometry.length - 1]).toEqual(MEMPHIS);
    expect(route.encodedGeometry).toBeTruthy();
    expect(route.bounds).not.toBeNull();
  });

  it("labels itself a preview, exactly as the real adapter does", async () => {
    const route = await createStubRouteAdapter().route({ stops: [JOLIET, MEMPHIS] });
    expect(route.previewOnly).toBe(true);
    expect(route.provider).toBe("stub");
  });
});

describe("geometry helpers", () => {
  it("computes a bounding box over positions", () => {
    expect(boundsOf([JOLIET, MEMPHIS])).toEqual([-89.94, 35.05, -88.0817, 41.525]);
    expect(boundsOf([])).toBeNull();
  });

  it("pads a box so pins are not flush against the edge", () => {
    const padded = padBounds([-89, 35, -88, 41], 0.1)!;
    expect(padded[0]).toBeLessThan(-89);
    expect(padded[3]).toBeGreaterThan(41);
  });

  it("gives a degenerate single-point box a usable minimum size", () => {
    const padded = padBounds([-88, 41, -88, 41]);
    expect(padded[2] - padded[0]).toBeGreaterThan(0);
    expect(padded[3] - padded[1]).toBeGreaterThan(0);
  });

  it("validates positions and rejects a lat/lng pair written backwards", () => {
    expect(isPosition([-88.08, 41.52])).toBe(true);
    // Latitude first would put this off the map.
    expect(isPosition([41.52, -188.08])).toBe(false);
    expect(isPosition([-88.08])).toBe(false);
    expect(isPosition(null)).toBe(false);
  });
});
