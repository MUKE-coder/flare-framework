/**
 * An OpenAPI 3.1 document for an app's generated REST API, built at request time
 * from the same descriptors and policies the API itself runs on, so it can't drift.
 *
 * Operations are filtered by role: a signed-in user sees what their role may call
 * (admins everything), a visitor only the sign-in endpoints. `visibility: "public"`
 * lists every operation to everyone.
 */
import { storedFields, type Resource } from "../resource/define.js";
import type { StoredField } from "../resource/fields.js";
import { can, type Policy, type PolicyAction } from "../resource/policy.js";
import { isFilterable, isSearchable, isSortable } from "./query.js";

type Schema = Record<string, unknown>;

export interface OpenApiOptions {
  resources: readonly Resource[];
  policies?: Record<string, Policy | undefined>;
  /** The viewer's role; null for a signed-out visitor. */
  role: string | null;
  /** "role" (default): only operations the viewer's role may call. "public": all of them. */
  visibility?: "role" | "public";
  title?: string;
  version?: string;
  description?: string;
  /** Absolute origin the "Try it" requests go to, e.g. https://app.example.com. */
  serverUrl?: string;
}

const E164 = "^\\+[1-9]\\d{6,14}$";

/** JSON Schema for one field value (never null; nullability is added by the caller). */
export function fieldJsonSchema(def: StoredField): Schema {
  const base: Schema = {};
  if (def.helpText) base.description = def.helpText;
  switch (def.kind) {
    case "string": {
      const schema: Schema = { ...base, type: "string", maxLength: def.maxLength ?? 255 };
      if (def.minLength !== undefined) schema.minLength = def.minLength;
      if (def.pattern) schema.pattern = def.pattern;
      switch (def.format) {
        case "email":
          return { ...schema, format: "email", examples: ["ada@example.com"] };
        case "url":
          return { ...schema, format: "uri", examples: ["https://example.com"] };
        case "tel":
          return { ...schema, pattern: E164, description: "International number in E.164 form.", examples: ["+256772123456"] };
        case "domain":
          return { ...schema, format: "hostname", description: "A hostname, stored lowercase without scheme or path.", examples: ["example.com"] };
        case "country":
          return { ...schema, pattern: "^[A-Z]{2}$", description: "ISO 3166-1 alpha-2 country code.", examples: ["UG"] };
        case "color":
          return { ...schema, pattern: "^#[0-9a-f]{6}$", description: "Hex colour.", examples: ["#f2541d"] };
        case "slug":
          return { ...schema, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", examples: ["my-first-post"] };
        default:
          return schema;
      }
    }
    case "text":
      return { ...base, type: "string", maxLength: def.maxLength ?? 65_535 };
    case "int":
    case "float": {
      const schema: Schema = { ...base, type: def.kind === "int" ? "integer" : "number" };
      if (def.min !== undefined) schema.minimum = def.min;
      if (def.max !== undefined) schema.maximum = def.max;
      return schema;
    }
    case "boolean":
      return { ...base, type: "boolean" };
    case "date":
      return { ...base, type: "string", format: "date" };
    case "datetime":
      return { ...base, type: "string", format: "date-time" };
    case "enum":
      return { ...base, type: "string", enum: [...def.options] };
    case "multiselect": {
      const schema: Schema = { ...base, type: "array", items: { type: "string", enum: [...def.options] }, uniqueItems: true };
      if (def.minItems !== undefined) schema.minItems = def.minItems;
      if (def.maxItems !== undefined) schema.maxItems = def.maxItems;
      return schema;
    }
    case "file":
      return { ...base, type: "string", description: base.description ?? "Storage key of an uploaded file." };
    case "belongsTo":
      return { ...base, type: "string", description: base.description ?? `id of a ${def.target}.` };
  }
}

const nullable = (schema: Schema): Schema => ({ ...schema, type: [schema.type as string, "null"] });

function resourceSchemas(resource: Resource) {
  const record: Record<string, Schema> = { id: { type: "string", format: "uuid", readOnly: true } };
  const create: Record<string, Schema> = {};
  const required: string[] = [];
  const recordRequired = ["id", "createdAt", "updatedAt"];

  for (const [key, def] of storedFields(resource)) {
    const value = { ...fieldJsonSchema(def), title: (def as { label?: string }).label ?? key };
    record[key] = def.required ? value : nullable(value);
    create[key] = def.required ? value : nullable(value);
    if ("default" in def && def.default !== undefined) create[key] = { ...create[key], default: def.default };
    if (def.required) recordRequired.push(key);
    if (def.required && !("default" in def && def.default !== undefined)) required.push(key);
  }
  record.createdAt = { type: "string", format: "date-time", readOnly: true };
  record.updatedAt = { type: "string", format: "date-time", readOnly: true };

  return {
    [resource.name]: { type: "object", properties: record, required: recordRequired },
    [`${resource.name}Create`]: { type: "object", properties: create, required, additionalProperties: false },
    [`${resource.name}Update`]: { type: "object", properties: create, additionalProperties: false, description: "Only the fields to change." },
    [`${resource.name}Page`]: {
      type: "object",
      properties: {
        data: { type: "array", items: { $ref: `#/components/schemas/${resource.name}` } },
        meta: { $ref: "#/components/schemas/PageMeta" },
      },
      required: ["data", "meta"],
    },
  };
}

const json = (schema: Schema) => ({ "application/json": { schema } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const problem = (description: string) => ({ description, content: json(ref("Problem")) });

function rolesNote(policy: Policy | undefined, action: PolicyAction): string {
  if (!policy) return "Any signed-in user.";
  const roles = policy[action === "list" ? "read" : action];
  if (roles.includes("*")) return "Any signed-in user.";
  return roles.length ? `Roles: ${roles.join(", ")}.` : "No role may do this.";
}

function listParameters(resource: Resource): Schema[] {
  const fields = storedFields(resource);
  const sortable = ["createdAt", "updatedAt", ...fields.filter(([, def]) => isSortable(def)).map(([key]) => key)];
  const parameters: Schema[] = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: resource.perPage } },
    {
      name: "sort",
      in: "query",
      description: "Field to sort by; prefix with - for descending.",
      schema: { type: "string", enum: sortable.flatMap((key) => [key, `-${key}`]) },
    },
  ];
  if (fields.some(([, def]) => isSearchable(def))) {
    parameters.push({ name: "q", in: "query", description: "Free-text search across the searchable fields.", schema: { type: "string", maxLength: 200 } });
  }
  for (const [key, def] of fields) {
    if (!isFilterable(def)) continue;
    parameters.push({ name: `filter[${key}]`, in: "query", description: `Only records whose ${key} equals this.`, schema: fieldJsonSchema(def) });
  }
  return parameters;
}

