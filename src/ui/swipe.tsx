import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { useTheme } from "@/theme";

import { Txt } from "./primitives";

/**
 * Swipe actions on a list row.
 *
 * The actions slide in rather than firing on release, so a swipe while the
 * truck is moving reveals a button instead of silently marking a load
 * delivered. Every action is also reachable by long-pressing the row, which is
 * the accessible path and the one that works with a screen reader.
 */

export interface SwipeAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "accent" | "info" | "negative";
  onPress: () => void;
}

export function SwipeableRow({
  children,
  actions,
}: {
  children: ReactNode;
  actions: SwipeAction[];
}) {
  const { colors } = useTheme();

  const toneColor = (tone: SwipeAction["tone"]) =>
    tone === "accent" ? colors.accent : tone === "negative" ? colors.negative : colors.info;

  if (actions.length === 0) return <>{children}</>;

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(
        _progress: SharedValue<number>,
        translation: SharedValue<number>,
        methods: SwipeableMethods,
      ) => (
        <ActionPanel
          actions={actions}
          translation={translation}
          toneColor={toneColor}
          close={methods.close}
        />
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function ActionPanel({
  actions,
  translation,
  toneColor,
  close,
}: {
  actions: SwipeAction[];
  translation: SharedValue<number>;
  toneColor: (tone: SwipeAction["tone"]) => string;
  close: () => void;
}) {
  const { space, radius } = useTheme();
  const width = actions.length * 84;

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translation.value + width }],
  }));

  return (
    <Animated.View style={[{ flexDirection: "row", width, marginBottom: space.sm }, style]}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            close();
            action.onPress();
          }}
          style={{
            width: 84,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            backgroundColor: toneColor(action.tone),
            borderRadius: radius.md,
            marginLeft: space.xs,
          }}
        >
          <Ionicons name={action.icon} size={22} color="#04120B" />
          <Txt variant="caption" color="#04120B">
            {action.label}
          </Txt>
        </Pressable>
      ))}
      <View />
    </Animated.View>
  );
}
