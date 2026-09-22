# @flaredev/cli

The `flare` command for [Flare](https://flare-docs.codetotech.com), a
batteries-included fullstack framework on Cloudflare Workers (vinext, D1,
Drizzle, Better Auth, R2). It scaffolds apps, generates resources with an admin
dashboard and REST API, runs migrations and deploys.

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
