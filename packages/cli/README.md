# @flaredev/cli

The `flare` command for [Flare](https://flare-docs.codetotech.com), a
batteries-included fullstack framework. It scaffolds apps, generates resources
with an admin dashboard and REST API, runs migrations and deploys.

Apps run on one of two stacks, chosen once at `flare create`:

- **Cloudflare** — vinext on Workers, D1 and Drizzle, Better Auth, R2.
- **Next.js** — Next.js 16 on Vercel, Postgres and Prisma, Better Auth, R2.

The descriptors, validators, policies, REST API and dashboard are the same on
both. [Choosing a stack](https://flare-docs.codetotech.com/start/stacks/) is the
comparison, including what each one can't do.

## Install

```sh
npm install -g @flaredev/cli     # or: pnpm add -g @flaredev/cli
```

Or with the install scripts (they check for Node.js 22+ and use npm or pnpm):

```sh
# macOS / Linux
curl -fsSL https://flare-docs.codetotech.com/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://flare-docs.codetotech.com/install.ps1 | iex
```

Or skip the install entirely:

```sh
npm create flare-framework@latest my-app
npx @flaredev/cli create my-app
```

## Use

```sh
flare create shop
cd shop
flare gen resource Product --fields 'name:string, price:int, sku:string!'
flare migrate
flare dev
flare deploy
```

Run `flare --help` for every command, or read the
[CLI reference](https://flare-docs.codetotech.com/reference/cli/).

Requires Node.js 22 or later.
