# Flare — Build Phases

Work phases **in order**. Do not start a phase's tasks until every task in the
previous phase is checked off, unless a task explicitly says it can run in
parallel. Check off tasks (`- [x]`) as you complete and verify them — not
before. This file is the single source of truth for project progress; keep it
current as you work, and re-read it at the start of every session to see
where things stand.

Each phase ends with an **exit criteria** line. Do not consider a phase done
until that criteria is demonstrably true (write a test, run it, deploy it —
don't just believe it).

---

## Phase M0 — Core scaffold

- [x] Set up the monorepo (CLI package, core framework package, example app)
- [x] `flare create <app>` scaffolds a vinext app with TypeScript + Tailwind
- [x] Wire D1 + Drizzle: generated `drizzle.config.ts`, base `schema.ts`, `wrangler.jsonc` D1 binding
- [x] Wire Better Auth: email/password provider, D1/Drizzle adapter, session middleware
- [x] `--auth-providers google,github` flag generates OAuth provider config + env var scaffolding
- [x] Wire R2: a storage helper (`lib/storage.ts`) with signed-upload and signed-read URL helpers
- [x] Wire Resend: a mailer helper (`lib/mail.ts`) with a basic transactional template
- [x] `flare dev` / `flare start` / `flare deploy` delegate correctly to vinext's own CLI commands

**Exit criteria:** a scaffolded app deploys to Cloudflare Workers and supports
email/password login end-to-end.

✅ **Met (2026-09-17).** `examples/demo` (from `flare create`) was deployed from a
clean account state with only `pnpm run deploy` (`flare deploy`): D1 and R2 were
provisioned, migrations applied, and the auth secret generated. `scripts/e2e-auth.sh`
passed 13/13 against https://demo.gmukejohnbaptist.workers.dev (sign-up, duplicate
and wrong-password rejection, sign-in, session, protected dashboard, sign-out,
forged cookie), and again after a redeploy.

---

## Phase M1 — Resource generator

- [x] Design and implement the `<resource>.resource.ts` descriptor format (see `project-description.md`)
- [x] `flare gen resource <Name> --fields "..."` parses the field grammar (including `file:[image,pdf,...]`)
- [x] Generator emits: Drizzle schema, D1 migration, Zod validators, REST/RPC route handlers, typed client
- [x] `belongsTo` / `hasMany` relations generate correct FK columns and inverse relation metadata
- [x] `flare migrate` / `flare migrate:rollback` work against the generated migrations
- [x] `flare seed` / `flare seed:make <name>` scaffold and run seed files
- [x] `flare sync-types` regenerates validators/client from schema and flags drift on hand-edited generated files
- [x] Implement the `// generated:start` / `// generated:end` marker convention so re-running `gen resource` preserves hand-written code outside those blocks
- [x] `flare rm resource <Name>` removes generated files, refuses on detected hand-written code outside markers unless `--force`
- [x] `flare gen migration <name>` scaffolds a blank migration for manual schema work

**Exit criteria:** `gen resource Contact --fields "name:string, email:string"`
followed by `migrate` produces a working CRUD REST API against D1, verified
with a request against each HTTP verb.

✅ **Met (2026-09-17).** In a fresh `flare create` app, exactly
`flare gen resource Contact --fields "name:string, email:string"` → `flare migrate`
→ `flare start` passed `scripts/e2e-crud.sh` 21/21 on local D1: GET list/item,
POST, PATCH, PUT, DELETE, plus 401/403/404/415/422/400 paths. The demo was then
deployed with `flare deploy` (remote migrations applied before release), and the
same script passed 21/21 against live D1 at https://demo.gmukejohnbaptist.workers.dev,
with auth still 13/13.

---

## Phase M2 — Admin dashboard shell

- [x] Build `<ResourceTable>` — reads columns/filters/sort from a resource descriptor; paginated, sortable, filterable
- [x] Build `<ResourceForm mode="create" | "edit">` — renders inputs from field metadata, wires Zod validation
- [x] Build all v1 field widgets: text, textarea, number, toggle, date picker, select, file upload, relation picker
- [x] Build `<ResourceNav>` — auto-populates sidebar from all registered resources
- [x] Generated admin pages (`page.tsx`, `new.tsx`, `[id]/edit.tsx`) are thin wrappers around the above, not hand-authored per resource
- [x] Session-gate the `/admin` route group (redirect non-staff/non-admin roles)
- [x] Apply the visual language from `style-guide.md`

**Exit criteria:** generating a resource produces usable, styled list/create/edit
admin pages with zero additional hand-written UI code.

✅ **Met (2026-09-17).** In a fresh `flare create` app,
`flare gen resource Ticket --fields "title:string, body:text?, priority:enum(low,normal,high), due:date?, done:boolean?, hours:float?"`
→ `flare migrate` → `flare dev` produced working admin pages with no hand-written
UI: the resource appeared in the sidebar, the empty list explained what to do, and a
record was created (select, date picker, toggle, number), listed with formatted
values and a status badge, edited, and deleted — all through the generated pages,
with no client errors. Screenshots confirmed the style guide (flat cards,
monochrome chrome, status-only color, labels above inputs, dark mode).

---

## Phase M3 — Roles, policies, v1 launch polish

