import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { templatesDir } from "../src/utils/fs.js";

/**
 * The Markdown renderer behind a `markdown` field's preview and record page.
 *
 * It exists instead of a dependency for one reason: it builds React elements, so stored
 * text can never become markup. These assertions are on the source, because the component
 * needs a React renderer to run and what matters here is structural — that there is no
 * `dangerouslySetInnerHTML` anywhere in it and that a link's href is checked.
 */
const source = readFileSync(join(templatesDir, "app/components/dashboard/fields/markdown.tsx"), "utf8");

describe("the markdown renderer", () => {
  it("never builds HTML from the stored text", () => {
    // The whole safety argument. If either of these appears as code, a sanitiser has to
    // appear with it. Matched as the JSX prop and the assignment, not as any mention —
    // the component's own comment explains why neither is there.
    expect(source).not.toContain("dangerouslySetInnerHTML={");
    expect(source).not.toMatch(/\.innerHTML\s*=/);
  });

  it("checks a link's protocol before putting it in an href", () => {
    // `[click](javascript:alert(1))` is the one place a value reaches an attribute.
    expect(source).toContain("SAFE_PROTOCOL");
    expect(source).toMatch(/SAFE_PROTOCOL\s*=\s*\/\^\(https\?:\|mailto:\|tel:\|\\\/\|#\)/);
    expect(source).toContain("SAFE_PROTOCOL.test(href)");
  });

  it("shows a refused link as text rather than dropping it", () => {
    // Silently removing something somebody typed is worse than showing it unlinked.
    const branch = source.slice(source.indexOf("SAFE_PROTOCOL.test(href)"));
    expect(branch).toContain("<span key={key}>");
  });

  it("opens external links safely", () => {
    expect(source).toContain('rel="noreferrer noopener"');
  });

  it("is honest about what it does not support", () => {
    // Tables and raw HTML come out as the text you typed; the comment says so, because
    // finding out by writing a table is a worse way to learn it.
    expect(source).toMatch(/Tables, footnotes,\s*\n?\s*\*?\s*images and raw HTML are not rendered/);
  });
});

describe("the markdown field", () => {
  const field = readFileSync(join(templatesDir, "app/components/dashboard/fields/markdown-field.tsx"), "utf8");

  it("adds no dependency for a two-state toggle", () => {
    // Tabs would mean another Radix package in every app for one field's editor.
    expect(field).not.toContain("@/components/ui/tabs");
    expect(field).toContain("aria-pressed");
  });

  it("will not offer a preview of nothing", () => {
    expect(field).toContain("disabled={empty}");
  });
});

describe("the json field", () => {
  const field = readFileSync(join(templatesDir, "app/components/dashboard/fields/json-field.tsx"), "utf8");

  it("says what is wrong rather than only that something is", () => {
    // The browser's parse error names the position, which is the useful part of it.
    expect(field).toContain("error.message");
    expect(field).toContain("Not valid JSON");
  });

  it("will not reformat text that does not parse", () => {
    expect(field).toContain("disabled={disabled || message !== null");
  });
});

describe("the tags field", () => {
  const field = readFileSync(join(templatesDir, "app/components/dashboard/fields/tags-field.tsx"), "utf8");

  it("commits a tag on blur, so clicking Save does not lose what was typed", () => {
    expect(field).toContain("onBlur={() => commit(draft)}");
  });

  it("stops Enter from submitting the form", () => {
    // Enter in a text input saves the record; here it means "that is one tag".
    const handler = field.slice(field.indexOf("function onKeyDown"));
    expect(handler).toContain("event.preventDefault()");
  });

  it("refuses a duplicate case-insensitively", () => {
    expect(field).toContain("existing.toLowerCase() === tag.toLowerCase()");
  });
});
