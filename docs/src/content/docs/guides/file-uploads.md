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

The form gets a drop zone. The bytes go to R2. The column holds a key.

## What a file field stores

**Not the file.** The column is text holding an object key:

```
products/image/2026/09/d0b8f166-add4-4fd6-9a55-b031135a4020-red-square.png
└─ table  └─ field  └─ date    └─ uuid                     └─ the name given
```

The bytes live in an R2 bucket. Objects are private, so there is no URL to put
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

## Setting up storage

Four variables, in `.env` or `.dev.vars`:

```ini
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=myapp
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
```

On the Cloudflare stack a bucket binding is created for you and these are only
needed if you reach R2 from outside a Worker.

Without them the field still renders and the upload fails — which is the
correct order of events, but worth knowing before you wonder why.

### Locally, without an R2 account

R2 speaks S3, and so does MinIO, so a container is enough to develop against:

```bash
docker run -d --name minio -p 9010:9000 -p 9011:9001 \
  -e MINIO_ROOT_USER=flare -e MINIO_ROOT_PASSWORD=flare-secret-123 \
  minio/minio server /data --console-address ":9001"
```

```ini
R2_ENDPOINT=http://127.0.0.1:9010
R2_BUCKET=myapp
R2_ACCESS_KEY_ID=flare
R2_SECRET_ACCESS_KEY=flare-secret-123
```

Create the bucket, and the console on `:9011` shows what was uploaded.

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
