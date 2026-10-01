import { describe, expect, it } from "vitest";
import { crossOrigin } from "../templates/app/lib/resource/http.js";

/**
 * The CSRF guard every generated write calls first.
 *
 * It used to compare `Origin` with `new URL(request.url).origin` alone, which is wrong on
 * the Next.js stack: `request.url` there is built from the server's own idea of its
 * address and ignores the `Host` header, so a request to http://127.0.0.1:3000 arrives
 * claiming to be http://localhost:3000. Every write from the other spelling was refused.
 * CI found it; a browser on the "wrong" one of those two addresses would have.
 */
const write = (url: string, headers: Record<string, string>) => new Request(url, { method: "POST", headers });

describe("the cross-origin guard", () => {
  it("allows a request with no Origin, which is not from a browser", () => {
    // A cron job or a script with an API key. Nothing is riding along automatically, so
    // there is no CSRF to prevent.
    expect(crossOrigin(write("http://localhost:3000/api/invoices", {}))).toBe(false);
  });

  it("allows a same-origin write", () => {
    expect(crossOrigin(write("http://localhost:3000/api/invoices", { origin: "http://localhost:3000" }))).toBe(false);
  });

  it("refuses a write from another site", () => {
    expect(crossOrigin(write("http://localhost:3000/api/invoices", { origin: "https://evil.example" }))).toBe(true);
  });

  it("trusts the host the client addressed, not the server's own idea of it", () => {
    // Exactly the Next.js case: request.url says localhost, the client said 127.0.0.1.
    const request = write("http://localhost:3000/api/invoices", { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" });
    expect(crossOrigin(request)).toBe(false);
  });

  it("still accepts the origin request.url reports, when the Host says otherwise", () => {
    // Behind a proxy that rewrote Host, a same-origin write by request.url must not break.
    const request = write("http://localhost:3000/api/invoices", { origin: "http://localhost:3000", host: "internal.svc:8080" });
    expect(crossOrigin(request)).toBe(false);
  });

  it("uses the forwarded host and scheme a proxy sets", () => {
    const request = write("http://localhost:3000/api/invoices", {
      origin: "https://shop.example",
      host: "localhost:3000",
      "x-forwarded-host": "shop.example",
      "x-forwarded-proto": "https",
    });
    expect(crossOrigin(request)).toBe(false);
  });

  it("refuses another site even when the forwarded host is set", () => {
    const request = write("http://localhost:3000/api/invoices", {
      origin: "https://evil.example",
      "x-forwarded-host": "shop.example",
      "x-forwarded-proto": "https",
    });
    expect(crossOrigin(request)).toBe(true);
  });

  it("does not let a scheme mismatch pass as same-origin", () => {
    // http://shop.example writing to https://shop.example is a different origin.
    const request = write("https://shop.example/api/invoices", { origin: "http://shop.example", host: "shop.example" });
    expect(crossOrigin(request)).toBe(true);
  });
});
