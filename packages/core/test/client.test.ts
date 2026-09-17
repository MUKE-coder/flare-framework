import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { ApiError, createResourceClient } from "../src/client.js";
import { defineResource, field } from "../src/resource/index.js";

const contact = defineResource({
  name: "Contact",
  fields: { name: field.string(), status: field.enum(["lead", "customer"], { default: "lead" }) },
});

function client(responses: Response[]) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => responses.shift()!);
  return { fetch, contacts: createResourceClient<typeof contact>("/api/contacts/", { fetch, baseURL: "https://app.test/" }) };
}

describe("createResourceClient", () => {
  it("builds list URLs with paging, sort, search, and filters", async () => {
    const { fetch, contacts } = client([Response.json({ data: [], meta: { page: 1, perPage: 10, total: 0, totalPages: 1 } })]);
    await contacts.list({ page: 2, perPage: 10, sort: "-name", q: "a b", filter: { status: "lead", companyId: null } });
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://app.test/api/contacts?page=2&perPage=10&sort=-name&q=a+b&filter%5Bstatus%5D=lead&filter%5BcompanyId%5D=null",
    );
  });

  it("sends JSON for writes and uses the right verbs", async () => {
    const record = { id: "1", name: "Ada", status: "lead", createdAt: "", updatedAt: "" };
    const { fetch, contacts } = client([Response.json(record), Response.json(record), Response.json(record), new Response(null, { status: 204 })]);

    await contacts.create({ name: "Ada" });
    await contacts.update("1", { status: "customer" });
    await contacts.replace("1", { name: "Ada" });
    expect(await contacts.delete("a/b")).toBeUndefined();

    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url, init]) => `${init.method ?? "GET"} ${url}`)).toEqual([
      "POST https://app.test/api/contacts",
      "PATCH https://app.test/api/contacts/1",
      "PUT https://app.test/api/contacts/1",
      "DELETE https://app.test/api/contacts/a%2Fb",
    ]);
    expect(new Headers(calls[0]![1].headers).get("content-type")).toBe("application/json");
    expect(calls[0]![1].body).toBe('{"name":"Ada"}');
  });

  it("throws ApiError with status, issues, and field", async () => {
    const { contacts } = client([Response.json({ error: "Email is already taken.", field: "email" }, { status: 409 })]);
    const error = await contacts.create({ name: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: "Email is already taken.", field: "email", issues: [] });
  });

  it("is typed from the descriptor", () => {
    const { contacts } = client([]);
    expectTypeOf(contacts.create).parameter(0).toEqualTypeOf<{ name: string; status?: "lead" | "customer" }>();
    expectTypeOf(contacts.get).returns.resolves.toHaveProperty("status").toEqualTypeOf<"lead" | "customer">();
  });
});
