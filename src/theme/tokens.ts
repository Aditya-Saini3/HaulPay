/**
 * Design tokens.
 *
 * Built for one-handed use in a truck cab, often in bright sun or at night.
 * The dark palette is the primary one and is a real dark theme, not a tinted
 * light theme — a deep slate ground with a single confident accent for
 * money-positive states and a distinct one for below-breakeven. Deliberately
 * not the generic blue-gradient fintech look.
 */

export interface Palette {
  /** Page ground. */
  background: string;
  /** Cards and sheets, one step off the ground. */
  surface: string;
  /** Inputs and pressed states, one step further. */
  surfaceRaised: string;
  border: string;
  borderStrong: string;

  text: string;
  textMuted: string;
  textFaint: string;
  /** Text on an accent-filled surface. */
  textOnAccent: string;

  /** The single confident accent. Money made. */
  accent: string;
  accentMuted: string;
  /** Below breakeven, negative profit, destructive actions. */
  negative: string;
  negativeMuted: string;
  /** Attention without alarm: pending, unpaid miles, warnings. */
  warning: string;
  warningMuted: string;
  info: string;

  /** Load status chips, shared with the map pin colours. */
  statusBooked: string;
  statusInTransit: string;
  statusDelivered: string;
  statusInvoiced: string;
  statusPaid: string;

  /** Chart series, in the order they get handed out. */
  chart: string[];
  overlay: string;
}

const dark: Palette = {
  background: "#0B1116",
  surface: "#131C24",
  surfaceRaised: "#1B2731",
  border: "#25333F",
  borderStrong: "#384957",

  text: "#F2F6FA",
  textMuted: "#93A4B3",
  textFaint: "#5F7284",
  textOnAccent: "#04120B",

  accent: "#00D48A",
  accentMuted: "#0C3A2B",
  negative: "#FF6369",
  negativeMuted: "#3D1A1E",
  warning: "#FFB224",
  warningMuted: "#3A2A0D",
  info: "#4C8DFF",

  statusBooked: "#7C8B99",
  statusInTransit: "#4C8DFF",
  statusDelivered: "#00D48A",
  statusInvoiced: "#FFB224",
  statusPaid: "#00A96E",

  chart: ["#00D48A", "#4C8DFF", "#FFB224", "#FF6369", "#A78BFA", "#3DC7FF", "#F472B6", "#84CC16"],
  overlay: "rgba(4, 8, 11, 0.72)",
};

const light: Palette = {
  background: "#F4F7F9",
  surface: "#FFFFFF",
  surfaceRaised: "#EDF1F5",
  border: "#D8E0E7",
  borderStrong: "#B8C6D2",

  text: "#0B1116",
  textMuted: "#526475",
  textFaint: "#7C8B99",
  textOnAccent: "#04120B",

  accent: "#00A96E",
  accentMuted: "#D6F5E7",
  negative: "#E5484D",
  negativeMuted: "#FDE7E8",
  warning: "#B7791F",
  warningMuted: "#FCF0D9",
  info: "#1B6BFF",

  statusBooked: "#7C8B99",
  statusInTransit: "#1B6BFF",
  statusDelivered: "#00A96E",
  statusInvoiced: "#B7791F",
  statusPaid: "#00875A",

  chart: ["#00A96E", "#1B6BFF", "#B7791F", "#E5484D", "#7C3AED", "#0891B2", "#DB2777", "#65A30D"],
  overlay: "rgba(11, 17, 22, 0.5)",
};

export const palettes = { dark, light } as const;

/**
 * Spacing on a 4pt grid. `tap` is the floor for any interactive element —
 * 48pt, because this is used with gloves on, at a fuel island, in the cold.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  tap: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Numbers are the interface, so the money sizes are large and always use
 * tabular figures — a column of dollar amounts has to line up on the decimal.
 */
export const type = {
  hero: { fontSize: 40, lineHeight: 44, fontWeight: "700" },
  money: { fontSize: 28, lineHeight: 32, fontWeight: "700" },
  moneySmall: { fontSize: 20, lineHeight: 24, fontWeight: "700" },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
} as const;

/**
 * The font feature that makes a column of money legible. Applied to every
 * numeric display, never to prose.
 */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };

export type ThemeName = keyof typeof palettes;
