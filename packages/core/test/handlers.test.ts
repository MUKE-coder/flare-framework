import { drizzle } from "drizzle-orm/sql-js";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import { defineResource, field } from "../src/resource/index.js";
import { createResourceHandlers, type AuthorizeContext } from "../src/server.js";

const company = defineResource({ name: "Company", fields: { name: field.string() } });
const contact = defineResource({
  name: "Contact",
  fields: {
    name: field.string(),
    email: field.string({ format: "email", unique: true }),
    notes: field.text({ required: false, searchable: true }),
    age: field.int({ required: false }),
    score: field.float({ default: 0 }),
    vip: field.boolean({ default: false }),
    status: field.enum(["lead", "customer"], { default: "lead" }),
    companyId: field.belongsTo("Company", { required: false }),
  },
});

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};
const companies = sqliteTable("companies", { id: text("id").primaryKey(), name: text("name").notNull(), ...timestamps });
const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  notes: text("notes"),
  age: integer("age"),
  score: real("score").notNull().default(0),
  vip: integer("vip", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["lead", "customer"] }).notNull().default("lead"),
  companyId: text("company_id").references(() => companies.id),
  ...timestamps,
});

const SQL = await initSqlJs();
const ORIGIN = "https://app.test";

let db: ReturnType<typeof drizzle>;
let calls: AuthorizeContext[];
let deny: Response | undefined;

