import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient } from "../src/realtime/client.js";

interface FakeHandlers {
  [k: string]: Array<(ev: unknown) => void>;
}

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  handlers: FakeHandlers = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.handlers[type] ??= []).push(cb);
  }

  emit(type: string, ev: Record<string, unknown> = {}): void {
    for (const cb of this.handlers[type] ?? []) cb.call(this, ev);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code, reason });
  }

  /** Simulate the server accepting the upgrade. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  frame(frame: unknown): void {
    this.emit("message", { data: JSON.stringify(frame) });
  }

  parsed(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const globals = globalThis as Record<string, unknown>;
const realWebSocket = globals.WebSocket;

function installFake(): void {
  FakeWebSocket.instances = [];
  globals.WebSocket = FakeWebSocket;
}

function client(policy: Record<string, number> = {}) {
  return new RealtimeClient("deals", {
    baseUrl: "http://example.test/",
    reconnect: { minDelayMs: 5, maxDelayMs: 200, factor: 2, jitterRatio: 0, ...policy },
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  if (typeof realWebSocket === "undefined") delete globals.WebSocket;
  else globals.WebSocket = realWebSocket;
});

describe("RealtimeClient", () => {
  it("constructs the channel URL and joins on open", () => {
    installFake();
    const c = client({ heartbeatMs: 0 });
    c.connect();
    const sock = FakeWebSocket.instances[0]!;
    expect(sock.url).toBe("ws://example.test/realtime/deals/ws");

    sock.open();
    expect(sock.parsed()).toContainEqual({ t: "join", presence: null });
    expect(c.status).toBe("open");
  });

  it("hydrates members from hello and forwards events", () => {
    installFake();
    const c = client({ heartbeatMs: 0 });
    const seen: Array<[string, unknown, string?]> = [];
    c.onAny((e, d, from) => seen.push([e, d, from]));
    const members = vi.fn();
    c.onMembers(members);

    c.connect();
    const sock = FakeWebSocket.instances[0]!;
    sock.open();
    sock.frame({
      t: "hello",
      connectionId: "c1",
      members: [{ connectionId: "c1", presence: { email: "a" } }],
    });
    const id = (c as unknown as { connectionId: string | null }).connectionId;
    expect(id).toBe("c1");
    expect(members).toHaveBeenCalledWith([{ connectionId: "c1", presence: { email: "a" } }]);
    expect(c.connected()).toBe(true);

    sock.frame({ t: "event", e: "deal.updated", d: { id: 7 }, from: "c2" });
    expect(seen).toEqual([["deal.updated", { id: 7 }, "c2"]]);
  });

  it("backs off exponentially and reconnects after a drop", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0 });
    c.connect();
    const first = FakeWebSocket.instances[0]!;
    first.open();

    // Network drop: the server side closes the socket.
    first.close(1001, "going away");
    expect(c.status).toBe("reconnecting");

    // After minDelayMs the client retries with the same channel.
    await timers.advanceTimersByTimeAsync(10);
    expect(FakeWebSocket.instances.length).toBe(2);
    const second = FakeWebSocket.instances[1]!;
    expect(second.url).toBe(first.url);
    second.open();
    expect(c.status).toBe("open");
    expect(second.parsed()).toContainEqual({ t: "join", presence: null });
  });

  it("skips the backoff after a service-restart close (1012)", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0 });
    c.connect();
    // Two failed upgrades build up the backoff (5ms, then 10ms)...
    FakeWebSocket.instances.at(-1)!.close(1006, "drop");
    await timers.advanceTimersByTimeAsync(5);
    FakeWebSocket.instances.at(-1)!.close(1006, "drop");
    await timers.advanceTimersByTimeAsync(10);
    expect(FakeWebSocket.instances.length).toBe(3);

    // ...but a 1012 from an open socket comes back at the minimum delay.
    FakeWebSocket.instances.at(-1)!.open();
    FakeWebSocket.instances.at(-1)!.close(1012, "restart");
    expect(c.status).toBe("reconnecting");
    await timers.advanceTimersByTimeAsync(5);
    expect(FakeWebSocket.instances.length).toBe(4);
  });

  it("keeps backing off after 1013 (try again later)", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0 });
    c.connect();
    FakeWebSocket.instances.at(-1)!.close(1006, "drop");
    await timers.advanceTimersByTimeAsync(5);
    FakeWebSocket.instances.at(-1)!.open();
    FakeWebSocket.instances.at(-1)!.close(1013, "overloaded");
    // Second attempt waits 10ms, not the 5ms minimum.
    await timers.advanceTimersByTimeAsync(5);
    expect(FakeWebSocket.instances.length).toBe(2);
    await timers.advanceTimersByTimeAsync(5);
    expect(FakeWebSocket.instances.length).toBe(3);
  });

  it("goes dead once consecutive connect failures reach maxRetries", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0, maxRetries: 2 });
    const seen: string[] = [];
    c.onStatus((s) => seen.push(s));

    c.connect();
    // Connections never open: the upgrade keeps failing, so no attempt reset.
    FakeWebSocket.instances.at(-1)!.close(1001, "drop");
    await timers.advanceTimersByTimeAsync(20);
    expect(FakeWebSocket.instances.length).toBe(2); // retry #1

    FakeWebSocket.instances.at(-1)!.close(1001, "drop");
    await timers.advanceTimersByTimeAsync(20);
    expect(FakeWebSocket.instances.length).toBe(3); // retry #2 (last allowed)

    FakeWebSocket.instances.at(-1)!.close(1001, "drop");
    await timers.advanceTimersByTimeAsync(20);
    expect(FakeWebSocket.instances.length).toBe(3); // no further socket
    expect(c.status).toBe("dead");
    expect(seen).toContain("dead");
  });

  it("force-reconnects when the server stops answering pongs (heartbeat)", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 15 });
    c.connect();
    const sock = FakeWebSocket.instances[0]!;
    sock.open();

    // Answer nothing; stale >= interval*2 (30ms) detaches the socket, then the
    // reconnect retries with a fresh upgrade within minDelayMs.
    await timers.advanceTimersByTimeAsync(100);
    expect(sock.readyState).toBe(FakeWebSocket.CLOSED);
    expect(c.status).toBe("reconnecting"); // a fresh upgrade is in flight
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it("stays open as long as pongs arrive", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 15 });
    c.connect();
    const sock = FakeWebSocket.instances[0]!;
    sock.open();

    for (let i = 0; i < 5; i++) {
      await timers.advanceTimersByTimeAsync(15);
      sock.frame({ t: "pong" });
    }
    expect(sock.readyState).toBe(FakeWebSocket.OPEN);
    expect(c.status).toBe("open");
  });

  it("does not reconnect after an explicit close()", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0 });
    c.connect();
    FakeWebSocket.instances[0]!.open();
    c.close();
    expect(c.status).toBe("closed");
    await timers.advanceTimersByTimeAsync(100);
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it("delivers to every subscriber, and unsubscribing one leaves the rest", () => {
    installFake();
    const c = client({ heartbeatMs: 0 });
    const a = vi.fn();
    const b = vi.fn();
    const offA = c.onAny(a);
    c.onAny(b);
    const membersA = vi.fn();
    const membersB = vi.fn();
    c.onMembers(membersA);
    const offMembersB = c.onMembers(membersB);
    c.connect();
    const sock = FakeWebSocket.instances[0]!;
    sock.open();

    sock.frame({ t: "event", e: "x", d: 1 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    offMembersB();
    sock.frame({ t: "event", e: "x", d: 2 });
    sock.frame({ t: "presence", members: [] });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(membersA).toHaveBeenCalledTimes(1);
    expect(membersB).not.toHaveBeenCalled();
  });

  it("does not reset the backoff for a connection that drops right after opening", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0, stableMs: 1000 });
    c.connect();
    // Accept-then-close three times (e.g. the server rejects the session after upgrade).
    for (const wait of [5, 10, 20]) {
      FakeWebSocket.instances.at(-1)!.open();
      FakeWebSocket.instances.at(-1)!.close(1011, "rejected");
      const before = FakeWebSocket.instances.length;
      await timers.advanceTimersByTimeAsync(wait - 1);
      expect(FakeWebSocket.instances.length).toBe(before);
      await timers.advanceTimersByTimeAsync(1);
      expect(FakeWebSocket.instances.length).toBe(before + 1);
    }
  });

  it("resets the backoff once a connection has stayed up for stableMs", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0, stableMs: 50 });
    c.connect();
    FakeWebSocket.instances.at(-1)!.close(1006, "drop");
    await timers.advanceTimersByTimeAsync(5);
    FakeWebSocket.instances.at(-1)!.close(1006, "drop");
    await timers.advanceTimersByTimeAsync(10);
    FakeWebSocket.instances.at(-1)!.open();
    await timers.advanceTimersByTimeAsync(50);
    FakeWebSocket.instances.at(-1)!.close(1006, "drop");
    const before = FakeWebSocket.instances.length;
    await timers.advanceTimersByTimeAsync(5);
    expect(FakeWebSocket.instances.length).toBe(before + 1);
  });

  it("reports dead again on a second outage after recovering", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0, deadAfterMs: 40, maxDelayMs: 1000 });
    c.connect();
    FakeWebSocket.instances.at(-1)!.open();

    FakeWebSocket.instances.at(-1)!.close(1006, "outage 1");
    await timers.advanceTimersByTimeAsync(20);
    FakeWebSocket.instances.at(-1)!.open(); // recovered before deadAfterMs
    await timers.advanceTimersByTimeAsync(100);
    expect(c.status).toBe("open");

    FakeWebSocket.instances.at(-1)!.close(1006, "outage 2");
    for (let i = 0; i < 10 && c.status !== "dead"; i++) {
      await timers.advanceTimersByTimeAsync(10);
      const last = FakeWebSocket.instances.at(-1)!;
      if (last.readyState === FakeWebSocket.CONNECTING) last.close(1006, "still down");
    }
    expect(c.status).toBe("dead");
  });

  it("ignores a late close from a socket it already replaced", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0 });
    c.connect();
    const first = FakeWebSocket.instances[0]!;
    first.open();
    first.close(1006, "drop");
    await timers.advanceTimersByTimeAsync(5);
    const second = FakeWebSocket.instances[1]!;
    second.open();

    first.emit("close", { code: 1006 }); // straggler from the old socket
    expect(c.status).toBe("open");
    await timers.advanceTimersByTimeAsync(100);
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it("reconnects again when connect() is called after close()", () => {
    installFake();
    const c = client({ heartbeatMs: 0 });
    c.connect();
    FakeWebSocket.instances[0]!.open();
    c.close();
    c.connect();
    expect(FakeWebSocket.instances.length).toBe(2);
    FakeWebSocket.instances[1]!.open();
    expect(c.status).toBe("open");
  });

  it("never waits longer than maxDelayMs, jitter included", async () => {
    installFake();
    const timers = vi.useFakeTimers();
    const c = client({ heartbeatMs: 0, minDelayMs: 100, maxDelayMs: 100, jitterRatio: 0.5 });
    const random = vi.spyOn(Math, "random").mockReturnValue(1); // largest positive jitter
    c.connect();
    FakeWebSocket.instances.at(-1)!.close(1006, "drop");
    await timers.advanceTimersByTimeAsync(100);
    expect(FakeWebSocket.instances.length).toBe(2);
    random.mockRestore();
  });
});