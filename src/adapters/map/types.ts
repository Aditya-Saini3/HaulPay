import type { Bounds, Position } from "../types";

/**
 * Map rendering, behind an interface so the tile provider can be swapped
 * without touching a single screen. The UI never names MapTiler, Stadia or
 * Protomaps — it asks the adapter for a style and gets one.
 */
export interface MapAdapter {
  readonly name: string;
  /**
   * A MapLibre style: a URL for a hosted provider, or an inline style object
   * for a self-hosted `.pmtiles` file.
   */
  styleFor(theme: "light" | "dark"): string | object;
  /**
   * Required by the ODbL. Rendered visibly on every map view — this is a
   * licence condition, not a nicety, so the adapter is what states it and the
   * map component always draws it.
   */
  readonly attribution: string;
  /** True when the provider is configured; false puts the map in its empty state. */
  readonly isConfigured: boolean;
}

export interface MapPin {
  id: string;
  position: Position;
  /** Drives the pin colour through the symbol layer's match expression. */
  status: string;
  title: string;
  subtitle?: string;
}

export interface MapViewport {
  center?: Position;
  bounds?: Bounds;
  zoom?: number;
}
