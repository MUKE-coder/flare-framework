import { describe, expect, it, vi } from "vitest";
import { createMailer, renderTransactionalEmail } from "../src/mail.js";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const message = { to: "delivered@resend.dev", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

describe("createMailer", () => {
  it("posts to Resend with auth, idempotency key, and snake_case fields", async () => {
    const fetch = vi.fn(async () => json(200, { id: "email_123" }));
    const mailer = createMailer({ apiKey: "re_test", from: "App <hello@app.test>", fetch });

    const result = await mailer.send({ ...message, replyTo: "support@app.test", idempotencyKey: "welcome/u1" });

    expect(result).toEqual({ data: { id: "email_123" }, error: null });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test", "Idempotency-Key": "welcome/u1" });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "App <hello@app.test>",
      to: ["delivered@resend.dev"],
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      reply_to: ["support@app.test"],
    });
  });

  it("returns API errors instead of throwing, without retrying client errors", async () => {
    const fetch = vi.fn(async () => json(403, { name: "validation_error", message: "Domain not verified" }));
    const mailer = createMailer({ apiKey: "re_test", from: "a@b.test", fetch, sleep: async () => {} });

    const result = await mailer.send({ ...message, idempotencyKey: "k" });
    expect(result).toEqual({
      data: null,
      error: { name: "validation_error", message: "Domain not verified", statusCode: 403 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures when an idempotency key is set, honouring Retry-After", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(429, { name: "rate_limit_exceeded", message: "slow down" }, { "retry-after": "2" }))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(json(200, { id: "email_ok" }));
    const sleep = vi.fn(async () => {});
    const mailer = createMailer({ apiKey: "re_test", from: "a@b.test", fetch, sleep });

    expect(await mailer.send({ ...message, idempotencyKey: "k" })).toEqual({ data: { id: "email_ok" }, error: null });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls[0]).toEqual([2000]);
  });

  it("never retries without an idempotency key (a retry could duplicate the email)", async () => {
    const fetch = vi.fn(async () => json(500, { name: "internal_server_error", message: "boom" }));
    const mailer = createMailer({ apiKey: "re_test", from: "a@b.test", fetch, sleep: async () => {} });

    const result = await mailer.send(message);
    expect(result.error?.statusCode).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries", async () => {
    const fetch = vi.fn(async () => json(503, { name: "unavailable", message: "down" }));
    const mailer = createMailer({ apiKey: "re_test", from: "a@b.test", fetch, sleep: async () => {}, maxRetries: 2 });

    expect((await mailer.send({ ...message, idempotencyKey: "k" })).error?.statusCode).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("logs instead of sending when no API key is configured", async () => {
    const fetch = vi.fn();
    const log = vi.fn();
    const mailer = createMailer({ apiKey: "", from: "App <a@b.test>", fetch, log });

    expect(await mailer.send(message)).toEqual({ data: { id: "logged" }, error: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(log.mock.calls[0]![0]).toContain("Subject: Hi");
  });
});

describe("renderTransactionalEmail", () => {
  const email = {
    appName: "Shop",
    heading: "Reset your password",
    paragraphs: ["Someone asked to reset the password for <b>you</b>."],
    action: { label: "Reset password", url: "https://shop.test/reset?token=a&b=1" },
    footer: "If you didn't ask for this, ignore this email.",
    preheader: "Password reset link inside",
  };

  it("renders escaped HTML with the action link", () => {
    const { html } = renderTransactionalEmail(email);
    expect(html).toContain("Someone asked to reset the password for &lt;b&gt;you&lt;/b&gt;.");
    expect(html).not.toContain("<b>you</b>");
    expect(html).toContain('href="https://shop.test/reset?token=a&amp;b=1"');
    expect(html).toContain("Password reset link inside");
  });

  it("renders a matching plain-text part", () => {
    expect(renderTransactionalEmail(email).text).toBe(
      [
        "Reset your password",
        "",
        "Someone asked to reset the password for <b>you</b>.",
        "",
        "Reset password: https://shop.test/reset?token=a&b=1",
        "",
        "--",
        "If you didn't ask for this, ignore this email.",
      ].join("\n"),
    );
  });

  it("rejects non-http action URLs", () => {
    expect(() => renderTransactionalEmail({ ...email, action: { label: "x", url: "javascript:alert(1)" } })).toThrow();
  });
});
