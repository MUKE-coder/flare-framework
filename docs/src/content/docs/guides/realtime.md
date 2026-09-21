---
title: Realtime
description: "Live channels on Durable Objects: server publishes, presence, per-channel authorization and automatic reconnection."
---

Flare's realtime primitive gives you live channels with presence, backed by
one Durable Object per channel. It uses the WebSocket Hibernation API: each
connection's presence lives in its socket attachment, so it survives the
Durable Object hibernating and the roster is rebuilt from
`ctx.getWebSockets()` without any durable storage.

Every new app is wired for it:

- `worker/index.ts` is the custom worker entrypoint. It exports the
  `RealtimeChannel` Durable Object class and hands `/realtime/<channel>/ws`
  upgrades to `handleRealtimeUpgrade`.
- `wrangler.jsonc` declares the `FLARE_REALTIME` Durable Object binding and
  its migration.
- `lib/realtime.ts` holds `authorizeRealtime` (who may join which channel)
  and `realtimeChannel(name)` (publish from server code).

The demo ships a working live deal board at `/admin/realtime`.

## Imports

| Where | Import from |
| --- | --- |
| Worker / server code (`handleRealtimeUpgrade`, `realtimeHub`, `RealtimeChannel`, types) | `@flaredev/core/realtime/server` |
| React hook (`useRealtime`) | `@flaredev/core/react` |
| Plain JS client (`RealtimeClient`), no React | `@flaredev/core/realtime` |

Realtime is **not** exported from `@flaredev/core/server`.

## Who may connect

`handleRealtimeUpgrade(request, namespace, { authorize, allowedOrigins? })`
is async and **requires** an `authorize(request, channel)` hook; there is no
default. For each upgrade it:

1. Returns `undefined` for paths other than `/realtime/<channel>/ws`, so the
   worker falls through to the app. Channel names are `[A-Za-z0-9._-]`,
   1-128 characters (anything else gets 400).
2. Refuses cross-site upgrades with **403** before `authorize` runs. A
   request with an `Origin` header must match the app's own origin or be
   listed in `allowedOrigins`. (Cookies ride along on cross-site WebSocket
   upgrades, so this is what stops another site connecting as your user.)
3. Calls `authorize(request, channel)`. It returns:
   - a grant, `{ send?: boolean }`, to admit the connection;
   - `false` or `null` to refuse with **401**;
   - a `Response`, which is returned to the client as-is.
4. Strips any client-sent `x-flare-realtime-grant` header, sets it from the
   grant, and forwards the upgrade to the channel's Durable Object.

An admitted connection always receives events and presence. It may
broadcast from the browser only if its grant has `send: true`.

### The default policy

The template's `lib/realtime.ts`:

```ts
export const authorizeRealtime: RealtimeAuthorize = async (request) => {
  // disableRefresh: this runs outside a Next request, where refreshing the
  // session cookie has nowhere to write it.
  const session = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } });
  if (!session) return false;
  return { send: false };
};
```

Any signed-in user may join any channel and receive; nobody may broadcast
from the browser. Server code publishes with
`realtimeChannel(name).publish(event, data)`.

Tighten it per channel as your app needs, for example:

```ts
if (channel === "deals" && !["admin", "staff"].includes(role ?? "")) return false;
if (channel === `user-${session.user.id}`) return { send: true };
```

The demo admits only the `deals` channel, only for `admin` and `staff`, and
grants them `send: true`; every other channel is refused.

## Publish from the server

Route handlers, server actions and cron jobs reach a channel through the
`FLARE_REALTIME` binding, wrapped by `lib/realtime.ts`:

```ts
import { realtimeChannel } from "@/lib/realtime";

// After a deal changes:
const recipients = await realtimeChannel("deals").publish("deal.updated", { id, title });
```

This is an RPC to the Durable Object, so **await it**. It returns the number
of live sockets the frame was sent to. `realtimeChannel(name).presence()`
returns the current members.

## Connect from a component

```tsx
"use client";

import { useRealtime } from "@flaredev/core/react";

export function DealFeed({ email }: { email: string }) {
  const { status, members } = useRealtime("deals", {
    presence: { email },
    onEvent: (event, data, from) => {
      if (from === undefined) {
        // Sent by server code: trust it as much as you trust your server.
      }
    },
  });

  return <pre>{status} {JSON.stringify(members, null, 2)}</pre>;
}
```

`useRealtime(channel, opts)` returns:

