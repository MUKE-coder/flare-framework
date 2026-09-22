# Clerk component suite and auth UX — research notes for Flare

Research date: **2026-09-22**. Sources are Clerk's official docs (`clerk.com/docs`), their changelog and
a small number of their own blog posts. Everything below is a description of *behaviour and structure* in
my own words — no Clerk code or doc prose is reproduced.

**Why we care.** Flare scaffolds auth screens as source code in the user's project
(`packages/cli/templates/app/components/auth/*`, routes `sign-in`, `sign-up`, `forgot-password`,
`reset-password`, `two-factor`, `dashboard/account`), themed by six themes
(`default`, `coral`, `amber`, `sky`, `mono`, `emerald` — see `packages/cli/src/themes.ts`). Clerk is the
best-funded, most-iterated implementation of these exact screens, so it is the right thing to mine for
*behaviour* even though our delivery model (source code, not a hosted npm component) is the opposite of theirs.

**Important framing — Clerk is mid-rewrite.** As of **Core 3** (March 2026), Clerk deprecated two things we
might otherwise have copied: `<SignedIn>` / `<SignedOut>` / `<Protect>` (folded into one `<Show>` component)
and **Clerk Elements** (their unstyled/headless composable layer), in favour of redesigned
`useSignIn` / `useSignUp` / `useCheckout` / `useWaitlist` hooks. They also deprecated
`createRouteMatcher()`-based middleware auth in favour of per-resource server-side checks. Those three
reversals are the single most useful signal in this whole document for Flare — see §7.
<https://clerk.com/changelog/2026-03-03-core-3>,
<https://clerk.com/docs/guides/customizing-clerk/elements/overview>,
<https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher>

---

## 1. Component inventory

Taken from the React component reference overview.
<https://clerk.com/docs/react/reference/components/overview> ·
<https://clerk.com/docs/reference/components/overview>

### 1.1 Authentication components

| Component | What it does | Why it exists |
| --- | --- | --- |
| `<SignIn />` | Full sign-in card: identifier entry, password / email-code / phone-code / passkey factors, social buttons, second factor, forgot-password entry point | The single highest-traffic screen; every app needs it and nobody wants to build the factor state machine |
| `<SignUp />` | Full sign-up card: identifier + optional name/username fields, password, legal consent, then email/phone verification | Mirror of sign-in; also the place restrictions (allowlist, waitlist mode) surface |
| `<GoogleOneTap />` | Renders Google's One Tap prompt and wires the returned credential into a Clerk session | Highest-converting sign-in affordance on the web; tiny surface, big lift |
| `<OAuthConsent />` | The "App X wants access to…" grant/deny screen when *your* app is an OAuth provider | Needed once you expose OAuth/MCP to third parties; reads `client_id`/`scope`/`redirect_uri` from the query string and requires `strict-origin-when-cross-origin` referrer policy for CSRF checks |
| `<Waitlist />` | Email capture form for waitlist mode; confirmation email on join, invite email on approval | Pre-launch apps want a gate that is not a broken sign-up |
| `<TaskChooseOrganization />` | Resolves the `choose-organization` session task — pick or create an org before continuing | See §2.6 |
| `<TaskResetPassword />` | Resolves the `reset-password` session task — force a password change at sign-in | See §2.6 |
| `<TaskSetupMFA />` | Resolves the `setup-mfa` session task — enrol a second factor before continuing | See §2.6 |

Sources: <https://clerk.com/docs/react/reference/components/authentication/sign-in.md>,
<https://clerk.com/docs/react/reference/components/authentication/waitlist.md>,
<https://clerk.com/docs/react/reference/components/authentication/oauth-consent.md>,
<https://clerk.com/docs/react/reference/components/authentication/task-setup-mfa.md>,
<https://clerk.com/docs/guides/configure/session-tasks.md>

### 1.2 User components

| Component | What it does | Why it exists |
| --- | --- | --- |
| `<UserAvatar />` | Just the avatar image with initials fallback | Reused inside every other component; exposed so you can build your own header |
| `<UserButton />` | Avatar that opens a menu: manage account, switch/add account, sign out; extensible with custom items | The universal "logged in" affordance in an app header |
| `<UserProfile />` | Full multi-tab account management UI (profile, security, billing) | The screen every app builds badly; see §4.2 |

### 1.3 Organization components

| Component | What it does | Why it exists |
| --- | --- | --- |
| `<CreateOrganization />` | Name + slug + logo form that creates an org and makes it active | Needed standalone for onboarding and for the "create" branch of the switcher |
| `<OrganizationProfile />` | Multi-tab org management: General, Members, Billing, Security (SSO) | Org admin settings, gated by permissions |
| `<OrganizationSwitcher />` | Dropdown to switch active org (and optionally personal account), plus create/manage entry points | Multi-tenant apps need an always-visible tenant indicator |
| `<OrganizationList />` | List of orgs the user belongs to + pending invitations/requests, as a full page rather than a dropdown | For the "pick a workspace" interstitial rather than the header |
| `<InviteMembersButton />` | Opens the invite-members flow from anywhere | Lets you put "Invite teammates" in an empty state instead of buried in settings |

Sources: <https://clerk.com/docs/react/reference/components/organization/organization-switcher.md>,
<https://clerk.com/docs/react/reference/components/organization/organization-profile.md>

