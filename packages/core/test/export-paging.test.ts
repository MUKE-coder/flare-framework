import { describe, expect, it } from "vitest";
import { defineResource, field } from "../src/resource/index.js";
import { parseListQuery } from "../src/server/query.js";

/**
 * The page-size cap.
 *
 * It shipped applying to everything, including the dashboard's own CSV export, which
 * asks for 500 at a time — so every export answered "Invalid query." and the button
 * showed an error toast for every resource, always.
 */
const contact = defineResource({ name: "Contact", fields: { name: field.string() } });
const parse = (params: Record<string, string>, options?: { maxPerPage?: number }) =>
  parseListQuery(contact, new URLSearchParams(params), options);

describe("the page-size cap", () => {
  it("refuses an outside request for more than it allows", () => {
    const result = parse({ perPage: "500" });
    expect("issues" in result).toBe(true);
    if (!("issues" in result)) return;
    expect(result.issues[0]!.param).toBe("perPage");
  });

  it("lets a server-side caller raise it", () => {
    // What the export does: page through everything deliberately.
    const result = parse({ perPage: "500" }, { maxPerPage: 500 });
    expect("query" in result).toBe(true);
    if (!("query" in result)) return;
    expect(result.query.perPage).toBe(500);
  });

  it("still refuses more than the raised limit", () => {
    expect("issues" in parse({ perPage: "501" }, { maxPerPage: 500 })).toBe(true);
  });

  it("keeps the default cap when nothing is passed", () => {
    expect("query" in parse({ perPage: "100" })).toBe(true);
    expect("issues" in parse({ perPage: "101" })).toBe(true);
  });
});
