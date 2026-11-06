---
title: UploadThing
description: A CDN with an uploader. Create the app, find the token and app id, and install the one package it needs.
---

File hosting with no bucket to configure — you make an app in their dashboard
and get a token. The quickest of the four to get working, and the smallest free
tier.

```bash
npx flare create shop --storage uploadthing
```

## It needs one package

```bash
pnpm add uploadthing
```

The only driver with a dependency. Flare does not install it for you, because an
app that picked a different driver should not carry it.

## Getting the two values

1. **Sign up at [uploadthing.com](https://uploadthing.com)** with GitHub or
   Google. The free tier is 2 GB; no card.
2. **Create an app** in the dashboard. The name is yours; it becomes part of the
   delivery domain.
3. **Your app → API Keys.** Both values are on that one page.

| Flare needs | Where it comes from | Secret? |
| --- | --- | --- |
| `UPLOADTHING_TOKEN` | Your app → API Keys | **Yes** |
| `UPLOADTHING_APP_ID` | The same page (also in your delivery URLs) | No |

[uploadthing.com/dashboard](https://uploadthing.com/dashboard) goes there.

:::note[The token is the newer kind]
UploadThing used to issue `UPLOADTHING_SECRET` (a `sk_live_…` string). The
current dashboard gives a single `UPLOADTHING_TOKEN`, which is what Flare wants.
If your dashboard still shows a secret, the token is on the same page under the
v7 heading.
:::

## Putting them in

Locally, in `.env` (Next.js) or `.dev.vars` (Cloudflare) — both git-ignored:

```ini
STORAGE_DRIVER=uploadthing
UPLOADTHING_TOKEN=…
UPLOADTHING_APP_ID=a1b2c3d4e5
```

For production on **Vercel**: Project → Settings → Environment Variables, then
redeploy. On **Cloudflare**:

```bash
npx wrangler secret put UPLOADTHING_TOKEN
```

## Delivery URLs are public and permanent

Files are served from `<app-id>.ufs.sh`, and anyone with the link can read them
for as long as they exist. That is the normal way to use a CDN, and the wrong way
to store a medical record. To keep reads private:

```ini
STORAGE_PUBLIC=false
```

Every read then goes through a signed, expiring URL your app redeems.

## How Flare uses it

Worth knowing, because it explains a column you will see in their dashboard.
UploadThing mints *its own* file key on upload, while a Flare driver is asked to
store bytes under a key it was **given**. The two are reconciled with
`customId`, which UploadThing accepts at upload, addresses in a delivery URL and
filters by on delete.

So your key stays your key, nothing has to be stored to map between them, and
the `customId` column in their dashboard is the path your app chose. Read it at
`lib/storage/uploadthing.ts`.

## Further reading

[A beginner's guide to file uploads in Next.js](https://jb.desishub.com/blog/beginners-to-file-upload)
covers UploadThing's dashboard and setup in full.

:::note[It uses their SDK end to end]
That guide builds an UploadThing file router, a route handler and their React
components. Flare uses the package only to talk to the API —
`lib/storage/uploadthing.ts` is the upload route, and a `file` field is the
component. Read it for the account setup; you do not need the file router.
:::
