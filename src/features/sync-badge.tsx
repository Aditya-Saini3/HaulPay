import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { subscribeToSync, runSync, type SyncStatus } from "@/sync";
import { useTheme } from "@/theme";
import { Row, Txt } from "@/ui";

/**
 * The sync chip. Only says something when there is something to say: pending
 * writes, no connection, or an error. A working sync is silent.
 */
export function SyncBadge() {
  const { colors, space, radius } = useTheme();
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => subscribeToSync(setStatus), []);

  if (!status) return null;
  const quiet = status.online && status.pending === 0 && !status.lastError && !status.syncing;
  if (quiet) return null;

  const { icon, label, color } = status.syncing
    ? { icon: "sync-outline" as const, label: "Syncing", color: colors.textMuted }
    : !status.online
      ? { icon: "cloud-offline-outline" as const, label: "Offline", color: colors.warning }
      : status.lastError
        ? { icon: "warning-outline" as const, label: "Sync issue", color: colors.negative }
        : { icon: "cloud-upload-outline" as const, label: `${status.pending} pending`, color: colors.textMuted };

  return (
    <Pressable onPress={() => void runSync()} accessibilityRole="button" accessibilityLabel={label}>
      <View
        style={{
          paddingHorizontal: space.md,
          paddingVertical: space.xs,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceRaised,
        }}
      >
        <Row gap={space.xs}>
          <Ionicons name={icon} size={13} color={color} />
          <Txt variant="caption" color={color}>
            {label}
          </Txt>
        </Row>
      </View>
    </Pressable>
  );
}
