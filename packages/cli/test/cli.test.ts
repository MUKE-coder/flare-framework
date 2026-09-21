import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLARE_VERSION } from "@flaredev/core";

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

describe("versions", () => {
  it("keeps FLARE_VERSION in step with every published package", () => {
    const version = (path: string) => (JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as { version: string }).version;
    expect(version("../package.json")).toBe(FLARE_VERSION);
    expect(version("../../core/package.json")).toBe(FLARE_VERSION);
    expect(version("../../create-flare-framework/package.json")).toBe(FLARE_VERSION);
  });
});