- `status`: `"connecting" | "open" | "reconnecting" | "dead" | "closed"`.
- `connected`: shorthand for `status === "open"`.
- `members`: `{ connectionId, presence }[]`, updated on every join, leave and
  presence change.
- `publish(event, data)`: broadcast to every *other* member. Needs a `send`
  grant; returns `false` when the socket is not open.
- `setPresence(presence)`: update this connection's presence.
- `connect()`: connect (with `autoConnect: false`), or resume after `close()`.
- `close()`: close the channel's shared socket for **every** component using
  that channel.

Options: `presence`, `onEvent(event, data, from)`, `reconnect` (see below),
`path` (default `/realtime`), `autoConnect` (default `true`).

How the hook behaves:

- **One shared socket** per channel and path. Components using the same
  channel share one reference-counted connection (and one presence entry);
  the socket closes when the last one unmounts. The first component to open
  a channel chooses its reconnect policy.
- The socket is acquired in an effect, so **nothing connects during SSR**.
- Presence is re-sent only when its **value** changes, not on every render of
  an inline object. `null` clears it.

### Trust decisions: use `from`, not the event name

Events broadcast by a client carry `from` (the sender's `connectionId`).
Events published by server code have no `from`. Any client with a `send`
grant can choose any event name, so decide what to trust by checking
`from`, not by the event name.

A `send` from a connection without the grant is not relayed; that client
gets `{"t":"error","code":"forbidden",...}` and stays connected.

## Presence

`members` is the channel's connected roster. On connect the client sends a
`join` frame with its presence; `setPresence` re-sends it.

- Presence survives Durable Object **hibernation**, because it lives in the
  socket attachments.
- After a real connection drop or a Durable Object restart, clients
  reconnect with a **new** `connectionId`, re-join with their presence, and
  the roster is rebuilt.

This is covered by `scripts/e2e-realtime-resilience.mjs`: it kills the
whole server process tree, restarts it, and checks that both browser tabs
reconnect on their own, presence is rebuilt, and a server publish reaches
both.

## Limits

| Limit | Value |
| --- | --- |
| Any client frame | 1 MiB |
| A client broadcast (`send`) | 64 KiB |
| Presence, serialized | 1024 characters |
| Connections per channel | 1000 (further upgrades get **503**) |
| Members listed in a presence roster | 256 |

Oversized frames and presence get an `error` frame; the connection stays
open.

## Reconnection and keepalive

The client reconnects automatically. Defaults (`RealtimeReconnectPolicy`):

| Option | Default | Meaning |
| --- | --- | --- |
| `minDelayMs` | 1000 | First retry delay |
| `factor` | 2 | Delay multiplier per failed attempt |
| `maxDelayMs` | 30000 | Cap on any delay |
| `jitterRatio` | 0.2 | ±20% randomness, applied inside the cap |
| `stableMs` | 10000 | The socket must stay open this long before the backoff resets |
| `heartbeatMs` | 30000 | Ping interval; a socket with no `pong` for two intervals is closed and reconnected |
| `deadAfterMs` | 120000 | Report `"dead"` after this long without reconnecting |
| `maxRetries` | 0 | 0 = never give up |

- Because the backoff only resets after `stableMs`, a server that accepts
  and immediately closes (a refused session, a crashing Durable Object)
  keeps backing off instead of reconnecting every second.
- Close code **1012** (service restart) retries at the minimum delay. Code
  **1013** (try again later) backs off normally.
- `"dead"` is reported per outage: the timer resets once a connection opens,
  so a later outage can go dead again.
- `connect()` after `close()` resumes.

Tune per channel:

```ts
useRealtime("deals", {
  reconnect: { minDelayMs: 250, maxDelayMs: 5_000, heartbeatMs: 15_000 },
});
```

## Wire protocol

Each frame is **one JSON text WebSocket message**. Client to server:

```json
{"t":"join","presence":{"email":"a@example.com"}}
{"t":"ping"}
{"t":"send","e":"deal.updated","d":{"id":7}}
```

Server to client:

- `{"t":"hello","connectionId","members"}` right after the upgrade.
- `{"t":"presence","members","joined"?,"left"?}` on every change.
- `{"t":"event","e","d","from"?}`: `from` is present only for client
  broadcasts.
- `{"t":"pong"}`.
- `{"t":"error","code"?,"message"}`: codes include `bad_frame`,
  `too_large`, `presence_too_large` and `forbidden`.

Event names (`e`) are 1-128 characters.
