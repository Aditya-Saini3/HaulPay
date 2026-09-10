import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type RefreshControlProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { moneyColor, statusColor, useTheme } from "@/theme";

/**
 * The base component set.
 *
 * Two rules run through all of it: nothing interactive is smaller than 48pt,
 * and every number renders in tabular figures so a column of dollar amounts
 * lines up on the decimal.
 */

export function Screen({
  children,
  scroll = false,
  edges = ["top"],
  contentStyle,
  refreshControl,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const { colors, space } = useTheme();
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ padding: space.lg, paddingBottom: space.xxl * 2 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      {...(refreshControl ? { refreshControl } : {})}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={edges}>
      {body}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const { colors, space, radius } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: padded ? space.lg : 0,
    overflow: "hidden",
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { backgroundColor: colors.surfaceRaised }, style]}
    >
      {children}
    </Pressable>
  );
}

type TextVariant = keyof ReturnType<typeof useTheme>["type"];

export function Txt({
  children,
  variant = "body",
  color,
  numeric = false,
  align,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  /** Turns on tabular figures. Every money and rate value sets this. */
  numeric?: boolean;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  const preset = theme.type[variant] as TextStyle;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        preset,
        { color: color ?? theme.colors.text },
        numeric && theme.tabular,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  full = false,
  style,
  ...rest
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
} & Omit<PressableProps, "style" | "onPress" | "disabled">) {
  const { colors, space, radius, type } = useTheme();

  const background =
    variant === "primary"
      ? colors.accent
      : variant === "destructive"
        ? colors.negative
        : variant === "secondary"
          ? colors.surfaceRaised
          : "transparent";
  const foreground =
    variant === "primary"
      ? colors.textOnAccent
      : variant === "destructive"
        ? "#FFFFFF"
        : colors.text;

  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          // 48pt floor: this gets used with gloves on.
          minHeight: space.tap,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          backgroundColor: background,
          borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
          alignSelf: full ? "stretch" : "auto",
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={foreground} /> : null}
          <Text style={[type.heading as TextStyle, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** A bottom-anchored primary action, which is where a thumb actually reaches. */
export function BottomBar({ children }: { children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.surface }}>
      <View
        style={{
          flexDirection: "row",
          gap: space.md,
          padding: space.lg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

export function Row({
  children,
  gap,
  align = "center",
  justify,
  wrap = false,
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { space } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: align,
          gap: gap ?? space.md,
          flexWrap: wrap ? "wrap" : "nowrap",
        },
        justify ? { justifyContent: justify } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider() {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: space.md,
      }}
    />
  );
}

export function StatusChip({ status, label }: { status: string; label: string }) {
  const { colors, space, radius, type } = useTheme();
  const color = statusColor(colors, status);
  return (
    <View
      style={{
        paddingHorizontal: space.md,
        paddingVertical: space.xs,
        borderRadius: radius.pill,
        backgroundColor: `${color}22`,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: `${color}66`,
      }}
    >
      <Text style={[type.caption as TextStyle, { color }]}>{label}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  tone,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: string;
}) {
  const { colors, space, radius, type } = useTheme();
  const active = tone ?? colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        backgroundColor: selected ? `${active}26` : colors.surfaceRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? active : colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? active : colors.textMuted} /> : null}
      <Text style={[type.label as TextStyle, { color: selected ? active : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The headline number card. Money is large, tabular and coloured by sign;
 * everything else on the card is supporting text.
 */
export function StatCard({
  label,
  value,
  sub,
  tone,
  signedCents,
  icon,
  onPress,
  compact = false,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: string;
  /** When given, the value is coloured green or red by its sign. */
  signedCents?: number | null;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  compact?: boolean;
}) {
  const { colors, space } = useTheme();
  const valueColor =
    tone ?? (signedCents === undefined ? colors.text : moneyColor(colors, signedCents));

  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: compact ? 120 : 150 }}>
      <Row gap={space.sm} justify="space-between">
        <Txt variant="label" color={colors.textMuted}>
          {label.toUpperCase()}
        </Txt>
        {icon ? <Ionicons name={icon} size={16} color={colors.textFaint} /> : null}
      </Row>
      <View style={{ height: space.sm }} />
      <Txt variant={compact ? "moneySmall" : "money"} numeric color={valueColor}>
        {value}
      </Txt>
      {sub ? (
        <Txt variant="caption" color={colors.textFaint} numeric style={{ marginTop: 2 }}>
          {sub}
        </Txt>
      ) : null}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const { colors, space } = useTheme();
  return (
    <View style={{ alignItems: "center", padding: space.xxl, gap: space.md }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surfaceRaised,
        }}
      >
        <Ionicons name={icon} size={40} color={colors.textFaint} />
      </View>
      <Txt variant="heading" align="center">
        {title}
      </Txt>
      {message ? (
        <Txt variant="body" color={colors.textMuted} align="center">
          {message}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <Row justify="space-between" style={{ marginTop: space.xl, marginBottom: space.md }}>
      <Txt variant="label" color={colors.textMuted}>
        {title.toUpperCase()}
      </Txt>
      {action}
    </Row>
  );
}

/** A label/value line. The value is tabular when it is a number. */
export function DetailRow({
  label,
  value,
  valueColor,
  numeric = true,
  strong = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  numeric?: boolean;
  strong?: boolean;
}) {
  const { colors, space } = useTheme();
  return (
    <Row justify="space-between" style={{ paddingVertical: space.sm }}>
      <Txt variant={strong ? "heading" : "body"} color={strong ? colors.text : colors.textMuted}>
        {label}
      </Txt>
      <Txt
        variant={strong ? "heading" : "body"}
        numeric={numeric}
        color={valueColor ?? colors.text}
      >
        {value}
      </Txt>
    </Row>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md }}>
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? (
        <Txt variant="body" color={colors.textMuted}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * Inline warning used on the load form when a rate lands under breakeven.
 * Stated as a number, not a lecture — this audience knows what breakeven means.
 */
export function Banner({
  tone = "warning",
  icon = "alert-circle-outline",
  children,
}: {
  tone?: "warning" | "negative" | "info" | "accent";
  icon?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  const { colors, space, radius } = useTheme();
  const map = {
    warning: { fg: colors.warning, bg: colors.warningMuted },
    negative: { fg: colors.negative, bg: colors.negativeMuted },
    info: { fg: colors.info, bg: `${colors.info}1F` },
    accent: { fg: colors.accent, bg: colors.accentMuted },
  } as const;
  const { fg, bg } = map[tone];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.md,
        alignItems: "flex-start",
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: bg,
      }}
    >
      <Ionicons name={icon} size={20} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{typeof children === "string" ? (
        <Txt variant="body" color={fg}>{children}</Txt>
      ) : (
        children
      )}</View>
    </View>
  );
}