export function openApiDocument(options: OpenApiOptions): Schema {
  const { resources, policies = {}, role, visibility = "role" } = options;
  const allowed = (resource: Resource, action: PolicyAction) =>
    visibility === "public" || (role !== null && can(policies[resource.name], role, action));

  const paths: Record<string, Schema> = {};
  const schemas: Record<string, Schema> = {
    Problem: {
      type: "object",
      properties: {
        error: { type: "string", examples: ["Validation failed."] },
        issues: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } },
        field: { type: "string", description: "The field a uniqueness conflict is about." },
      },
      required: ["error"],
    },
    PageMeta: {
      type: "object",
      properties: {
        page: { type: "integer" },
        perPage: { type: "integer" },
        total: { type: "integer", description: "Matching rows, counted up to 10,000." },
        totalPages: { type: "integer" },
        exactTotal: { type: "boolean", description: "False when there are more than 10,000 matches; page with the cursors instead." },
        nextCursor: { type: "string", description: "Pass as ?cursor= for the next page." },
        prevCursor: { type: "string" },
      },
      required: ["page", "perPage", "total", "totalPages", "exactTotal"],
    },
  };
  const tags: Schema[] = [{ name: "Authentication", description: "Sign in here first: the session cookie authorizes every other request." }];

  const auth: Record<string, Schema> = {
    "/api/auth/sign-up/email": {
      post: {
        operationId: "signUp",
        tags: ["Authentication"],
        summary: "Create an account",
        security: [],
        requestBody: { required: true, content: json({ type: "object", properties: { name: { type: "string" }, email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 } }, required: ["name", "email", "password"] }) },
        responses: { "200": { description: "Signed up and signed in; sets the session cookie." }, "422": problem("The email is taken or the password too short.") },
      },
    },
    "/api/auth/sign-in/email": {
      post: {
        operationId: "signIn",
        tags: ["Authentication"],
        summary: "Sign in",
        security: [],
        requestBody: { required: true, content: json({ type: "object", properties: { email: { type: "string", format: "email" }, password: { type: "string" } }, required: ["email", "password"] }) },
        responses: { "200": { description: "Signed in; sets the session cookie." }, "401": problem("Wrong email or password.") },
      },
    },
    "/api/auth/get-session": {
      get: { operationId: "getSession", tags: ["Authentication"], summary: "The current session", responses: { "200": { description: "The signed-in user and session, or null." } } },
    },
    "/api/auth/sign-out": {
      post: { operationId: "signOut", tags: ["Authentication"], summary: "Sign out", responses: { "200": { description: "Signed out; clears the session cookie." } } },
    },
  };
  Object.assign(paths, auth);

  for (const resource of resources) {
    const policy = policies[resource.name];
    const can = (action: PolicyAction) => allowed(resource, action);
    if (!(["list", "read", "create", "update", "delete"] as const).some(can)) continue;

    Object.assign(schemas, resourceSchemas(resource));
    const tag = resource.pluralLabel;
    // "Security events" → "SecurityEvents", for operation ids like listSecurityEvents.
    const plural = tag.replace(/(?:^|\s+)(\w)/g, (_, letter: string) => letter.toUpperCase());
    tags.push({ name: tag, description: `The ${resource.pluralLabel.toLowerCase()} API, generated from resources/${resource.slug}.` });
    const denied = { "401": problem("Sign in first."), "403": problem("Your role can't do this.") };
    const collection: Schema = {};
    const item: Schema = {};
    const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };

    if (can("list")) {
      collection.get = {
        operationId: `list${plural}`,
        tags: [tag],
        summary: `List ${resource.pluralLabel.toLowerCase()}`,
        description: rolesNote(policy, "list"),
        parameters: listParameters(resource),
        responses: { "200": { description: "One page of records.", content: json(ref(`${resource.name}Page`)) }, "400": problem("A query parameter isn't accepted."), ...denied },
      };
    }
    if (can("create")) {
      collection.post = {
        operationId: `create${resource.name}`,
        tags: [tag],
        summary: `Create a ${resource.label.toLowerCase()}`,
        description: rolesNote(policy, "create"),
        requestBody: { required: true, content: json(ref(`${resource.name}Create`)) },
        responses: {
          "201": { description: "Created. The Location header points at it.", content: json(ref(resource.name)) },
          "409": problem("A unique field already has this value."),
          "422": problem("Validation failed; `issues` lists each field."),
          ...denied,
        },
      };
    }
    if (can("read")) {
      item.get = {
        operationId: `get${resource.name}`,
        tags: [tag],
        summary: `Get a ${resource.label.toLowerCase()}`,
        description: rolesNote(policy, "read"),
        parameters: [idParam],
        responses: { "200": { description: "The record.", content: json(ref(resource.name)) }, "404": problem("No record with this id."), ...denied },
      };
    }
    if (can("update")) {
      const body = (name: string) => ({ required: true, content: json(ref(name)) });
      const responses = {
        "200": { description: "The updated record.", content: json(ref(resource.name)) },
        "404": problem("No record with this id."),
        "409": problem("A unique field already has this value."),
        "422": problem("Validation failed; `issues` lists each field."),
        ...denied,
      };
      item.patch = { operationId: `update${resource.name}`, tags: [tag], summary: `Update a ${resource.label.toLowerCase()}`, description: `Send only the fields to change. ${rolesNote(policy, "update")}`, parameters: [idParam], requestBody: body(`${resource.name}Update`), responses };
      item.put = { operationId: `replace${resource.name}`, tags: [tag], summary: `Replace a ${resource.label.toLowerCase()}`, description: `Send every field. ${rolesNote(policy, "update")}`, parameters: [idParam], requestBody: body(`${resource.name}Create`), responses };
    }
    if (can("delete")) {
      item.delete = {
        operationId: `delete${resource.name}`,
        tags: [tag],
        summary: `Delete a ${resource.label.toLowerCase()}`,
        description: rolesNote(policy, "delete"),
        parameters: [idParam],
        responses: { "204": { description: "Deleted." }, "404": problem("No record with this id."), "409": problem("Other records still point at this one."), ...denied },
      };
    }
    if (Object.keys(collection).length) paths[`/api/${resource.slug}`] = collection;
    if (Object.keys(item).length) paths[`/api/${resource.slug}/{id}`] = item;
  }

  const visible = tags.length - 1;
  const intro =
    role === null && visibility === "role"
      ? "Sign in to see the endpoints available to you: use **Authentication → Sign in** below, or sign in to the app in this browser, then reload."
      : `${visible} resource API${visible === 1 ? "" : "s"} available to ${visibility === "public" ? "everyone" : `the **${role}** role`}.`;

  return {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "API",
      version: options.version ?? "1.0.0",
      description: [options.description, intro, "Requests are authorized by the session cookie. Writes must be same-origin JSON (`Content-Type: application/json`)."]
        .filter(Boolean)
        .join("\n\n"),
    },
    servers: options.serverUrl ? [{ url: options.serverUrl }] : undefined,
    security: [{ session: [] }],
    tags,
    paths,
    components: {
      schemas,
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "better-auth.session_token", description: "Set by signing in. Browsers send it automatically on same-origin requests." },
      },
    },
  };
}
