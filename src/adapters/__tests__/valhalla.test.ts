import { buildValhallaRequest, parseValhallaResponse } from "../route/valhalla";
import { encodePolyline } from "../route/polyline";
import { AdapterError, type Position } from "../types";

const JOLIET: Position = [-88.0817, 41.525];
const CHICAGO: Position = [-87.705, 41.81];
const MEMPHIS: Position = [-89.94, 35.05];

describe("Valhalla request", () => {
  it("sends every stop as ordered locations in one request", () => {
    // A multi-stop load must not be chained into pairwise calls.
    const body = buildValhallaRequest({ stops: [JOLIET, CHICAGO, MEMPHIS] }) as {
      locations: { lon: number; lat: number; type: string }[];
      costing: string;
    };

    expect(body.locations).toHaveLength(3);
    expect(body.costing).toBe("truck");
    expect(body.locations.map((l) => l.lon)).toEqual([-88.0817, -87.705, -89.94]);
  });

  it("marks the ends as breaks and the middle as through", () => {
    const body = buildValhallaRequest({ stops: [JOLIET, CHICAGO, MEMPHIS] }) as {
      locations: { type: string }[];
    };
    expect(body.locations.map((l) => l.type)).toEqual(["break", "through", "break"]);
  });

  it("maps the truck profile straight onto truck costing options", () => {
    const body = buildValhallaRequest({
      stops: [JOLIET, CHICAGO],
      truck: { heightM: 4.11, widthM: 2.6, lengthM: 21.64, weightT: 36.29, axleLoadT: 9.07, hazmat: true },
    }) as { costing_options: { truck: Record<string, unknown> } };

    expect(body.costing_options.truck).toEqual({
      height: 4.11,
      width: 2.6,
      length: 21.64,
      weight: 36.29,
      axle_load: 9.07,
      hazmat: true,
    });
  });

  it("omits dimensions that were never filled in", () => {
    // Sending height: 0 would tell Valhalla the truck fits under nothing.
    const body = buildValhallaRequest({
      stops: [JOLIET, CHICAGO],
      truck: { heightM: 4.11, widthM: null, lengthM: 0, weightT: undefined, hazmat: false },
    }) as { costing_options: { truck: Record<string, unknown> } };

    expect(body.costing_options.truck).toEqual({ height: 4.11 });
  });

  it("asks for shortest routing for drivers paid on HHG miles", () => {
    const body = buildValhallaRequest({ stops: [JOLIET, CHICAGO], shortest: true }) as {
      costing_options: { truck: Record<string, unknown> };
    };
    expect(body.costing_options.truck.shortest).toBe(true);
  });

  it("asks for miles and polyline6 so nothing has to be converted", () => {
    const body = buildValhallaRequest({ stops: [JOLIET, CHICAGO] }) as {
      directions_options: { units: string };
      shape_format: string;
    };
    expect(body.directions_options.units).toBe("miles");
    expect(body.shape_format).toBe("polyline6");
  });

  it("refuses a route with fewer than two stops", () => {
    expect(() => buildValhallaRequest({ stops: [JOLIET] })).toThrow(AdapterError);
  });
});

describe("Valhalla response", () => {
  const legShape = (points: Position[]) => encodePolyline(points, 6);

  it("reads mileage off the trip summary and decodes the shape", () => {
    const result = parseValhallaResponse({
      trip: {
        summary: { length: 842.7, time: 46_800, min_lon: -89.94, min_lat: 35.05, max_lon: -87.7, max_lat: 41.81 },
        legs: [{ shape: legShape([JOLIET, CHICAGO, MEMPHIS]), summary: { length: 842.7, time: 46_800 } }],
      },
    });

    expect(result.miles).toBe(842.7);
    expect(result.hours).toBe(13);
    expect(result.geometry.length).toBeGreaterThan(0);
    expect(result.bounds).toEqual([-89.94, 35.05, -87.7, 41.81]);
    expect(result.provider).toBe("valhalla");
  });

  it("always reports itself as a preview, never as navigation", () => {
    // OSM truck-restriction tagging is sparse in places, so the app labels the
    // route a preview and keeps the mileage field editable.
    const result = parseValhallaResponse({
      trip: { summary: { length: 100, time: 3600 }, legs: [{ shape: legShape([JOLIET, CHICAGO]), summary: { length: 100, time: 3600 } }] },
    });
    expect(result.previewOnly).toBe(true);
  });

  it("stitches multi-leg shapes without doubling back at the junction", () => {
    const first: Position[] = [JOLIET, [-87.9, 41.65], CHICAGO];
    const second: Position[] = [CHICAGO, [-88.8, 38.4], MEMPHIS];

    const result = parseValhallaResponse({
      trip: {
        summary: { length: 600, time: 36_000 },
        legs: [
          { shape: legShape(first), summary: { length: 45, time: 3_600 } },
          { shape: legShape(second), summary: { length: 555, time: 32_400 } },
        ],
      },
    });

    // The shared junction point appears once, not twice.
    const junctions = result.geometry.filter(
      (p) => Math.abs(p[0] - CHICAGO[0]) < 1e-6 && Math.abs(p[1] - CHICAGO[1]) < 1e-6,
    );
    expect(junctions).toHaveLength(1);
    expect(result.legs).toEqual([
      { miles: 45, hours: 1 },
      { miles: 555, hours: 9 },
    ]);
  });

  it("falls back to summing legs when the trip summary is missing", () => {
    const result = parseValhallaResponse({
      trip: {
        legs: [
          { shape: legShape([JOLIET, CHICAGO]), summary: { length: 45.2, time: 3_600 } },
          { shape: legShape([CHICAGO, MEMPHIS]), summary: { length: 554.8, time: 32_400 } },
        ],
      },
    });
    expect(result.miles).toBe(600);
    expect(result.hours).toBe(10);
    expect(result.bounds).not.toBeNull();
  });

  it("raises a no-result error when Valhalla cannot connect the stops", () => {
    expect(() =>
      parseValhallaResponse({ error: "No path could be found for input", error_code: 442 }),
    ).toThrow(/No path could be found/);

    try {
      parseValhallaResponse({ error: "No path could be found", error_code: 442 });
    } catch (error) {
      expect((error as AdapterError).kind).toBe("no_result");
    }
  });

  it("raises rather than returning an empty route", () => {
    expect(() => parseValhallaResponse({ trip: { legs: [] } })).toThrow(AdapterError);
    expect(() => parseValhallaResponse({})).toThrow(AdapterError);
  });
});
