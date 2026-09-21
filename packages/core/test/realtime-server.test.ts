import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRealtimeUpgrade, RealtimeChannel, type RealtimeChannelNamespace } from "../src/realtime/server.js";

/** Server half of a WebSocketPair, with the hibernation API's attachment methods. */
class FakeSocket {
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private attachment: unknown = null;
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  serializeAttachment(value: unknown) {
    if (JSON.stringify(value).length > 2048) throw new Error("attachment exceeds 2048 bytes");
    this.attachment = structuredClone(value);
  }
  deserializeAttachment<T>(): T {
    return structuredClone(this.attachment) as T;
  }
  frames(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw));
  }
  last(): Record<string, unknown> | undefined {
    return this.frames().at(-1);
  }
}

/** DurableObjectState subset the channel uses. */
class FakeState {
  sockets: FakeSocket[] = [];
  acceptWebSocket(ws: FakeSocket) {
    this.sockets.push(ws);
  }
  getWebSockets() {
    return [...this.sockets];
  }
}

let serverSockets: FakeSocket[] = [];
class FakePair {
  0 = new FakeSocket();
  1 = new FakeSocket();
  constructor() {
    serverSockets.push(this[1]);
  }
}

/** Node's Response refuses status 101; the channel's upgrade response needs it. */
class UpgradeResponse extends Response {
  private readonly upgradeStatus?: number;
  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init?.status === 101 ? { ...init, status: 200 } : init);
    if (init?.status === 101) this.upgradeStatus = 101;
  }
  override get status() {
    return this.upgradeStatus ?? super.status;
  }
}

beforeEach(() => {
  serverSockets = [];
  vi.stubGlobal("WebSocketPair", FakePair);
  vi.stubGlobal("Response", UpgradeResponse);
});
afterEach(() => vi.unstubAllGlobals());

function channel() {
  const state = new FakeState();
  // The real DurableObject constructor is protected; the runtime constructs DOs.
  const hub = new (RealtimeChannel as unknown as new (ctx: unknown, env: unknown) => RealtimeChannel)(state, {});
  return { hub, state };
}

const upgrade = (grant?: object) =>
  new Request("https://app.test/realtime/deals/ws", {
    headers: { upgrade: "websocket", ...(grant ? { "x-flare-realtime-grant": JSON.stringify(grant) } : {}) },
  });

/** Connect a socket through the channel's own fetch, as the worker would. */
function join(hub: RealtimeChannel, grant?: object): FakeSocket {
  const response = hub.fetch(upgrade(grant));
  expect(response.status).toBe(101);
  return serverSockets.at(-1)!;
}

const message = (hub: RealtimeChannel, ws: FakeSocket, frame: unknown) =>
  hub.webSocketMessage(ws as unknown as WebSocket, typeof frame === "string" ? frame : JSON.stringify(frame));

