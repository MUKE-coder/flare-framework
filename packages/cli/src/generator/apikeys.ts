/**
 * `flare gen apikeys` — the code it writes.
 *
 * API keys are Better Auth's (`@better-auth/api-key`): it owns the table, minting,
 * hashing, expiry, revocation and the per-key rate limit. What this generator adds is the
 * part Better Auth leaves to the app — turning a verified key into the user a policy is
 * checked against — plus a screen to manage them.
 *
 * Deliberately not the plugin's `enableSessionForAPIKeys`. That option mocks a session for
 * any request carrying a valid key, and the plugin's own documentation says it is not
 * recommended for production. `lib/api-keys.ts` verifies explicitly instead.
 */

/** The table the plugin needs, in Drizzle's SQLite dialect. */
export function renderApiKeyTable(): string {
  return `
export const apikey = sqliteTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").default("default").notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id").notNull(),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: integer("last_refill_at", { mode: "timestamp_ms" }),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }).default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: integer("last_request", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_configId_idx").on(table.configId),
    index("apikey_referenceId_idx").on(table.referenceId),
    index("apikey_key_idx").on(table.key),
  ],
);
`;
}

/**
 * The same table as a Prisma model.
 *
 * `Apikey`, not `ApiKey`. Better Auth looks the table up as `prisma.apikey`, and Prisma
 * derives that property from the model name by lowercasing its first letter only — so
 * `ApiKey` would be `prisma.apiKey` and the adapter refuses to start with "Missing tables:
 * apikey". `Passkey` and `TwoFactor` in base.prisma follow the same rule.
 *
 * No relation to User: `referenceId` is the plugin's own column and it is not declared as
 * a foreign key, which is why there is nothing to add to `model User` — base.prisma is
 * yours to edit and a generator that needed a back-relation in it would have to.
 */
export function renderApiKeyModel(): string {
  return `
model Apikey {
  id                  String    @id @default(uuid())
  configId            String    @default("default") @map("config_id")
  name                String?
  start               String?
  referenceId         String    @map("reference_id")
  prefix              String?
  key                 String
  refillInterval      Int?      @map("refill_interval")
  refillAmount        Int?      @map("refill_amount")
  lastRefillAt        DateTime? @map("last_refill_at")
  enabled             Boolean?  @default(true)
  rateLimitEnabled    Boolean?  @default(true) @map("rate_limit_enabled")
  rateLimitTimeWindow Int?      @default(86400000) @map("rate_limit_time_window")
  rateLimitMax        Int?      @default(10) @map("rate_limit_max")
  requestCount        Int?      @default(0) @map("request_count")
  remaining           Int?
  lastRequest         DateTime? @map("last_request")
  expiresAt           DateTime? @map("expires_at")
  createdAt           DateTime  @map("created_at")
  updatedAt           DateTime  @map("updated_at")
  permissions         String?
  metadata            String?

  @@index([configId])
  @@index([referenceId])
  @@index([key])
  @@map("apikey")
}
`;
}


/**
 * Server actions for the dashboard screen.
 *
 * Thin on purpose. The plugin's own endpoints already scope every operation to the
 * session: `listApiKeys` returns only this user's, and `deleteApiKey` answers 404 for a
 * key belonging to somebody else rather than confirming it exists. Re-checking that here
 * would be a second, weaker copy of a rule that is already enforced.
 */
