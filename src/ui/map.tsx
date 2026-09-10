import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from "@maplibre/maplibre-react-native";
import { useMemo, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import {
  MAP_COLORS,
  STATUS_COLORS,
  boundsOf,
  decodePolyline,
  mapAdapter,
  padBounds,
  type Bounds,
  type MapPin,
  type Position,
} from "@/adapters";
import { useTheme } from "@/theme";

import { EmptyState, Txt } from "./primitives";

/**
 * The map.
 *
 * Everything here is drawn from stored addresses. No device location is
 * requested at any point — the only exception in the whole app is the optional
 * one-time "use my current location" button on the address field, which is
 * foreground-only.
 *
 * The OSM attribution is rendered on every map view. That is a licence
 * condition of the ODbL, not a nicety, so it is part of this component rather
 * than something each screen has to remember.
 */

export interface MapViewProps {
  /** Stops to pin, in order. */
  stops?: { position: Position; type: "pickup" | "dropoff" | "stop"; label?: string }[];
  /** Loads to pin, colour-coded by status and clustered at low zoom. */
  pins?: MapPin[];
  /** Encoded polyline6 from the routing adapter. */
  routeGeometry?: string | null;
  /** Already-decoded route, when the caller has one in hand. */
  routeLine?: Position[] | null;
  /** Fixed height, or "fill" to expand into a flexed parent. */
  height?: number | "fill";
  onPinPress?: (id: string) => void;
  interactive?: boolean;
  children?: ReactNode;
}

export function MapView({
  stops = [],
  pins = [],
  routeGeometry = null,
  routeLine = null,
  height = 220,
  onPinPress,
  interactive = true,
  children,
}: MapViewProps) {
  const theme = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const palette = MAP_COLORS[theme.name];

  const line = useMemo<Position[]>(() => {
    if (routeLine?.length) return routeLine;
    if (routeGeometry) return decodePolyline(routeGeometry, 6);
    // With no route, connect the stops so the lane is still legible.
    return stops.map((s) => s.position);
  }, [routeGeometry, routeLine, stops]);

  const bounds = useMemo<Bounds | null>(() => {
    const positions = [...line, ...stops.map((s) => s.position), ...pins.map((p) => p.position)];
    const box = boundsOf(positions);
    return box ? padBounds(box) : null;
  }, [line, stops, pins]);

  const style = useMemo(() => {
    try {
      return mapAdapter.styleFor(theme.name);
    } catch {
      return null;
    }
  }, [theme.name]);

  const routeFeature = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features:
        line.length >= 2
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: { type: "LineString" as const, coordinates: line },
              },
            ]
          : [],
    }),
    [line],
  );

  const stopFeatures = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: stops.map((stop, index) => ({
        type: "Feature" as const,
        id: index,
        properties: { type: stop.type, label: stop.label ?? String(index + 1), index },
        geometry: { type: "Point" as const, coordinates: stop.position },
      })),
    }),
    [stops],
  );

  const pinFeatures = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pins.map((pin) => ({
        type: "Feature" as const,
        id: pin.id,
        properties: { id: pin.id, status: pin.status, title: pin.title },
        geometry: { type: "Point" as const, coordinates: pin.position },
      })),
    }),
    [pins],
  );

  if (!style) {
    return (
      <View
        style={[
          height === "fill" ? { flex: 1 } : { height },
          { borderRadius: theme.radius.lg, overflow: "hidden" },
        ]}
      >
        <EmptyState
          icon="map-outline"
          title="No map style configured"
          message="Set EXPO_PUBLIC_MAP_STYLE_URL_LIGHT and _DARK to a hosted OSM vector tile provider."
        />
      </View>
    );
  }

  const hasAnything = line.length > 0 || stops.length > 0 || pins.length > 0;

  return (
    <View
      style={{
        ...(height === "fill" ? { flex: 1 } : { height }),
        borderRadius: theme.radius.lg,
        overflow: "hidden",
        backgroundColor: theme.colors.surfaceRaised,
      }}
    >
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        logo={false}
        // The library's own attribution control is replaced with the always-on
        // label below, so it can never be scrolled or themed out of view.
        attribution={false}
        compass={false}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        onPress={(event) => {
          const features = (event.nativeEvent as { features?: GeoJSON.Feature[] }).features;
          const id = features?.[0]?.properties?.id;
          if (typeof id === "string") onPinPress?.(id);
        }}
      >
        <Camera
          ref={cameraRef}
          duration={400}
          {...(bounds
            ? { bounds, padding: { top: 48, right: 48, bottom: 48, left: 48 } }
            : // No stops yet: frame the lower 48 rather than the null island.
              { center: [-96, 39] as Position, zoom: 3 })}
        />

        {routeFeature.features.length > 0 ? (
          <GeoJSONSource id="route" data={routeFeature}>
            {/* Casing under the line keeps it readable over dark map tiles. */}
            <Layer
              id="route-casing"
              type="line"
              source="route"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": palette.routeCasing, "line-width": 7, "line-opacity": 0.9 }}
            />
            <Layer
              id="route-line"
              type="line"
              source="route"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": palette.route, "line-width": 4 }}
            />
          </GeoJSONSource>
        ) : null}

        {stopFeatures.features.length > 0 ? (
          <GeoJSONSource id="stops" data={stopFeatures}>
            <Layer
              id="stop-halo"
              type="circle"
              source="stops"
              paint={{
                "circle-radius": 11,
                "circle-color": palette.routeCasing,
                "circle-opacity": 0.95,
              }}
            />
            <Layer
              id="stop-dot"
              type="circle"
              source="stops"
              paint={{
                "circle-radius": 8,
                "circle-color": [
                  "match",
                  ["get", "type"],
                  "pickup",
                  palette.pickup,
                  "dropoff",
                  palette.dropoff,
                  palette.stop,
                ],
              }}
            />
          </GeoJSONSource>
        ) : null}

        {pinFeatures.features.length > 0 ? (
          <GeoJSONSource id="loads" data={pinFeatures} cluster clusterRadius={48} clusterMaxZoom={11}>
            <Layer
              id="load-clusters"
              type="circle"
              source="loads"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": palette.route,
                "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28],
                "circle-opacity": 0.9,
              }}
            />
            <Layer
              id="load-cluster-count"
              type="symbol"
              source="loads"
              filter={["has", "point_count"]}
              layout={{
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": 13,
                "text-allow-overlap": true,
              }}
              paint={{ "text-color": palette.routeCasing }}
            />
            <Layer
              id="load-pins"
              type="circle"
              source="loads"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-radius": 9,
                "circle-stroke-width": 2.5,
                "circle-stroke-color": palette.routeCasing,
                "circle-color": [
                  "match",
                  ["get", "status"],
                  "booked",
                  STATUS_COLORS.booked!,
                  "in_transit",
                  STATUS_COLORS.in_transit!,
                  "delivered",
                  STATUS_COLORS.delivered!,
                  "invoiced",
                  STATUS_COLORS.invoiced!,
                  "paid",
                  STATUS_COLORS.paid!,
                  STATUS_COLORS.booked!,
                ],
              }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>

      {!hasAnything ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          {children}
        </View>
      ) : null}

      <MapAttribution />
    </View>
  );
}

/**
 * "© OpenStreetMap contributors", visible on every map view. Required by the
 * ODbL, so it is not optional and not conditional.
 */
export function MapAttribution() {
  const { colors, space, radius } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: space.sm,
        bottom: space.sm,
        paddingHorizontal: space.sm,
        paddingVertical: 2,
        borderRadius: radius.sm,
        backgroundColor: colors.overlay,
      }}
    >
      <Txt variant="caption" color={colors.text}>
        {mapAdapter.attribution}
      </Txt>
    </View>
  );
}

/**
 * The honest label on every route.
 *
 * OSM truck-restriction tagging is good in some regions and sparse in others,
 * so Valhalla truck routing is reliable for mileage and shape but must not be
 * presented as turn-by-turn a driver can follow blind.
 */
export function RoutePreviewNote() {
  const { colors, space } = useTheme();
  return (
    <Txt variant="caption" color={colors.textFaint} style={{ marginTop: space.xs }}>
      Route preview for mileage, not navigation. Mileage stays editable.
    </Txt>
  );
}
