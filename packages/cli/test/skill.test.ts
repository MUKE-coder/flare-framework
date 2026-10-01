import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLARE_VERSION, NUMBER_FORMATS, STRING_FORMATS } from "@flaredev/core";
import { parseFields } from "../src/generator/grammar.js";

/**
 * The agent skill and the field grammar documentation.
 *
 * Both are hand-written prose about a list that lives in code, and both fell behind it:
 * the skill claimed 0.7.3 while the packages were 0.8.1, and said nothing about the
 * twelve field types 0.8.0 added. An agent reading it would not know they exist.
 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const skill = read("../../../skills/flare/SKILL.md");
const skillGrammar = read("../../../skills/flare/references/field-grammar.md");
const docsGrammar = read("../../../docs/src/content/docs/concepts/field-grammar.md");

describe("the skill's metadata", () => {
  it("claims the version the packages are on", () => {
    // Same reason FLARE_VERSION is pinned against all three package.json files: a stale
    // version here tells an agent the framework is older than it is.
    expect(/^\s*version:\s*"([^"]+)"/m.exec(skill)?.[1]).toBe(FLARE_VERSION);
  });
});

describe("every field format reaches the pages that list them", () => {
  for (const [name, text] of [
    ["the skill's field grammar", skillGrammar],
    ["the docs' field grammar", docsGrammar],
  ] as const) {
    it(`${name} names all ${STRING_FORMATS.length} string formats`, () => {
      const missing = STRING_FORMATS.filter((format) => !new RegExp("\\b" + format + "\\b").test(text));
      expect(missing, `add these to ${name}`).toEqual([]);
    });

    it(`${name} names all ${NUMBER_FORMATS.length} number formats`, () => {
      const missing = NUMBER_FORMATS.filter((format) => !new RegExp("\\b" + format + "\\b").test(text));
      expect(missing, `add these to ${name}`).toEqual([]);
    });
  }
});

describe("SKILL.md itself", () => {
  it("says the formats exist, so an agent knows to open the reference", () => {
    // The reference was complete and the skill never mentioned it had formats at all.
    // An agent that doesn't know there is a `money` type writes `price:float`.
    for (const format of ["email", "money", "rating", "slug"]) {
      expect(skill, format).toMatch(new RegExp("\\b" + format + "\\b"));
    }
  });
});

describe("the types SKILL.md tells an agent to use", () => {
  /** The backticked tokens in one of the section's bullets. */
  const bullet = (label: string): string[] => {
    const section = skill.slice(skill.indexOf("### Reach for a specific type"));
    const from = section.indexOf(`**${label}:**`);
    expect(from, label).toBeGreaterThan(-1);
    const text = section.slice(from, section.indexOf("\n- ", from + 1) + 1 || undefined);
    return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
  };

  it("all parse — the whole list, through the real parser", () => {
    // I have written field syntax into documentation that the parser rejects before
    // (`avatar:image`, which reads perfectly and is an error). Prose about a grammar is
    // worth nothing unless the grammar agrees with it.
    const claimed = [
      ...bullet("Text with a shape"),
      ...bullet("Numbers with a meaning"),
      ...bullet("Choices"),
      ...bullet("Longer text"),
      ...bullet("Time"),
    ];
    expect(claimed.length).toBeGreaterThan(20);

    const rejected: string[] = [];
    for (const type of claimed) {
      try {
        parseFields(`thing:${type}`);
      } catch (failure) {
        rejected.push(`${type} — ${(failure as Error).message.split(".")[0]}`);
      }
    }
    expect(rejected, "SKILL.md names types the parser does not accept").toEqual([]);
  });

  it("names file categories that work in the brackets and nowhere else", () => {
    const categories = bullet("Files").filter((token) => /^[a-z]+$/.test(token));
    expect(categories).toContain("image");
    expect(categories).toContain("any");

    for (const category of categories) {
      expect(() => parseFields(`doc:file:[${category}]:5mb`), category).not.toThrow();
      // The section says so in prose; this is the prose being true.
      expect(() => parseFields(`doc:${category}`), category).toThrow();
    }
  });
});
