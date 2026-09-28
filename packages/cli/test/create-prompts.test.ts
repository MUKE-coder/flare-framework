import { describe, expect, it, vi } from "vitest";
import { askCreateQuestions, canPrompt } from "../src/commands/create-prompts.js";

/**
 * The questions `flare create` asks in a terminal.
 *
 * These exist because the stack question was missing for a whole release: the flag
 * worked, so every test passed, and anyone who answered the prompts instead of passing
 * flags silently got Cloudflare with no choice offered.
 */
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  cancel: vi.fn(),
  isCancel: () => false,
  log: { message: vi.fn() },
  select: vi.fn(async ({ initialValue }: { initialValue: unknown }) => initialValue),
  multiselect: vi.fn(async ({ initialValues }: { initialValues: unknown }) => initialValues),
}));

const promptsFor = async (given: Parameters<typeof askCreateQuestions>[0]) => {
  const prompts = await import("@clack/prompts");
  vi.mocked(prompts.select).mockClear();
  const answers = await askCreateQuestions(given);
  const asked = vi.mocked(prompts.select).mock.calls.map(([options]) => String(options.message));
  return { answers, asked };
};

describe("askCreateQuestions", () => {
  it("asks where the app will run, before anything else", async () => {
    const { answers, asked } = await promptsFor({});
    expect(asked[0]).toMatch(/where will it run/i);
    expect(answers.stack).toBe("cloudflare");
  });

  it("offers both stacks", async () => {
    const prompts = await import("@clack/prompts");
    await promptsFor({});
    const [options] = vi.mocked(prompts.select).mock.calls[0]!;
    expect((options.options as { value: string }[]).map((choice) => choice.value)).toEqual(["cloudflare", "next"]);
  });

  it("doesn't ask what --stack already answered", async () => {
    const { answers, asked } = await promptsFor({ stack: "next" });
    expect(asked.some((message) => /where will it run/i.test(message))).toBe(false);
    expect(answers.stack).toBe("next");
  });
});

describe("canPrompt", () => {
  it("stays quiet when told to skip the questions", () => {
    expect(canPrompt(true)).toBe(false);
  });
});
