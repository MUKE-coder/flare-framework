/**
 * `flare user:add <email>` — make an account from the command line.
 *
 * The way in for an app whose sign-up is `closed`, and a shortcut for any app: no form,
 * no email, no invitation. It writes the same two rows a sign-up writes — the user and a
 * `credential` account holding the password hash — through the same `credentialUserRows`
 * the seeder uses, so an account made here is indistinguishable from one made through
 * the form. That matters: the subtle way to get this wrong is to put the email in
 * `account.accountId`, where Better Auth expects the user id, and end up with a row that
 * looks right and cannot sign in.
 *
 * The password is generated unless you give one, and printed once. It is the only copy:
 * nothing stores it in plain text, here or anywhere.
 */
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { credentialUserRows } from "@flaredev/core";
import pc from "picocolors";
import { readStack } from "../stack.js";
import { extractJson, readD1Databases, runWrangler } from "../utils/wrangler.js";
import { listRoles } from "./role.js";
import { findAppRoot, resolveBin, runNode } from "./run.js";

export interface UserAddOptions {
  /** Against the deployed database rather than the local one. */
  remote?: boolean;
  env?: string;
  /** The role to give them. Default: the plugin's default, "user". */
  role?: string;
  /** Their password. Generated and printed when omitted. */
  password?: string;
  /** Their display name. Default: the part of the email before the @. */
  name?: string;
  cwd?: string;
  log?: (message: string) => void;
}

const EMAIL = /^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/;
const ROLE = /^[a-z][a-z0-9_-]{0,31}$/;

/**
 * A password worth printing: long enough that it does not need rotating straight away,
 * and from an alphabet with no characters that get lost in a terminal or a chat message.
 */
export function generatePassword(length = 24): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]!).join("");
}

/** A string that is safe to put inside single quotes in SQLite SQL, having been validated. */
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The SQL that inserts both rows.
 *
 * Exported so the interesting part — two rows, the right columns, the hash in the account
 * and the user id in `accountId` — is tested without a database.
 */
export function userAddSql(rows: Awaited<ReturnType<typeof credentialUserRows>>): string {
  const user = rows.user;
  const account = rows.account;
  const ms = (date: Date) => String(date.getTime());
  return [
    `INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at) VALUES (`,
    [
      quoted(user.id),
      quoted(user.name),
      quoted(user.email),
      user.emailVerified ? "1" : "0",
      user.role ? quoted(user.role) : "NULL",
      ms(user.createdAt),
      ms(user.updatedAt),
    ].join(", "),
    `);`,
    `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (`,
    [
      quoted(account.id),
      quoted(account.accountId),
      quoted(account.providerId),
      quoted(account.userId),
      quoted(account.password!),
      ms(account.createdAt),
      ms(account.updatedAt),
    ].join(", "),
    `);`,
  ].join("\n");
}

/** `flare user:add <email>` */
export async function addUser(email: string, options: UserAddOptions = {}): Promise<number> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) throw new Error(`"${email}" doesn't look like an email address.`);
  if (options.role && !ROLE.test(options.role)) {
    throw new Error(`Invalid role "${options.role}". Use lowercase letters, digits, _ or -, e.g. admin or staff.`);
  }

  const password = options.password ?? generatePassword();
  const generated = options.password === undefined;
  const rows = await credentialUserRows({ email: address, password, name: options.name, role: options.role });

  const code = readStack(appRoot) === "next" ? await addOnPrisma(appRoot, rows, log) : await addOnD1(appRoot, rows, options, log);
  if (code !== 0) return code;

  log(pc.green(`✔ ${address} can now sign in${options.role ? ` as ${options.role}` : ""}.`));
  if (generated) {
    log("");
    log(`  password: ${pc.bold(password)}`);
    log(pc.dim("  Shown once — nothing stores it in plain text. Send it to them and have them change it."));
  }
  return 0;
}

