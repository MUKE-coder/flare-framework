/**
 * Transactional email through Resend's REST API (plain fetch, no SDK).
 *
 * Like the official SDK, `send` never throws for API failures: it resolves to
 * `{ data, error }`. Transient failures (429, 5xx, concurrent idempotent request)
 * are retried with backoff, but only when an idempotency key is given, so a retry
 * can never deliver a duplicate.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | string[];
  /** Overrides the mailer's default sender. */
  from?: string;
  /** e.g. `password-reset/<userId>/<tokenId>`. Required for retries; 1-256 chars; valid for 24h. */
  idempotencyKey?: string;
}

export type MailResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string; statusCode: number | null } };

export interface MailerOptions {
  /** Resend API key. When empty, messages are logged instead of sent (local development). */
  apiKey: string | undefined;
  /** Default sender, e.g. `Acme <hello@acme.com>`. The domain must be verified in Resend. */
  from: string;
  /** Retries after the first attempt, for transient failures. Default 2. */
  maxRetries?: number;
  fetch?: typeof fetch;
  /** Where logged (key-less) messages go. Default console.info. */
  log?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function createMailer(options: MailerOptions) {
  const doFetch = options.fetch ?? fetch;
  const maxRetries = options.maxRetries ?? 2;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? ((message: string) => console.info(message));

  async function send(message: MailMessage): Promise<MailResult> {
    const from = message.from ?? options.from;

    if (!options.apiKey) {
      log(
        [
          "[flare/mail] RESEND_API_KEY is not set; email logged instead of sent:",
          `  From: ${from}`,
          `  To: ${[message.to].flat().join(", ")}`,
          `  Subject: ${message.subject}`,
          "",
          message.text ?? message.html,
        ].join("\n"),
      );
      return { data: { id: "logged" }, error: null };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) headers["Idempotency-Key"] = message.idempotencyKey;

    const body = JSON.stringify({
      from,
      to: [message.to].flat(),
      subject: message.subject,
      html: message.html,
      ...(message.text !== undefined && { text: message.text }),
      ...(message.replyTo !== undefined && { reply_to: [message.replyTo].flat() }),
    });

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await doFetch(RESEND_ENDPOINT, { method: "POST", headers, body });
      } catch (cause) {
        if (message.idempotencyKey && attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        return failure("network_error", cause instanceof Error ? cause.message : String(cause), null);
      }

      if (response.ok) {
        const { id } = (await response.json()) as { id: string };
        return { data: { id }, error: null };
      }

      const payload = (await response.json().catch(() => ({}))) as { name?: string; message?: string };
      const name = payload.name ?? "application_error";
      const retryable = RETRYABLE.has(response.status) || name === "concurrent_idempotent_requests";
      if (retryable && message.idempotencyKey && attempt < maxRetries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      return failure(name, payload.message ?? response.statusText, response.status);
    }
  }

  return { send };
}

function backoff(attempt: number): number {
  return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
}

function failure(name: string, message: string, statusCode: number | null): MailResult {
  return { data: null, error: { name, message, statusCode } };
}

export type Mailer = ReturnType<typeof createMailer>;

// ---------------------------------------------------------------------------
// Template

export interface TransactionalEmail {
  /** Product name shown above the heading. */
  appName: string;
  heading: string;
  /** Plain-text paragraphs; HTML is escaped. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Small print under the content, e.g. "If you didn't request this, ignore this email." */
  footer?: string;
  /** Inbox preview text. */
  preheader?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/**
 * A plain, monochrome transactional email (table layout with inline styles, which
 * email clients need). Returns both HTML and text parts.
 */
export function renderTransactionalEmail(email: TransactionalEmail): { html: string; text: string } {
  if (email.action && !/^https?:\/\//i.test(email.action.url)) {
    throw new Error("Email action URLs must be absolute http(s) URLs.");
  }
  const font = `font-family:ui-sans-serif,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif`;
  const paragraphs = email.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#0a0a0a">${escapeHtml(p)}</p>`)
    .join("");
  const action = email.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:6px;background:#0a0a0a"><a href="${escapeHtml(email.action.url)}" style="display:inline-block;padding:10px 18px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(email.action.label)}</a></td></tr></table><p style="margin:0 0 16px;font-size:12px;line-height:18px;color:#6b7280">Or paste this link into your browser:<br><a href="${escapeHtml(email.action.url)}" style="color:#6b7280;word-break:break-all">${escapeHtml(email.action.url)}</a></p>`
    : "";
  const footer = email.footer
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e5e7;font-size:12px;line-height:18px;color:#6b7280">${escapeHtml(email.footer)}</p>`
    : "";
  const preheader = email.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(email.preheader)}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(email.heading)}</title></head><body style="margin:0;padding:0;background:#f7f7f8;${font}">${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e5e7;border-radius:8px"><tr><td style="padding:32px;${font}"><p style="margin:0 0 24px;font-size:14px;font-weight:600;color:#6b7280">${escapeHtml(email.appName)}</p><h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:600;color:#0a0a0a">${escapeHtml(email.heading)}</h1>${paragraphs}${action}${footer}</td></tr></table></td></tr></table></body></html>`;

  const text = [
    email.heading,
    "",
    ...email.paragraphs.flatMap((p) => [p, ""]),
    ...(email.action ? [`${email.action.label}: ${email.action.url}`, ""] : []),
    ...(email.footer ? ["--", email.footer] : []),
  ]
    .join("\n")
    .trimEnd();

  return { html, text };
}