export function renderApiKeyActions(): string {
  return `"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireDashboard } from "@/lib/dashboard";

const PATH = "/dashboard/api-keys";

/**
 * Mint a key for the signed-in user.
 *
 * The plaintext comes back exactly once — there is only a hash in the table — so the
 * caller has to show it immediately or lose it. The owner comes from the session, not
 * from an argument: a name is the only thing the browser gets to choose.
 */
export async function createApiKeyAction(name: string, expiresInDays?: number) {
  await requireDashboard(PATH);
  const trimmed = name.trim().slice(0, 64);
  if (!trimmed) return { ok: false as const, error: "Give the key a name, so you can tell them apart later." };

  try {
    const created = await auth.api.createApiKey({
      body: { name: trimmed, ...(expiresInDays ? { expiresIn: expiresInDays * 86_400 } : {}) },
      headers: await headers(),
    });
    revalidatePath(PATH);
    return { ok: true as const, key: created.key, id: created.id, name: created.name };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not create the key." };
  }
}

/** Revoke one. The plugin answers 404 for a key that is not yours. */
export async function revokeApiKeyAction(id: string) {
  await requireDashboard(PATH);
  try {
    await auth.api.deleteApiKey({ body: { keyId: id }, headers: await headers() });
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not revoke the key." };
  }
}

/** This user's keys, newest first. Never includes a plaintext key — there isn't one to include. */
export async function listApiKeysAction() {
  await requireDashboard(PATH);
  // Paginated: the response is { apiKeys, total, limit, offset }, not an array.
  const { apiKeys } = await auth.api.listApiKeys({ headers: await headers() });
  return apiKeys
    .map((key) => ({
      id: key.id,
      name: key.name,
      start: key.start,
      enabled: key.enabled,
      requestCount: key.requestCount,
      lastRequest: key.lastRequest ? new Date(key.lastRequest).toISOString() : null,
      expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
      createdAt: new Date(key.createdAt).toISOString(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
`;
}

/** `app/dashboard/api-keys/page.tsx` — the list, with the form and the revoke buttons. */
export const renderApiKeyPage = (): string => `import { KeyRoundIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireDashboard } from "@/lib/dashboard";
import { listApiKeysAction } from "./actions";
import { KeyRow, NewKeyForm } from "./key-controls";

const when = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default async function ApiKeysPage() {
  await requireDashboard("/dashboard/api-keys");
  const keys = await listApiKeysAction();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
        <p className="text-muted-foreground text-sm">
          For clients that cannot hold a cookie: a cron job, a script, a mobile app, a partner integration. A key acts as
          you, so it can do what your role and your own records allow, and nothing more.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New key</CardTitle>
          <CardDescription>
            The key is shown once. Only a hash is stored, so it cannot be shown again — issue a new one instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewKeyForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
          <CardDescription>Revoking one takes effect on its next request.</CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRoundIcon />
                </EmptyMedia>
                <EmptyTitle>No keys yet</EmptyTitle>
                <EmptyDescription>Create one above to call the API without signing in.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Starts with</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name ?? "Unnamed"}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{key.start ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{key.requestCount ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{when(key.lastRequest)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{when(key.expiresAt)}</TableCell>
                    <TableCell>
                      <KeyRow id={key.id} name={key.name ?? "this key"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
`;

/** The two interactive pieces: the create form, and a revoke button per row. */
export const renderApiKeyControls = (): string => `"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";

export function NewKeyForm() {
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  if (minted) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Copy this now. It will not be shown again.</p>
        <div className="flex items-center gap-2">
          <code className="bg-muted flex-1 truncate rounded-md px-3 py-2 font-mono text-sm">{minted}</code>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(minted);
              setCopied(true);
              toast.success("Key copied");
            }}
          >
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              setMinted(null);
              setCopied(false);
            }}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createApiKeyAction(name, days ? Number(days) : undefined);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          // Held in state rather than toasted: this is the only moment the plaintext
          // exists, and a message that vanishes after four seconds is the wrong place for
          // something unrecoverable.
          setMinted(result.key);
          setName("");
          setDays("");
        });
      }}
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field>
            <FieldLabel htmlFor="key-name">What is it for</FieldLabel>
            <Input id="key-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nightly sync" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="key-days">Expires in (days)</FieldLabel>
            <Input
              id="key-days"
              type="number"
              min="1"
              value={days}
              onChange={(event) => setDays(event.target.value)}
              placeholder="Never"
            />
          </Field>
        </div>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Create key
        </Button>
      </div>
    </form>
  );
}

export function KeyRow({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2Icon data-icon="inline-start" />
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything using it stops working on its next request, and it cannot be restored. Issue a new key instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await revokeApiKeyAction(id);
                if (result.ok) toast.success("Key revoked");
                else toast.error(result.error);
              })
            }
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
`;
