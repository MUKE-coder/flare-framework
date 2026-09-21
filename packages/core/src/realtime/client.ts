/**
 * Flare Realtime client transport. A framework-agnostic reconnecting WebSocket
 * that speaks the `types.ts` wire protocol. `useRealtime` (react.ts) wraps it
 * for React; this class is usable directly in plain JS/TS and tests.
 */
import {
  DEFAULT_RECONNECT_POLICY,
  type RealtimeMember,
  type RealtimePresenceData,
  type RealtimeReconnectPolicy,
  type RealtimeServerFrame,
  type RealtimeStatus,
} from "./types.js";

export interface RealtimeClientOptions {
  /** Reconnect/keepalive tuning (see RealtimeReconnectPolicy). */
  reconnect?: RealtimeReconnectPolicy;
  /** Initial presence announced on `join`. */
  presence?: RealtimePresenceData;
}

type EventHandler = (payload: unknown, from?: string) => void;
type AnyHandler = (e: string, d: unknown, from?: string) => void;
type MembersHandler = (members: RealtimeMember[]) => void;
type StatusHandler = (status: RealtimeStatus) => void;

/** Close codes after which the server expects clients back right away. */
const SERVICE_RESTART = 1012;

function subscribe<T>(set: Set<T>, handler: T): () => void {
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

export class RealtimeClient {
  readonly channel: string;
  members: RealtimeMember[] = [];
  status: RealtimeStatus = "connecting";
  /** This connection's id, from the server's `hello` (new on every reconnect). */
  connectionId: string | null = null;

  private readonly url: string;
  private readonly policy: Required<RealtimeReconnectPolicy>;
  private presence: RealtimePresenceData;
  private ws: WebSocket | null = null;
  private attempt = 0;
  private explicitClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private deadTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongAt = 0;

  private readonly listeners = new Map<string, Set<EventHandler>>();
  private readonly anyHandlers = new Set<AnyHandler>();
  private readonly memberHandlers = new Set<MembersHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();

  /**
   * @param channel Channel name to join, e.g. `"deals"`.
   * @param opts.path Websocket endpoint (default `/realtime`); the URL is
   *          resolved against `location` in the browser, or the given
   *          `baseUrl`. Scheme is upgraded to `wss:` / `ws:` automatically.
   */
  constructor(channel: string, opts: RealtimeClientOptions & { path?: string; baseUrl?: string } = {}) {
    this.channel = channel;
    this.policy = { ...DEFAULT_RECONNECT_POLICY, ...opts.reconnect };
    this.presence = opts.presence ?? null;

    const path = opts.path ?? "/realtime";
    const base = opts.baseUrl ?? (typeof location !== "undefined" ? location.href : "http://localhost:8787/");
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${path.replace(/\/$/, "")}/${channel}/ws`;
    url.search = "";
    url.hash = "";
    this.url = url.toString();
  }

  /** Subscribe to one application event type. Returns an unsubscribe fn. */
  on(e: string, handler: EventHandler): () => void {
    let set = this.listeners.get(e);
    if (!set) {
      set = new Set();
      this.listeners.set(e, set);
    }
    return subscribe(set, handler);
  }

  /** Subscribe to every application event on the channel. */
  onAny(handler: AnyHandler): () => void {
    return subscribe(this.anyHandlers, handler);
  }

  /** Presence change notifications (full member list on every change). */
  onMembers(handler: MembersHandler): () => void {
    return subscribe(this.memberHandlers, handler);
  }

  onStatus(handler: StatusHandler): () => void {
    return subscribe(this.statusHandlers, handler);
  }

  /** Set presence for this connection; sends a `join` frame if already connected. */
  setPresence(presence: RealtimePresenceData): void {
    this.presence = presence;
    if (this.connected()) this.send({ t: "join", presence });
  }

  /** Broadcast an application event to every other member (needs a `send` grant). */
  publish(e: string, d: unknown): boolean {
    return this.send({ t: "send", e, d });
  }

  connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Connect and join; no-op if already connected or connecting. Resumes after close(). */
  connect(): this {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return this;
    }
    this.explicitClose = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.setStatus(this.attempt > 0 ? "reconnecting" : "connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.setStatus("dead");
      return this;
    }
    this.ws = ws;

    // Events from a socket this client has already replaced are ignored, so a late
    // close from an old socket can't tear down the heartbeat of the new one.
    ws.addEventListener("open", () => ws === this.ws && this.handleOpen());
    ws.addEventListener("message", (event) => ws === this.ws && this.handleMessage(String(event.data)));
    ws.addEventListener("close", (event) => ws === this.ws && this.handleClose(event));
    return this;
  }

  /** Close and stop reconnecting and keepalive, until connect() is called again. */
  close(): void {
    this.explicitClose = true;
    this.clearTimers();
    this.setStatus("closed");
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close(1000, "Client closed");
      } catch {
        // Already closed.
      }
    }
  }

  private send(frame: { t: "join" | "ping" | "send"; presence?: RealtimePresenceData; e?: string; d?: unknown }): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  private handleOpen(): void {
    if (this.deadTimer) clearTimeout(this.deadTimer);
    this.deadTimer = null;
    // Only a connection that stays up resets the backoff.
    this.stableTimer = setTimeout(() => {
      this.attempt = 0;
      this.stableTimer = null;
    }, this.policy.stableMs);
    this.send({ t: "join", presence: this.presence });
    this.startHeartbeat();
    this.setStatus("open");
  }

  private handleMessage(raw: string): void {
    let frame: RealtimeServerFrame;
    try {
      frame = JSON.parse(raw) as RealtimeServerFrame;
    } catch {
      return;
    }

    switch (frame.t) {
      case "hello":
        this.connectionId = frame.connectionId;
        this.setMembers(frame.members);
        break;
      case "presence":
        this.setMembers(frame.members);
        break;
      case "event":
        this.dispatch(frame.e, frame.d, frame.from);
        break;
      case "pong":
        this.lastPongAt = Date.now();
        break;
      case "error":
        // Server rejected a frame; the connection stays open.
        break;
    }
  }

  private setMembers(members: RealtimeMember[]): void {
    this.members = members;
    for (const handler of [...this.memberHandlers]) handler(members);
  }

  private dispatch(e: string, d: unknown, from?: string): void {
    for (const handler of [...this.anyHandlers]) handler(e, d, from);
    const set = this.listeners.get(e);
    if (!set) return;
    for (const handler of [...set]) handler(d, from);
  }

  private handleClose(event: { code?: number }): void {
    this.ws = null;
    this.clearHeartbeat();
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
    if (this.explicitClose) return;

    // 1012 "service restart": the server wants clients back soon, so skip the backoff.
    // 1013 "try again later" is an overload signal and backs off like anything else.
    if (event.code === SERVICE_RESTART) this.attempt = 0;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.policy.maxRetries > 0 && this.attempt >= this.policy.maxRetries) {
      this.setStatus("dead");
      return;
    }
    this.setStatus("reconnecting");

    if (!this.deadTimer && this.policy.deadAfterMs > 0) {
      this.deadTimer = setTimeout(() => {
        this.deadTimer = null;
        if (this.status === "reconnecting") this.setStatus("dead");
      }, this.policy.deadAfterMs);
    }

    const delay = this.nextDelay();
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Exponential backoff with jitter, never above maxDelayMs. */
  private nextDelay(): number {
    const base = this.policy.minDelayMs * Math.pow(this.policy.factor, Math.min(this.attempt, 16));
    const jitter = this.policy.jitterRatio > 0 ? (Math.random() * 2 - 1) * this.policy.jitterRatio : 0;
    return Math.max(0, Math.round(Math.min(base * (1 + jitter), this.policy.maxDelayMs)));
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    const interval = this.policy.heartbeatMs;
    if (interval <= 0) return;
    this.lastPongAt = Date.now();
    this.heartbeatInterval = setInterval(() => {
      if (!this.connected()) return;
      if (Date.now() - this.lastPongAt >= interval * 2) {
        // Silent connection: drop it; the close handler drives the reconnect.
        try {
          this.ws?.close(4000, "Heartbeat timeout");
        } catch {
          // Ignore.
        }
        return;
      }
      this.send({ t: "ping" });
    }, interval);
  }

  private clearTimers(): void {
    for (const timer of [this.reconnectTimer, this.deadTimer, this.stableTimer]) if (timer) clearTimeout(timer);
    this.reconnectTimer = null;
    this.deadTimer = null;
    this.stableTimer = null;
    this.clearHeartbeat();
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of [...this.statusHandlers]) handler(status);
  }
}

export type { RealtimeEvent, RealtimeMember, RealtimePresenceData, RealtimeStatus } from "./types.js";
