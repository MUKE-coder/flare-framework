import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLARE_VERSION } from "@flare/core";

const bin = fileURLToPath(new URL("../bin/flare.js", import.meta.url));

function flare(...args: string[]) {
  return execFileSync(process.execPath, [bin, ...args], { encoding: "utf8" });
}

describe("flare binary", () => {
  it("prints the version", () => {
    expect(flare("--version")).toContain(FLARE_VERSION);
  });

  it("prints help with no arguments", () => {
    expect(flare()).toContain("Usage:");
  });
});
