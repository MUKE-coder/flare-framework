import { describe, expect, it } from "vitest";
import { isStaleChunkError } from "../templates/app/lib/stale-chunk.js";

describe("isStaleChunkError", () => {
  it("recognises the message a tab running old code actually throws", () => {
    // Verbatim from a browser that had one Flare app's chunks cached and was then
    // served another on the same localhost port. It names a module in the app, which
    // is why it reads like a bug in the app and is not one.
    const error = new Error(
      "Module [project]/node_modules/.pnpm/lucide-react@1.69.0/node_modules/lucide-react/dist/esm/icons/key-round.mjs " +
        "[app-client] (ecmascript) <export default as KeyRoundIcon> was instantiated because it was required from " +
        "module [project]/components/dashboard/user-menu.tsx [app-client] (ecmascript), but the module factory is not available.",
    );
    expect(isStaleChunkError(error)).toBe(true);
  });

  it("recognises the other names the same problem travels under", () => {
    const chunkLoad = Object.assign(new Error("Loading chunk 42 failed."), { name: "ChunkLoadError" });
    expect(isStaleChunkError(chunkLoad)).toBe(true);
    expect(isStaleChunkError(new Error("Failed to fetch dynamically imported module: /_next/static/x.js"))).toBe(true);
    expect(isStaleChunkError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new Error("Loading CSS chunk 7 failed"))).toBe(true);
    expect(isStaleChunkError(new Error("Importing a module script failed."))).toBe(true);
  });

  it("leaves a real failure alone, so it still gets `reset` and the digest", () => {
    // The distinction has to be narrow: calling an ordinary bug "old code" would send
    // people to reload a page that will throw again for a reason nobody has looked at.
    expect(isStaleChunkError(new Error("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isStaleChunkError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(false);
    expect(isStaleChunkError(new Error("Invalid `prisma.contact.findMany()` invocation"))).toBe(false);
  });

  it("survives whatever it is handed", () => {
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError({})).toBe(false);
    expect(isStaleChunkError("module factory is not available")).toBe(false);
  });
});
