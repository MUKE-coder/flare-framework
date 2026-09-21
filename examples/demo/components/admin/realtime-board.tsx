"use client";

import { useEffect, useRef, useState } from "react";
import { RadioIcon, SendIcon, UsersIcon } from "lucide-react";
import { useRealtime } from "@flare/core/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface ActivityEntry {
  id: number;
  kind: "client" | "server" | "presence";
  text: string;
  at: string;
}

function time() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

export interface RealtimeBoardProps {
  /** Session email shown in presence so other viewers can see who is online. */
  email: string;
}

export function RealtimeBoard({ email }: RealtimeBoardProps) {
  const { status, members, publish, connected } = useRealtime("deals", {
    presence: { email, role: "admin" },
    onEvent: (e, d, from) => {
      // Only server publishes arrive without `from`, so a browser can't pass its
      // broadcast off as a server event by choosing the event name.
      if (from) {
        const text = e === "page.event" ? String((d as { message?: unknown } | null)?.message ?? "") : `${e} — ${JSON.stringify(d)}`;
        append({ kind: "client", text, at: time() });
      } else {
        append({ kind: "server", text: `${e} — ${JSON.stringify(d)}`, at: time() });
      }
    },
  });

  const [entries, setEntries] = useState<ActivityEntry[]>([
    { id: 1, kind: "presence", text: `Joined channel "deals" as ${email}`, at: time() },
  ]);
  const seq = useRef(2);
  const [message, setMessage] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  function append(entry: Omit<ActivityEntry, "id">) {
    setEntries((prev) => [...prev.slice(-199), { ...entry, id: seq.current++ }]);
  }

  // Keep the log pinned to the bottom.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries.length]);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" />
            Presence
          </CardTitle>
          <CardDescription>Who is connected right now</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <StatusPill status={status} />
            <span data-realtime-viewers={members.length} className="text-muted-foreground">{members.length} viewer{members.length === 1 ? "" : "s"}</span>
          </div>
          {members.length === 0 && !connected ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            members.map((member) => {
              const who = (member.presence as { email?: string } | null)?.email ?? "anonymous";
              return (
                <div key={member.connectionId} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate font-medium">{who}</span>
                  <Badge variant={who === email ? "default" : "secondary"}>{who === email ? "you" : "online"}</Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RadioIcon className="size-4" />
            Live activity
          </CardTitle>
          <CardDescription>Deal events broadcast while you watch</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div ref={logRef} className="h-64 space-y-1 overflow-y-auto rounded-md border p-3 font-mono text-xs">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-2">
                <span className="text-muted-foreground">{entry.at}</span>
                <span
                  className={
                    entry.kind === "server"
                      ? "text-primary"
                      : entry.kind === "presence"
                        ? "text-muted-foreground"
                        : ""
                  }
                >
                  {entry.text}
                </span>
              </div>
            ))}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = message.trim();
              if (!text) return;
              if (!publish("page.event", { message: text })) {
                append({ kind: "presence", text: `Not connected — ${text} was not sent.`, at: time() });
              } else {
                setEntries((prev) => [...prev, { id: seq.current++, kind: "client", text: `→ ${text}`, at: time() }]);
                setMessage("");
              }
            }}
          >
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Broadcast to every viewer…" />
            <Button type="submit" disabled={!connected || !message.trim()}>
              <SendIcon className="size-4" />
              Send
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Server-driven events (the path a status change would use):</span>
            <Button
              size="sm"
              variant="outline"
              disabled={!connected}
              onClick={async () => {
                const response = await fetch("/api/realtime/broadcast", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ e: "deal.updated", d: { note: "Stage advanced to Contract" } }),
                });
                const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
                if (!body?.ok) append({ kind: "presence", text: "Server publish failed.", at: time() });
              }}
            >
              Push deal.updated
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!connected}
              onClick={async () => {
                const response = await fetch("/api/realtime/broadcast", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ e: "deal.comment", d: { note: "New comment on Acme migration" } }),
                });
                const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
                if (!body?.ok) append({ kind: "presence", text: "Server publish failed.", at: time() });
              }}
            >
              Push deal.comment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "open"
      ? "bg-success/15 text-success"
      : status === "reconnecting"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";
  return (
    <span data-realtime-status={status} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}