---
title: Sharing your local app
description: "A public HTTPS URL for your local server with one flag, through Cloudflare Quick Tunnels. No account, DNS or open ports."
---

Add `--tunnel` to put the app you're running locally on a public, encrypted
URL:

```sh
npx flare dev --tunnel      # the dev server, with hot reload
npx flare start --tunnel    # the production build in workerd
```

```
  Public URL  https://chair-oclc-diff-discusses.trycloudflare.com
  Forwarding  http://localhost:3000
```

This uses [Cloudflare Quick Tunnels](https://try.cloudflare.com). There's no
Cloudflare account to set up, no DNS records and no firewall ports to open. The
URL changes each time you start the command, and the tunnel closes when you
stop the server with Ctrl+C.

Use it to:

- show work in progress to a client or teammate;
- try the app on your phone;
- receive webhooks locally. Point Stripe or GitHub at
  `https://<tunnel>/api/webhooks/...`.
- test OAuth sign-in with a provider that won't redirect to `localhost`.

## Share anything

`flare tunnel` shares any local port or URL, Flare app or not:

```sh
npx flare tunnel            # http://localhost:3000
npx flare tunnel 8787
npx flare tunnel http://localhost:5173
```

## How it works

- **The `cloudflared` binary.** Flare uses `cloudflared` if it's on your PATH.
  Otherwise it downloads Cloudflare's official release once, from
  `github.com/cloudflare/cloudflared`, into `~/.flare/bin`.
- **`flare dev --tunnel`** waits for the dev server to print its address, then
  opens the tunnel to it. Apps allow `*.trycloudflare.com` in
  `server.allowedHosts` (`vite.config.ts`), so Vite accepts the public
  hostname. Hot reload keeps working over the tunnel.
- **`flare start --tunnel`** opens the tunnel first, then starts
  `wrangler dev` with `--local-upstream <tunnel host> --upstream-protocol https`.
  That way the Worker sees the public origin, and sign-in works over the
  tunnel. While it runs, sign in through the public URL rather than
  `localhost`.
- **Auth.** Apps list `*.trycloudflare.com` in Better Auth's allowed hosts
  (`lib/auth.ts`). This is safe in production: Cloudflare only routes hostnames
  a Worker actually serves, so a deployed app never receives a
  `trycloudflare.com` host.

## Before you share

Anyone with the link can reach your local server while it runs:

- It uses your local database and your `.dev.vars` secrets.
- `flare dev` serves the Vite dev server, which exposes your source code.
  Prefer `flare start --tunnel` when the audience is outside your team.
- The security layer sees real visitor IPs through the tunnel, so bans and
  rate limits apply as they would in production.

Quick tunnels are for development and demos. They have no uptime guarantee,
and Cloudflare limits them to 200 concurrent requests. For anything permanent,
`flare deploy`.
