import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMemo, useState, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { formatMoney, parseDollarsToCents, parseMiles, type Cents } from "@/earnings";
import { useTheme } from "@/theme";

import { Button, Row, Txt } from "./primitives";

/**
 * Form fields.
 *
 * Money fields hold a string while being typed and only commit integer cents on
 * blur, so a half-typed "12." never becomes 12 dollars behind the driver's
 * back, and no float ever reaches storage.
 */

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  const { colors, space } = useTheme();
  return (
    <Row justify="space-between" style={{ marginBottom: space.xs }}>
      <Txt variant="label" color={colors.textMuted}>
        {typeof children === "string" ? children.toUpperCase() : children}
      </Txt>
      {hint ? (
        <Txt variant="caption" color={colors.textFaint}>
          {hint}
        </Txt>
      ) : null}
    </Row>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>, focused: boolean): ViewStyle {
  return {
    minHeight: theme.space.tap,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: focused ? theme.colors.accent : theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.space.md,
    justifyContent: "center",
  };
}

export function Field({
  label,
  hint,
  children,
  style,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { space } = useTheme();
  return (
    <View style={[{ marginBottom: space.lg }, style]}>
      {label ? <FieldLabel hint={hint}>{label}</FieldLabel> : null}
      {children}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  keyboardType,
  autoCapitalize = "sentences",
  secureTextEntry = false,
  multiline = false,
  numeric = false,
  autoFocus = false,
  right,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  secureTextEntry?: boolean;
  multiline?: boolean;
  numeric?: boolean;
  autoFocus?: boolean;
  right?: ReactNode;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Field label={label} hint={hint}>
      <View style={[inputStyle(theme, focused), multiline && { minHeight: 96, paddingVertical: theme.space.md }]}>
        <Row gap={theme.space.sm}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textFaint}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            secureTextEntry={secureTextEntry}
            multiline={multiline}
            autoFocus={autoFocus}
            style={[
              theme.type.body as TextStyle,
              { flex: 1, color: theme.colors.text, paddingVertical: theme.space.sm },
              numeric && theme.tabular,
              multiline && { textAlignVertical: "top" },
            ]}
          />
          {right}
        </Row>
      </View>
    </Field>
  );
}

/**
 * A money field. Holds the raw string while focused so the caret does not jump,
 * and commits integer cents on blur.
 */
export function MoneyField({
  label,
  cents,
  onChange,
  hint,
  placeholder = "0.00",
  allowNegative = false,
}: {
  label?: string;
  cents: Cents | null;
  onChange: (cents: Cents | null) => void;
  hint?: string;
  placeholder?: string;
  allowNegative?: boolean;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const display = draft ?? (cents === null ? "" : (cents / 100).toFixed(2));

  const commit = () => {
    setFocused(false);
    if (draft === null) return;
    if (draft.trim() === "") {
      onChange(null);
    } else {
      const parsed = parseDollarsToCents(draft);
      if (parsed !== null) onChange(allowNegative ? parsed : Math.abs(parsed));
    }
    setDraft(null);
  };

  return (
    <Field label={label} hint={hint}>
      <View style={inputStyle(theme, focused)}>
        <Row gap={theme.space.xs}>
          <Txt variant="moneySmall" color={focused ? theme.colors.text : theme.colors.textMuted}>
            $
          </Txt>
          <TextInput
            value={display}
            onChangeText={setDraft}
            onFocus={() => {
              setFocused(true);
              setDraft(display);
            }}
            onBlur={commit}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textFaint}
            keyboardType={allowNegative ? "numbers-and-punctuation" : "decimal-pad"}
            style={[
              theme.type.moneySmall as TextStyle,
              theme.tabular,
              { flex: 1, color: theme.colors.text, paddingVertical: theme.space.sm },
            ]}
          />
        </Row>
      </View>
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  suffix,
  placeholder = "0",
  decimals = 1,
}: {
  label?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  suffix?: string;
  placeholder?: string;
  decimals?: number;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const display = draft ?? (value === null ? "" : String(value));

  const commit = () => {
    setFocused(false);
    if (draft === null) return;
    if (draft.trim() === "") {
      onChange(null);
    } else {
      const parsed = decimals === 0 ? Number(draft.replace(/[^\d]/g, "")) : parseMiles(draft);
      onChange(parsed === null || Number.isNaN(parsed) ? null : parsed);
    }
    setDraft(null);
  };

  return (
    <Field label={label} hint={hint}>
      <View style={inputStyle(theme, focused)}>
        <Row gap={theme.space.sm}>
          <TextInput
            value={display}
            onChangeText={setDraft}
            onFocus={() => {
              setFocused(true);
              setDraft(display);
            }}
            onBlur={commit}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textFaint}
            keyboardType="decimal-pad"
            style={[
              theme.type.moneySmall as TextStyle,
              theme.tabular,
              { flex: 1, color: theme.colors.text, paddingVertical: theme.space.sm },
            ]}
          />
          {suffix ? (
            <Txt variant="body" color={theme.colors.textMuted}>
              {suffix}
            </Txt>
          ) : null}
        </Row>
      </View>
    </Field>
  );
}

