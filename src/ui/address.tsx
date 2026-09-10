import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextStyle } from "react-native";

import { AdapterError, createDebouncedSearch, geocodeAdapter, type Place, type Position } from "@/adapters";
import { useTheme } from "@/theme";

import { Field, FieldLabel } from "./fields";
import { Row, Txt } from "./primitives";

/**
 * Address autocomplete.
 *
 * Debounced at 300ms with results cached locally, because the geocoder behind
 * this is a shared OSM service with a usage policy, not an unlimited API. The
 * "use my location" button is the one place in the entire app that reads device
 * location, it is foreground-only, and it fires once per tap.
 */

export interface AddressValue {
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

export const EMPTY_ADDRESS: AddressValue = {
  address: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  lat: null,
  lng: null,
};

export function placeToAddress(place: Place): AddressValue {
  return {
    address: place.street ?? place.label,
    city: place.city,
    state: place.state,
    postalCode: place.postalCode,
    country: place.country,
    lat: place.position[1],
    lng: place.position[0],
  };
}

/** "Joliet, IL" — the way a lane is written on a rate confirmation. */
export function shortLane(value: Pick<AddressValue, "city" | "state">): string {
  return [value.city, value.state].filter(Boolean).join(", ") || "—";
}

export function addressLabel(value: AddressValue): string {
  const lane = shortLane(value);
  if (value.address && lane !== "—") return `${value.address} · ${lane}`;
  return value.address ?? lane;
}

export function AddressField({
  label,
  value,
  onChange,
  placeholder = "Search an address, city or ZIP",
  near,
  hint,
}: {
  label?: string;
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  placeholder?: string;
  /** Biases results toward the previous stop, which is usually where the truck is. */
  near?: Position | null;
  hint?: string;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const search = useMemo(
    () =>
      createDebouncedSearch(async (q: string, signal: AbortSignal) => {
        return geocodeAdapter.autocomplete(q, {
          limit: 8,
          signal,
          ...(near ? { near } : {}),
        });
      }, 300),
    [near],
  );

  useEffect(() => () => search.cancel(), [search]);

  const onType = useCallback(
    (text: string) => {
      setQuery(text);
      setOpen(true);
      setError(null);

      if (text.trim().length < 3) {
        setResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      search(text)
        .then((places) => {
          if (!mounted.current) return;
          // A superseded query resolves null; leaving the list alone is correct.
          if (places === null) return;
          setResults(places);
          setSearching(false);
        })
        .catch((err: unknown) => {
          if (!mounted.current) return;
          setSearching(false);
          setError(
            err instanceof AdapterError && err.kind === "rate_limited"
              ? "Address lookups are busy. Type the address and keep going."
              : "Address search is unavailable. You can still type the address.",
          );
        });
    },
    [search],
  );

  const choose = (place: Place) => {
    onChange(placeToAddress(place));
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  /**
   * The one and only device-location read in the app. Foreground permission,
   * one fix, no watcher, nothing running in the background.
   */
  const useCurrentLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission was declined. Type the address instead.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const place = await geocodeAdapter.reverse([
        position.coords.longitude,
        position.coords.latitude,
      ]);
      if (place) {
        choose(place);
      } else {
        onChange({
          ...EMPTY_ADDRESS,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      }
    } catch {
      setError("Could not read your location. Type the address instead.");
    } finally {
      if (mounted.current) setLocating(false);
    }
  };

  const hasValue = Boolean(value.address ?? value.city ?? value.lat);

  return (
    <Field label={label} hint={hint}>
      {hasValue && !open ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => ({
            minHeight: theme.space.tap,
            borderRadius: theme.radius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceRaised,
            paddingHorizontal: theme.space.md,
            paddingVertical: theme.space.sm,
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Row justify="space-between">
            <View style={{ flex: 1 }}>
              <Txt variant="body" numberOfLines={1}>
                {value.address ?? shortLane(value)}
              </Txt>
              {value.address ? (
                <Txt variant="caption" color={theme.colors.textMuted}>
                  {shortLane(value)}
                  {value.postalCode ? ` ${value.postalCode}` : ""}
                </Txt>
              ) : null}
            </View>
            {value.lat === null ? (
              // No coordinates means no route leg and no map pin for this stop.
              <Ionicons name="warning-outline" size={18} color={theme.colors.warning} />
            ) : (
              <Ionicons name="pencil" size={16} color={theme.colors.textMuted} />
            )}
          </Row>
        </Pressable>
      ) : (
        <View
          style={{
            borderRadius: theme.radius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceRaised,
            overflow: "hidden",
          }}
        >
          <Row gap={theme.space.sm} style={{ paddingHorizontal: theme.space.md }}>
            <Ionicons name="search" size={18} color={theme.colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={onType}
              onFocus={() => setOpen(true)}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textFaint}
              autoCorrect={false}
              style={[
                theme.type.body as TextStyle,
                { flex: 1, minHeight: theme.space.tap, color: theme.colors.text },
              ]}
            />
            {searching ? <ActivityIndicator size="small" color={theme.colors.textMuted} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
              onPress={useCurrentLocation}
              hitSlop={8}
              style={{ padding: theme.space.xs }}
            >
              {locating ? (
                <ActivityIndicator size="small" color={theme.colors.accent} />
              ) : (
                <Ionicons name="locate" size={20} color={theme.colors.accent} />
              )}
            </Pressable>
          </Row>

          {results.map((place) => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              onPress={() => choose(place)}
              style={({ pressed }) => ({
                minHeight: theme.space.tap,
                paddingHorizontal: theme.space.md,
                paddingVertical: theme.space.sm,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.colors.border,
                backgroundColor: pressed ? theme.colors.surface : "transparent",
                justifyContent: "center",
              })}
            >
              <Txt variant="body" numberOfLines={1}>
                {place.label}
              </Txt>
            </Pressable>
          ))}

          {/* Typing an address the geocoder does not know is always allowed —
              a yard with no street number still has to be enterable. */}
          {open && query.trim().length >= 3 && !searching && results.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChange({ ...EMPTY_ADDRESS, address: query.trim() });
                setQuery("");
                setOpen(false);
              }}
              style={{
                minHeight: theme.space.tap,
                paddingHorizontal: theme.space.md,
                justifyContent: "center",
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.colors.border,
              }}
            >
              <Txt variant="body" color={theme.colors.accent}>
                Use “{query.trim()}” as typed
              </Txt>
            </Pressable>
          ) : null}
        </View>
      )}

      {error ? (
        <Txt variant="caption" color={theme.colors.warning} style={{ marginTop: theme.space.xs }}>
          {error}
        </Txt>
      ) : null}
    </Field>
  );
}

export { FieldLabel };
