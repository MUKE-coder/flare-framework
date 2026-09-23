/**
 * `flare gen endpoint <Resource> <name>`: a route of your own beside the generated CRUD
 * ones, with the session, the policy and the store already wired.
 *
 * Deliberately not clever: it writes one ordinary file with no generated block, so it's
 * yours from the moment it exists and `flare sync-types` will never touch it.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kebabCase, pascalCase, type PolicyAction } from "@flaredev/core";
import pc from "picocolors";
import { loadResources } from "../generator/load.js";
import { findAppRoot } from "./run.js";

export interface GenEndpointOptions {
  /** GET by default; a write verb also checks the policy for its action. */
  method?: string;
  /** Which policy action to require. Default: "read" for GET, "update" otherwise. */
  action?: string;
  /** Put it under a record: /api/orders/[id]/<name>. */
  record?: boolean;
  cwd?: string;
  log?: (message: string) => void;
}

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];
const ACTIONS: PolicyAction[] = ["read", "create", "update", "delete"];

export async function genEndpoint(resourceName: string, rawName: string, options: GenEndpointOptions = {}): Promise<string> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());

  const method = (options.method ?? "GET").toUpperCase();
  if (!METHODS.includes(method)) throw new Error(`Unknown method "${method}". Use one of ${METHODS.join(", ")}.`);

  const name = kebabCase(rawName);
  if (!name) throw new Error(`Invalid endpoint name "${rawName}".`);

  const resources = await loadResources(appRoot);
  const wanted = pascalCase(resourceName);
  const entry = resources.find(({ resource }) => resource.name === wanted);
  if (!entry) {
    throw new Error(`No resource "${resourceName}". Available: ${resources.map(({ resource }) => resource.name).join(", ") || "none"}.`);
  }

  const action = (options.action ?? (method === "GET" ? "read" : "update")) as PolicyAction;
  if (!ACTIONS.includes(action)) throw new Error(`Unknown action "${action}". Use one of ${ACTIONS.join(", ")}.`);

  const { resource, stem } = entry;
  const relative = options.record
    ? `app/api/${resource.slug}/[id]/${name}/route.ts`
    : `app/api/${resource.slug}/${name}/route.ts`;
  const path = join(appRoot, relative);
  if (existsSync(path)) throw new Error(`${relative} already exists.`);

  mkdirSync(join(path, ".."), { recursive: true });
  const route = options.record ? `/api/${resource.slug}/[id]/${name}` : `/api/${resource.slug}/${name}`;
  writeFileSync(path, renderEndpoint({ resource: resource.name, stem, method, action, record: Boolean(options.record), name, route }));

  log(`${pc.green("create".padEnd(9))} ${relative}`);
  log(`\nIt's an ordinary route handler — edit it freely; regeneration leaves it alone.`);
  return relative;
}

interface EndpointSpec {
  resource: string;
  stem: string;
  method: string;
  action: PolicyAction;
  record: boolean;
  name: string;
  /** The URL it answers on, for the comment at the top of the file. */
  route: string;
}

/** The file `gen endpoint` writes. Short on purpose: it's meant to be read and changed. */
export function renderEndpoint({ resource, stem, method, action, record, route }: EndpointSpec): string {
  const body = method === "GET" || method === "DELETE" ? "" : "  const body = (await request.json()) as Record<string, unknown>;\n";
  const params = record ? ", { params }: { params: Promise<{ id: string }> }" : "";
  const id = record ? "  const { id } = await params;\n" : "";

  return `import { authorize, currentUser } from "@/lib/api";
import { dashboardStore } from "@/lib/dashboard";
import ${stem.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())}Resource from "@/resources/${stem}.resource";

/**
 * ${method} ${route}
 *
 * Yours to change. The session and the policy are checked the same way the generated
 * CRUD routes check them, and \`store\` is the same store they use — so hooks, validation
 * and cache invalidation all still apply.
 */
export async function ${method}(request: Request${params}) {
${id}  const denied = await authorize({ request, resource: ${stem.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())}Resource, action: "${action}" });
  if (denied) return denied;

  const user = await currentUser();
  const store = dashboardStore("${resource}");
${body}
  // Your logic here. \`store.list\`, \`store.get\`, \`store.create\`, \`store.update\` and
  // \`store.delete\` are available, or reach for Drizzle directly with \`getDb()\`.
  return Response.json({ ok: true, ${record ? "id, " : ""}${method === "GET" || method === "DELETE" ? "" : "received: body, "}user: user?.email ?? null });
}
`;
}
