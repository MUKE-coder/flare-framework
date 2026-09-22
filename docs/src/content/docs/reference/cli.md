---
title: CLI reference
description: Every flare command, flag by flag.
---

Short, `wrangler`-consistent verbs. Every command below accepts `--help`.

## `flare create <dir>`

Scaffold a new app.

| Flag | |
| --- | --- |
| `--pm <manager>` | `pnpm`, `npm`, `yarn`, or `bun` (default: detected) |
| `--auth-providers <list>` | Comma-separated OAuth providers to scaffold: `google`, `github` |
| `--skip-install` | Write files without installing dependencies |

```bash
npx @flaredev/cli create shop --auth-providers google,github
```

## `flare gen resource <Name>`

Generate (or update) a resource — see
[what it emits](/concepts/generated-files/) and the
[field grammar](/concepts/field-grammar/).

| Flag | |
| --- | --- |
| `--fields <fields>` | e.g. `"name:string, email:string!, status:enum(lead,customer)"` |
| `--force` | Overwrite a hand-edited generated block |

```bash
npx flare gen resource Contact --fields 'name:string, email:string!, company:belongsTo(Company)?'
```

## `flare gen migration <name>`

Scaffold a migration by hand, or diff the current schema.

| Flag | |
| --- | --- |
| `--from-schema` | Diff current tables instead of writing a blank migration |

```bash
npx flare gen migration backfill_contact_status
npx flare gen migration add_phone_to_contacts --from-schema
```

## `flare gen policy <Name>`

Write (or update) a [resource-level policy](/guides/roles-and-policies/).

| Flag | |
| --- | --- |
| `--roles <roles>` | Roles allowed to read, create, and update, e.g. `admin,staff` |
| `--delete-roles <roles>` | Roles allowed to delete (default: the first `--roles` entry) |
| `--force` | Overwrite a hand-edited roles block |

```bash
npx flare gen policy Invoice --roles admin,staff --delete-roles admin
```

## `flare gen billing`

Add [Stripe billing](/guides/billing/): the Plan, Customer and Purchase
resources, their policies, Checkout, the Customer Portal, the webhook, and
`/dashboard/billing`.

| Flag | |
| --- | --- |
| `--provider <provider>` | Payment provider. Only `stripe` is supported. |
| `--mode <mode>` | Only `subscriptions`, which also covers one-time checkout |
| `--force` | Overwrite hand-edited generated blocks, including a hand-edited Customer fields block |
| `--skip-install` | Write the files without installing the `stripe` dependency |
| `--skip-migration` | Skip generating the migration |

```bash
npx flare gen billing --provider stripe --mode subscriptions
```

## `flare gen security`

Add [security](/guides/security/): `security.config.ts`, the SecurityEvent
resource and policy, the request guard in `lib/security.ts`, the
`/admin/security` dashboard, and the KV, Durable Object and rate-limit
bindings in `wrangler.jsonc`.

| Flag | |
| --- | --- |
| `--force` | Overwrite hand-edited generated blocks |
| `--skip-migration` | Skip generating the migration |

```bash
npx flare gen security
```

## `flare billing:sync-plans`

Mirror this app's Stripe Products (those with metadata
`flare_app=<package name>`) and their active prices into the Plan table.
Deactivate plans whose price is gone. Configure the Customer Portal to allow
switching between the synced plans.

| Flag | |
| --- | --- |
| `--remote` | Write to the deployed database |
| `--env <name>` | Wrangler environment |
| `--all` | Import every active Product, not only this app's |

```bash
npx flare billing:sync-plans --remote
```

## `flare rm resource <Name>`

Remove a resource's generated files. Refuses on hand-written code outside
generated blocks, or while another resource still references it — see the
[codegen overwrite contract](/concepts/codegen-contract/).

| Flag | |
| --- | --- |
| `--force` | Delete even when files contain hand-written code |

```bash
npx flare rm resource Tag
```

## `flare role:add <name>`

Register an additional role users can be assigned. `admin` and `staff` are seeded by the initial migration.

| Flag | |
| --- | --- |
| `--label <label>` | Display label (default: humanized name) |
| `--remote` | Target the deployed database |
| `--env <name>` | Wrangler environment |

```bash
npx flare role:add support --label "Customer support"
```

## `flare user:role <email> <role>`

Set a user's role — e.g. make the first admin. Refuses an unregistered
role name.

| Flag | |
| --- | --- |
| `--remote` | Target the deployed database |
| `--env <name>` | Wrangler environment |

```bash
npx flare user:role you@example.com admin --remote
```

## `flare migrate`

Apply pending D1 migrations (local by default — shared state with `flare
dev`/`flare start`).

| Flag | |
| --- | --- |
| `--remote` | Target the deployed database |
| `--env <name>` | Wrangler environment |
| `--database <binding>` | Which D1 binding, when the app has more than one |

## `flare migrate:rollback`

Undo the most recently applied migrations — see
[migrations & seeds](/guides/migrations-and-seeds/) for exactly how downs
are resolved.

| Flag | |
| --- | --- |
| `--steps <n>` | How many migrations to roll back (default `1`) |
| `--remote` | Target the deployed database (requires `--yes`) |
| `--yes` | Confirm a remote rollback |
| `--env <name>` | Wrangler environment |
| `--database <binding>` | Which D1 binding |

## `flare seed [...names]`

Run seed files from `seeds/` against the local D1 database.

```bash
npx flare seed             # every seed, file-name order
npx flare seed contacts    # just seeds/contacts.seed.ts
```

## `flare seed:make <name>`

Create `seeds/<name>.seed.ts`, with example rows if the name matches a
resource.

| Flag | |
| --- | --- |
| `--resource <name>` | Write example rows for this resource explicitly |

## `flare sync-types`

Regenerate every derived file from the descriptors and report drift — see
[drift & sync-types](/concepts/sync-types/).

| Flag | |
| --- | --- |
| `--check` | Change nothing; exit `1` if anything is out of sync (CI) |
| `--force` | Overwrite generated blocks that were edited by hand |

## `flare tunnel [port|url]`

Share a local server on a public `https://*.trycloudflare.com` URL through a
Cloudflare Quick Tunnel. No account is needed. The target defaults to
`http://localhost:3000`. See [Sharing your local app](/guides/tunnels/).

```bash
npx flare tunnel 8787
```

## Delegated commands

These forward straight through to the app's own installs — see
[deploying to Cloudflare](/guides/deployment/) for what `deploy` adds on
top.

| Command | Runs |
| --- | --- |
| `flare dev` | `vinext dev` |
| `flare build` | `vinext build` |
| `flare start` | `wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/state` (runs `flare build` first if there's no build yet) |
| `flare deploy` | Migrations → `vinext-cloudflare deploy` → secrets → zone security rules |

`flare dev` and `flare start` also accept `--tunnel`, which shares the running
server on a public URL ([Sharing your local app](/guides/tunnels/)).

`flare deploy` additionally accepts `--skip-migrations`, `--skip-secrets`,
`--skip-security`,
`--env <name>`, and `--preview` (shorthand for `--env preview`).
