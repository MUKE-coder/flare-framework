/**
 * Where a new app's uploads go, chosen at `flare create` (`--storage`).
 *
 * One place that knows, for each provider: which stacks it runs on, which variables it
 * needs, **where in that provider's own console those values are**, and which page of
 * Flare's docs explains it. The last two matter more than they look: a variable name on
 * its own is only useful to somebody who already has an account, and the question people
 * actually have is "where do I get this".
 *
 * The runtime side of this is `lib/storage.ts` and `lib/storage/` in the app, which read
 * `STORAGE_DRIVER`. This module only decides what gets written into the env file and what
 * is said on screen afterwards.
 */
import type { Stack } from "./stack.js";

/** One variable a provider needs, and what to put in it. */
export interface StorageVar {
  name: string;
  /** A placeholder for the example file — never a real credential. */
  example?: string;
  /** A local default that works with `docker compose up -d`, where there is one. */
  local?: string;
  /** A line of explanation, for the variables whose purpose is not obvious. */
  note?: string;
}

export interface StorageProvider {
  label: string;
  /** One line for the prompt, per stack where it differs. */
  hint: Partial<Record<Stack, string>> & { both?: string };
  stacks: Stack[];
  /** What it needs, per stack. The bound bucket on Cloudflare needs nothing. */
  vars: Partial<Record<Stack, StorageVar[]>>;
  /** Where in the provider's own console the values are. Written into the env file. */
  where?: string;
  /** That console. */
  console?: string;
  /** The section of Flare's own docs that explains this driver. */
  docs: string;
  /**
   * The SDK this provider needs, for the one that needs one. `flare create` adds it to
   * the app's dependencies (see STORAGE_DEPENDENCIES), so it is not something to tell
   * anyone to install.
   */
  install?: string;
  /** Said after `create`, when there is something to do before uploads work. */
  caveat?: string;
}

// One page per provider: how to make the account, and where each value comes from.
const DOCS = "https://flare-docs.codetotech.com/storage";

/**
 * Declared separately from the exported record so the key union is exact while every
 * entry still reads as a `StorageProvider` — with `as const satisfies`, an optional
 * field absent from one provider is absent from the union and unreachable on all of them.
 */
const PROVIDERS = {
  r2: {
    label: "Cloudflare R2",
    hint: {
      cloudflare: "the bound bucket — nothing to configure",
      next: "or any S3: MinIO locally, B2, S3",
    },
    stacks: ["cloudflare", "next"],
    vars: {
      // The Worker is bound to the bucket, so there is no endpoint and no key.
      cloudflare: [],
      next: [
        { name: "R2_ENDPOINT", example: "https://<account-id>.r2.cloudflarestorage.com", local: "http://127.0.0.1:9000" },
        { name: "R2_BUCKET", example: "myapp", local: "app-uploads" },
        { name: "R2_ACCESS_KEY_ID", local: "flare" },
        { name: "R2_SECRET_ACCESS_KEY", local: "flare-secret-123" },
      ],
    },
    where: "Cloudflare dashboard → R2 → Manage API tokens → Create API token (Object Read & Write)",
    console: "https://dash.cloudflare.com/?to=/:account/r2/api-tokens",
    docs: `${DOCS}/r2/`,
  },
  disk: {
    label: "Local disk",
    hint: { next: "no account, no network; one machine only" },
    stacks: ["next"],
    vars: {
      next: [{ name: "STORAGE_DIR", example: "storage/app", local: "storage/app", note: "Where the files go. Add it to .gitignore." }],
    },
    docs: `${DOCS}/disk/`,
    caveat: "disk is one machine only — two instances do not share a filesystem, and serverless hosts have no writable one.",
  },
  cloudinary: {
    label: "Cloudinary",
    hint: { both: "a CDN with an image pipeline" },
    stacks: ["cloudflare", "next"],
    vars: {
      cloudflare: [
        { name: "CLOUDINARY_CLOUD_NAME", example: "my-cloud" },
        { name: "CLOUDINARY_API_KEY" },
        { name: "CLOUDINARY_API_SECRET" },
      ],
      next: [
        { name: "CLOUDINARY_CLOUD_NAME", example: "my-cloud" },
        { name: "CLOUDINARY_API_KEY" },
        { name: "CLOUDINARY_API_SECRET" },
      ],
    },
    where: "Cloudinary console → Settings → API Keys (the cloud name is on the dashboard, top left)",
    console: "https://console.cloudinary.com/settings/api-keys",
    docs: `${DOCS}/cloudinary/`,
    caveat: "Cloudinary serves its own URLs, which anyone with the link can read and which do not expire. Set STORAGE_PUBLIC=false to keep reads signed and proxied.",
  },
  uploadthing: {
    label: "UploadThing",
    hint: { both: "a CDN with an uploader" },
    stacks: ["cloudflare", "next"],
    vars: {
      // One variable, not two. The token is base64 JSON carrying the app id, so the
      // driver reads the id out of it rather than asking for it a second time.
      cloudflare: [{ name: "UPLOADTHING_TOKEN" }],
      next: [{ name: "UPLOADTHING_TOKEN" }],
    },
    where: "UploadThing dashboard → your app → API Keys",
    console: "https://uploadthing.com/dashboard",
    docs: `${DOCS}/uploadthing/`,
    install: "uploadthing",
    caveat: "UploadThing serves its own URLs, which anyone with the link can read and which do not expire. Set STORAGE_PUBLIC=false to keep reads signed and proxied.",
  },
} satisfies Record<string, StorageProvider>;