### 1.4 Billing components

| Component | What it does | Why it exists |
| --- | --- | --- |
| `<PricingTable />` | Plan cards with features, monthly/annual toggle, "Popular" highlight, opens checkout on select; `for="user"` or `for="organization"` | Pricing page and in-app upgrade page in one component |
| `<CheckoutButton />` | Wraps your own button; opens the checkout drawer for a given `planId` | Upsell from any surface without navigating away |
| `<PlanDetailsButton />` | Opens a drawer describing one plan's features | "What's in Pro?" link next to a locked feature |
| `<SubscriptionDetailsButton />` | Opens a drawer with the current subscription, invoices, payment method | Self-serve billing management without a billing page |

Source: <https://clerk.com/docs/react/reference/components/billing/pricing-table.md>,
<https://clerk.com/docs/react/reference/components/billing/checkout-button.md>

### 1.5 Control components

These render no UI of their own; they gate or redirect.

| Component | What it does |
| --- | --- |
| `<Show>` | **Core 3's unified gate.** `when="signed-in"` / `when="signed-out"` / `when={{ role }}` / `when={{ permission }}` / `when={{ plan }}` / `when={{ feature }}` / `when={(has) => …}`, plus a `fallback` |
| `<SignedIn>` / `<SignedOut>` / `<Protect>` | **Deprecated** — the pre-Core-3 trio that `<Show>` replaces |
| `<ClerkLoading>` | Renders children while the Clerk client is still initialising |
| `<ClerkLoaded>` | Renders children once the client is `ready` or `degraded` (i.e. `window.Clerk` is safe to touch) |
| `<ClerkDegraded>` | Renders children when Clerk is up but impaired — nest inside `<ClerkLoaded>` to show a banner |
| `<ClerkFailed>` | Renders children when Clerk could not initialise at all |
| `<RedirectToSignIn>` / `<RedirectToSignUp>` | Imperative redirect-on-mount |
| `<RedirectToUserProfile>` / `<RedirectToCreateOrganization>` / `<RedirectToOrganizationProfile>` | Redirect to the corresponding hosted/Account-Portal page |
| `<RedirectToTasks>` | Redirect a `pending` session to its outstanding session task |
| `<AuthenticateWithRedirectCallback>` | Mount on your OAuth callback route; completes the redirect handshake and lands the session |

Sources: <https://clerk.com/docs/react/reference/components/control/show.md>,
<https://clerk.com/docs/react/reference/components/control/clerk-loaded.md>,
<https://clerk.com/changelog/2026-03-03-core-3>

### 1.6 Unstyled components

| Component | What it does |
| --- | --- |
| `<SignInButton>` | Wraps your own button; opens sign-in as a modal or navigates to the sign-in route |
| `<SignUpButton>` | Same for sign-up |
| `<SignOutButton>` | Wraps your button; ends the session and redirects |
| `<SignInWithMetamaskButton>` | Web3 wallet sign-in trigger |

The pattern here is worth noting: these are **behaviour wrappers around the consumer's own markup**
(pass your `<Button>` as a child, keep your own styles, inherit the click behaviour). That is the one
piece of Clerk's packaging model that transfers cleanly to a source-code framework.

### 1.7 Unstyled/headless layer — Clerk Elements (deprecated)

Clerk Elements was a Radix-style headless kit: `<SignIn.Root>`, `<SignIn.Step name="start|verifications|
choose-strategy|forgot-password|reset-password">`, `<SignIn.Strategy name="password|email_code|…">`,
`<SignIn.Action>`, `<SignIn.SafeIdentifier>` (masked identifier), `<SignIn.Salutation>`, `<SignIn.Passkey>`,
plus common primitives `<Clerk.Root>`, `<Clerk.Field>`, `<Clerk.Label>`, `<Clerk.Input>`,
`<Clerk.FieldError>`, `<Clerk.FieldState>`, `<Clerk.GlobalError>`, `<Clerk.Connection>`, `<Clerk.Icon>`,
`<Clerk.Loading>`, `<Clerk.Link>`.

Two of its primitives are the **highest-value things in this whole report** (§2.1, §2.2) and both survive
conceptually even though the package is deprecated:

- `<Clerk.Input type="otp">` — fully accessible segmented OTP input with a per-character `render` prop
  exposing `status: 'none' | 'selected' | 'cursor' | 'hovered'`, configurable `length` (default 6),
  optional auto-submit on fill, and a `passwordManagerOffset` (default 40px) so a password-manager icon
  does not sit on top of the last box.
- `<Clerk.Input type="password" validatePassword>` — live password validation; results readable through
  `<Clerk.FieldState>` as `{ state: 'success' | 'error' | 'warning' | 'info', codes, message }`, with a
  `data-has-passed-validation` attribute on the input for styling.

Sources: <https://clerk.com/docs/guides/customizing-clerk/elements/reference/common>,
<https://clerk.com/docs/guides/customizing-clerk/elements/reference/sign-in>,
<https://clerk.com/docs/guides/customizing-clerk/elements/overview>