- [x] `flare role:add <name>` registers roles in the auth/roles table
- [x] `flare gen policy <Name> --roles a,b` generates resource-level read/create/update/delete policy files
- [x] `<ResourceTable>` / `<ResourceForm>` / `<ResourceNav>` enforce policies (hide nav items with no read access)
- [x] API layer enforces the same policies server-side (never UI-only enforcement — verify with a direct API call as an unauthorized role)
✅ **Roles and policies (2026-09-17).** `flare role:add staff` registers a role;
`flare gen policy Deal --roles admin,staff` writes `policies/deal.policy.ts`
(delete narrowed to `admin`) and registers it. Against the running demo with three
users — admin, staff, and one with no role — the API answered exactly as the policy
says: `GET/POST/PATCH /api/deals` 200/201/200 for both admin and staff, `DELETE`
403 for staff and 204 for admin, and 403 on every verb for the roleless user, whose
Contacts and Companies (no policy) stayed open. In the browser, admin saw Edit and
Delete, staff saw Edit only, and after narrowing create/update to `admin`, staff got
no New button and no row menu at all — with `POST`/`PATCH` also turning 403, so the
UI never became the only gate. The roleless user saw no Deals in the sidebar and was
redirected off `/admin/deals` and `/admin/deals/new`. 234 unit tests pass.

- [x] Wire KV data-cache adapter ~~and Workers Cache CDN adapter~~ with sane default TTLs
  - KV data cache: done and verified on the deployed demo (see "Caching" in `project-description.md`).
  - Workers Cache CDN adapter: moved to the Backlog (2026-09-18). vinext 1.0 beta's `cdnAdapter` breaks every redirecting page.
- [ ] `<FileField>` admin component fully wired to R2 with signed-URL upload flow, respecting the `file:[types]` MIME constraint
- [ ] Write the framework's own docs/examples
- [ ] End-to-end test: `flare create app && flare gen resource Contact --fields "..." && flare deploy` completes in under 5 minutes for a fresh user

**Exit criteria:** the 5-minute create→generate→deploy loop holds, with roles
enforced at both UI and API layers. **This is the v1 launch bar.**

---

## Phase M4 — Realtime primitive

- [ ] Design one Durable Object–backed broadcast/channel primitive (rooms, presence)
- [ ] Ship `useRealtime(channel)` client hook wired to a WebSocket-hibernation-backed DO
- [ ] Build one worked example end-to-end (e.g. live comments or live order status updates)
- [ ] Document reconnect/backoff behavior clearly — do not attempt a general CRDT sync engine

**Exit criteria:** one realtime example works reliably under connection drops
and DO cold starts.

---

## Phase M5 — Billing

- [ ] `flare gen billing --provider stripe --mode subscriptions` scaffolds a `Plan` resource, `Subscription` fields on `Customer`, and the Stripe webhook route
- [ ] `flare billing:sync-plans` pulls Stripe Products/Prices into the local `Plan` table
- [ ] `<BillingPortalButton>` opens a Stripe-hosted billing portal session
- [ ] Webhook handler verifies signatures and keeps `Customer.status` in sync on `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] One-time Checkout flow (for non-subscription purchases) ships as a separate, additive path alongside subscriptions

**Exit criteria:** a subscription can be purchased, upgraded, and cancelled
entirely through generated UI, with `Customer.status` staying correct through
every webhook event.

---

## Phase M6 — Security dashboard

- [ ] `security.config.ts` provisions Cloudflare Rate Limiting + WAF/IP Access rules at deploy time via the Cloudflare API
- [ ] `/admin/security` dashboard reads rule hits, blocked-request counts, and active bans back from the same API
- [ ] Manual ban/unban from the dashboard calls the IP Access Rules API directly
- [ ] `SecurityEvent` resource (generated like any other resource) logs app-layer signals: failed-login bursts, checkout abuse, API scraping patterns
- [ ] App-layer counters (KV or Durable Objects) detect abuse patterns and can push an IP into the edge-layer ban list

**Exit criteria:** a simulated login-brute-force attempt is detected, logged
as a `SecurityEvent`, and results in an automatic edge-layer ban, visible in
the dashboard.

---

## Phase M7 — Observability & performance analytics

- [ ] Drizzle query-logging wrapper flags N+1 patterns (same query shape run >N times in one request) with the offending query and a suggested eager-load fix
- [ ] Wire `instrumentation.ts`'s `onRequestError()` hook to write into an `ErrorEvent` resource automatically
- [ ] `/admin/performance` dashboard: latency percentiles and resource consumption (CPU time, subrequests, D1 read/write units) via Workers Analytics Engine
- [ ] Per-route breakdown of the above, not just app-wide aggregates

**Exit criteria:** an intentionally-introduced N+1 query in a demo app is
caught and surfaced in the dashboard before the developer notices it in
production.

---

## Backlog (not phased yet — do not start without discussion)

- Field-level permissions and per-record ownership (full RBAC)
- Inline `hasMany` dashboard widgets, saved filters/views
- Admin UI theming/plugin system
- Workers AI + Vectorize integrations (AI-generated fields, semantic search)
- Queues-backed background jobs
- Workers Cache CDN adapter (`cdnAdapter`): re-enable in `vite.config.ts` once vinext fixes redirects behind it and the two-stage warm deploy leaves experimental. Pages are already CDN-ready (the root layout no longer reads cookies)
