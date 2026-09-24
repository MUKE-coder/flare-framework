/**
 * Realtime, on the Next.js stack.
 *
 * The Cloudflare stack gives every channel a Durable Object: one address, one thread,
 * its own storage, and websockets that stay open. Vercel has no equivalent — functions
 * don't hold connections — so rather than pretend, this says so, and publishing is a
 * no-op that never breaks a write.
 *
 * If you need it here, the shape to reach for is a hosted pub/sub (Ably, Pusher,
 * Upstash) behind these same two functions.
 */
import type { RealtimeAuthorize } from "@flaredev/core/realtime/server";

export const authorizeRealtime: RealtimeAuthorize = () => false;

export interface RealtimeChannel {
  publish(event: string, data: unknown): Promise<void>;
}

/** A channel that accepts publishes and drops them, so callers need no special case. */
export function realtimeChannel(_name: string): RealtimeChannel {
  return { publish: async () => undefined };
}
