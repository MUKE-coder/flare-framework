// This file is yours.
//
// Flare copies the code that turns a resource descriptor into a working endpoint into
// your app rather than hiding it in node_modules, for the same reason shadcn/ui copies
// a component: you cannot fix, read or reason about what you cannot see.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

/**
 * Invitations, for an app whose sign-up is `invite` (see lib/auth-config.ts) — the
 * Prisma half.
 *
 * **They live in the `Verification` model**, which Better Auth already has and already
 * uses for exactly this shape of thing: a single-use token with an expiry. Reusing it
 * means invitations need no model of their own and so no migration — an app switching to
 * `invite` changes one line in auth-config.ts and nothing else.
 *
 * Rows are keyed `invite:<hash>`. Only the hash is stored, never the token itself, for the
 * same reason a password is not: a leaked database should not be a pile of working
 * invitations.
 */
import { prisma } from "@/lib/db";

/** How long an invitation is good for, unless you say otherwise. */
export const DEFAULT_INVITE_DAYS = 7;

/** The cookie an opened invitation link leaves behind, for the sign-up that follows. */
export const INVITE_COOKIE = "flare_invite";

/** How long that cookie lives: long enough to fill in a form, not long enough to forget. */
export const INVITE_COOKIE_MAX_AGE = 60 * 60;

const KEY_PREFIX = "invite:";

/** WebCrypto, so this file does not depend on which runtime it is loaded in. */
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Only the hash is stored, so a copy of the table is not a pile of working invitations. */
async function hash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const key = async (token: string) => `${KEY_PREFIX}${await hash(token)}`;

/** What an invitation is for: one address, or anybody who has the link. */
export type InviteFor = { email: string } | { anyone: true };

/** An invitation. The token is returned once and never stored. */
export interface CreatedInvitation {
  token: string;
  expiresAt: Date;
  /** Who it is for, or null when anybody with the link may use it. */
  email: string | null;
}

/** Create one. The returned token is the only copy. */
export async function createInvitation(options: { for: InviteFor; days?: number }): Promise<CreatedInvitation> {
  const token = randomToken();
  const email = "email" in options.for ? options.for.email.trim().toLowerCase() : null;
  const expiresAt = new Date(Date.now() + (options.days ?? DEFAULT_INVITE_DAYS) * 86_400_000);
  await prisma.verification.create({
    // `*` rather than an empty string, so "for anybody" is a value and not a mistake.
    data: { identifier: await key(token), value: email ?? "*", expiresAt },
  });
  return { token, expiresAt, email };
}

/** The link to send somebody, given the app's own origin. */
export const invitationLink = (baseUrl: string, token: string) => `${baseUrl.replace(/\/$/, "")}/invite/${token}`;

/**
 * Whether this token is a live invitation for this email address.
 *
 * Checked, not spent: the account does not exist yet when this is asked, and an
 * invitation should survive a sign-up that fails validation.
 */
export async function invitationAllows(token: string | undefined, email: string): Promise<boolean> {
  if (!token) return false;
  const row = await prisma.verification.findFirst({ where: { identifier: await key(token) } });
  if (!row) return false;
  if (row.expiresAt.getTime() <= Date.now()) return false;
  // An invitation addressed to somebody is for them alone; `*` is for whoever has the link.
  return row.value === "*" || row.value === email.trim().toLowerCase();
}

/** Spend it, so the link cannot be used again. Called once the account exists. */
export async function spendInvitation(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.verification.deleteMany({ where: { identifier: await key(token) } });
}

/** Invitations an admin can see: live ones, newest first. Never the tokens. */
export async function listInvitations(): Promise<{ id: string; email: string | null; expiresAt: Date; createdAt: Date }[]> {
  const rows = await prisma.verification.findMany({
    where: { identifier: { startsWith: KEY_PREFIX }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({ id: row.id, email: row.value === "*" ? null : row.value, expiresAt: row.expiresAt, createdAt: row.createdAt }));
}

/** Revoke one by its row id, so a link sent to the wrong address stops working. */
export async function revokeInvitation(id: string): Promise<void> {
  await prisma.verification.deleteMany({ where: { id } });
}

/**
 * Drop invitations that have expired.
 *
 * Only rows under the `invite:` prefix — the rest of this table is Better Auth's, and
 * deleting its tokens would sign people out and break magic links.
 */
export async function pruneInvitations(): Promise<void> {
  await prisma.verification.deleteMany({ where: { identifier: { startsWith: KEY_PREFIX }, expiresAt: { lt: new Date() } } });
}
