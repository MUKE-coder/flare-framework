import { NextRequest, NextResponse } from "next/server";
import { canUseDealBoard, realtimeChannel } from "@/lib/realtime";
import { getSession } from "@/lib/session";

/** Server publishes go to every viewer, so keep them small. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Server-driven publish endpoint for the realtime demo board. This is how a
 * business flow (e.g. an order status change) broadcasts to live viewers: it
 * writes through the FLARE_REALTIME Durable Object binding, which is the only
 * way server code can reach WebSocket connections.
 */
export async function POST(request: NextRequest) {
  // Read the body before any early return: answering with it unread breaks the
  // next request through wrangler's local dev proxy ("Network connection lost").
  const raw = await request.text();

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canUseDealBoard((session.user as { role?: string | null }).role)) {
    return NextResponse.json({ error: "Your role can't post to the deal board." }, { status: 403 });
  }

  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: `Events are limited to ${MAX_BODY_BYTES / 1024} KB.` }, { status: 413 });
  }
  let body: { e?: unknown; d?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { e?: unknown; d?: unknown };
  } catch {
    return NextResponse.json({ error: "Send a JSON body like {\"e\": \"deal.updated\", \"d\": {...}}." }, { status: 400 });
  }

  const event = body?.e ?? "page.event";
  if (typeof event !== "string" || event.length === 0 || event.length > 128) {
    return NextResponse.json({ error: "`e` must be a string of up to 128 characters." }, { status: 400 });
  }

  const recipients = await realtimeChannel("deals").publish(event, body?.d ?? {});
  return NextResponse.json({ ok: true, recipients, from: session.user.email });
}
