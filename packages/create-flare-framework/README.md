# create-flare-framework

Start a new [Flare](https://flare-docs.codetotech.com) app, a batteries-included
fullstack framework on Cloudflare Workers.

```sh
npm create flare-framework@latest my-app
# or
pnpm create flare-framework my-app
yarn create flare-framework my-app
bun create flare-framework my-app
```

This runs `flare create` from [`@flaredev/cli`](https://www.npmjs.com/package/@flaredev/cli),
so every `flare create` flag works:

```sh
npm create flare-framework@latest my-app -- --auth-providers google,github
```

Requires Node.js 22 or later.
