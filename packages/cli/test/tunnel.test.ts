import { describe, expect, it } from "vitest";
import { portArg } from "../src/commands/run.js";
import { parseLocalUrl, parseTunnelUrl, releaseAsset, toLocalUrl } from "../src/tunnel.js";

describe("quick tunnels", () => {
  it("finds the public URL in cloudflared's log", () => {
    const log = [
      "2026-09-21T22:30:01Z INF Requesting new quick Tunnel on trycloudflare.com...",
      "2026-09-21T22:30:03Z INF |  https://chair-oclc-diff-discusses.trycloudflare.com                                        |",
    ].join("\n");
    expect(parseTunnelUrl(log)).toBe("https://chair-oclc-diff-discusses.trycloudflare.com");
    expect(parseTunnelUrl("INF Requesting new quick Tunnel on trycloudflare.com...")).toBeNull();
  });

  it("finds the address a dev server is listening on", () => {
    expect(parseLocalUrl("  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m3000\x1b[22m/\x1b[39m")).toBe("http://localhost:3000");
    expect(parseLocalUrl("[wrangler:info] Ready on http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(parseLocalUrl("Listening on http://0.0.0.0:4000")).toBe("http://localhost:4000");
    expect(parseLocalUrl("vite v8 building…")).toBeNull();
  });

  it("accepts a port or a URL to share", () => {
    expect(toLocalUrl(undefined)).toBe("http://localhost:3000");
    expect(toLocalUrl("8787")).toBe("http://localhost:8787");
    expect(toLocalUrl(":5173")).toBe("http://localhost:5173");
    expect(toLocalUrl("http://127.0.0.1:9000")).toBe("http://127.0.0.1:9000");
    expect(() => toLocalUrl("my-app")).toThrow(/isn't a port or URL/);
  });

  it("picks Cloudflare's release build for the platform", () => {
    expect(releaseAsset("win32", "x64")).toBe("cloudflared-windows-amd64.exe");
    expect(releaseAsset("linux", "arm64")).toBe("cloudflared-linux-arm64");
    expect(releaseAsset("darwin", "arm64")).toBe("cloudflared-darwin-arm64.tgz");
    expect(() => releaseAsset("aix", "ppc64")).toThrow(/Install it yourself/);
  });

  it("reads --port from forwarded arguments", () => {
    expect(portArg(["--port", "9000"])).toBe("9000");
    expect(portArg(["--port=9001"])).toBe("9001");
    expect(portArg(["--inspector-port", "9229"])).toBeUndefined();
  });
});
