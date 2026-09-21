import app from "vinext/server/app-router-entry";
import { RealtimeChannel, handleRealtimeUpgrade } from "@flare/core/realtime/server";
import { authorizeRealtime } from "../lib/realtime";

// `DurableObjectNamespace` and `ExecutionContext` are ambient globals injected
// by the generated worker-configuration.d.ts (wrangler types), not exports of
// the `cloudflare:workers` module.

export { RealtimeChannel };

export interface AppEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  FLARE_REALTIME: DurableObjectNamespace<RealtimeChannel>;
}

export interface AppContext {
  waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * Custom entrypoint. Holds the realtime upgrade seam; everything else is
 * delegated to the vinext app handler (fetch handler + assets).
 */
export default {
  async fetch(request: Request, env: AppEnv, ctx: AppContext): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/realtime/")) {
      // Who may join which channel lives in lib/realtime.ts (authorizeRealtime).
      const realtime = await handleRealtimeUpgrade(request, env.FLARE_REALTIME, { authorize: authorizeRealtime });
      if (realtime) return realtime;
    }
    return app.fetch(request, env, ctx);
  },
};
