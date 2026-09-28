# create-flare-framework

Start a new [Flare](https://flare-docs.codetotech.com) app, a batteries-included
fullstack framework. It asks where the app will run: **Cloudflare Workers**
(vinext, D1, Drizzle) or **Next.js on Vercel** (Postgres, Prisma). The
descriptors, generated code and admin dashboard are the same either way.

```sh
pnpm create flare-framework my-app
# or
npm create flare-framework@latest my-app
yarn create flare-framework my-app
bun create flare-framework my-app
```

A Flare app is around 340 packages. pnpm installs them in seconds where npm
takes minutes, so dependencies are installed with pnpm whenever it's on your
machine — whichever command you started with. Pass `--pm npm` to override.

Pass `-- --stack next` to skip the question.

This runs `flare create` from [`@flaredev/cli`](https://www.npmjs.com/package/@flaredev/cli),
so every `flare create` flag works:

```sh
npm create flare-framework@latest my-app -- --auth-providers google,github
```

Requires Node.js 22 or later.
