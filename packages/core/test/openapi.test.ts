import { describe, expect, it } from "vitest";
import { defineResource, definePolicy, field } from "../src/index.js";
import { openApiDocument } from "../src/server/openapi.js";

const Deal = defineResource({
  name: "Deal",
  fields: {
    title: field.string(),
    value: field.int({ min: 0 }),
    stage: field.enum(["lead", "won", "lost"]),
    phone: field.tel({ required: false }),
    tags: field.multiselect(["hot", "cold"], { required: false }),
  },
});
const Note = defineResource({ name: "Note", fields: { body: field.text() } });
const policies = {
  Deal: definePolicy({ resource: "Deal", read: ["*"], create: ["admin", "staff"], update: ["admin"], delete: ["admin"] }),
};
type Doc = { paths: Record<string, Record<string, { operationId?: string; parameters?: { name: string }[] }>>; components: { schemas: Record<string, { properties: Record<string, Record<string, unknown>>; required?: string[] }> }; tags: { name: string }[] };
const build = (role: string | null, visibility?: "role" | "public") => openApiDocument({ resources: [Deal, Note], policies, role, visibility }) as unknown as Doc;

describe("openApiDocument", () => {
  it("shows a visitor only the sign-in endpoints", () => {
    expect(Object.keys(build(null).paths).every((path) => path.startsWith("/api/auth/"))).toBe(true);
  });

  it("shows each role exactly the operations its policy allows", () => {
    const user = build("user").paths;
    expect(Object.keys(user["/api/deals"]!)).toEqual(["get"]);
    expect(Object.keys(user["/api/deals/{id}"]!)).toEqual(["get"]);
    expect(Object.keys(user["/api/notes"]!)).toEqual(["get", "post"]); // no policy: any signed-in user

    const admin = build("admin").paths;
    expect(Object.keys(admin["/api/deals/{id}"]!).sort()).toEqual(["delete", "get", "patch", "put"]);
    expect(Object.keys(build(null, "public").paths)).toContain("/api/deals");
  });

  it("describes fields with their formats and nullability", () => {
    const schemas = build("admin").components.schemas;
    expect(schemas.DealCreate!.required).toEqual(["title", "value", "stage"]);
    expect(schemas.DealCreate!.properties.value).toMatchObject({ type: "integer", minimum: 0 });
    expect(schemas.DealCreate!.properties.stage).toMatchObject({ enum: ["lead", "won", "lost"] });
    expect(schemas.DealCreate!.properties.phone).toMatchObject({ type: ["string", "null"], pattern: String.raw`^\+[1-9]\d{6,14}$` });
    expect(schemas.DealCreate!.properties.tags).toMatchObject({ type: ["array", "null"], uniqueItems: true });
  });

  it("documents list parameters and names every operation", () => {
    const list = build("admin").paths["/api/deals"]!.get!;
    const names = list.parameters!.map((parameter) => parameter.name);
    expect(names).toEqual(expect.arrayContaining(["page", "perPage", "sort", "q", "filter[stage]"]));
    expect(list.operationId).toBe("listDeals");
    expect(build("admin").paths["/api/deals/{id}"]!.patch!.operationId).toBe("updateDeal");
  });
});
