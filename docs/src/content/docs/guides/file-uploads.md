---
title: File uploads
description: Images, PDFs, spreadsheets, archives and anything else — how to declare each, what the form does, and where the bytes go.
---

A file field is one line:

```ts
image: field.file({ accept: ["image"], maxBytes: 5 * 1024 * 1024, required: false }),
```

or on the command line:

```bash
--fields 'image:file:[image]:5mb?'
```

The form gets a drop zone. The bytes go to your storage driver. The column
holds a key.

## What a file field stores

**Not the file.** The column is text holding an object key:

```
products/image/2026/09/d0b8f166-add4-4fd6-9a55-b031135a4020-red-square.png
└─ table  └─ field  └─ date    └─ uuid                     └─ the name given
```

The bytes live in whichever store you configured. Objects are private by
default, so there is no URL to put
in an `<img>` — one is signed on demand and expires. That is why a thumbnail
does a short round trip instead of rendering straight from the column.

The key's prefix is `<table>/<field>/`, and the validator enforces it. A
request cannot attach an object that was uploaded for a different field:

```json
{ "error": "Validation failed.",
  "issues": [{ "path": "image", "message": "This file wasn't uploaded for this field" }] }
```

## The categories

`accept` takes one or more of these. Each is a set of MIME types.

| Category | Accepts | Typical use |
| --- | --- | --- |
| `image` | PNG, JPEG, GIF, WebP, AVIF | Avatars, product photos, covers |
| `pdf` | PDF | Invoices, contracts, reports |
| `document` | DOC, DOCX, ODT | Uploaded paperwork |
| `spreadsheet` | XLS, XLSX, ODS | Imports, price lists |
| `csv` | CSV | Data imports |
| `text` | Plain text | Logs, notes |
| `video` | Any `video/*` | Clips, recordings |
| `audio` | Any `audio/*` | Voice notes, podcasts |
| `archive` | ZIP, GZIP, 7z, RAR | Bundles, backups, downloads you sell |
| `any` | Anything | A drive, an attachment box |

:::note
`archive` lists the aliases as well as the canonical types. Windows sends
`application/x-zip-compressed` for a `.zip`, and a field that refused an
ordinary zip would be no use.
:::

## Examples

### A product photo

```bash
--fields 'image:file:[image]:5mb?'
```

An image gets a thumbnail in the form, in the table and on the record page.
Anything else shows its filename.

### An avatar, small on purpose

```ts
avatar: field.file({ accept: ["image"], maxBytes: 512 * 1024, required: false,
                     helpText: "A square picture works best. Up to 512 KB." }),
```

### A signed contract

```bash
--fields 'contract:file:[pdf]:20mb?'
```

### Paperwork, in whatever form it arrives

```bash
--fields 'attachment:file:[pdf,document,image]:25mb?'
```

Several categories, so a scan, a Word file or a PDF all pass.

### A price list to import

```bash
--fields 'priceList:file:[spreadsheet,csv]:10mb?'
```

Storing the upload is separate from reading it. To parse it, add an endpoint:

```bash
npx flare gen endpoint Import process --method POST --record
```

### A digital product people buy

```bash
--fields 'download:file:[archive,pdf]:2gb?'
```

Downloads are the case where R2 pays for itself: it charges nothing for
bandwidth out, which on a file-heavy product is usually the largest line on
the bill.

### A voice note

```bash
--fields 'recording:file:[audio]:25mb?'
```

### A drive: anything at all

```ts
file: field.file({ accept: ["any"], maxBytes: 100 * 1024 * 1024 }),
```

`any` checks nothing but the size. Reach for it when the app really is a
drive — not to save writing a list.

## Sizes

```bash
--fields 'photo:file:[image]:5mb?'     # 5mb, 500kb, 2gb
```

```ts
field.file({ accept: ["image"], maxBytes: 5 * 1024 * 1024 })
```

The limit is enforced **twice**: the browser refuses the file, and the server
refuses to sign an upload URL for it. A check only the browser does is not a
check.

Sensible ceilings: an avatar 512 KB, a photo 5 MB, a PDF 20 MB, a video or a
download much larger. Cloudflare Workers can stream large bodies, but a 2 GB
upload over a phone connection is a poor experience whatever the platform
allows.

## What the form does

1. You drop a file (or click to choose one).
2. The browser checks the type and size against the field.
3. It asks the server for a signed upload URL, which checks them **again** and
   mints a key under `<table>/<field>/`.
4. The bytes go straight to storage, with a progress bar.
5. The key goes into the form. Nothing is saved to the record until you save.

An image shows a preview immediately — from the local file while uploading,
then from a signed URL.

## Where the bytes go

`STORAGE_DRIVER` picks where they go. The default needs nothing set: on
Cloudflare it is the R2 bucket your app is already bound to, and on Next.js it
is whatever `docker compose up` or your `R2_*` variables point at.