describe("RealtimeChannel", () => {
  it("greets a new member and tells everyone who joined", () => {
    const { hub } = channel();
    const a = join(hub);
    const b = join(hub);
    expect(b.frames()[0]).toMatchObject({ t: "hello", members: [{ presence: null }, { presence: null }] });
    expect(a.last()).toMatchObject({ t: "presence", joined: { connectionId: b.frames()[0]!.connectionId } });
  });

  it("refuses browser broadcasts unless the worker granted send", async () => {
    const { hub } = channel();
    const reader = join(hub);
    const viewer = join(hub); // no grant header: receive-only
    const forged = join(hub, { send: "yes" }); // only a literal true counts

    await message(hub, viewer, { t: "send", e: "deal.updated", d: { id: 1 } });
    await message(hub, forged, { t: "send", e: "deal.updated", d: { id: 1 } });
    expect(viewer.last()).toMatchObject({ t: "error", code: "forbidden" });
    expect(forged.last()).toMatchObject({ t: "error", code: "forbidden" });
    expect(reader.frames().some((frame) => frame.t === "event")).toBe(false);

    const poster = join(hub, { send: true });
    await message(hub, poster, { t: "send", e: "note", d: "hi" });
    expect(reader.last()).toMatchObject({ t: "event", e: "note", d: "hi", from: expect.any(String) });
  });

  it("caps broadcast size and presence size", async () => {
    const { hub } = channel();
    const poster = join(hub, { send: true });
    await message(hub, poster, { t: "send", e: "big", d: "x".repeat(70 * 1024) });
    expect(poster.last()).toMatchObject({ t: "error", code: "too_large" });

    await message(hub, poster, { t: "join", presence: { bio: "x".repeat(1500) } });
    expect(poster.last()).toMatchObject({ t: "error", code: "presence_too_large" });
    // Presence that fits is stored and survives a round trip through the attachment.
    await message(hub, poster, { t: "join", presence: { email: "a@b.co" } });
    expect(hub.presence()[0]).toMatchObject({ presence: { email: "a@b.co" } });
  });

  it("rejects malformed frames without closing the socket", async () => {
    const { hub } = channel();
    const ws = join(hub);
    await message(hub, ws, "not json");
    expect(ws.last()).toMatchObject({ t: "error", code: "bad_frame" });
    await message(hub, ws, { t: "ping" });
    expect(ws.last()).toEqual({ t: "pong" });
    expect(ws.closed).toBeNull();
  });

  it("leaves the closing member out of the roster it announces", () => {
    const { hub, state } = channel();
    const a = join(hub);
    const b = join(hub);
    const bId = b.frames()[0]!.connectionId;

    // The runtime can still list the closing socket inside webSocketClose.
    hub.webSocketClose(b as unknown as WebSocket, 1001, "bye");
    expect(a.last()).toMatchObject({ t: "presence", left: bId });
    expect((a.last()!.members as unknown[]).length).toBe(1);
    expect(b.closed).toEqual({ code: 1001, reason: "bye" });
    expect(state.sockets.length).toBe(2);
  });

  it("publishes server events to every member", () => {
    const { hub } = channel();
    const a = join(hub);
    const b = join(hub);
    expect(hub.publish("deal.updated", { id: 7 })).toBe(2);
    for (const ws of [a, b]) expect(ws.last()).toEqual({ t: "event", e: "deal.updated", d: { id: 7 } });
  });

  it("refuses new connections when the channel is full", () => {
    const { hub, state } = channel();
    state.sockets = Array.from({ length: 1000 }, () => new FakeSocket());
    expect(hub.fetch(upgrade()).status).toBe(503);
  });
});

describe("handleRealtimeUpgrade", () => {
  function namespace() {
    const seen: Request[] = [];
    const ns: RealtimeChannelNamespace = {
      idFromName: (name) => ({ toString: () => name, equals: () => false, name }),
      get: () => ({ fetch: (request: Request) => (seen.push(request), new Response("ok")) }),
    };
    return { ns, seen };
  }
  const ws = (path = "/realtime/deals/ws", headers: Record<string, string> = {}) =>
    new Request(`https://app.test${path}`, { headers: { upgrade: "websocket", ...headers } });

  it("ignores other paths so the app handles them", async () => {
    const { ns } = namespace();
    expect(await handleRealtimeUpgrade(new Request("https://app.test/admin"), ns, { authorize: () => ({}) })).toBeUndefined();
  });

  it("asks authorize and refuses when it says no", async () => {
    const { ns, seen } = namespace();
    const authorize = vi.fn(() => false as const);
    const response = await handleRealtimeUpgrade(ws(), ns, { authorize });
    expect(response!.status).toBe(401);
    expect(authorize).toHaveBeenCalledWith(expect.any(Request), "deals");
    expect(seen).toHaveLength(0);
  });

  it("refuses cross-site origins before authorizing", async () => {
    const { ns, seen } = namespace();
    const authorize = vi.fn(() => ({ send: true }));
    const response = await handleRealtimeUpgrade(ws("/realtime/deals/ws", { origin: "https://evil.test" }), ns, { authorize });
    expect(response!.status).toBe(403);
    expect(authorize).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);

    const allowed = await handleRealtimeUpgrade(ws("/realtime/deals/ws", { origin: "https://admin.test" }), ns, {
      authorize,
      allowedOrigins: ["https://admin.test"],
    });
    expect(allowed!.status).toBe(200);
  });

  it("replaces any client-sent grant with the one authorize returned", async () => {
    const { ns, seen } = namespace();
    const forged = ws("/realtime/deals/ws", { origin: "https://app.test", "x-flare-realtime-grant": '{"send":true}' });
    await handleRealtimeUpgrade(forged, ns, { authorize: () => ({}) });
    expect(seen[0]!.headers.get("x-flare-realtime-grant")).toBe('{"send":false}');
  });

  it("validates the channel name and the upgrade header", async () => {
    const { ns } = namespace();
    const authorize = () => ({});
    expect((await handleRealtimeUpgrade(ws("/realtime/bad%20name/ws"), ns, { authorize }))!.status).toBe(400);
    const plain = new Request("https://app.test/realtime/deals/ws");
    expect((await handleRealtimeUpgrade(plain, ns, { authorize }))!.status).toBe(426);
  });
});
