/**
 * Realtime, on the Next.js stack.
 *
 * The Cloudflare stack gives every channel a Durable Object: one address, one thread,
 * its own storage, and websockets that stay open. Vercel has no equivalent — functions
 * don't hold connections — so rather than pretend, publishing warns once per channel
 * and drops the event, which never breaks the write that triggered it.
 *
 * If you need it here, the shape to reach for is a hosted pub/sub (Ably, Pusher,
 * Upstash) behind these same two functions.
 */
import type { RealtimeAuthorize } from "@flaredev/core/realtime/server";

export const authorizeRealtime: RealtimeAuthorize = () => false;

export interface RealtimeChannel {
  publish(event: string, data: unknown): Promise<void>;
}

/**
 * Channels this process has already warned about, so a publish in a hot path logs once
 * rather than on every write.
 */
const warned = new Set<string>();

/**
 * A channel that accepts publishes and drops them, so callers need no special case.
 *
 * It says so the first time, once per channel. A silent no-op is the worst version of
 * this: the code reads as though it works, nothing arrives, and there is nothing to
 * search for.
 */
export function realtimeChannel(name: string): RealtimeChannel {
  return {
    publish: async (event) => {
      if (warned.has(name)) return;
      warned.add(name);
      console.warn(
        `[flare] realtimeChannel("${name}").publish("${event}") did nothing: this app is on the Next.js stack, ` +
          "where there is nowhere to hold a websocket open. The write itself succeeded. " +
          "To deliver events, put a hosted pub/sub (Ably, Pusher, Upstash) behind lib/realtime.ts — " +
          "both functions in that file are yours to change.",
      );
    },
  };
}
