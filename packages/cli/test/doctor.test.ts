import { describe, expect, it } from "vitest";
import { checkNode, checkTemplateVersion, declaredBindings, envProblems, MINIMUM_NODE, parseEnvFile } from "../src/commands/doctor.js";

describe("checkNode (#54)", () => {
  it("passes the minimum and anything above it", () => {
    expect(checkNode(`v${MINIMUM_NODE}.0.0`).verdict).toBe("ok");
    expect(checkNode("v26.4.0").verdict).toBe("ok");
  });

  it("fails below it, and says which version is needed", () => {
    const finding = checkNode("v18.20.0");
    expect(finding.verdict).toBe("fail");
    expect(finding.detail).toContain(String(MINIMUM_NODE));
    expect(finding.fix).toBeDefined();
  });

  it("says it cannot tell rather than guessing", () => {
    // "Cannot tell" and "fine" are different answers, and only one is reassuring.
    expect(checkNode("not a version").verdict).toBe("skip");
  });
});

describe("parseEnvFile (#54)", () => {
  it("splits on the first = only, so base64 padding is not an empty value", () => {
    // The bug this test exists for: every app's BETTER_AUTH_SECRET is base64 and often
    // ends in "=", and splitting on every "=" reported it as unset.
    const values = parseEnvFile("BETTER_AUTH_SECRET=4RPdH9nQ2bE7xKlZmWvTgY6sAoPj1cUf==");
    expect(values.get("BETTER_AUTH_SECRET")).toBe("4RPdH9nQ2bE7xKlZmWvTgY6sAoPj1cUf==");
  });

  it("ignores comments and blank lines", () => {
    const values = parseEnvFile("# a comment\n\nA=1\n  # indented comment\nB=2\n");
    expect([...values.keys()]).toEqual(["A", "B"]);
  });

  it("strips surrounding quotes", () => {
    expect(parseEnvFile('MAIL_FROM="Acme <hi@acme.com>"').get("MAIL_FROM")).toBe("Acme <hi@acme.com>");
    expect(parseEnvFile("A='x'").get("A")).toBe("x");
  });

  it("keeps an empty value as empty rather than dropping the key", () => {
    const values = parseEnvFile("RESEND_API_KEY=");
    expect(values.has("RESEND_API_KEY")).toBe(true);
    expect(values.get("RESEND_API_KEY")).toBe("");
  });

  it("ignores a line with no key", () => {
    expect([...parseEnvFile("=novalue\njust text\n").keys()]).toEqual([]);
  });
});

describe("envProblems (#54)", () => {
  const example = "# comment\nBETTER_AUTH_SECRET=\nRESEND_API_KEY=\nMAIL_FROM=\n";

  it("says nothing about optional keys left empty", () => {
    // The example says mail may stay empty to print to the console, so an empty
    // RESEND_API_KEY is a choice, not a fault.
    const actual = "BETTER_AUTH_SECRET=abc123==\nRESEND_API_KEY=\nMAIL_FROM=\n";
    expect(envProblems(example, actual)).toEqual({ absent: [], empty: [] });
  });

  it("names a required key that is there but empty", () => {
    const actual = "BETTER_AUTH_SECRET=\nRESEND_API_KEY=\nMAIL_FROM=\n";
    expect(envProblems(example, actual).empty).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it("names keys the file does not have at all", () => {
    expect(envProblems(example, "BETTER_AUTH_SECRET=abc\n").absent).toEqual(["RESEND_API_KEY", "MAIL_FROM"]);
  });

  it("takes the required list as an argument, so it is not a hidden rule", () => {
    const actual = "BETTER_AUTH_SECRET=abc\nRESEND_API_KEY=\nMAIL_FROM=\n";
    expect(envProblems(example, actual, ["RESEND_API_KEY"]).empty).toEqual(["RESEND_API_KEY"]);
  });
});

describe("declaredBindings (#54)", () => {
  it("reads the bindings out of a wrangler.jsonc, comments and all", () => {
    const config = `{
      // The database.
      "d1_databases": [{ "binding": "DB" }],
      /* uploads */
      "r2_buckets": [{ "binding": "STORAGE" }]
    }`;
    expect(declaredBindings(config)).toEqual({ d1: true, r2: true, kv: false });
  });

  it("notices when one is absent", () => {
    expect(declaredBindings('{ "d1_databases": [] }')).toEqual({ d1: true, r2: false, kv: false });
  });
});

describe("checkTemplateVersion (#54)", () => {
  it("is happy when the app and the CLI agree", () => {
    expect(checkTemplateVersion("0.11.0", "0.11.0").verdict).toBe("ok");
  });

  it("warns when the app is behind, and says how to catch up", () => {
    const finding = checkTemplateVersion("0.10.2", "0.11.0");
    expect(finding.verdict).toBe("warn");
    expect(finding.detail).toContain("0.10.2");
    expect(finding.fix).toContain("flare update");
  });

  it("warns the other way round too, and blames the CLI", () => {
    const finding = checkTemplateVersion("0.12.0", "0.11.0");
    expect(finding.verdict).toBe("warn");
    expect(finding.fix).toContain("Update the CLI");
  });

  it("compares numerically, not as text", () => {
    // "0.9.0" > "0.11.0" as strings, which is the trap.
    expect(checkTemplateVersion("0.9.0", "0.11.0").fix).toContain("flare update");
  });

  it("says it cannot tell when nothing is installed", () => {
    expect(checkTemplateVersion(undefined, "0.11.0").verdict).toBe("skip");
  });
});
