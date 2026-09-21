/**
 * Flare Realtime server primitive: one WebSocket-hibernatable Durable Object
 * per channel, providing broadcast (rooms) and presence.
 *
 * - One DO instance per channel name (`hubs.get(hubs.idFromName(channel))`).
 * - WebSocket Hibernation API: sockets, their tags, and per-socket attachment
 *   data survive hibernation; presence rebuilds from `state.getWebSockets()`
 *   with no durable storage dependency.
 * - Connectivity: the app's `worker/index.ts` intercepts `/realtime/<channel>/ws`
 *   upgrades and hands them to `handleRealtimeUpgrade`, which checks the Origin,
 *   asks the app's `authorize` hook, and routes to this DO.
 * - Server-driven publishes call `hub.publish(event, data)` on the DO stub
 *   from any app code that has access to the `FLARE_REALTIME` binding.
 *
 * Wire protocol lives in `types.ts`.
 *
 * @see https://developers.cloudflare.com/durable-objects/api/websockets/
 */
import { DurableObject } from "cloudflare:workers";
import type { HibernatableWebSocket } from "cloudflare:workers";
import { parseClientFrame, type RealtimeMember, type RealtimePresenceData } from "./types.js";

const MEMBER_TAG = "member";
const MAX_FRAME_CHARS = 1024 * 1024;
/** A client broadcast is relayed to every member, so keep it well under the frame limit. */
const MAX_SEND_CHARS = 64 * 1024;
/** Presence lives in the socket attachment, which the runtime caps at 2 KiB. */
const MAX_PRESENCE_CHARS = 1024;
const MAX_PRESENCE = 256;
/** Refuse new sockets past this many on one channel (each costs the DO memory and fan-out). */
const MAX_CONNECTIONS = 1000;

/**
 * Header the worker uses to hand an authorized connection's grant to the DO.
 * `handleRealtimeUpgrade` always strips any client-sent copy before setting it.
 */
const GRANT_HEADER = "x-flare-realtime-grant";

/** What an authorized connection may do beyond receiving events and presence. */
export interface RealtimeGrant {
  /** Allow `send` frames (client-to-client broadcast). Off unless granted. */
  send?: boolean;
}

/**
 * Decides whether a WebSocket upgrade may join `channel`. Return a grant to allow
 * it, or `false`/`null` to refuse (401). A Response is returned to the client as-is.
 */
export type RealtimeAuthorize = (
  request: Request,
  channel: string,
) => RealtimeGrant | false | null | Response | Promise<RealtimeGrant | false | null | Response>;

export interface RealtimeUpgradeOptions {
  /** Required: there is no default, so every app decides who may connect. */
  authorize: RealtimeAuthorize;
  /**
   * Origins allowed to open sockets besides the app's own. Browsers always send
   * Origin on WebSocket upgrades, so this is what blocks cross-site WebSocket hijacking.
   */
  allowedOrigins?: string[];
}

/**
 * `WebSocketPair` is a workerd *global* — it is deliberately not exported by
 * the `cloudflare:workers` module (matching @cloudflare/workers-types, which
 * declares it as a global const). Resolve it off `globalThis` so the bundle
 * needs no module import workerd would reject.
 */
function makeWebSocketPair(): { 0: HibernatableWebSocket; 1: HibernatableWebSocket } {
  const Ctor = (
    globalThis as unknown as {
      WebSocketPair?: new () => { 0: HibernatableWebSocket; 1: HibernatableWebSocket };
    }
  ).WebSocketPair;
  if (!Ctor) throw new Error("The WebSocketPair global is unavailable in this runtime.");
  return new Ctor();
}

/** Per-socket metadata, persisted by the hibernation API across hibernation. */
interface Attachment {
  connectionId: string;
  /** Join time, ms since epoch. */
  joinedAt: number;
  presence: RealtimePresenceData;
  /** Granted by the worker's authorize hook; see RealtimeGrant. */
  send: boolean;
}

function readGrant(request: Request): RealtimeGrant {
  try {
    const grant = JSON.parse(request.headers.get(GRANT_HEADER) ?? "null") as RealtimeGrant | null;
    return { send: grant?.send === true };
  } catch {
    return { send: false };
  }
}

function presenceFits(presence: RealtimePresenceData): boolean {
  try {
    return JSON.stringify(presence ?? null).length <= MAX_PRESENCE_CHARS;
  } catch {
    return false;
  }
}

