---
title: Where uploaded files go
description: Pick a storage provider when you scaffold an app, and find the credentials each one needs.
---

A `file` field needs somewhere to put the bytes. Flare ships four drivers and
`flare create` asks which one you want:

```bash
npx flare create shop --storage cloudinary
```

or answer the question it asks when you leave the flag off. Whatever you pick is
written into the app's env file as `STORAGE_DRIVER`, with the variables it needs
and a link to where they live.

| Provider | Needs an account | Free tier | Best for |
| --- | --- | --- | --- |
| [Cloudflare R2](/storage/r2/) *(default)* | Yes, with a card on file | 10 GB, **no egress charge** | Almost everything. The default for a reason |
| [Local disk](/storage/disk/) | No | — | Developing without Docker; one server you own |
| [Cloudinary](/storage/cloudinary/) | Yes | 25 GB + transformations | Images that need resizing, cropping, format conversion |
| [UploadThing](/storage/uploadthing/) | Yes | 2 GB | Getting started fastest; no bucket to configure |

## Changing your mind

One line in `.env` (Next.js) or `.dev.vars` (Cloudflare):

```ini
STORAGE_DRIVER=cloudinary
```

plus that provider's variables. Nothing else in the app changes — the `file`
field, the drop zone, the size cap, the type check and `createUploadUrl` are
identical whichever driver is underneath. Files already uploaded stay where they
are, so a switch is not a migration; it decides where the *next* upload goes.

## Which ones make files public

With **R2** and **disk**, a read URL is a short-lived signed token that
`app/api/storage/route.ts` redeems, so whoever issued it decided the viewer was
allowed it.

**Cloudinary** and **UploadThing** are content delivery networks. Serving
through your app would throw away the thing you are paying them for, so they
hand back **their own URL, which anyone with the link can read and which does
not expire**. That is the normal way to use them, and the wrong way to store a
passport scan.

```ini
STORAGE_PUBLIC=false
```

makes every read signed and proxied by your app instead, and they become
ordinary private storage with a good pipeline attached.

## How the drivers work

Each is an ordinary file in `lib/storage/` in your repository. A driver answers
three questions — store these bytes, give them back, throw them away — and
`lib/storage.ts` is the only place that knows which one is in use. See
[file uploads](/guides/file-uploads/#where-the-bytes-go) for the field itself and
[writing another one](/guides/file-uploads/#writing-another-one) to add your own.
