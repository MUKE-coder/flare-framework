import app from "vinext/server/app-router-entry";
import { RealtimeChannel, handleRealtimeUpgrade } from "@flaredev/core/realtime/server";
import { SecurityMonitor } from "@flaredev/core/security/server";
import { authorizeRealtime } from "../lib/realtime";
import { protect } from "../lib/security";

// `DurableObjectNamespace` and `ExecutionContext` are ambient globals injected
// by the generated worker-configuration.d.ts (wrangler types), not exports of
// the `cloudflare:workers` module.

// Durable Object classes must be exported from the Worker's main module.
export { RealtimeChannel, SecurityMonitor };

export interface AppEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  FLARE_REALTIME: DurableObjectNamespace<RealtimeChannel>;
}

export interface AppContext {
  waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * Custom entrypoint. Every request passes lib/security.ts first (bans, rate
 * limits, abuse detection; a pass-through until `flare gen security`), then the
 * realtime upgrade seam, then the vinext app.
 */
export default {
  async fetch(request: Request, env: AppEnv, ctx: AppContext): Promise<Response> {
    return protect(request, env, ctx, async () => {
      if (new URL(request.url).pathname.startsWith("/realtime/")) {
        // Who may join which channel lives in lib/realtime.ts (authorizeRealtime).
        const realtime = await handleRealtimeUpgrade(request, env.FLARE_REALTIME, { authorize: authorizeRealtime });
        if (realtime) return realtime;
      }
      return app.fetch(request, env, ctx);
    });
  },
};
