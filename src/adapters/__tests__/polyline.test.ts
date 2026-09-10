import { decodePolyline, encodePolyline, simplify } from "../route/polyline";
import type { Position } from "../types";

describe("polyline", () => {
  it("decodes the canonical precision-5 example", () => {
    // The example from Google's own encoded polyline documentation.
    const decoded = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    expect(decoded).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("decodes polyline6 at the precision Valhalla actually returns", () => {
    const route: Position[] = [
      [-88.081727, 41.525031],
      [-88.041234, 41.601234],
      [-87.705012, 41.810004],
    ];
    const decoded = decodePolyline(encodePolyline(route, 6), 6);

    decoded.forEach((point, i) => {
      expect(point[0]).toBeCloseTo(route[i]![0], 6);
      expect(point[1]).toBeCloseTo(route[i]![1], 6);
    });
  });

  it("compresses the shape tenfold when polyline6 is read at precision 5", () => {
    // This is the bug the explicit precision argument exists to prevent: the
    // route still decodes, it just lands in the wrong hemisphere-ish place.
    const route: Position[] = [[-88.081727, 41.525031]];
    const wrong = decodePolyline(encodePolyline(route, 6), 5);

    expect(wrong[0]![0]).toBeCloseTo(-880.81727, 4);
    expect(wrong[0]![1]).toBeCloseTo(415.25031, 4);
  });

  it("round-trips a long route without drift", () => {
    const route: Position[] = Array.from({ length: 500 }, (_, i) => [
      -88 + i * 0.01,
      41 + Math.sin(i / 20) * 0.5,
    ]);
    const decoded = decodePolyline(encodePolyline(route, 6), 6);

    expect(decoded).toHaveLength(500);
    expect(decoded[499]![0]).toBeCloseTo(route[499]![0], 6);
    expect(decoded[499]![1]).toBeCloseTo(route[499]![1], 6);
  });

  it("returns what it has rather than throwing on a truncated string", () => {
    const encoded = encodePolyline(
      [
        [-88.08, 41.52],
        [-87.7, 41.81],
      ],
      6,
    );
    expect(() => decodePolyline(encoded.slice(0, encoded.length - 2), 6)).not.toThrow();
    expect(decodePolyline("", 6)).toEqual([]);
  });

  it("thins a dense line while keeping its ends and its corners", () => {
    // A straight run with one real corner in the middle of it.
    const straight: Position[] = Array.from({ length: 200 }, (_, i) => [-88 + i * 0.001, 41]);
    const corner: Position[] = Array.from({ length: 200 }, (_, i) => [-87.8, 41 + i * 0.001]);
    const dense = [...straight, ...corner];

    const thin = simplify(dense, 0.0005);

    expect(thin.length).toBeLessThan(dense.length / 10);
    expect(thin[0]).toEqual(dense[0]);
    expect(thin[thin.length - 1]).toEqual(dense[dense.length - 1]);
    // The corner survives.
    expect(thin.some((p) => Math.abs(p[0] - -87.8) < 1e-9 && Math.abs(p[1] - 41) < 0.002)).toBe(true);
  });

  it("leaves a two-point line alone", () => {
    const line: Position[] = [
      [-88, 41],
      [-87, 42],
    ];
    expect(simplify(line)).toEqual(line);
  });
});
