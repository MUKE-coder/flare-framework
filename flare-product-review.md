# Flare Framework — Product Review

**To:** MUKE-coder (maintainer)
**From:** Product Management
**Date:** 1 October 2026
**Version reviewed:** `@flaredev/cli` / `@flaredev/core` 0.8.1 (`main`, commit "0.8.1: the Export button never worked, and five skills")
**Sources:** the GitHub repo (cloned and read), flare-docs.codetotech.com, `llms.txt`, the agent skill, the "Build with AI" brief, `CHANGELOG.md`, `phases.md`, `project-description.md`

---

## 1. Executive summary

Flare is a well-reasoned, well-written framework with one strong idea executed cleanly: **one resource descriptor is the source of truth for the table, the migration, the validators, the REST API, the typed client, the policy and the dashboard**, and the engine that runs it is copied into the app rather than hidden in `node_modules`. The code quality is high, the docs have a voice, and the "nothing is hidden" posture plus `flare diff` / `flare update` is a real differentiator against Refine, PayloadCMS, Directus and friends.

The product's biggest risks are not in the idea. They are:

1. **Release quality on the Next.js stack.** The changelog shows five consecutive releases fixing things that never worked on first use (first install, image uploads, cursor paging, `flare diff`, Export). Every one of them would have been caught by a CI job that scaffolds an app and clicks the feature. There is no `.github/` directory in the repo.
2. **The authorization model stops at the resource.** Policies are role × action per resource. There is no per-record ownership, no field-level rule and no tenant/organisation primitive. For the "founder validating something" persona in your own *Who it's for* page, this is the first wall they hit on day two.
3. **Adoption is near zero** (8 stars, 1 fork, 0 watchers at time of writing) despite a product that is, honestly, better than its numbers. This is a distribution problem, not an engineering one.

Overall verdict: **strong 0.x, not yet a 1.0.** The fastest path to 1.0 is less about new features and more about trust: CI, a stable contract, ownership policies, and a visible community surface.

---

## 2. What developers will love

### 2.1 The descriptor is really the source of truth
```ts
export default defineResource({
  name: "Product",
  fields: { name: field.string(), sku: field.string({ unique: true }), price: field.float(), ... },
});
```
Everything downstream is derived. Changing a label or a validation rule takes effect at runtime without regenerating; only storage-level changes need a migration. That split (runtime descriptor vs. generated storage) is the correct design and it is explained well in `fields.ts`.

### 2.2 "Nothing is hidden"
`lib/resource/` (~950 lines in the template: `rows.ts`, `query.ts`, `store.ts`, `handlers.ts`, `http.ts`, plus one adapter) is the app's own code. Ctrl-click lands in your repo. `flare diff` and `flare update --yes` give you shadcn-style ownership with an upgrade path. This is the headline feature and it is executed properly — including the 0.7.2 fix that expanded tracking from 7 files to 116.

### 2.3 Routes that read top-to-bottom (0.7.0)
Each generated `POST` shows `authorize → crossOrigin → readJson → store.create → Response` in order, with the guards as named functions. This is the opposite of the "magic handler factory" most generators ship, and it is exactly what an AI agent (and a junior dev) needs to reason about a request.

### 2.4 The engine is thoughtful in the places that usually bite
- `COUNT_LIMIT = 10_000` with `exactTotal: false` and cursor paging past it — a real answer to "the count query is the slowest thing on the page."
- `z.strictObject` on create/update with a readable "Unknown field(s)" message.
- Constraint errors mapped back to the owning field (`409 "SKU is already taken."` with `field: "sku"`), the same wording on SQLite and Postgres.
- `drain(request)` in a `finally`, with the comment explaining the wrangler "Network connection lost" bug it prevents. Nobody documents that.
- `onChange` runs *before* the write returns so cache tags can't race the response; a broken listener never converts a completed write into an error.
- Computed fields that throw become `null` rather than taking the record with them.

### 2.5 Batteries that are actually included
Better Auth (passwords, magic link, OTP, passkeys, 2FA, social), R2 signed uploads with content sniffing, Resend mail, Stripe subscriptions + one-time checkout, OpenAPI 3.1 + Scalar page, CSV import/export, saved views, audit log, a security dashboard with ban lists and abuse detection, a cost estimator, six themes with dark mode, loading skeletons per route, `flare tunnel` with no account. For a solo developer this is weeks of work removed.

