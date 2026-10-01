# The Flare CLI

Every command takes `--help`. Inside an app, run them with `npx flare …`;
each app pins its own `@flaredev/cli`.

## Creating

```bash
pnpm create flare-framework myapp        # asks which stack, theme, sign-in methods
pnpm create flare-framework myapp -- --stack next --yes
```

Dependencies install with pnpm whenever it is on the machine, whichever
package manager started the command. `--pm npm` overrides.

## Generating

| Command | Writes |
| --- | --- |
| `flare gen resource <Name> --fields '<spec>'` | Table/model, migration, validators, REST routes, typed client, four dashboard pages and their skeletons |
| `flare gen endpoint <Resource> <name>` | A route handler for something a resource doesn't cover. The resource comes first, positionally — there is no `--resource` flag. `--method`, `--record`, `--action` |
| `flare gen policy <Resource> --roles admin,staff` | Who may read, create, update and delete |
| `flare gen migration <name>` | An empty migration, or `--from-schema` to diff |
| `flare gen billing` | Stripe checkout, portal and webhooks |
| `flare gen security` | Zone rules and the detector layer (Cloudflare only) |
| `flare gen apikeys` | API keys, so a cron job, script or mobile app can call the API |
 | API keys for cron jobs, scripts and mobile apps |

`--force` overwrites a generated block someone has hand-edited. It is the
only way past the codegen contract, and it discards their edits.

| `flare diff [filter]` | What differs between this app's copies of Flare's code and the installed version |
| `flare update [filter]` | Take the installed version. Refuses without `--yes` |

`flare rm resource <Name>` removes everything a resource owns, including
files orphaned after its descriptor was deleted.

## Database

| | Cloudflare | Next.js |
| --- | --- | --- |
| Apply migrations | `flare migrate` (`--remote` for production) | `prisma migrate dev` locally; `flare migrate` (= `prisma migrate deploy`) in production |
| Roll back | `flare migrate:rollback --steps 1` | `prisma migrate resolve` |
| Seed file | `flare seed:make <name> --resource Product`, then `flare seed` | the same |
| Fill a table | `flare seed:resource Product 25k` | not available — writes to D1 through wrangler |
| Copy local rows up | `flare db:push` | not applicable |

`flare seed` hands a seed `db` (Drizzle or the app's Prisma client), an
`insertMany` that batches, and `fake` for sample values.

## Running

| Command | Cloudflare | Next.js |
| --- | --- | --- |
| `flare dev` | `vinext dev` | `next dev` |
| `flare build` | `vinext build` | `prisma generate`, then `next build` |
| `flare start` | `wrangler dev` on the build | `next start` |
| `flare deploy` | migrations → deploy → secrets → zone rules | `vercel deploy --prod` |

`flare dev --tunnel` shares the running server on a public HTTPS URL, on
either stack.

## Other

- `flare user:role <email> <role>` — make someone an admin
- `flare theme [name]` — switch the look
- `flare sync-types` — regenerate after editing descriptors by hand
- `flare gen resource --help` — the field grammar, inline