| `STORAGE_DRIVER` | What it is | Needs | Stack |
| --- | --- | --- | --- |
| `r2` *(default)* | The bound bucket on Cloudflare. On Next.js, anything S3-compatible: R2, MinIO, B2, S3 | nothing on Cloudflare; four `R2_*` variables on Next.js | both |
| `disk` | The local filesystem, like Laravel's `local` disk | nothing | Next.js |
| `cloudinary` | A CDN with an image pipeline | three `CLOUDINARY_*` variables | both |
| `uploadthing` | A CDN with an uploader | a token, an app id, and `pnpm add uploadthing` | both |

`disk` is the one exception: a Worker has no filesystem to write to, and the
bound bucket already covers what it is for.

On Cloudflare these are secrets, so set them with
`wrangler secret put CLOUDINARY_API_SECRET` rather than in `wrangler.jsonc`.

Each one is an ordinary file in `lib/storage/` in your repository. A driver
answers three questions — store these bytes, give them back, throw them away —
and everything above it is identical whichever you pick: the `file` field, the
drop zone, the size cap, the type check, `createUploadUrl` and
`createReadUrl`.

:::danger[Two of them make files public]
With `r2` and `disk`, a read URL is a short-lived signed token redeemed by
`app/api/storage/route.ts`, so whoever issued it decided the viewer was
allowed it.

`cloudinary` and `uploadthing` are content delivery networks. Serving through
your app would throw away the thing you are paying them for, so they hand back
**their own URL, which anyone with the link can read, and which does not
expire**. That is the normal way to use them, and the wrong way to store a
passport scan.

Set `STORAGE_PUBLIC=false` to keep every read signed and proxied, and they
become ordinary private storage with a good pipeline attached.
:::

### r2 — the default

On **Cloudflare**, nothing to do: the app is bound to a `STORAGE` bucket that
Wrangler provisions on first deploy and simulates locally as a directory.

On **Next.js**, four variables, and they work against any S3:

```ini
STORAGE_DRIVER=r2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=myapp
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
```

Locally, `docker compose up -d` in a new app gives you MinIO on
`127.0.0.1:9000` already pointed at by `.env`, and its console on `:9001`
shows what was uploaded. MinIO speaks S3, so this is the same code path you
deploy.

### disk — no account, no network

Next.js only.

```ini
STORAGE_DRIVER=disk
# STORAGE_DIR=storage/app      # the default
```

Files land under `storage/app/objects/`, with the content type recorded
beside them in `storage/app/meta/` — so a file called `IMG_0421` with no
extension still comes back as an image rather than a download.

Good for developing without Docker, and for a single server where a volume is
simpler than a bucket. Not for anything that scales horizontally: two
instances do not share a filesystem, and the second one serves 404s for
everything the first one wrote. Add `storage/` to `.gitignore`.

### cloudinary

```ini
STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=…
CLOUDINARY_API_KEY=…
CLOUDINARY_API_SECRET=…
```

No SDK — the driver signs the upload itself, which is a sorted query string
and a SHA-1, and posts the file. Cloudinary files an asset under `image`,
`video` or `raw`, and the key's extension decides which, in both directions,
so an upload and the read that follows it always agree.

Re-uploading the same key replaces the asset and invalidates the CDN copy,
rather than leaving the old bytes cached at the edge under a URL you have
already handed out.

### uploadthing

```bash
pnpm add uploadthing
```

```ini
STORAGE_DRIVER=uploadthing
UPLOADTHING_TOKEN=…
UPLOADTHING_APP_ID=…
```

UploadThing mints its own file key on upload, and a driver is asked to store
bytes under a key it was *given*. The two are reconciled with `customId`,
which UploadThing accepts at upload, addresses in a delivery URL, and filters
by on delete — so your key stays your key and nothing has to be stored to map
between them.

### Writing another one

A driver is a `StorageBucket`: `get`, `put`, `delete`, and optionally
`publicUrl`. `lib/storage/cloudinary.ts` is a good one to copy — it is a CDN
driver written with nothing but `fetch` and Web Crypto, so it runs unchanged
on both stacks. Add it to the `switch` in `lib/storage.ts`, which is the only
place that knows which driver is in use.

A driver that needs Node — `disk` does — belongs in a Next.js app only.

## Reading a file back in your own code

```ts
import { storage } from "@/lib/storage";

const url = await storage.createReadUrl({ key: product.image });          // expires
const download = await storage.createReadUrl({ key, downloadAs: "invoice.pdf" });
```

`downloadAs` sets the filename the browser saves it under.

## Deleting

Removing a record does **not** remove its objects. That is deliberate: a
delete you can undo is worth more than a few kilobytes, and an object with no
row costs almost nothing.

To clean up, do it in a hook, where every path through the app runs it:

```ts title="resources/product.resource.ts"
hooks: {
  afterDelete: async ({ row }) => {
    if (row.image) await storage.bucket.delete(String(row.image));
  },
},
```

## Several files on one record

A file field holds one key. For many, make the files a resource:

```bash
npx flare gen resource Attachment \
  --fields 'file:file:[any]:50mb, caption:string?, post:belongsTo(Post)'
```

Then `attachments: field.hasMany("Attachment")` on `Post` gives its record
page a table of them. [Relationships](/guides/relationships/) covers the
pattern; the [drive tutorial](/tutorials/drive/) builds it with multi-file
upload.
