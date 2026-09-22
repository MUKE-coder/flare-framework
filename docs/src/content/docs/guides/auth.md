---
title: Authentication
description: "Passwords, magic links, email codes, passkeys, two-factor and social sign-in, with every screen built."
---

Every app ships [Better Auth](https://better-auth.com) 1.7 wired to D1, and
the screens for it: sign-in, sign-up, password reset, two-factor, and an
account page where people manage all of it.

## Sign-in methods

| Method | How it works |
| --- | --- |
| **Email and password** | Always on. Includes password reset by email and email verification. |
| **Magic links** | A one-time link by email that expires in 5 minutes. |
| **Email codes** | A 6-digit code by email, for people who'd rather type than click. |
| **Passkeys** | Face ID, Touch ID, Windows Hello or a security key. There's no password to steal, and it counts as a strong sign-in on its own. |
| **Two-factor** | After a password, a code from an authenticator app (with 10 backup codes) or a code by email. |
| **Google, GitHub, Apple, Microsoft** | Social sign-in, joined to an existing account with the same verified email. |

`flare create` asks which to switch on. In scripts, pass them as flags:

```bash
npx flare create shop --auth magic-link,passkeys,2fa-app --auth-providers google,github --yes
```

`--auth` takes `magic-link`, `email-otp`, `passkeys`, `2fa-app` and `2fa-email`,
or `all` (the default) or `none`.

### Changing them later

The choices live in `lib/auth-config.ts`:

```ts
export const authConfig = {
  magicLink: true,
  emailOtp: false,
  passkeys: true,
  twoFactor: { authenticator: true, email: true },
  social: ["google", "github"] as SocialProvider[],
  requireEmailVerification: false,
};
```

Every method's tables exist whatever you choose, so switching one on or off
needs no migration. A method that's off is refused by the API with
`404 This sign-in method isn't enabled.`, not just hidden from the screens.

## The screens

| Route | What it's for |
| --- | --- |
| `/sign-in` | Two steps: the email first (with passkey and social sign-in beside it), then the password, or an emailed link or code |
| `/sign-up` | Name, email, password, and social sign-up |
| `/forgot-password`, `/reset-password` | Reset by emailed link; a reset signs every other device out |
| `/two-factor` | The second step after a password: authenticator code, email code or backup code, with "trust this device for 30 days" |
| `/dashboard/account` | Profile and email verification, password, two-factor setup (QR code and backup codes), passkeys, connected accounts, signed-in devices |

Their layout, colours and type follow the app's [theme](/guides/themes/).
The wording lives in the components under `components/auth/`, and the emails
in `lib/auth-emails.ts`.

## Two-factor and email sign-in

Better Auth only asks for the second factor after a password. A magic link or
emailed code on its own would let anyone with the inbox skip it. So for accounts
with two-factor on, Flare doesn't send a sign-in link or code. It emails a
notice instead: "sign in with your password or a passkey". The screen shows the
same "check your email" either way, so nobody can use this to learn which
accounts have two-factor.

People who signed up with a social account have no password. They can still
set up two-factor, and the account page doesn't ask them for one.

## Emails

Without `RESEND_API_KEY`, emails print to the console (in `flare dev` and
`flare start`), links and codes included, so every flow works locally with
nothing set up. With it, they're sent through [Resend](/guides/mail/) from
`MAIL_FROM`.

## Social providers

Each provider switches on only when it's in `authConfig.social` **and** its
credentials are set. That way the app runs and deploys before you have any
credentials, and a button never appears for a provider that can't work. Put
credentials in `.dev.vars` locally, and `wrangler secret put` in production.
Register this callback URL with each provider:

```text
<your app URL>/api/auth/callback/<provider>
```

| Provider | Where | Variables |
| --- | --- | --- |
| Google | [Google Cloud console](https://console.cloud.google.com/apis/credentials) → OAuth client (web) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub | [GitHub developer settings](https://github.com/settings/developers) → OAuth app | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Microsoft | [Microsoft Entra](https://entra.microsoft.com) → App registrations | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, optional `MICROSOFT_TENANT_ID` |
| Apple | [Apple Developer](https://developer.apple.com/account/resources/identifiers/list/serviceId) → Services ID | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, optional `APPLE_APP_BUNDLE_ID` |

- **Microsoft:** `MICROSOFT_TENANT_ID` defaults to `common`, which accepts
  personal and work accounts. Set your tenant id to allow only your
  organisation.
- **Apple:** `APPLE_CLIENT_ID` is the Services ID. `APPLE_CLIENT_SECRET` isn't
  a static secret: it's a JWT you sign with your Sign in with Apple key (`.p8`),
  and it's valid for at most six months. Regenerate it before then. Apple also
  needs a real domain with HTTPS: it doesn't redirect to `localhost`. For local
  testing, use a [tunnel](/guides/tunnels/).

## Passkeys

Passkeys use the address the app is served from. On your machine, open the app
at `http://localhost:3000`, not `http://127.0.0.1:3000`: browsers refuse
passkeys on IP addresses. In production the domain is the passkey's home, so a
passkey made on `app.example.com` works there and nowhere else.

## Password hashing

Passwords are hashed with **PBKDF2-SHA256 at 100,000 iterations** via
WebCrypto, not Better Auth's default scrypt. Scrypt in pure JavaScript costs
about 250–300ms of CPU per hash, well over the Workers free-plan CPU budget;
PBKDF2 at the same strength costs about 45ms. 100k is the highest iteration
count Workers' WebCrypto accepts, and it's stored with each hash so it can
change later without breaking existing users.

## Session gating

Two layers, on purpose:

1. **`proxy.ts`** does an optimistic, cookie-only redirect, with no database
   call, so signed-out visitors bounce off protected routes immediately.
2. **`requireSession()` / `getSession()`** in `lib/session.ts` check the
   session against D1 in the page or route handler itself. The proxy is a
   fast, best-effort gate; these are the real one.

```ts
import { requireSession } from "@/lib/session";

export default async function ReportsPage() {
  const { user } = await requireSession("/reports"); // to /sign-in?next=/reports when signed out
  return <p>Welcome, {user.name}</p>;
}
```

## Base URL and allowed hosts

Set `BETTER_AUTH_URL` once you have a custom domain. Until then, Flare allows
`localhost:*`, `127.0.0.1:*`, your `<app>.*.workers.dev` host and
`*.trycloudflare.com` ([tunnels](/guides/tunnels/)), so local dev, tunnels and
your first deploy all work with no configuration.

## Secrets

`flare create` writes a random `BETTER_AUTH_SECRET` to `.dev.vars`
(git-ignored). `flare deploy` generates and uploads a **separate** secret for
production the first time you deploy. It never reuses the local value.

## Admin access

The `admin` plugin adds `user.role` (default `"user"`) and ban fields.
`adminSession()` in `lib/admin.ts` decides who reaches `/admin`:

- any role in `ADMIN_ROLES` (`admin` and `staff` by default), or
- any role that may **read** at least one resource under its
  [policy](/guides/roles-and-policies/).

Grant a role:

```bash
npx flare user:role you@example.com admin --remote
```

## Tested

`scripts/e2e-auth.mjs` in the framework repo runs every method in a real
browser against a running app. It covers sign-up, both sign-in steps, magic
links and email codes, password reset, authenticator setup and sign-in with a
code or backup code, email two-factor, the notice for two-factor accounts,
passkeys (with Chrome's virtual authenticator) and signed-in devices.