/**
 * The subset of a `DurableObjectNamespace` the realtime primitive needs.
 * Structural so core's published d.ts stays independent of
 * `@cloudflare/workers-types`; any `DurableObjectNamespace<RealtimeChannel>`
 * binding (e.g. `env.FLARE_REALTIME`) satisfies it.
 */
export interface RealtimeChannelNamespace {
  idFromName(name: string): { toString(): string; equals(other: unknown): boolean; readonly name?: string; readonly jurisdiction?: string };
  get(id: { toString(): string; equals(other: unknown): boolean; readonly name?: string; readonly jurisdiction?: string }): unknown;
}

function asHibernatable(ws: WebSocket): HibernatableWebSocket {
  return ws as HibernatableWebSocket;
}

/**
 * The Durable Object backing one channel. Extend it only via composition in
 * the app's `worker/index.ts`; the class is exported for wrangler's `migrations`
 * block and app-side RPC typing.
 */
export class RealtimeChannel extends DurableObject {
  /** Upgrade path for `/realtime/<channel>/ws`, reached only through handleRealtimeUpgrade. */
  fetch(request: Request): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("This endpoint is for WebSocket upgrades.", { status: 426 });
    }
    if (this.ctx.getWebSockets(MEMBER_TAG).length >= MAX_CONNECTIONS) {
      return new Response("This channel is full.", { status: 503 });
    }

    const pair = makeWebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connectionId = crypto.randomUUID();
    const grant = readGrant(request);

    server.serializeAttachment(<Attachment>{ connectionId, joinedAt: Date.now(), presence: null, send: grant.send === true });
    this.ctx.acceptWebSocket(server, [MEMBER_TAG]);

    server.send(this.frame({ t: "hello", connectionId, members: this.members() }));
    this.announcePresence({ joined: { connectionId, presence: null } });

    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  /**
   * App-facing RPC: broadcast an application event to every live member.
   * Returns the number of sockets that accepted the frame.
   */
  publish(e: string, d: unknown): number {
    const frame = this.frame({ t: "event", e, d });
    let sent = 0;
    for (const ws of this.ctx.getWebSockets(MEMBER_TAG)) {
      try {
        ws.send(frame);
        sent += 1;
      } catch {
        // Socket died between enumeration and send; webSocketClose cleans up.
      }
    }
    return sent;
  }

  /** App-facing RPC: the channel's currently connected members. */
  presence(): RealtimeMember[] {
    return this.members();
  }

  /** RPC for server logic that knows a connectionId. Returns false if not found or too large. */
  setPresence(connectionId: string, presence: RealtimePresenceData): boolean {
    if (!presenceFits(presence)) return false;
    for (const ws of this.ctx.getWebSockets(MEMBER_TAG)) {
      const attachment = ws.deserializeAttachment<Attachment>();
      if (attachment.connectionId === connectionId) {
        ws.serializeAttachment({ ...attachment, presence });
        this.announcePresence({ joined: { connectionId, presence } });
        return true;
      }
    }
    return false;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const hij = asHibernatable(ws);
    if (message.length > MAX_FRAME_CHARS) {
      hij.send(this.frame({ t: "error", code: "too_large", message: "Frame exceeds 1 MiB." }));
      return;
    }

    const attachment = hij.deserializeAttachment<Attachment>();
    const parsed = parseClientFrame(message);
    if (!parsed.ok) {
      hij.send(this.frame({ t: "error", code: "bad_frame", message: parsed.reason }));
      return;
    }
    const frame = parsed.frame;

    if (frame.t === "join") {
      const presence = frame.presence ?? null;
      if (!presenceFits(presence)) {
        hij.send(this.frame({ t: "error", code: "presence_too_large", message: `Presence must serialize to at most ${MAX_PRESENCE_CHARS} characters.` }));
        return;
      }
      hij.serializeAttachment({ ...attachment, presence });
      this.announcePresence({ joined: { connectionId: attachment.connectionId, presence } });
    } else if (frame.t === "ping") {
      hij.send(this.frame({ t: "pong" }));
    } else if (frame.t === "send") {
      if (!attachment.send) {
        hij.send(this.frame({ t: "error", code: "forbidden", message: "This connection may not broadcast on this channel." }));
        return;
      }
      if (message.length > MAX_SEND_CHARS) {
        hij.send(this.frame({ t: "error", code: "too_large", message: `Broadcasts are limited to ${MAX_SEND_CHARS / 1024} KiB.` }));
        return;
      }
      const eventFrame = this.frame({ t: "event", e: frame.e, d: frame.d, from: attachment.connectionId });
      for (const other of this.ctx.getWebSockets(MEMBER_TAG)) {
        if (other === hij) continue;
        try {
          other.send(eventFrame);
        } catch {
          // Swallow; close handling reconciles presence.
        }
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    const attachment = asHibernatable(ws).deserializeAttachment<Attachment>();
    if (attachment?.connectionId) {
      // The closing socket can still be listed by getWebSockets() inside this handler.
      this.announcePresence({ left: attachment.connectionId }, ws);
    }
    try {
      // Complete the closing handshake (a no-op where the runtime auto-replies).
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // Already closed.
    }
  }

  webSocketError(ws: WebSocket): void {
    // Closely followed by webSocketClose; presence reconciliation happens there.
    void ws;
  }

  private members(exclude?: WebSocket): RealtimeMember[] {
    return this.ctx
      .getWebSockets(MEMBER_TAG)
      .filter((ws) => ws !== exclude)
      .map((ws) => {
        const attachment = ws.deserializeAttachment<Attachment>();
        return { connectionId: attachment.connectionId, presence: attachment.presence } satisfies RealtimeMember;
      })
      .slice(0, MAX_PRESENCE);
  }

  private announcePresence(change: { joined?: RealtimeMember; left?: string }, exclude?: WebSocket): void {
    const frame = this.frame({ t: "presence", members: this.members(exclude), ...change });
    for (const ws of this.ctx.getWebSockets(MEMBER_TAG)) {
      if (ws === exclude) continue;
      try {
        ws.send(frame);
      } catch {
        // Swallow; a closed socket is reconciled by webSocketClose.
      }
    }
  }

  private frame(frame: RealtimeServerFrameValue): string {
    try {
      return JSON.stringify(frame);
    } catch {
      return '{"t":"error","code":"serialize","message":"Serialization failure"}';
    }
  }
}

type RealtimeServerFrameValue =
  | { t: "hello"; connectionId: string; members: RealtimeMember[] }
  | { t: "presence"; members: RealtimeMember[]; joined?: RealtimeMember; left?: string }
  | { t: "event"; e: string; d: unknown; from?: string }
  | { t: "pong" }
  | { t: "error"; code?: string; message: string };

/**
 * Route a WebSocket upgrade for `/realtime/<channel>/ws` to the channel's DO,
 * after checking the Origin and asking `options.authorize` whether this request
 * may join. Returns `undefined` for any other path so the caller falls through
 * to the app handler.
 *
 * ```ts
 * // worker/index.ts
 * const realtime = await handleRealtimeUpgrade(request, env.FLARE_REALTIME, { authorize: authorizeRealtime });
 * if (realtime) return realtime;
 * return app.fetch(request, env, ctx);
 * ```
 */
export async function handleRealtimeUpgrade(
  request: Request,
  namespace: RealtimeChannelNamespace,
  options: RealtimeUpgradeOptions,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const match = /^\/realtime\/([^/]+)\/ws\/?$/.exec(url.pathname);
  if (!match) return undefined;

  const channel = match[1] ?? "";
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(channel)) {
    return new Response("Invalid channel name.", { status: 400 });
  }

  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("This endpoint expects a WebSocket upgrade.", { status: 426 });
  }

  // Cookies ride along on cross-site WebSocket upgrades, so a foreign page could
  // otherwise connect as the signed-in user.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== url.origin && !(options.allowedOrigins ?? []).includes(origin)) {
    return new Response("Cross-origin WebSocket upgrade refused.", { status: 403 });
  }

  const decision = await options.authorize(request, channel);
  if (decision instanceof Response) return decision;
  if (!decision) return new Response("Not allowed to join this channel.", { status: 401 });

  const forwarded = new Request(request);
  forwarded.headers.delete(GRANT_HEADER);
  forwarded.headers.set(GRANT_HEADER, JSON.stringify({ send: decision.send === true } satisfies RealtimeGrant));
  return (namespace.get(namespace.idFromName(channel)) as RealtimeChannel).fetch(forwarded);
}

/**
 * Resolve a channel hub (DO stub) for app-driven publish/presence calls.
 *
 * ```ts
 * await realtimeHub(env.FLARE_REALTIME, "deals").publish("deal.stage", { id, stage });
 * ```
 */
export function realtimeHub(namespace: RealtimeChannelNamespace, channel: string): RealtimeChannel {
  return namespace.get(namespace.idFromName(channel)) as RealtimeChannel;
}

export type { RealtimeMember, RealtimePresenceData } from "./types.js";
