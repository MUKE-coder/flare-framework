# @flaredev/core

The runtime for [Flare](https://flare-docs.codetotech.com) apps: resource
descriptors and the field grammar, the resource store and validators, policies,
auth, mail and storage helpers, realtime (Durable Objects), billing rules and
the security layer.

Apps created with [`@flaredev/cli`](https://www.npmjs.com/package/@flaredev/cli)
depend on this package already. You rarely add it by hand:

```sh
npm create flare-framework@latest my-app
```

Entry points: `@flaredev/core`, `/server`, `/client`, `/react`, `/realtime`,
`/realtime/server`, `/security`, `/security/server`.

Requires Node.js 22 or later.