### 2.6 Field grammar depth
Thirteen string formats (`email`, `tel` with E.164 + country picker, `timezone` checked against the runtime's own list, `currency`, `postcode`…), `money`/`percent`/`rating` display shorthands, file categories with size caps. The `:5mb` and `enum(a,b)` syntax is compact and the `--help` is good.

### 2.7 AI-native from the start
An installable skill (`npx skills add MUKE-coder/flare-framework@flare`), `/llms.txt`, a "Build with AI" button on every docs page, and a brief that tells the agent to *read `lib/resource/` rather than guess*. The rules list (generated markers, `clientResource()`, hooks-not-handlers, policies-only-in-policies) is precisely the list of mistakes agents make. This is ahead of most frameworks.

### 2.8 The writing
The changelog explains root causes and names the test that asserted the broken behaviour. The *Who it's for* page has a *Who it's not for* section. The *Costs* page uses measured numbers. Developers trust this tone.

---

## 3. Bugs and defects found

### 3.1 Confirmed in the current code

| # | Where | What | Severity |
|---|---|---|---|
| B1 | `packages/cli/src/cli.ts` | The "Unknown generator" error lists `resource, migration, policy, billing, security` — **`endpoint` is missing**, even though it is a valid generator. | Low |
| B2 | `cli.ts` help text | `flare diff` is described as covering "(lib/resource)" — stale since 0.7.2, when it was widened to all of `lib/` and `components/`. | Low |
| B3 | `cli.ts` help text | `migrate`, `migrate:rollback`, `seed` and `seed:resource` are all described in D1/Wrangler terms ("Apply pending D1 migrations", "against the local D1 database"). On a `next` app this is wrong and confusing. `seed:resource` isn't even supported there. | Medium |
| B4 | `skills/flare/SKILL.md` | Skill metadata says `version: "0.7.3"` while the packages are 0.8.1. `SKILL.md` has zero mentions of `money`, `rating`, `username`; only `references/field-grammar.md` has them. An agent reading the skill may not know 0.8.0's twelve field types exist. | Medium |
| B5 | `realtimeChannel().publish()` on `next` | Documented as a silent no-op. A silent no-op in a method called `publish` is a trap: a developer ports a Cloudflare app, nothing errors, nothing happens. | Medium |
| B6 | Repo | **No `.github/` directory.** No CI, no release workflow. `pnpm test` exists and there are 51 test files (~6k lines), but nothing runs them on push, and the ten `scripts/e2e-*` scripts are ad-hoc and manual. | High |
| B7 | `gen` command surface | All six generators share one `flare gen` command with ~15 options; `flare gen --help` shows billing, security, migration, policy and endpoint flags together. Error messages have to say which generator a flag belongs to. | Low |

### 3.2 Pattern in the changelog (the real finding)

| Version | Shipped broken | Found by |
|---|---|---|
| 0.6.1 | New Next.js app could not finish its first `pnpm install` | a user |
| 0.6.2 | Prisma engines download could take the install down | a user |
| 0.7.1 | Image uploads on Next.js stored nothing and returned 201 | "uploading an actual PNG rather than reading the code" |
| 0.7.2 | `flare diff` only saw a sixth of the tracked files | self |
| 0.7.3 | Second page of every Next.js dashboard list failed; the test asserted the broken behaviour | a user |
| 0.8.1 | Export button never worked, on both stacks, since the feature shipped | a user |

Six releases in a row shipped a feature that did not work on first use. Four of six are Next.js-only. The honesty in the changelog is admirable, but the pattern tells a developer: *the Cloudflare stack is tested by use; the Next.js stack is tested by readers.* That is the single biggest threat to the "same descriptor, both stacks" promise.

### 3.3 Leaks in the "identical on both stacks" claim

The brief itself lists these; they are not bugs, but they are promises with asterisks that a developer discovers after choosing:

- Enum values must be identifiers (Postgres enums), so `A+` needs `a_pos` + `optionLabels`.
- `date` is text on SQLite and `DateTime @db.Date` on Postgres, so `fake.date()` works on one and throws on the other.
- `seed:resource` is Cloudflare-only.
- Realtime does not exist on `next`.
- Prisma cannot see hand-written SQL and `migrate dev` will offer to drop it.
- A stack is chosen once and cannot be changed.

Recommendation: a single **"Stack differences"** table on the *Choosing a stack* page, above the fold, listing every one of these. Today they are scattered across the brief, the skill and the changelog.

---

## 4. Missing features (ordered by how often a real app hits them)

### 4.1 Per-record ownership and tenant scoping — **the gap**
`policy.ts` says it plainly: *"Field-level rules and per-record ownership are deliberately out of scope for v1."* Today any signed-in user with the `staff` role can read every row of every resource that role can read. There is no `owner` concept, no `where: { userId: ctx.user.id }` scoping, no organisation/team model. Nearly every app in your target list — the client project, the internal tool, the founder's MVP — needs "users see their own records" within the first week. Developers will bolt it on in hooks, which your own Rule 5 forbids, or in handlers, which Rule 4 forbids.

**Recommended shape:** a `scope` on the policy (`scope: (user) => ({ ownerId: user.id })`) applied by the store to `list`/`read`/`update`/`delete`, and an `ownedBy: field.belongsTo("User", { owner: true })` convention that auto-fills on create and auto-scopes. Keep roles as they are; add ownership underneath.

### 4.2 API keys / bearer auth for non-browser clients
The API is cookie + CSRF only. The CORS guide ends with "a bearer token is often simpler" and then does not provide one. A mobile app, a cron, a partner integration or a script cannot call a Flare API without hand-rolling auth. Better Auth has an API-key plugin; wiring it as `flare gen apikeys` with a dashboard page would close this in days.

### 4.3 Field kinds developers will ask for in week one
- `json` — settings blobs, metadata, anything not table-shaped. Both SQLite and Postgres support it.
- `richtext` / `markdown` — the "notes" and "description" fields of every CRM and CMS.
- `decimal` — see 4.4.
- `array`/`tags` of free strings (distinct from `multiselect`, which is a fixed vocabulary).

### 4.4 Money as `float` is a liability
The brief says "Don't invent a cents integer for money unless asked. `float` plus the dashboard's digit grouping is the default." For a shop tutorial with a till that is a correctness bug waiting to happen (`0.1 + 0.2`). Postgres has `numeric`; SQLite stores integers exactly. Recommended: `money` stays as the display shorthand, but the stored column becomes integer minor units (or `numeric` on Postgres), with the store converting at the boundary. This is a breaking change — do it before 1.0, not after.

### 4.5 Soft delete
No `deletedAt`, no `softDelete: true` on a resource, no "Trash" view. The audit log exists, which makes soft delete the obvious next step.

### 4.6 Background jobs, scheduled tasks, webhooks (inbound)
Nothing for Queues, `scheduled()` handlers, or a generic inbound-webhook endpoint (Stripe's is special-cased). Phases lists Queues in the backlog. Email sending, CSV import of 25k rows and R2 cleanup all want a job runner.

### 4.7 Orphaned uploads
Replace or delete a file field and the old R2 object stays forever. Already in your backlog; it is a storage bill and a GDPR problem, so it should be in a phase.

### 4.8 Many-to-many ergonomics
Making the join its own resource is the right storage decision and the docs argue it well. But the *dashboard* side is missing: no inline `hasMany` widget on the record page, no "add related" from the parent, no pivot picker. Also in your backlog; it is the feature people screenshot.

### 4.9 Data model migration between stacks
"Cannot be changed afterwards" is defensible, but a `flare export --json` / `flare import` pair (all tables to portable JSON, back into the other stack) would turn a hard wall into a documented afternoon, and would double as a backup story — which also does not exist today.

### 4.10 Smaller gaps
- `flare gen resource` cannot take a descriptor file as input (only `--fields`); writing the descriptor first, then generating, means writing it twice or hand-editing afterwards.
- No `flare doctor` / `flare check` to validate env vars, bindings, pnpm version, Node ≥22, Prisma generate state — most "it doesn't work" issues are environment.
- No i18n hooks in the dashboard (labels are English strings in descriptors, with no locale layer).
- No test harness for the generated app (a `createResourceStore` with an in-memory `rows` is mentioned in the comments as possible, but no `flare gen test` or example test ships).
- `flare rm` only removes resources, not endpoints or policies.

---

## 5. What developers will not like

### 5.1 The install is heavy
~340 packages, pnpm forced whenever present, Node 22+. The README owns this, but "minutes under npm" is a first impression.

### 5.2 `!` in the field grammar fights bash
`email:string!` triggers history expansion in double quotes; the help text itself has to warn about it. Accepting `email:string:unique` as an alias (and `:optional`) costs nothing and removes the warning.

### 5.3 Prisma on the `next` stack is a sharp edge
"`prisma migrate dev` will offer to **drop** your GIN index / generated column / trigger" is the kind of sentence that ends up in a post-mortem. Either Flare writes those objects into a Prisma-visible place (e.g. a tracked `prisma/sql/` folder it re-applies), or `flare migrate` on `next` should wrap `migrate dev` and refuse when the shadow diff contains a `DROP`.

### 5.4 Vendor-shaped stacks
Cloudflare-or-Vercel, D1-or-Neon, KV-or-Upstash, R2 on both, Better Auth, Resend, Stripe. Each is a sensible default, but a developer with existing Postgres on Railway, or S3 on AWS, or Postmark, has no sanctioned slot. The *Self-hosting* page exists, which is good; a `rows.ts` adapter for plain `pg` and a storage adapter interface for S3-compatible hosts would widen the funnel a lot for little code.

### 5.5 The admin dashboard is the UI
Public pages are "a courtesy" (your words). That is honest, but it means every Flare app looks like an admin panel. The themes change colours, not information architecture. A "customer portal" layout (the signed-in non-admin view) is the most common second surface and there is no primitive for it.

### 5.6 Trust signals are thin
8 stars. No Discord, no GitHub Discussions, no issue templates, no contributing guide, no roadmap page in the docs (it is in `phases.md`, in the repo), no CI badge, no "used by" section, `supabase-docs.png` sitting in the repo root. The docs live on `codetotech.com` rather than a `flare`-branded domain. None of this is about the code; all of it is what a developer checks in the first 90 seconds before deciding whether to invest a weekend.

### 5.7 The 0.x contract is still moving
`createResourceStore` changed signature in 0.6.0; routes changed shape in 0.7.0; `store.list` changed signature in 0.8.1. Each was handled gracefully (old exports kept working), but a developer who regenerated between 0.6 and 0.8 has three vintages of route in one app. Say in the docs which release freezes the contract.

---

## 6. Recommendations

### Now (next two releases)
1. **Add CI.** One GitHub Actions workflow: `pnpm test`, then scaffold both stacks with `--skip-install` off, run `flare gen resource`, `flare migrate`, start the server, hit `/api/products`, click Export, upload a PNG, page twice. Every bug in §3.2 becomes a red check instead of a user report. Add the badge to the README.
2. **Fix B1–B4.** Error list, stale help strings, stack-aware command descriptions, bump and regenerate the skill from the same source as the docs (the skill should be a build artifact, not a hand-copied file).
3. **Make the `next` no-ops loud.** `realtimeChannel().publish()` on `next` should `console.warn` in dev at minimum; `seed:resource` should say "Cloudflare only — use `seed:make`" rather than failing on a missing wrangler.
4. **One "Stack differences" table** on the stacks page.

### Next (before 1.0)
5. **Ownership scoping in policies** (§4.1). This is the feature that unblocks the most apps.
6. **API keys via Better Auth** (§4.2), with a dashboard page.
7. **`json` and `richtext` fields** (§4.3).
8. **Decide money storage** (§4.4) — breaking, so do it now.
9. **Soft delete** as a descriptor flag, surfaced in the table as a Trash filter.
10. **Freeze and publish the codegen contract** with a version number, and state what "1.0" means (no signature changes to `lib/resource/` without a major).

### Later (growth)
11. Inline `hasMany` widgets and a related-record picker.
12. Orphan cleanup for R2, plus a job runner (Queues on Cloudflare, Vercel Cron / Upstash QStash on `next`) that both use.
13. `flare export` / `flare import` for backups and stack moves.
14. Plain-Postgres and S3 adapters to widen the funnel beyond two hosts.
15. **Distribution:** a branded domain, GitHub Discussions, a public roadmap page (render `phases.md`), a 90-second demo video on the README, a comparison page against Refine / Payload / Directus / Supabase Studio, and three "built with Flare" showcases (the demo CRM, the shop, the drive — you already have them, deploy and link them).

---

## 7. Scorecard

| Area | Score | Note |
|---|---|---|
| Core idea & architecture | 9/10 | Descriptor + copied engine is the right design |
| Code quality | 8/10 | Clear, commented, defensive; a few stale strings |
| Docs | 8/10 | Excellent voice and coverage; stack differences scattered |
| AI-agent readiness | 9/10 | Skill + llms.txt + brief; skill version lags |
| Release quality | 4/10 | Six consecutive "never worked" fixes; no CI |
| Authorization model | 4/10 | Resource-level only; no ownership or tenancy |
| Data model breadth | 6/10 | Rich string formats; no json/richtext/decimal; float money |
| Stack parity | 6/10 | Real, with a dozen documented asterisks |
| Extensibility | 7/10 | Hooks, computed, endpoints, policies; no jobs/webhooks |
| Community & trust | 2/10 | 8 stars, no CI badge, no community surface |

**Overall: 6.5/10 today, with a clear path to 8+.** The engineering is better than the adoption, and the gap closes with CI, ownership policies and a visible community — not with more features.