export type StorageProviderName = keyof typeof PROVIDERS;

export const STORAGE_PROVIDERS: Record<StorageProviderName, StorageProvider> = PROVIDERS;

/** The default: the bucket the app is already bound to, or already pointed at. */
export const DEFAULT_STORAGE: StorageProviderName = "r2";

/** Which providers a stack can use. `disk` is Next.js only — a Worker has no filesystem. */
export function storageProvidersFor(stack: Stack): StorageProviderName[] {
  return (Object.keys(STORAGE_PROVIDERS) as StorageProviderName[]).filter((name) =>
    STORAGE_PROVIDERS[name].stacks.includes(stack),
  );
}

/** The prompt's one-line hint for a provider on a stack. */
export function storageHint(name: StorageProviderName, stack: Stack): string {
  const { hint } = STORAGE_PROVIDERS[name];
  return hint[stack] ?? hint.both ?? "";
}

/**
 * Parse `--storage`, against the stack it has to run on.
 *
 * A provider the stack cannot use is rejected with the reason rather than the list: being
 * told "disk is Next.js only, because a Worker has no filesystem" answers the question,
 * where "one of: r2, cloudinary, uploadthing" leaves you guessing why.
 */
export function parseStorage(input: string | undefined, stack: Stack): StorageProviderName {
  if (input === undefined) return DEFAULT_STORAGE;
  const name = input.trim().toLowerCase();
  const known = Object.keys(STORAGE_PROVIDERS) as StorageProviderName[];
  if (!known.includes(name as StorageProviderName)) {
    throw new Error(`Unknown --storage "${input}". One of: ${known.join(", ")}.`);
  }
  const provider = name as StorageProviderName;
  if (!STORAGE_PROVIDERS[provider].stacks.includes(stack)) {
    const reason =
      provider === "disk"
        ? "a Worker has no filesystem to write to, and the bound R2 bucket already covers what it is for"
        : `it does not run on the ${stack} stack`;
    throw new Error(`--storage ${provider} cannot be used with --stack ${stack}: ${reason}.`);
  }
  return provider;
}

/** The variables a provider needs on a stack. */
export const storageVars = (name: StorageProviderName, stack: Stack): StorageVar[] => STORAGE_PROVIDERS[name].vars[stack] ?? [];