**Deprecation note:** Core 3 replaced Elements with redesigned hooks. The `signIn` object returned from
`useSignIn` is now stateful (mutations re-render), step methods map 1:1 to the flow
(`signIn.password()`, `signIn.emailCode.sendCode()`, `signIn.finalize()` replacing
`attemptFirstFactor` / `setActive`), and it carries `fetchStatus` plus structured `errors.fields`.
There is also an experimental composable layer in `@clerk/ui/experimental` (e.g. wrapping your own layout
in `<OrganizationProfileProvider>` / `<UserProfileProvider>` and dropping in individual section
components) — referenced from the `<UserProfile>` and `<OrganizationProfile>` reference pages.
<https://clerk.com/changelog/2026-03-03-core-3>

### 1.8 Utility

| Component | What it does |
| --- | --- |
| `<UNSAFE_PortalProvider>` | Lets you retarget where Clerk portals its modals/drawers, to fix focus-trap fights with dialog libraries (Radix etc.) |

---

## 2. Auth UX details worth copying

### 2.1 Password field behaviour

What Clerk actually enforces and how:

| Rule | Value | Note |
| --- | --- | --- |
| Minimum length | 8 by default, configurable (they cite 12 as a common choice) | NIST SP 800-63B alignment |
| Maximum length | recommend accepting up to 64 | All printable ASCII, space, and Unicode accepted; each code point counts as one char |
| Character-class rules | **Off by default**; special chars / digits / mixed case only on their Business tier | Deliberately de-emphasised — length beats composition |
| Strength estimation | `zxcvbn-ts`, `min_zxcvbn_strength` on a 0–4 scale; 3 = "safely unguessable" | Enforceable at low/medium/high |
| Breach check | HaveIBeenPwned k-anonymity range query against >10bn credentials | On compromise, the user is pushed into an OTP-based reset rather than merely warned |

Sources: <https://clerk.com/docs/security/password-protection>,
<https://clerk.com/blog/how-we-roll-passwords>, <https://clerk.com/blog/a-new-password-experience>

UX behaviours to copy:

1. **Feedback while typing, not on submit.** The `validatePassword` primitive emits a *state*
   (`success` / `error` / `warning` / `info`) plus a message on each keystroke. `warning` is the key one:
   the password is *allowed* but weak, so you nudge rather than block. Most homegrown forms only have
   pass/fail.
