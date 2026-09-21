/**
 * Wire protocol shared by the server (RealtimeChannel DO), the framework's
 * non-React client, and the useRealtime hook.
 *
 * All frames are single JSON text messages. There is no binary path and no
 * message exceeding 1 MiB. Unknown message types are ignored server-side.
 */

/** Arbitrary application metadata a connection can attach to its presence. */
export type RealtimePresenceData = Record<string, unknown> | null;

/** One connected member, as announced in `hello` and `presence` frames. */
export interface RealtimeMember {
  /** Server-assigned id for this connection (unique within the channel). */
  connectionId: string;
  presence: RealtimePresenceData;
}

/** Frames sent by the server to a client. */
export type RealtimeServerFrame =
  /** Sent immediately after the upgrade; the channel's current members. */
  | { t: "hello"; connectionId: string; members: RealtimeMember[] }
  /** Presence changed: a member joined or left, and the full current list. */
  | { t: "presence"; members: RealtimeMember[]; joined?: RealtimeMember; left?: string }
  /** An application event broadcast on the channel (`send` / `publish`). */
  | { t: "event"; e: string; d: unknown; from?: string }
  /** Reply to a client `ping` (connectivity / keepalive). */
  | { t: "pong" }
  /** The server refused the message; the connection stays open. */
  | { t: "error"; code?: string; message: string };

/** Frames a client may send to the server. */
export type RealtimeClientFrame =
  /** Attach/refresh presence before broadcasting; must come first if used. */
  | { t: "join"; presence?: RealtimePresenceData }
  /** Liveness probe; the server replies with `pong`. */
  | { t: "ping" }
  /** Broadcast an application event to every other member of the channel. */
  | { t: "send"; e: string; d: unknown };

/** Reconnect policy for the client, with sane server-friendly defaults. */
export interface RealtimeReconnectPolicy {
  /**
   * Delay before the first reconnect after a drop. Doubled on every failed
   * attempt (with optional jitter) up to `maxDelayMs`. Reset after the socket
   * has stayed open for `stableMs`.
   */
  minDelayMs?: number;
  /** Hard cap on any single reconnect delay. */
  maxDelayMs?: number;
  /** Exponential multiplier: delay * factor per attempt. */
  factor?: number;
  /** Add up to ±jitterRatio*delay of randomness to avoid thundering herds. */
  jitterRatio?: number;
  /** Give up reconnecting after this many failed attempts (0 = never). */
  maxRetries?: number;
  /**
   * How long to attempt reconnecting without user interaction before the hook
   * reports `status: "dead"` instead of `"reconnecting"`.
   */
  deadAfterMs?: number;
  /** Send a keepalive ping every `heartbeatMs`; force-reconnect after two intervals without a pong. */
  heartbeatMs?: number;
  /**
   * How long a socket must stay open before the backoff resets. A server that
   * accepts and immediately closes (an auth reject, a crashing DO) keeps backing
   * off instead of reconnecting at `minDelayMs` forever.
   */
  stableMs?: number;
}

export const DEFAULT_RECONNECT_POLICY: Required<RealtimeReconnectPolicy> = {
  minDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  jitterRatio: 0.2,
  maxRetries: 0,
  deadAfterMs: 120_000,
  heartbeatMs: 30_000,
  stableMs: 10_000,
};

/** Client connection lifecycle, as surfaced by useRealtime and RealtimeClient. */
export type RealtimeStatus = "connecting" | "open" | "reconnecting" | "dead" | "closed";

export interface RealtimeEvent {
  e: string;
  d: unknown;
  from?: string;
}

/** Validate a client frame; returns { ok: false; reason } or { ok: true; frame }. */
export function parseClientFrame(raw: string): { ok: true; frame: RealtimeClientFrame } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "Not valid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "Frame must be an object." };
  const frame = parsed as Partial<RealtimeClientFrame>;
  if (frame.t === "join") {
    if (frame.presence !== undefined && (typeof frame.presence !== "object" || frame.presence === null)) {
      return { ok: false, reason: "presence must be an object." };
    }
    return { ok: true, frame: { t: "join", presence: frame.presence as RealtimePresenceData } };
  }
  if (frame.t === "ping") return { ok: true, frame: { t: "ping" } };
  if (frame.t === "send") {
    if (typeof frame.e !== "string" || frame.e.length === 0 || frame.e.length > 128) {
      return { ok: false, reason: "send.e must be a string of up to 128 characters." };
    }
    return { ok: true, frame: { t: "send", e: frame.e, d: frame.d } };
  }
  return { ok: false, reason: `Unknown frame type "${String(frame.t)}".` };
}