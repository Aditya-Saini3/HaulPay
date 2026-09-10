import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { palettes, radius, space, TABULAR, type, type Palette, type ThemeName } from "./tokens";

export * from "./tokens";

export interface Theme {
  name: ThemeName;
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  tabular: typeof TABULAR;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  children,
  override,
}: {
  children: ReactNode;
  /** Settings can pin a theme; otherwise it follows the device. */
  override?: ThemeName | null;
}) {
  const scheme = useColorScheme();
  // Dark is the default when the device has no preference: this is a night app
  // as much as a day one.
  const name: ThemeName = override ?? (scheme === "light" ? "light" : "dark");

  const value = useMemo<Theme>(
    () => ({ name, colors: palettes[name], space, radius, type, tabular: TABULAR }),
    [name],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside a ThemeProvider");
  return theme;
}

/** Load-status colour, shared with the map pins so the two never disagree. */
export function statusColor(colors: Palette, status: string): string {
  switch (status) {
    case "in_transit":
      return colors.statusInTransit;
    case "delivered":
      return colors.statusDelivered;
    case "invoiced":
      return colors.statusInvoiced;
    case "paid":
      return colors.statusPaid;
    default:
      return colors.statusBooked;
  }
}

/** Green when it made money, red when it did not. Used on every profit figure. */
export function moneyColor(colors: Palette, cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return colors.textMuted;
  if (cents > 0) return colors.accent;
  if (cents < 0) return colors.negative;
  return colors.text;
}
