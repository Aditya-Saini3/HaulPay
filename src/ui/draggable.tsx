import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

/**
 * A drag-to-reorder list.
 *
 * Written rather than pulled in as a dependency because the only thing it has
 * to reorder is a handful of stops on a load, and the interaction has to work
 * one-handed with the row height this app uses. Each row also carries explicit
 * up/down buttons: dragging in a moving truck is not always realistic, and
 * they are the accessible path regardless.
 */

export interface DraggableListProps<T> {
  items: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (items: T[]) => void;
  rowHeight: number;
}

export function DraggableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  rowHeight,
}: DraggableListProps<T>) {
  const { space } = useTheme();
  const [dragging, setDragging] = useState<number | null>(null);

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || to < 0 || to >= items.length) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      if (moved !== undefined) next.splice(to, 0, moved);
      onReorder(next);
    },
    [items, onReorder],
  );

  return (
    <View style={{ gap: space.sm }}>
      {items.map((item, index) => (
        <DraggableRow
          key={keyExtractor(item, index)}
          index={index}
          count={items.length}
          rowHeight={rowHeight}
          dragging={dragging === index}
          onDragStart={() => setDragging(index)}
          onDragEnd={(offsetRows) => {
            setDragging(null);
            move(index, index + offsetRows);
          }}
          onMoveUp={() => move(index, index - 1)}
          onMoveDown={() => move(index, index + 1)}
        >
          {renderItem(item, index)}
        </DraggableRow>
      ))}
    </View>
  );
}

function DraggableRow({
  children,
  index,
  count,
  rowHeight,
  dragging,
  onDragStart,
  onDragEnd,
  onMoveUp,
  onMoveDown,
}: {
  children: ReactNode;
  index: number;
  count: number;
  rowHeight: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: (offsetRows: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { colors, space, radius } = useTheme();
  const translateY = useSharedValue(0);
  const active = useSharedValue(false);
  const spacing = rowHeight + space.sm;

  const pan = useRef(
    Gesture.Pan()
      // A long press before the drag takes, so a scroll gesture is not stolen.
      .activateAfterLongPress(180)
      .onStart(() => {
        active.value = true;
        runOnJS(onDragStart)();
      })
      .onUpdate((event) => {
        translateY.value = event.translationY;
      })
      .onEnd(() => {
        const offsetRows = Math.round(translateY.value / spacing);
        active.value = false;
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
        runOnJS(onDragEnd)(offsetRows);
      }),
  ).current;

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: active.value ? 1.02 : 1 }],
    zIndex: active.value ? 10 : 0,
    elevation: active.value ? 6 : 0,
  }));

  return (
    <Animated.View style={style}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: dragging ? colors.surfaceRaised : colors.surface,
          borderRadius: radius.md,
          borderWidth: dragging ? 1 : 0,
          borderColor: colors.accent,
        }}
      >
        <GestureDetector gesture={pan}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Stop ${index + 1} of ${count}. Long press to drag, or use the arrows.`}
            style={{
              width: space.tap,
              minHeight: rowHeight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="reorder-three" size={24} color={colors.textFaint} />
          </View>
        </GestureDetector>

        <View style={{ flex: 1 }}>{children}</View>

        <View style={{ justifyContent: "center" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Move stop up"
            disabled={index === 0}
            onPress={onMoveUp}
            hitSlop={4}
            style={{ width: 40, height: rowHeight / 2, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons
              name="chevron-up"
              size={18}
              color={index === 0 ? colors.textFaint : colors.textMuted}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Move stop down"
            disabled={index === count - 1}
            onPress={onMoveDown}
            hitSlop={4}
            style={{ width: 40, height: rowHeight / 2, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons
              name="chevron-down"
              size={18}
              color={index === count - 1 ? colors.textFaint : colors.textMuted}
            />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
