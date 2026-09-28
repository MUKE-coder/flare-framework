<p align="center">
  <img src="https://flare-docs.codetotech.com/banner.png" alt="Flare — the full-stack framework for Cloudflare and Next.js" width="100%">
</p>

# @flaredev/core

The runtime for [Flare](https://flare-docs.codetotech.com) apps: resource
descriptors and the field grammar, the resource store and validators, policies,
auth, mail and storage helpers, realtime (Durable Objects), billing rules and
the security layer. The resource store runs over Drizzle or Prisma, which is
what lets one descriptor serve both the Cloudflare and Next.js stacks.

Apps created with [`@flaredev/cli`](https://www.npmjs.com/package/@flaredev/cli)
depend on this package already. You rarely add it by hand:

```sh
npm create flare-framework@latest my-app
```

Entry points: `@flaredev/core`, `/server`, `/client`, `/react`, `/realtime`,
`/realtime/server`, `/security`, `/security/server`.

Requires Node.js 22 or later.
