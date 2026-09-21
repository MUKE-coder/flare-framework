import {
  realtimeHub,
  type RealtimeAuthorize,
  type RealtimeChannel,
  type RealtimeChannelNamespace,
} from "@flare/core/realtime/server";
import { env } from "cloudflare:workers";
import { auth } from "./auth";

/**
 * Who may open a realtime connection, per channel. `worker/index.ts` calls this for
 * every `/realtime/<channel>/ws` upgrade, after rejecting cross-site origins.
 *
 * Default: any signed-in user may join any channel and receive events and
 * presence; nobody may broadcast from the browser (server code publishes with
 * `realtimeChannel(...).publish`). Tighten per channel as your app needs, e.g.
 *
 *   if (channel === "deals" && !["admin", "staff"].includes(role ?? "")) return false;
 *   if (channel === `user-${session.user.id}`) return { send: true };
 */
export const authorizeRealtime: RealtimeAuthorize = async (request) => {
  // disableRefresh: this runs outside a Next request, where refreshing the
  // session cookie has nowhere to write it.
  const session = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } });
  if (!session) return false;
  return { send: false };
};

/** The FLARE_REALTIME binding. `env` is the worker runtime binding object; its type is app-generated. */
function binding(): RealtimeChannelNamespace {
  return (env as unknown as { FLARE_REALTIME: RealtimeChannelNamespace }).FLARE_REALTIME;
}

/**
 * An RPC handle for a realtime channel that server code can publish to.
 *
 * ```ts
 * // In a route handler or server action, after something the UI should
 * // live-update on, await the RPC (DO stubs return promises):
 * await realtimeChannel("deals").publish("deal.updated", { id, title });
 * ```
 */
export function realtimeChannel(name: string): RealtimeChannel {
  return realtimeHub(binding(), name);
}
