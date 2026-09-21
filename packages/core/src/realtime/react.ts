"use client";

/**
 * useRealtime(channel) — React hook over RealtimeClient.
 *
 * One WebSocket per channel (and path) is shared across every component using
 * this hook (reference-counted registry), so an admin dashboard with several
 * widgets on one channel opens a single socket. The first component to open a
 * channel chooses its reconnect policy.
 *
 * Reconnect behavior: automatic with exponential backoff + jitter (default
 * 1s→30s, capped), status `"dead"` after 120s without reconnecting, and a
 * keepalive ping every 30s that reconnects a socket that stops answering.
 * Nothing connects during server rendering.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RealtimeClient } from "./client.js";
import type { RealtimeMember, RealtimePresenceData, RealtimeReconnectPolicy, RealtimeStatus } from "./types.js";

export interface UseRealtimeOptions {
  /** Presence announced on join, and re-sent whenever its value changes. `null` clears it. */
  presence?: RealtimePresenceData;
  /** Reconnect/keepalive tuning (see RealtimeReconnectPolicy). */
  reconnect?: RealtimeReconnectPolicy;
  /** Channel endpoint path if the app mounted realtime elsewhere (default /realtime). */
  path?: string;
  /** Connect immediately on mount (default true). Set false to defer. */
  autoConnect?: boolean;
  /** Called for every application event received on the channel. */
  onEvent?: (e: string, d: unknown, from?: string) => void;
}

export interface UseRealtimeResult {
  /** Lifecycle: connecting | open | reconnecting | dead | closed. */
  status: RealtimeStatus;
  /** Currently connected members (id + presence). */
  members: RealtimeMember[];
  /** Broadcast an app event to every other member (needs a `send` grant from the server). */
  publish: (e: string, d: unknown) => boolean;
  /** True when the underlying socket is open. */
  connected: boolean;
  /** Connect (with autoConnect: false), or resume after close(). */
  connect: () => void;
  /** Close the channel's shared socket for every component using it. */
  close: () => void;
  /** Update this connection's presence. */
  setPresence: (presence: RealtimePresenceData) => void;
}

interface SharedChannel {
  client: RealtimeClient;
  refs: number;
}

const registry = new Map<string, SharedChannel>();

function acquire(key: string, channel: string, opts: { reconnect?: RealtimeReconnectPolicy; path?: string }): RealtimeClient {
  const existing = registry.get(key);
  if (existing) {
    existing.refs += 1;
    return existing.client;
  }
  const client = new RealtimeClient(channel, { reconnect: opts.reconnect, path: opts.path });
  registry.set(key, { client, refs: 1 });
  return client;
}

function release(key: string): void {
  const entry = registry.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    entry.client.close();
    registry.delete(key);
  }
}

type Snapshot = { status: RealtimeStatus; members: RealtimeMember[] };
const SERVER_SNAPSHOT: Snapshot = { status: "connecting", members: [] };
const noopUnsubscribe = () => {};

export function useRealtime(channel: string, opts: UseRealtimeOptions = {}): UseRealtimeResult {
  const { presence, reconnect, path, autoConnect = true, onEvent } = opts;
  const key = `${path ?? "/realtime"}|${channel}`;

  // Acquire and release in one effect: StrictMode's mount/unmount/mount and
  // discarded renders stay balanced, and nothing runs during server rendering.
  const [client, setClient] = useState<RealtimeClient | null>(null);
  const reconnectRef = useRef(reconnect);
  reconnectRef.current = reconnect;
  useEffect(() => {
    const acquired = acquire(key, channel, { reconnect: reconnectRef.current, path });
    setClient(acquired);
    if (autoConnect) acquired.connect();
    return () => {
      release(key);
      setClient(null);
    };
  }, [key, channel, path, autoConnect]);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  useEffect(() => client?.onAny((e, d, from) => onEventRef.current?.(e, d, from)), [client]);

  // Re-send presence only when its value changes, not on every render of an inline object.
  const presenceKey = presence === undefined ? undefined : JSON.stringify(presence);
  useEffect(() => {
    if (!client || presenceKey === undefined) return;
    client.setPresence(JSON.parse(presenceKey) as RealtimePresenceData);
  }, [client, presenceKey]);

  const cache = useRef<{ client: RealtimeClient; value: Snapshot } | null>(null);
  const getSnapshot = (): Snapshot => {
    if (!client) return SERVER_SNAPSHOT;
    const cached = cache.current;
    if (cached && cached.client === client && cached.value.status === client.status && cached.value.members === client.members) {
      return cached.value;
    }
    const value = { status: client.status, members: client.members };
    cache.current = { client, value };
    return value;
  };
  const subscribe = useMemo(
    () => (notify: () => void) => {
      if (!client) return noopUnsubscribe;
      const offStatus = client.onStatus(notify);
      const offMembers = client.onMembers(notify);
      return () => {
        offStatus();
        offMembers();
      };
    },
    [client],
  );
  const { status, members } = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  return useMemo(
    () => ({
      status,
      members,
      connected: status === "open",
      publish: (e: string, d: unknown) => client?.publish(e, d) ?? false,
      connect: () => void client?.connect(),
      close: () => client?.close(),
      setPresence: (next: RealtimePresenceData) => client?.setPresence(next),
    }),
    [client, status, members],
  );
}

export { RealtimeClient } from "./client.js";
export type { RealtimeMember, RealtimePresenceData, RealtimeReconnectPolicy, RealtimeStatus } from "./types.js";
