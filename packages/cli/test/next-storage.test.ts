import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Next.js stack's R2 adapter.
 *
 * Every one of these pins a failure that actually happened, all in the same bug: an
 * image upload reported success and stored nothing.
 */
const storage = readFileSync(fileURLToPath(new URL("../templates/next/lib/storage.ts", import.meta.url)), "utf8");

describe("the R2 adapter", () => {
  it("sends a content-length", () => {
    // S3 answers 411 MissingContentLength without one, and Next's patched fetch does
    // not derive it — not even from a buffered body.
    expect(storage).toContain('"content-length": String(body.byteLength)');
  });

  it("buffers the body rather than streaming it", () => {
    // A stream has no length to send. The request body arrives as one.
    expect(storage).toContain("await new Response(value as BodyInit).arrayBuffer()");
    expect(storage).not.toContain("value instanceof ReadableStream");
  });

  it("raises a failed write instead of returning as though it worked", () => {
    expect(storage).toContain("Storage ${doing} failed");

    // The two writes both check. A read returning null on failure is correct — a
    // missing object is a 404, not an error.
    const body = (name: string) => {
      const from = storage.indexOf(`async ${name}(`);
      return storage.slice(from, storage.indexOf("\n  },", from));
    };
    expect(body("put")).toContain("ok(");
    expect(body("delete")).toContain("ok(");
    expect(body("get")).toContain("if (!response.ok");
  });

  it("keeps the slashes in a key", () => {
    // encodeURIComponent on the whole key turns products/a.png into products%2Fa.png,
    // which is a different object name.
    expect(storage).toContain('key.split("/").map(encodeURIComponent).join("/")');
    expect(storage).not.toContain("encodeURIComponent(key)");
  });
});