/**
 * The storage block for the app's real env file (`.env` or `.dev.vars`).
 *
 * `local` values are filled in where a provider has one that works with the compose file,
 * so `docker compose up -d` is still the only setup step for the default. Everything else
 * is left empty with the console link above it — an empty value fails loudly at the first
 * upload, which is better than a placeholder that looks configured.
 */
export function storageEnv(name: StorageProviderName, stack: Stack, options: { local?: boolean } = {}): string {
  const provider = STORAGE_PROVIDERS[name];
  const vars = storageVars(name, stack);
  const lines = [`# Where uploads go. Each driver is a readable file in lib/storage/.`, `# ${provider.docs}`];

  if (vars.length === 0) {
    lines.push(`# ${provider.label}: nothing to configure — the app is bound to its own bucket.`);
    lines.push(`STORAGE_DRIVER=${name}`);
    return lines.join("\n") + "\n";
  }

  // When the values below are the local ones, say so — otherwise a line about where to
  // find credentials sits directly above a working localhost address and reads as though
  // the address were wrong.
  const filledLocally = options.local && vars.some((variable) => variable.local);
  if (provider.where) {
    lines.push(filledLocally ? `# Below: the local values. For production: ${provider.where}` : `# ${provider.label} credentials: ${provider.where}`);
  }
  if (provider.console) lines.push(`# ${provider.console}`);
  lines.push(`STORAGE_DRIVER=${name}`);
  for (const variable of vars) {
    if (variable.note) lines.push(`# ${variable.note}`);
    lines.push(`${variable.name}=${(options.local ? variable.local : undefined) ?? ""}`);
  }
  return lines.join("\n") + "\n";
}

/** The same block for the committed example file, with placeholders rather than values. */
export function storageEnvExample(name: StorageProviderName, stack: Stack): string {
  const provider = STORAGE_PROVIDERS[name];
  const vars = storageVars(name, stack);
  const lines = ["", `# Uploads: ${provider.label}. ${provider.docs}`];
  if (provider.where) lines.push(`# Credentials: ${provider.where}`);
  if (provider.console) lines.push(`# ${provider.console}`);
  lines.push(`STORAGE_DRIVER=${name}`);
  for (const variable of vars) {
    if (variable.note) lines.push(`# ${variable.note}`);
    lines.push(`${variable.name}=${variable.example ?? ""}`);
  }
  const others = storageProvidersFor(stack).filter((other) => other !== name);
  lines.push("", `# Or switch driver: ${others.join(", ")} — see the guide above.`, "");
  return lines.join("\n");
}

/**
 * What to say after `create`, when uploads need something before they work.
 *
 * Nothing for the default, which is the point of it being the default.
 */
export function storageSetupSteps(name: StorageProviderName, stack: Stack, options: { local?: boolean } = {}): string[] {
  const provider = STORAGE_PROVIDERS[name];
  const vars = storageVars(name, stack);
  const steps: string[] = [];

  // Whether the env file was written with values that already work. For the default on
  // Next.js that is every variable — docker compose brings up MinIO and .env points at
  // it — so there is nothing to fetch before the first upload, and a list of credentials
  // to go and get would be a to-do item that is not one. Said as a deploy-time note
  // instead, which is when it becomes true.
  const readyLocally = options.local !== false && vars.length > 0 && vars.every((variable) => variable.local);

  if (vars.length > 0 && provider.console) {
    if (readyLocally) {
      steps.push(`Works locally as it is. When you deploy, replace ${vars.map((variable) => variable.name).join(", ")}:`);
    } else {
      steps.push(`Get ${vars.map((variable) => variable.name).join(", ")} from ${provider.where ?? provider.console}`);
    }
    steps.push(provider.console);
  }
  if (provider.caveat) steps.push(provider.caveat);
  if (steps.length > 0) steps.push(`How it works: ${provider.docs}`);
  return steps;
}