export interface Option<T> {
  value: T;
  label: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/** A segmented control. Fine up to about four options; past that use Select. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Field label={label}>
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surfaceRaised,
          borderRadius: radius.md,
          padding: 3,
          gap: 3,
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{
                flex: 1,
                minHeight: space.tap - 6,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: radius.sm,
                backgroundColor: selected ? colors.accent : "transparent",
                paddingHorizontal: space.sm,
              }}
            >
              <Txt
                variant="label"
                align="center"
                color={selected ? colors.textOnAccent : colors.textMuted}
              >
                {option.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

/** A select that opens a sheet. Used wherever there are more than four choices. */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = "Select",
  hint,
  clearable = false,
}: {
  label?: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  placeholder?: string;
  hint?: string;
  clearable?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  return (
    <>
      <Field label={label} hint={hint}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [inputStyle(theme, false), pressed && { opacity: 0.8 }]}
        >
          <Row justify="space-between">
            <Txt
              variant="body"
              color={selected ? theme.colors.text : theme.colors.textFaint}
              numberOfLines={1}
            >
              {selected?.label ?? placeholder}
            </Txt>
            <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
          </Row>
        </Pressable>
      </Field>

      <Sheet open={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
        <ScrollView style={{ maxHeight: 420 }}>
          {clearable ? (
            <OptionRow
              label={placeholder}
              selected={value === null}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
          ) : null}
          {options.map((option) => (
            <OptionRow
              key={option.value}
              label={option.label}
              description={option.description}
              icon={option.icon}
              selected={option.value === value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

function OptionRow({
  label,
  description,
  icon,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: space.tap,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.xs,
        backgroundColor: pressed ? colors.surfaceRaised : "transparent",
      })}
    >
      {icon ? <Ionicons name={icon} size={20} color={colors.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="body">{label}</Txt>
        {description ? (
          <Txt variant="caption" color={colors.textMuted}>
            {description}
          </Txt>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          padding: space.lg,
          paddingBottom: space.xxl,
          gap: space.sm,
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            marginBottom: space.sm,
          }}
        />
        {title ? <Txt variant="title">{title}</Txt> : null}
        {children}
        {footer}
      </View>
    </Modal>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors, space } = useTheme();
  return (
    <Row justify="space-between" style={{ minHeight: space.tap, paddingVertical: space.sm }}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Txt variant="body">{label}</Txt>
        {description ? (
          <Txt variant="caption" color={colors.textMuted}>
            {description}
          </Txt>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={Platform.OS === "android" ? colors.surface : undefined}
      />
    </Row>
  );
}

/**
 * Date and time picker. Emits an ISO string that carries the device's UTC
 * offset, because the earnings engine reads the local calendar day off the
 * string — a load started at 23:30 belongs to that day, not to the next one in
 * UTC.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = "datetime",
  hint,
  clearable = true,
}: {
  label?: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  mode?: "date" | "time" | "datetime";
  hint?: string;
  clearable?: boolean;
}) {
  const theme = useTheme();
  const [picking, setPicking] = useState<null | "date" | "time">(null);

  const date = value ? new Date(value) : new Date();
  const valid = value !== null && !Number.isNaN(date.getTime());

  const display = !valid
    ? "Not set"
    : mode === "date"
      ? date.toLocaleDateString()
      : mode === "time"
        ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  const emit = (next: Date) => {
    onChange(toLocalIso(next));
  };

  return (
    <Field label={label} hint={hint}>
      <Row gap={theme.space.sm}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPicking(mode === "time" ? "time" : "date")}
          style={({ pressed }) => [inputStyle(theme, false), { flex: 1 }, pressed && { opacity: 0.8 }]}
        >
          <Row justify="space-between">
            <Txt variant="body" numeric color={valid ? theme.colors.text : theme.colors.textFaint}>
              {display}
            </Txt>
            <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
          </Row>
        </Pressable>
        {clearable && valid ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? "date"}`}
            onPress={() => onChange(null)}
            style={{
              width: theme.space.tap,
              height: theme.space.tap,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close-circle" size={22} color={theme.colors.textFaint} />
          </Pressable>
        ) : null}
      </Row>

      {picking ? (
        <DateTimePicker
          value={valid ? date : new Date()}
          mode={picking}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selected) => {
            if (Platform.OS !== "ios") setPicking(null);
            if (event.type === "dismissed" || !selected) return;

            if (mode === "datetime" && picking === "date") {
              const merged = new Date(selected);
              merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
              emit(merged);
              // Chain straight into the time picker so a datetime is one flow.
              if (Platform.OS !== "ios") setPicking("time");
              return;
            }
            emit(selected);
            if (Platform.OS === "ios") setPicking(null);
          }}
        />
      ) : null}

      {Platform.OS === "ios" && picking ? (
        <Row gap={theme.space.sm} style={{ marginTop: theme.space.sm }}>
          {mode === "datetime" ? (
            <Button
              label={picking === "date" ? "Set time" : "Set date"}
              variant="secondary"
              onPress={() => setPicking(picking === "date" ? "time" : "date")}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button label="Done" variant="secondary" onPress={() => setPicking(null)} style={{ flex: 1 }} />
        </Row>
      ) : null}
    </Field>
  );
}

/**
 * An ISO 8601 string carrying the device's own UTC offset.
 *
 * `Date.toISOString()` would normalise to UTC and lose the local day, which is
 * exactly the information the settlement week is built on.
 */
export function toLocalIso(date: Date): string {
  const pad = (n: number, width = 2) => String(Math.floor(Math.abs(n))).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`
  );
}

/** Today as a `YYYY-MM-DD` local day key. */
export function todayKey(): string {
  return toLocalIso(new Date()).slice(0, 10);
}

export { formatMoney };