async function addOnD1(
  appRoot: string,
  rows: Awaited<ReturnType<typeof credentialUserRows>>,
  options: UserAddOptions,
  log: (message: string) => void,
): Promise<number> {
  if (options.role) {
    // Catch a typo before writing the row: a role nothing recognises is a user who can
    // sign in and reach nothing, which looks like a different bug entirely.
    const roles = await listRoles(options);
    if (roles && !roles.includes(options.role)) {
      log(pc.red(`No role "${options.role}" is registered. Known roles: ${roles.join(", ") || "none"}.`));
      log(pc.dim(`Register it with: flare role:add ${options.role}${options.remote ? " --remote" : ""}`));
      return 1;
    }
  }

  const db = readD1Databases(appRoot)[0];
  if (!db) throw new Error("No d1_databases in wrangler.jsonc.");
  const target = [options.remote ? "--remote" : "--local", ...(options.env ? ["--env", options.env] : [])];
  const wrangler = resolveBin(appRoot, "wrangler", "wrangler");

  const existing = await runWrangler(
    wrangler,
    ["d1", "execute", db.binding, ...target, "--json", "--command", `SELECT id FROM "user" WHERE lower(email) = ${quoted(rows.user.email)}`],
    appRoot,
    { capture: true },
  );
  if (existing.code !== 0) throw new Error(`Could not read the user table:\n${existing.output.trim()}`);
  const [found] = extractJson<{ results: { id: string }[] }[]>(existing.output);
  if ((found?.results ?? []).length > 0) {
    log(pc.red(`${rows.user.email} already has an account.`));
    log(pc.dim("To change their role: flare user:role <email> <role>"));
    return 1;
  }

  const result = await runWrangler(wrangler, ["d1", "execute", db.binding, ...target, "--command", userAddSql(rows)], appRoot, { capture: true });
  if (result.code !== 0) throw new Error(`Could not create the account:\n${result.output.trim()}`);
  return 0;
}

/**
 * The Next.js stack, through the app's own Prisma client.
 *
 * The generated client is TypeScript a bundler compiles, so it cannot be imported from
 * here; the app runs a throwaway script with its own tsx, the same way `flare user:role`
 * does.
 */
async function addOnPrisma(
  appRoot: string,
  rows: Awaited<ReturnType<typeof credentialUserRows>>,
  log: (message: string) => void,
): Promise<number> {
  const runner = join(appRoot, ".flare-user-add-runner.mts");
  const script = [
    `import "dotenv/config";`,
    `import { prisma } from "./lib/db";`,
    "",
    `const client = prisma as unknown as {`,
    `  user: { findFirst(args: unknown): Promise<{ id: string } | null>; create(args: unknown): Promise<unknown> };`,
    `  account: { create(args: unknown): Promise<unknown> };`,
    `  $disconnect(): Promise<void>;`,
    `};`,
    "",
    `const existing = await client.user.findFirst({ where: { email: { equals: ${JSON.stringify(rows.user.email)}, mode: "insensitive" } } });`,
    `if (existing) {`,
    `  await client.$disconnect();`,
    `  // 3 means "already has an account", which the CLI turns into a useful message.`,
    `  process.exit(3);`,
    `}`,
    `await client.user.create({ data: ${JSON.stringify({ ...rows.user, createdAt: undefined, updatedAt: undefined })} });`,
    `await client.account.create({ data: ${JSON.stringify({ ...rows.account, createdAt: undefined, updatedAt: undefined })} });`,
    `await client.$disconnect();`,
    "",
  ].join("\n");

  writeFileSync(runner, script);
  try {
    const code = await runNode([resolveBin(appRoot, "tsx", "tsx"), runner], appRoot);
    if (code === 3) {
      log(pc.red(`${rows.user.email} already has an account.`));
      log(pc.dim("To change their role: flare user:role <email> <role>"));
      return 1;
    }
    return code;
  } finally {
    rmSync(runner, { force: true });
  }
}
