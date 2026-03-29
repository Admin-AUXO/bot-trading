"use client";

import { useSyncExternalStore } from "react";

export interface RealtimeSyncState {
  connected: boolean;
  lastMessageAt: number | null;
}

const listeners = new Set<() => void>();
let state: RealtimeSyncState = {
  connected: false,
  lastMessageAt: null,
};

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: RealtimeSyncState): void {
  if (next.connected === state.connected && next.lastMessageAt === state.lastMessageAt) {
    return;
  }

  state = next;
  emitChange();
}

export function noteRealtimeMessage(): void {
  setState({
    connected: true,
    lastMessageAt: Date.now(),
  });
}

export function markRealtimeDisconnected(): void {
  setState({
    ...state,
    connected: false,
  });
}

export function useRealtimeSyncState(): RealtimeSyncState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

export function isRealtimeHealthy(syncState: RealtimeSyncState, maxAgeMs: number = 15_000): boolean {
  return syncState.connected && syncState.lastMessageAt != null && Date.now() - syncState.lastMessageAt <= maxAgeMs;
}
