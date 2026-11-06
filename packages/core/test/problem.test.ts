import { describe, expect, it } from "vitest";
import { ISSUE_CODES, PROBLEM_CODES, problemResponse, wantsJson, type ProblemBody } from "../src/problem.js";

const body = async (response: Response) => (await response.json()) as ProblemBody;

describe("the one error envelope (#29)", () => {
  it("is error and code, and nothing else, when no field is involved", async () => {
    const response = problemResponse(404, "Contact not found.", PROBLEM_CODES.notFound);
    expect(response.status).toBe(404);
    // No empty `issues` key: a client checking `if (body.issues)` should not find one.
    expect(await body(response)).toEqual({ error: "Contact not found.", code: "not_found" });
  });

  it("carries issues when the answer is about fields", async () => {
    const response = problemResponse(422, "Validation failed.", PROBLEM_CODES.validationFailed, [
      { path: "email", message: "Enter an email address.", code: ISSUE_CODES.invalid },
      { path: "name", message: "Required.", code: ISSUE_CODES.invalid },
    ]);
    expect(await body(response)).toEqual({
      error: "Validation failed.",
      code: "validation_failed",
      issues: [
        { path: "email", message: "Enter an email address.", code: "invalid" },
        { path: "name", message: "Required.", code: "invalid" },
      ],
    });
  });

  it("leaves issues out rather than sending an empty list", async () => {
    expect(await body(problemResponse(409, "Taken.", PROBLEM_CODES.uniqueViolation, []))).toEqual({ error: "Taken.", code: "unique_violation" });
  });

  it("keeps the headers it is given", async () => {
    const response = problemResponse(429, "Slow down.", PROBLEM_CODES.rateLimited, undefined, { headers: { "retry-after": "60" } });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("has a code for every failure the API can give", () => {
    // The point of a code is that it is a closed set, so this is the list a client can
    // switch over. Adding one is fine; renaming one is a breaking change.
    expect(Object.values(PROBLEM_CODES).sort()).toEqual([
      "access_denied",
      "bad_request",
      "cross_origin_blocked",
      "forbidden",
      "internal",
      "invalid_json",
      "invalid_query",
      "invalid_token",
      "length_required",
      "not_found",
      "payload_too_large",
      "rate_limited",
      "related_record_missing",
      "still_referenced",
      "unauthenticated",
      "unique_violation",
      "unsupported_media_type",
      "validation_failed",
      "value_not_allowed",
    ]);
  });

  it("has no two codes with the same string", () => {
    const values = Object.values(PROBLEM_CODES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("wantsJson (#29)", () => {
  const request = (url: string, accept?: string) => new Request(url, accept ? { headers: { accept } } : undefined);

  it("says yes when the caller asks for JSON", () => {
    expect(wantsJson(request("https://example.com/anything", "application/json"))).toBe(true);
  });

  it("says no to a browser navigation, which should get a sentence to read", () => {
    expect(wantsJson(request("https://example.com/dashboard", "text/html,application/xhtml+xml"))).toBe(false);
  });

  it("falls back to the path, so an API call with no Accept still gets JSON", () => {
    expect(wantsJson(request("https://example.com/api/contacts"))).toBe(true);
    expect(wantsJson(request("https://example.com/dashboard"))).toBe(false);
  });

  it("prefers an explicit JSON Accept over the path", () => {
    // A fetch for /dashboard that asks for JSON is a program, whatever the path says.
    expect(wantsJson(request("https://example.com/dashboard", "application/json"))).toBe(true);
  });
});
