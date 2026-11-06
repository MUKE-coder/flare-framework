---
title: Cloudinary
description: A CDN with an image pipeline. Create the account and find the cloud name, API key and secret Flare needs.
---

A content delivery network with image and video transformation built in:
resizing, cropping, format conversion and compression, applied by changing the
URL. Pick it when the images matter more than the storage.

```bash
npx flare create shop --storage cloudinary
```

## Getting the three values

1. **Sign up at [cloudinary.com](https://cloudinary.com/users/register_free)**.
   The free tier is 25 GB of storage and 25 GB of delivery a month, and needs no
   card.
2. **The dashboard shows your cloud name** at the top left, under the account
   name. It is a short slug like `dxy3kf9qa` — part of every delivery URL, so it
   is not a secret.
3. **Settings → API Keys** for the other two. Click the eye to reveal the
   secret, or **Generate new API key** if you would rather this app had its own.

| Flare needs | Where it comes from | Secret? |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Dashboard, top left | No — it is in every URL |
| `CLOUDINARY_API_KEY` | Settings → API Keys | No |
| `CLOUDINARY_API_SECRET` | Settings → API Keys (click to reveal) | **Yes** |

[console.cloudinary.com/settings/api-keys](https://console.cloudinary.com/settings/api-keys)
goes straight there.

## Putting them in

Locally, in `.env` (Next.js) or `.dev.vars` (Cloudflare) — both git-ignored:

```ini
STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=dxy3kf9qa
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=…
```

For production on **Vercel**: Project → Settings → Environment Variables, then
redeploy. On **Cloudflare**:

```bash
npx wrangler secret put CLOUDINARY_API_SECRET
```

Put the cloud name and API key in `wrangler.jsonc` vars if you prefer — neither
is secret — but the API secret must be a secret.

## No upload preset to configure

Some Cloudinary guides have you create an *unsigned upload preset* so a browser
can upload directly. Flare does not need one: the driver signs each upload
itself — a sorted query string and a SHA-1 — and posts the file from your
server. Nothing is configured in the Cloudinary dashboard beyond having the
account.

## Two things worth knowing

**Delivery URLs are public and permanent.** Cloudinary serves files from
`res.cloudinary.com`, and anyone with the link can read them for as long as they
exist. That is what you are paying for, and it is the wrong way to store a
passport scan. To keep reads private:

```ini
STORAGE_PUBLIC=false
```

Every read then goes through a signed, expiring URL that your app redeems, and
you keep the upload pipeline without the public delivery.

**Re-uploading the same key replaces the asset** and invalidates the CDN copy,
rather than leaving stale bytes cached at the edge under a URL you have already
handed out.

## How Flare uses it

The driver files an asset under `image`, `video` or `raw`, decided by the key's
extension, in both directions — so an upload and the read that follows always
agree about where it went. No SDK: it is `fetch` and Web Crypto, which is why
the same file runs on Workers and on Node. Read it at
`lib/storage/cloudinary.ts` in your app.

## Further reading

[A beginner's guide to file uploads in Next.js](https://jb.desishub.com/blog/beginners-to-file-upload)
covers Cloudinary alongside UploadThing and EdgeStore, with the dashboard steps
and working components.

:::note[It wires Cloudinary up by hand]
That guide uses the `next-cloudinary` package and its own upload route. Flare
has neither — `lib/storage/cloudinary.ts` is already the upload route, and a
`file` field is already the component. Read it for the account setup; ignore the
plumbing.
:::
