---
title: Email (Resend)
description: Transactional email over Resend's REST API, no SDK.
---

`lib/mail.ts` exposes `mailer` and `sendTransactionalEmail()`, built on
`createMailer()` / `renderTransactionalEmail()` from `@flare/core`, which
call Resend's REST API directly with `fetch` — no SDK dependency to bundle
into your Worker.

## Local development needs no account

With `RESEND_API_KEY` left empty — the scaffold default — emails print to
the console instead of being sent, so sign-up, password reset, and any
email flow you build work locally with zero setup. `MAIL_FROM` falls back
to Resend's sandbox sender, which only delivers to the account owner, so
set your own verified domain before going further than local testing.

## Retries are opt-in and idempotent

`send()` resolves to `{ data, error }` and never throws for API errors —
matching Resend's own SDK contract. `429`/`5xx` responses and
idempotency conflicts are retried with backoff (honoring `Retry-After`),
but **only when you pass an `idempotencyKey`** — without one, a retry
could double-send.

```ts
import { sendTransactionalEmail } from "@/lib/mail";

await sendTransactionalEmail({
  to: user.email,
  subject: "Welcome to Acme",
  heading: "Welcome, " + user.name,
  paragraphs: ["Your account is ready."],
  action: { label: "Open dashboard", url: `${baseUrl}/dashboard` },
  footer: "You received this because you signed up for Acme.",
  idempotencyKey: `welcome-email/${user.id}`,
});
```

`sendTransactionalEmail` takes the fields of `TransactionalEmail` (from
`@flare/core`) except `appName`, which `lib/mail.ts` fills in, plus `to`,
`subject` and an optional `idempotencyKey`:

| Field | Type | |
| --- | --- | --- |
| `heading` | `string` | Required |
| `paragraphs` | `string[]` | Required; plain text, HTML-escaped |
| `action` | `{ label: string; url: string }` | Optional button; `url` must be absolute `http(s)` |
| `footer` | `string` | Optional small print |
| `preheader` | `string` | Optional inbox preview text |

## The template

A monochrome, table-based email — the only layout that survives every
email client's CSS support gap — with escaped content, an optional action
button (absolute `http(s)` URLs only), and a matching plain-text part
generated alongside the HTML.

## Setting it up for real

1. [Verify a sending domain](https://resend.com/domains) in Resend.
2. Set `RESEND_API_KEY` and `MAIL_FROM` (a verified address on that
   domain) — locally in `.dev.vars`, in production with:

   ```bash
   wrangler secret put RESEND_API_KEY
   wrangler secret put MAIL_FROM
   ```

`flare deploy` lists any optional secret from `.dev.vars.example` that's
still unset in production, `RESEND_API_KEY` included, so you won't
discover a silent no-op mailer after the fact.