2. **Guessability, not regex.** zxcvbn catches dates, names, keyboard walks and common phrases — a regex
   checklist happily passes `Password1!`. Telling the user *why* ("this looks like a common word plus a
   number") is worth more than five green ticks.
3. **State the policy before the user fails it.** Clerk renders the active policy as helper text under the
   field so the rules are visible from the first keystroke.
4. **A styling hook for the passed state** (`data-has-passed-validation`) so the field itself can go green
   without React state plumbing.
5. **Show/hide toggle.** Present on their password inputs. *Not documented in prose* — I could not find a
   docs page specifying the toggle's semantics (aria labelling, whether it resets on blur), so treat the
   details as our own design decision. See §8.
6. **Breach check as a first-class outcome.** `form_password_pwned` is a distinct error code that routes
   the user into reset, not a generic validation failure.

### 2.2 Email/code verification (OTP) UX

From the Elements OTP primitive and the sign-up/sign-in options docs:

- **Segmented display, single input.** One real `<input>` underneath; N visual boxes drawn via a render
  prop. This is what makes paste, autofill (`one-time-code`), backspace, arrow keys and screen readers all
  work — the common mistake is N separate inputs, which breaks every one of those.
- **Per-character status** (`none` / `selected` / `cursor` / `hovered`) so the active box can be styled
  without hand-rolled focus math.
- **Numeric-only, default length 6**, with **auto-submit when full** — no "Continue" tap for the happy path.
- **`passwordManagerOffset`** (~40px) so 1Password/iCloud Keychain icons do not overlap the last cell.
  A small detail that signals how much of this is field-tested.
- **Resend cooldown: 30 seconds**, while the previously issued code stays valid for **10 minutes** — i.e.
  resending does not invalidate the code already in the user's inbox. Email *links* expire in 10 minutes
  and can optionally be restricted to the originating device/browser.
- **Masked identifier echoed back** (`<SignIn.SafeIdentifier>`) — "we sent a code to j•••@example.com" —
  so the user can tell they mistyped without the screen leaking the address.

Sources: <https://clerk.com/docs/guides/customizing-clerk/elements/reference/common>,
<https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options.md>

### 2.3 MFA setup and challenge

Strategies: **TOTP authenticator app**, **SMS code**, **backup codes**.
<https://clerk.com/docs/guides/development/custom-flows/account-updates/manage-mfa>

Setup flow (TOTP): generate secret → show QR **and** the plaintext secret (for devices that cannot scan) →
require the user to enter a code to prove enrolment worked → only then mark enabled → immediately present
backup codes, once, with copy/download. Clerk's docs are explicit that backup codes should be enabled
alongside every other strategy, because without them a lost device means an admin has to reset MFA
manually.

Challenge flow: first factor succeeds → status becomes `needs_second_factor` → user is shown their
**default** second factor, with a **"use another method"** affordance listing the others they have enrolled
(`verifyPhoneCode` / `verifyTOTP` / `verifyBackupCode`). The escape hatch is the part people forget.
<https://clerk.com/docs/guides/development/custom-flows/authentication/multi-factor-authentication>

Clerk also shipped **enforced MFA** (an org/app can require it) in Feb 2026, which is what
`TaskSetupMFA` exists to service. <https://clerk.com/changelog/2026-02-20-require-mfa>

### 2.4 Password reset flow

Four steps, and the details matter:

1. Enter email or phone → a sign-in attempt is created with the `reset_password_email_code` (or phone)
   strategy and a code is sent.
2. Enter the code → verified.
3. Enter the new password → submitted with the verified attempt, so no long-lived reset token is passed
   around.
4. **`signOutOfOtherSessions` option** — a checkbox at reset time that revokes every other session. This
   is the single best detail in the flow: reset is exactly the moment when "someone else may be logged in
   as me" is top of mind.

Two edge cases they handle explicitly:

- If the user has MFA, reset transitions to `needs_second_factor` *after* the new password — resetting the
  password must not bypass the second factor.
- The **same flow is reused** when a sign-in attempt returns `form_password_pwned`. Breach detection and
  forgotten-password converge on one screen.

Source: <https://clerk.com/docs/nextjs/guides/development/custom-flows/authentication/forgot-password>

### 2.5 Sign-in/sign-up identifier options

Worth noting as configuration surface: email, phone, or username as identifier; email verified by code or
link; phone by code; password optional (and existing users keep theirs if it is later disabled for new
sign-ups); passkeys; optional first/last name; optional self-serve account deletion; username constrained
to 4–64 Latin-only characters explicitly to prevent homoglyph spoofing. SMS is allowlisted by region
(US/CA by default).
<https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options.md>

The `<SignIn withSignUp>` prop merges sign-in and sign-up into one flow, transferring the attempt between
them automatically — one door instead of two, which removes the "do I have an account?" decision.
<https://clerk.com/docs/react/reference/components/authentication/sign-in.md>

### 2.6 Session tasks — the idea worth stealing

**The problem.** After a user authenticates you frequently still need something from them before they can
use the app: pick an organisation, reset a compromised password, enrol MFA, accept new terms, finish
onboarding. Most apps solve this with a pile of ad-hoc redirects in a layout or middleware, which leaks
(some route forgets the check) and is impossible to reason about.

**Clerk's answer.** A third session state. A session is `signed-out`, `pending`, or `active`. `pending`
means *authenticated but with outstanding tasks*, and — critically — **`pending` is treated as signed-out
by default** (`treatPendingAsSignedOut`, default `true`; with it on, `useAuth()` returns nulls). So the
gate is not a redirect you have to remember to write; it is the meaning of "signed in".

Built-in task types: `choose-organization` (when orgs are on and personal accounts off — the default for
instances created after 2025-08-22), `reset-password` (compromised password, for instances after
2025-12-08), `setup-mfa`.

Mounting: the task components are embedded inside `<SignIn>` / `<SignUp>` by default; `taskUrls` on
`<ClerkProvider>` maps a task type to your own route if you want to host it yourself. Middleware can also
branch on `sessionStatus === 'pending'` — but Clerk's docs explicitly say that middleware check is a UX
convenience and **not a security boundary**; the data layer must enforce it too.

Source: <https://clerk.com/docs/guides/configure/session-tasks.md>

**This is the highest-leverage architectural idea in the report for Flare.** Better Auth has no built-in
equivalent, and Flare can express it cleanly because auth is resolved on the server (see §3).

---

## 3. Control components, and the server-resolved equivalent

### 3.1 What Clerk's API looks like

```tsx
<Show when="signed-in" fallback={<SignInPrompt />}>…</Show>
<Show when={{ permission: 'org:invoices:create' }} fallback={<NoAccess />}>…</Show>
<Show when={(has) => has({ role: 'admin' }) || has({ role: 'manager' })}>…</Show>
<ClerkLoading><Skeleton /></ClerkLoading>
<ClerkLoaded><UserButton /></ClerkLoaded>
```

These exist **because Clerk resolves auth on the client.** The client boots in an unknown state, fetches
the session, and only then knows who you are — hence `<ClerkLoading>`, hence `fallback` props on every
single component, hence a `degraded` state, hence flashes of the wrong UI. Roughly half of the control
surface is compensation for client-side session resolution.

### 3.2 What Clerk itself is moving toward

Two signals, both pointing the same way:

- `createRouteMatcher()` middleware auth is **deprecated**; Clerk now recommends checking auth on each
  server-side resource (page, route handler, server function) individually.
  <https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher>
- The server helpers (`auth()`, `auth.protect()`, `has()`, `currentUser()`) are the recommended path in
  App Router; `auth()` is server-only and returns the auth object plus `redirectToSignIn()`.
  <https://clerk.com/docs/reference/nextjs/app-router/auth>,
  <https://clerk.com/docs/nextjs/guides/users/reading>

### 3.3 The Flare equivalent

Flare resolves the session on the server (Better Auth + RSC), so **most of the control surface should not
exist at all**. Concretely:

| Clerk | Flare equivalent | Rationale |
| --- | --- | --- |
| `<ClerkLoading>` / `<ClerkLoaded>` | **Nothing.** The server already knows. | No unknown state means no loading gate. If a client island needs it, Suspense covers it. |
| `<ClerkDegraded>` / `<ClerkFailed>` | **Nothing.** | Artefacts of a third-party client SDK that can fail to boot. Our auth is in-process. |
| `<SignedIn>` / `<SignedOut>` | `const session = await getSession()` then plain JSX `{session ? … : …}` | An `async` RSC makes conditional rendering trivial; a component wrapper adds indirection and buys nothing |
| `<Show when={{ role }}>` | A small server helper — `await requireRole('admin')` throwing/redirecting, and a non-throwing `has({ role })` for conditional UI | Keep the *predicate shape* (`role` / `permission` / `plan` / callback), drop the component |
| `<Protect>` / `auth.protect()` | `await requireSession()` at the top of the page/route/server function | Per-resource, matching where Clerk has landed |
| `<RedirectToSignIn>` | `redirect('/sign-in?next=' + encodeURIComponent(pathname))` inside the guard | The `next` round-trip is the part worth copying |
| `<RedirectToTasks>` | The session-task gate (§2.6) baked into `getSession()` | See below |
| `<AuthenticateWithRedirectCallback>` | Better Auth's callback route already handles this | Server-side by construction |
| `<SignInButton>` / `<SignOutButton>` | **Keep.** Small client components wrapping the consumer's own button, handling pending state and redirect | This is the one control-ish pattern that genuinely transfers |

**The one client-side control component worth shipping** is a `<Session>`/`useSession()` pair for
*interactive* islands (a header that must update after sign-out without a reload), hydrated from the
server-rendered session so it never has a loading state on first paint.

**Session tasks, server-side.** The clean Flare shape is a single `getSession()` that returns
`{ status: 'signed-out' | 'pending' | 'active', user, tasks }`, plus `requireSession()` which redirects to
`/sign-in` on signed-out and to the first outstanding task on pending. Because it is one function that
every protected resource already calls, adding a task type later (accept-terms, complete-onboarding) is a
one-line change with no risk of a route forgetting the check — which is exactly the property Clerk bought
with `treatPendingAsSignedOut`.

---

## 4. UserButton, UserProfile, OrganizationSwitcher in detail

### 4.1 `<UserButton />`

Renders the avatar-opens-a-menu pattern (their docs credit Google's UI as the origin).

Default menu items: **Manage account** (opens `<UserProfile>`), **Sign out**. With multi-session enabled it
also lists the other signed-in accounts with a **switch** action (no full page reload) and an **Add account**
entry pointing at `signInUrl`.

Props: `appearance`, `defaultOpen`, `showName` (name beside the avatar), `userProfileMode:
'modal' | 'navigation'`, `userProfileUrl`, `afterSwitchSessionUrl`, `fallback`, plus `userProfileProps` to
style the profile it opens.

Extension sub-components: `<UserButton.MenuItems>` containing `<UserButton.Action>` (custom action, or
reordering the built-in `manageAccount` / `signOut` actions) and `<UserButton.Link>` (custom nav item);
`<UserButton.UserProfilePage>` and `<UserButton.UserProfileLink>` inject pages into the profile opened
from the button.

Source: <https://clerk.com/docs/react/reference/components/user/user-button.md>

**For Flare:** the modal-vs-navigate choice and the ability to slot custom menu items are the two things
worth having. Multi-session account switching is not.

### 4.2 `<UserProfile />`

Described as full account management for profile, security and billing. Props: `appearance`, `routing`
(`'hash' | 'path'`), `path`, `additionalOAuthScopes` (request extra provider scopes per connection),
`customPages`, `fallback`.

Tabs (assembled from the reference page and the Account Portal docs; the docs pages are thinner than the
product, so treat the per-tab action lists as *approximately* right — flagged in §8):

| Tab | Contains |
| --- | --- |
| **Account / Profile** | Avatar upload, first/last name, username; email addresses (add, verify, set primary, remove); phone numbers (same); connected social accounts (connect, disconnect, re-consent for extra scopes); delete account |
| **Security** | Password (set / change / remove), MFA (TOTP with QR, SMS, backup-code regeneration), passkeys (add, rename, remove), **active devices** list with per-session revoke, and account deletion in some configurations |
| **Billing** | Current plan, plan switching, invoices, payment methods |
| **API keys** | Present in newer builds; **unverified** — I did not find a docs page confirming it as a `<UserProfile>` tab |

Extension: `customPages` / `<UserProfile.Page>` and `<UserProfile.Link>` add your own tabs and external
links into the same nav (the reference notes `customPages` is JS-SDK-only in the prop table while the
React sub-component form is documented separately — see §8). There is also an experimental composable
route: wrap your own layout in a provider from `@clerk/ui/experimental` and place individual section
components yourself.

Source: <https://clerk.com/docs/react/reference/components/user/user-profile.md>,
<https://clerk.com/docs/guides/customizing-clerk/account-portal>

**For Flare:** Flare already has `components/account/security-settings.tsx` and
`app/dashboard/account/page.tsx`. The gaps against Clerk's Security tab are: **active-sessions list with
revoke**, **passkey management**, **backup-code regeneration**, and **"sign out of all other devices"**.
Better Auth exposes the session-list and passkey APIs for all of these.

### 4.3 `<OrganizationSwitcher />`

Dropdown listing the orgs the user belongs to, plus the personal account (suppressible with
`hidePersonal`), plus pending invitations. Selecting an org sets it active; **Manage** opens
`<OrganizationProfile>`; **Create organization** opens `<CreateOrganization>` either as a modal or by
navigating, per `createOrganizationMode`.

Props: `hidePersonal`, `createOrganizationMode: 'modal' | 'navigation'`, `organizationProfileMode`,
`afterSelectOrganizationUrl`, `afterSelectPersonalUrl`, `afterCreateOrganizationUrl`,
`afterLeaveOrganizationUrl`, `organizationProfileProps`, `defaultOpen`, `appearance`, `fallback`.

`<OrganizationProfile>` tabs: **General** (org name/slug/logo, verified domains, delete org — admin-gated;
"Leave organization" for everyone), **Members** (list with role and join date; invite, change role, remove
— admin-gated; sub-tabs for pending invitations and join requests), **Billing** (plans, invoices, payment
methods), **Security** (enterprise SSO connections, shown only when self-serve SSO is on and the viewer
holds the managing permission).

Sources: <https://clerk.com/docs/react/reference/components/organization/organization-switcher.md>,
<https://clerk.com/docs/react/reference/components/organization/organization-profile.md>

**For Flare:** orgs are a later phase. The transferable detail is the **permission-gated rendering inside
one component** — the same Members tab renders as read-only for a member and fully interactive for an
admin, rather than being two components.

---

## 5. Customization story, and the lesson for a source-code framework

Clerk's `appearance` prop has five keys
(<https://clerk.com/docs/react/guides/customizing-clerk/appearance-prop/overview.md>):

| Key | Purpose |
| --- | --- |
| `theme` | A `BaseTheme` (or array, merged in order) as the foundation |
| `options` | Layout decisions CSS cannot express — social-buttons placement, logo position, terms/privacy/help links |
| `variables` | Global design tokens (below) |
| `elements` | Per-element overrides keyed by a descriptor (`formButtonPrimary`, `card`, `socialButtonsBlockButton`, …), including state variants |
| `cssLayerName` | Puts Clerk's CSS in a named `@layer` so your cascade can win deterministically |
| `captcha` | Styles the CAPTCHA widget separately |

Variables (<https://clerk.com/docs/react/guides/customizing-clerk/appearance-prop/variables.md>):
`colorPrimary`, `colorPrimaryForeground`, `colorDanger`, `colorSuccess`, `colorWarning`, `colorNeutral`,
`colorForeground`, `colorMutedForeground`, `colorMuted`, `colorBackground`, `colorInput`,
`colorInputForeground`, `colorBorder`, `colorRing`, `colorShadow`, `colorShimmer`, `colorModalBackdrop`;
`fontFamily`, `fontFamilyButtons`, `fontFamilyMono`, `fontSize` (string or `{xs,sm,md,lg,xl}`),
`fontWeight` (`{normal,medium,semibold,bold}`); `borderRadius`; `spacing`.

Cascade: set `appearance` on `<ClerkProvider>` for everything, override per component, and use nested
props (`userProfileProps.appearance`, `checkoutProps.appearance`) for components a component opens.
Core 3 added a visual theme editor with live preview and automatic light/dark matching of the host app.

### The lesson for Flare

Read the token list again: it is **almost exactly a shadcn/Tailwind token set**. Clerk spent years building
`variables` + `elements` + `cssLayerName` + a theme editor to reconstruct, through a prop, the ability to
edit the component — which is what you have for free when the component is a file in the user's repo.

Therefore:

1. **Do not build an `appearance` prop.** It is pure compensation for un-editable components. Flare's
   equivalent is "open the file". Any energy spent on a theming API is energy not spent on the flows.
2. **Do keep the token vocabulary.** Flare's auth components already read `--brand`, `--button-radius`,
   `--radius`, `--font-theme` (see `components/auth/ui.tsx`). Clerk's list is a good completeness check —
   we are missing explicit `--color-success` / `--color-warning` equivalents, and the password strength
   meter, OTP states and MFA screens all need them. Add them to the six themes.
3. **Do copy `options`, as props.** The layout decisions Clerk exposes there (social buttons above vs below
   the form, logo placement, terms/privacy links) are exactly the choices Flare currently bakes per theme
   via `socialPlacement` / `socialStyle` in `sign-in-flow.tsx`. Keeping them as explicit props rather than
   theme-implicit makes the generated code more editable.
4. **Do copy the descriptor discipline.** Clerk's element descriptors are stable, semantic names. In a
   source-code component the equivalent is stable `data-slot` attributes on the parts (shadcn already does
   this), so a user can restyle from their own CSS without editing our JSX — a useful middle ground
   between "accept the default" and "fork the file".
5. **Do copy `cssLayerName`'s intent.** Generated auth CSS should live in a predictable layer so it loses
   to the user's own styles by default.

---

## 6. What Clerk gets right that is easy to miss

- **One door.** `withSignUp` collapses sign-in and sign-up into a single flow with automatic transfer.
- **Masked identifier echo** on every verification screen.
- **`fallback` on every component** — because they must; but the underlying discipline (never render a
  layout-shifting blank) is worth keeping even when the server resolves auth.
- **Resend cooldown without invalidating the old code.** Resending is a UX act, not a security act.
- **Breach detection routes to a flow, not a message.**
- **Backup codes shown exactly once, at enrolment, with copy and download**, and regenerable later.
- **`signOutOfOtherSessions` offered at the moment of password reset.**
- **Pending as a session state, not a redirect.**
- **Deprecating their own headless layer** after two years because the hook API covered the same ground
  with less machinery. The lesson: ship the opinionated flow, expose the data layer, skip the middle tier.

---

## 7. Prioritised recommendations for Flare

Ranked by (UX win) ÷ (effort), for a framework that generates source code.

### Tier 1 — build these first

| # | Thing | What it should do |
| --- | --- | --- |
| 1 | **`<PasswordField>`** | Show/hide toggle, live zxcvbn-backed strength meter, policy stated as helper text before first keystroke, `warning` state that nudges without blocking, themed via `--color-success` / `--color-warning` |
| 2 | **`<OtpInput>`** | One real input, N styled cells, `inputMode="numeric"` + `autocomplete="one-time-code"`, paste/backspace/arrow support, auto-submit on fill, per-cell active/filled state, right padding for password-manager icons |
| 3 | **Server session gate — `getSession()` / `requireSession()`** | Returns `{ status: 'signed-out' \| 'pending' \| 'active', user, tasks }`; redirects signed-out to `/sign-in?next=…` and pending to the first outstanding task. Replaces the whole `<SignedIn>`/`<Protect>`/`<ClerkLoading>` family |
| 4 | **Session tasks** | A task registry (`reset-password`, `setup-mfa`, `choose-organization`, `accept-terms`, `onboarding`) with one route per task and the gate in (3). Pending counts as not-signed-in by default |
| 5 | **Verification screen (`<VerifyCode>`)** | Masked identifier echo, OTP input, 30s resend cooldown with visible countdown, old code stays valid, "use a different email" back-link, clear expiry copy |
| 6 | **Reset-password flow with `signOutOfOtherSessions`** | Code → new password (with the field from (1)) → checkbox to revoke all other sessions, checked by default → MFA challenge if enrolled → land signed in |
| 7 | **MFA enrolment (`<SetupTotp>`)** | QR + copyable plaintext secret, confirm-with-a-code before enabling, backup codes shown once with copy/download, regenerate later |
| 8 | **MFA challenge with "use another method"** | Default factor first, explicit switcher listing every enrolled factor including backup codes, trust-this-device option (Flare's `two-factor-form.tsx` already has `trust` — keep it) |

### Tier 2 — high value, slightly more work

| # | Thing | What it should do |
| --- | --- | --- |
| 9 | **Account → Security: active sessions** | List devices with browser/OS/IP/last-seen, revoke one, "sign out everywhere"; Better Auth exposes the session list |
| 10 | **Passkey management** | Add/rename/remove passkeys in the account page; "sign in with a passkey" on the sign-in screen with conditional-UI autofill |
| 11 | **`<UserMenu>` (our `<UserButton>`)** | Avatar + name, links to account/settings/sign-out, slot for app-specific items, modal-or-navigate for the account page |
| 12 | **`<SignInButton>` / `<SignOutButton>`** | Thin client wrappers around the consumer's own button: pending state, `next` round-trip, redirect after |
| 13 | **Breach check on sign-up and reset** | HaveIBeenPwned k-anonymity range query (one `fetch`, works on Workers, no key) → distinct error that routes to reset rather than a generic "invalid password" |
| 14 | **Connected accounts panel** | List linked social providers in the account page, link/unlink, block unlinking the last credential when no password is set |
| 15 | **Sign-in-or-up single door** | One identifier field that branches to sign-in or sign-up after lookup, as an opt-in scaffold choice |

### Tier 3 — later, or only when orgs land

- `<OrganizationSwitcher>` / org profile with permission-gated tabs (copy the "one component, two
  permission states" pattern, not the component itself).
- `<Waitlist>` — cheap and genuinely useful for the pre-launch apps Flare targets; a form, a table and an
  approval email.
- Email-link (magic link) verification as an alternative to codes, with the device-match option.

### Explicitly **not** worth copying

| Not copying | Why |
| --- | --- |
| `<ClerkLoading>` / `<ClerkLoaded>` / `<ClerkDegraded>` / `<ClerkFailed>` | Pure artefacts of client-side session resolution and a remote SDK that can fail to boot. Flare resolves on the server; there is no unknown state to render |
| An `appearance` prop (variables/elements/baseTheme) | Reconstructs, through a prop, the ability to edit a component we are *handing the user as a file*. Ship tokens + `data-slot` hooks and let people edit the source |
| A headless/Elements-style layer (`<SignIn.Root>`, `<SignIn.Step>`, …) | Clerk built it, shipped it for two years, then deprecated it as unnecessary complexity. Our components *are* the escape hatch. Expose Better Auth's client directly for anyone who wants to start over |
| Multi-session account switching | Large surface (session stacks, per-session storage, switch-without-reload), tiny audience. Skip unless asked for |
| `<RedirectTo*>` components | `redirect()` in a server component is one line and cannot render the wrong thing first |
| `createRouteMatcher`-style middleware auth | Clerk deprecated it themselves; a middleware matcher is not a security boundary and drifts from the routes it claims to protect. Guard each resource |
| Billing components (`<PricingTable>`, `<CheckoutButton>`, …) | Deeply coupled to Clerk's own billing product. If Flare wants billing it belongs in a Stripe/Polar module, not the auth scaffold |
| `<SignInWithMetamaskButton>` | Niche |
| `<UNSAFE_PortalProvider>` | Only needed because Clerk portals modals it does not own. Our modals are the user's own components |
| Forced character-class password rules | Clerk gates these behind their top tier and de-emphasises them deliberately; length + guessability estimation is the better default and the better message |

---

## 8. Not verified / caveats

- **Show/hide password toggle semantics.** Clerk clearly ships one, but I found no docs page specifying
  aria labelling, whether it resets on blur, or whether it is suppressed for password managers. Treat as
  our design decision.
- **`<UserProfile>` per-tab action lists.** Assembled from the reference page, the Account Portal page and
  the MFA/account-update custom-flow guides. The docs do not publish an exhaustive per-tab action list, so
  the tables in §4.2 are close but not authoritative. An **API keys** tab appears in recent Clerk builds;
  I could not confirm it in the `<UserProfile>` docs.
- **`customPages` availability.** The `<UserProfile>` prop table describes `customPages` as JS-SDK-only,
  while the React docs also document `<UserProfile.Page>` / `<UserProfile.Link>` sub-components. I did not
  resolve which applies to React in Core 3.
- **`<UserAvatar>`, `<OrganizationList>`, `<InviteMembersButton>`, `<GoogleOneTap>`,
  `<SignInWithMetamaskButton>`, `<RedirectTo*>`** — one-line descriptions come from the overview page plus
  reasonable inference; I did not fetch each individual reference page.
- **`<PlanDetailsButton>` / `<SubscriptionDetailsButton>`** — descriptions inferred from the billing
  overview; their own reference pages were not fetched.
- **Exact zxcvbn thresholds Clerk applies by default** (which of 0–4 is the default floor, as opposed to
  the configurable `min_zxcvbn_strength`) — not stated in the docs I read.
- **Core 3 timing.** Core 3 shipped March 2026 and the docs are mid-migration: several pages still show
  the pre-Core-3 API (`<SignedIn>`, Elements) without a deprecation banner. Where a claim here concerns
  Core 3, the changelog is the source, not the reference pages.
- **Elements deprecation vs. the primitives.** The *package* is deprecated. The OTP and password-validation
  *behaviours* documented there are still what Clerk's own components do — I am recommending the
  behaviour, not the package.

## 9. Source list

- Component reference (React): <https://clerk.com/docs/react/reference/components/overview>
- Component reference (framework-agnostic): <https://clerk.com/docs/reference/components/overview>
- `<SignIn>`: <https://clerk.com/docs/react/reference/components/authentication/sign-in.md>
- `<UserButton>`: <https://clerk.com/docs/react/reference/components/user/user-button.md>
- `<UserProfile>`: <https://clerk.com/docs/react/reference/components/user/user-profile.md>
- `<OrganizationSwitcher>`: <https://clerk.com/docs/react/reference/components/organization/organization-switcher.md>
- `<OrganizationProfile>`: <https://clerk.com/docs/react/reference/components/organization/organization-profile.md>
- `<PricingTable>`: <https://clerk.com/docs/react/reference/components/billing/pricing-table.md>
- `<CheckoutButton>`: <https://clerk.com/docs/react/reference/components/billing/checkout-button.md>
- `<Show>`: <https://clerk.com/docs/react/reference/components/control/show.md>
- `<ClerkLoaded>` family: <https://clerk.com/docs/react/reference/components/control/clerk-loaded.md>
- `<OAuthConsent>`: <https://clerk.com/docs/react/reference/components/authentication/oauth-consent.md>
- `<Waitlist>`: <https://clerk.com/docs/react/reference/components/authentication/waitlist.md>
- `<TaskSetupMFA>`: <https://clerk.com/docs/react/reference/components/authentication/task-setup-mfa.md>
- Session tasks: <https://clerk.com/docs/guides/configure/session-tasks.md>
- Password protection and rules: <https://clerk.com/docs/security/password-protection>
- Password design posts: <https://clerk.com/blog/how-we-roll-passwords>, <https://clerk.com/blog/a-new-password-experience>
- Sign-up/sign-in options: <https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options.md>
- MFA custom flow: <https://clerk.com/docs/guides/development/custom-flows/authentication/multi-factor-authentication>
- Manage MFA: <https://clerk.com/docs/guides/development/custom-flows/account-updates/manage-mfa>
- Forgot password: <https://clerk.com/docs/nextjs/guides/development/custom-flows/authentication/forgot-password>
- Appearance prop: <https://clerk.com/docs/react/guides/customizing-clerk/appearance-prop/overview.md>
- Appearance variables: <https://clerk.com/docs/react/guides/customizing-clerk/appearance-prop/variables.md>
- Elements (deprecated) — common: <https://clerk.com/docs/guides/customizing-clerk/elements/reference/common>
- Elements (deprecated) — sign-in: <https://clerk.com/docs/guides/customizing-clerk/elements/reference/sign-in>
- Elements overview/deprecation: <https://clerk.com/docs/guides/customizing-clerk/elements/overview>
- Core 3 changelog: <https://clerk.com/changelog/2026-03-03-core-3>
- Require MFA changelog: <https://clerk.com/changelog/2026-02-20-require-mfa>
- Middleware auth deprecation: <https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher>
- `auth()` (App Router): <https://clerk.com/docs/reference/nextjs/app-router/auth>
- Account Portal: <https://clerk.com/docs/guides/customizing-clerk/account-portal>