beforeEach(() => {
  const sqlite = new SQL.Database();
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.run(`CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  sqlite.run(`CREATE TABLE contacts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, notes TEXT, age INTEGER,
    score REAL NOT NULL DEFAULT 0, vip INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead','customer')),
    company_id TEXT REFERENCES companies(id),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  db = drizzle(sqlite);
  calls = [];
  deny = undefined;
});

function handlers(resource = contact, table = contacts) {
  return createResourceHandlers({
    resource,
    table,
    getDb: () => db,
    authorize: (context) => {
      calls.push(context);
      return deny;
    },
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonRequest = (method: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(ORIGIN + path, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function create(body: object) {
  const res = await handlers().collection.POST(jsonRequest("POST", "/api/contacts", body));
  return { res, body: await res.json() };
}

describe("create (POST)", () => {
  it("inserts with generated id, timestamps, and column defaults", async () => {
    const { res, body } = await create({ name: "Ada", email: "ada@example.com" });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ name: "Ada", email: "ada@example.com", score: 0, vip: false, status: "lead", notes: null });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("location")).toBe(`/api/contacts/${body.id}`);
    expect(new Date(body.createdAt).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it("returns 422 with issues for invalid bodies and unknown keys", async () => {
    const { res, body } = await create({ name: "", email: "nope", id: "forced" });
    expect(res.status).toBe(422);
    expect(body.issues.map((i: { path: string }) => i.path).sort()).toEqual(["", "email", "name"]);
  });

  it("rejects non-JSON, malformed JSON, and cross-origin writes", async () => {
    const h = handlers().collection;
    const form = new Request(ORIGIN + "/api/contacts", { method: "POST", body: "name=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect((await h.POST(form)).status).toBe(415);
    expect((await h.POST(jsonRequest("POST", "/api/contacts", "{not json"))).status).toBe(400);
    expect((await h.POST(jsonRequest("POST", "/api/contacts", { name: "x", email: "x@y.z" }, { origin: "https://evil.test" }))).status).toBe(403);
  });

  it("maps unique and foreign key violations to 409/422", async () => {
    await create({ name: "Ada", email: "ada@example.com" });
    const dup = await create({ name: "Ada 2", email: "ada@example.com" });
    expect(dup.res.status).toBe(409);
    expect(dup.body).toEqual({ error: "Email is already taken.", field: "email" });

    const orphan = await create({ name: "Bob", email: "bob@example.com", companyId: "missing" });
    expect(orphan.res.status).toBe(422);
  });
});

describe("list (GET collection)", () => {
  beforeEach(async () => {
    for (const [name, status, vip, age] of [
      ["Ada", "customer", true, 36],
      ["Bob 100%", "lead", false, null],
      ["Cy", "lead", true, 20],
    ] as const) {
      await create({ name, email: `${name.split(" ")[0]!.toLowerCase()}@example.com`, status, vip, age });
    }
  });

  const list = async (query = "") => {
    const res = await handlers().collection.GET(new Request(`${ORIGIN}/api/contacts${query}`));
    return { status: res.status, body: await res.json() };
  };

  it("paginates with metadata", async () => {
    const { body } = await list("?perPage=2&page=2&sort=name");
    expect(body.meta).toEqual({ page: 2, perPage: 2, total: 3, totalPages: 2 });
    expect(body.data.map((c: { name: string }) => c.name)).toEqual(["Cy"]);
  });

  it("sorts ascending and descending", async () => {
    expect((await list("?sort=-name")).body.data.map((c: { name: string }) => c.name)).toEqual(["Cy", "Bob 100%", "Ada"]);
  });

  it("searches string fields, treating % and _ literally", async () => {
    expect((await list("?q=100%25")).body.data.map((c: { name: string }) => c.name)).toEqual(["Bob 100%"]);
    // Case-insensitive, across every searchable string field (name and email here).
    expect((await list("?q=ADA")).body.data.map((c: { name: string }) => c.name)).toEqual(["Ada"]);
    expect((await list("?q=cy%40example")).body.data.map((c: { name: string }) => c.name)).toEqual(["Cy"]);
    expect((await list("?q=a_a")).body.meta.total).toBe(0);
  });

  it("filters by enum, boolean, and null", async () => {
    expect((await list("?filter[status]=lead")).body.meta.total).toBe(2);
    expect((await list("?filter[vip]=true&filter[status]=lead")).body.data.map((c: { name: string }) => c.name)).toEqual(["Cy"]);
    expect((await list("?filter[companyId]=null")).body.meta.total).toBe(3);
  });

  it("rejects unknown sorts, filters, and bad paging with 400", async () => {
    for (const query of ["?sort=notes", "?filter[email]=x", "?filter[status]=vip", "?page=0", "?perPage=500", "?filter[age]=1"]) {
      expect((await list(query)).status, query).toBe(400);
    }
  });
});

describe("item routes", () => {
  it("reads, patches, replaces, and deletes", async () => {
    const { body: created } = await create({ name: "Ada", email: "ada@example.com", notes: "hi", age: 30, status: "customer" });
    const h = handlers().item;

    const read = await h.GET(new Request(`${ORIGIN}/api/contacts/${created.id}`), params(created.id));
    expect(read.status).toBe(200);

    const patched = await h.PATCH(jsonRequest("PATCH", `/api/contacts/${created.id}`, { age: 31 }), params(created.id));
    expect(await patched.json()).toMatchObject({ age: 31, notes: "hi", status: "customer" });

    const badPatch = await h.PATCH(jsonRequest("PATCH", `/api/contacts/${created.id}`, { name: null }), params(created.id));
    expect(badPatch.status).toBe(422);

    const replaced = await h.PUT(jsonRequest("PUT", `/api/contacts/${created.id}`, { name: "Ada L", email: "ada@example.com" }), params(created.id));
    expect(await replaced.json()).toMatchObject({ name: "Ada L", notes: null, age: null, status: "lead", score: 0 });

    const deleted = await h.DELETE(new Request(`${ORIGIN}/api/contacts/${created.id}`, { method: "DELETE" }), params(created.id));
    expect(deleted.status).toBe(204);
    expect((await h.GET(new Request(`${ORIGIN}/api/contacts/${created.id}`), params(created.id))).status).toBe(404);
  });

  it("returns 404 for missing records on every verb", async () => {
    const h = handlers().item;
    const id = "missing";
    expect((await h.GET(new Request(`${ORIGIN}/x`), params(id))).status).toBe(404);
    expect((await h.PATCH(jsonRequest("PATCH", "/x", { age: 1 }), params(id))).status).toBe(404);
    expect((await h.PUT(jsonRequest("PUT", "/x", { name: "a", email: "a@b.co" }), params(id))).status).toBe(404);
    expect((await h.DELETE(new Request(`${ORIGIN}/x`, { method: "DELETE" }), params(id))).status).toBe(404);
  });

  it("refuses to delete a record other records still reference", async () => {
    const companyHandlers = handlers(company as never, companies as never);
    const res = await companyHandlers.collection.POST(jsonRequest("POST", "/api/companies", { name: "Acme" }));
    const acme = await res.json();
    await create({ name: "Ada", email: "ada@example.com", companyId: acme.id });

    const del = await companyHandlers.item.DELETE(new Request(`${ORIGIN}/api/companies/${acme.id}`, { method: "DELETE" }), params(acme.id));
    expect(del.status).toBe(409);
  });
});

describe("authorization", () => {
  it("passes action and id to authorize, and returns its denial", async () => {
    deny = Response.json({ error: "nope" }, { status: 401 });
    const h = handlers();
    expect((await h.collection.GET(new Request(`${ORIGIN}/api/contacts`))).status).toBe(401);
    expect((await h.item.DELETE(new Request(`${ORIGIN}/api/contacts/abc`, { method: "DELETE" }), params("abc"))).status).toBe(401);
    expect(calls.map(({ action, id }) => ({ action, id }))).toEqual([{ action: "list", id: undefined }, { action: "delete", id: "abc" }]);
  });

  it("reads the body of a denied write before answering", async () => {
    // An unread body breaks the next request through wrangler's local dev proxy.
    deny = Response.json({ error: "nope" }, { status: 403 });
    const h = handlers();
    const post = jsonRequest("POST", "/api/contacts", { name: "Ada", email: "ada@example.com" });
    expect((await h.collection.POST(post)).status).toBe(403);
    expect(post.bodyUsed).toBe(true);
    const patch = jsonRequest("PATCH", "/api/contacts/abc", { name: "Ada" });
    expect((await h.item.PATCH(patch, params("abc"))).status).toBe(403);
    expect(patch.bodyUsed).toBe(true);
  });
});

describe("configuration", () => {
  it("fails fast when the table and descriptor disagree", () => {
    const stale = sqliteTable("contacts", { id: text("id").primaryKey(), name: text("name"), ...timestamps });
    expect(() => handlers(contact, stale as never)).toThrow(/no column for "email"/);
  });
});
