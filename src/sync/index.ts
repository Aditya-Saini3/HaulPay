import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";

import { uploadPendingAttachments } from "./attachments";
import { pendingCount, sync, type SyncResult } from "./engine";

export { sync, pendingCount, type SyncResult } from "./engine";
export { uploadPendingAttachments, signedUrlFor, storagePathFor } from "./attachments";

/**
 * Decides when to sync.
 *
 * Three triggers, all of them things that just made a sync likely to succeed or
 * likely to be wanted: the network came back, the app came to the foreground,
 * or a periodic tick while the app is open. There is no background task — the
 * app does not ask for one, and a driver's battery is not ours to spend.
 */

type Listener = (state: SyncStatus) => void;

export interface SyncStatus {
  syncing: boolean;
  online: boolean;
  pending: number;
  lastResult: SyncResult | null;
  lastError: string | null;
}

let status: SyncStatus = {
  syncing: false,
  online: true,
  pending: 0,
  lastResult: null,
  lastError: null,
};

const listeners = new Set<Listener>();

function emit(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

export function subscribeToSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export async function refreshPendingCount(): Promise<void> {
  emit({ pending: await pendingCount() });
}

/** Runs a sync, keeping the UI status in step. Never throws at the caller. */
export async function runSync(): Promise<SyncResult | null> {
  if (status.syncing) return null;
  emit({ syncing: true, lastError: null });
  try {
    const result = await sync();
    await uploadPendingAttachments();
    const pending = await pendingCount();
    emit({
      syncing: false,
      pending,
      lastResult: result,
      lastError: result.errors[0]?.message ?? null,
    });
    return result;
  } catch (error) {
    emit({ syncing: false, lastError: (error as Error).message });
    return null;
  }
}

let started = false;
let interval: ReturnType<typeof setInterval> | null = null;

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export function startSyncManager(): () => void {
  if (started) return () => undefined;
  started = true;

  const netSub = NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    const cameBack = online && !status.online;
    emit({ online });
    // A reconnect is the single best moment to flush the outbox.
    if (cameBack) void runSync();
  });

  const appSub = AppState.addEventListener("change", (next: AppStateStatus) => {
    if (next === "active" && status.online) void runSync();
  });

  interval = setInterval(() => {
    if (status.online && !status.syncing) void runSync();
  }, SYNC_INTERVAL_MS);

  void refreshPendingCount();
  void runSync();

  return () => {
    netSub();
    appSub.remove();
    if (interval) clearInterval(interval);
    interval = null;
    started = false;
  };
}
