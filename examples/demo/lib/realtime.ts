import {
  realtimeHub,
  type RealtimeAuthorize,
  type RealtimeChannel,
  type RealtimeChannelNamespace,
} from "@flare/core/realtime/server";
import { env } from "cloudflare:workers";
import { auth } from "./auth";

/** Roles that may watch and post on the live deal board. */
const DEAL_BOARD_ROLES = ["admin", "staff"];

/**
 * Who may open a realtime connection, per channel. `worker/index.ts` calls this for
 * every `/realtime/<channel>/ws` upgrade, after rejecting cross-site origins.
 *
 * The demo has one channel, "deals": admins and staff may join and broadcast from
 * the browser; everyone else is refused. Unknown channels are refused too.
 */
export const authorizeRealtime: RealtimeAuthorize = async (request, channel) => {
  // disableRefresh: this runs outside a Next request, where refreshing the
  // session cookie has nowhere to write it.
  const session = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } });
  if (!session) return false;
  const role = (session.user as { role?: string | null }).role ?? "";
  if (channel === "deals" && DEAL_BOARD_ROLES.includes(role)) return { send: true };
  return false;
};

/** Whether a role may use the deal board (also used by the server publish route). */
export const canUseDealBoard = (role: string | null | undefined) => DEAL_BOARD_ROLES.includes(role ?? "");

/** The FLARE_REALTIME binding. `env` is the worker runtime binding object; its type is app-generated. */
function binding(): RealtimeChannelNamespace {
  return (env as unknown as { FLARE_REALTIME: RealtimeChannelNamespace }).FLARE_REALTIME;
}

/**
 * An RPC handle for a realtime channel that server code can publish to.
 *
 * ```ts
 * await realtimeChannel("deals").publish("deal.updated", { id, title });
 * ```
 */
export function realtimeChannel(name: string): RealtimeChannel {
  return realtimeHub(binding(), name);
}
