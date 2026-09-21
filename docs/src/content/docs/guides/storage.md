---
title: File storage (R2)
description: Signed uploads and reads, content sniffing, and per-field scoping.
---

Every app gets a `STORAGE` R2 binding (`bucket_name: <app>-storage`).
`lib/storage.ts` wraps `createStorage()` from `@flaredev/core`, and
`app/api/storage/route.ts` redeems the signed URLs it issues.

## Flare-signed, not S3-presigned

R2 bindings can't presign URLs the S3 way, and S3 presigning needs R2 API
tokens, bucket CORS, and doesn't work against the local simulator. Instead,
every URL Flare issues carries an **HMAC-SHA256 token** scoped to:

- one operation (`put` or `get`)
- one object key
- an expiry
- for uploads: the allowed content types (wildcards allowed, matching the
  `file:[image,pdf]` grammar) and a max size

The signing key is derived from `BETTER_AUTH_SECRET`. The trade-off:
uploaded bytes stream through the Worker, so uploads are capped by the
Workers request body limit. A direct-to-R2 presigned path can be added
later behind the same `createUploadUrl`/`createReadUrl` API without
changing how a resource declares a `file` field.

## Reads are sandboxed

Only known-safe types — raster images, PDF, text, audio/video — are served
inline. Everything else, **SVG included**, is sent as an attachment with a
`sandbox` CSP, so an upload can never become stored XSS on your app's own
origin.

## Uploads are checked by content, not just by label

The `Content-Type` header is whatever the sender's browser chose, so the
upload route reads the first 32 bytes of the body and compares them
against the declared type's real signature — PNG, JPEG, GIF, WebP, AVIF,
PDF, zip-based Office/OpenDocument, legacy Office, and common audio/video
containers; text is checked for control bytes. A mismatch is rejected with
`415`. A type with no known signature (a custom type you pass to
`createUploadUrl` yourself) is let through unchanged.

The body then streams to R2 through a `FixedLengthStream` — R2 only
accepts streams of known length, which also catches an upload that sends
fewer bytes than its declared `Content-Length` promised.

## A file field only stores keys issued for it

Uploads for field `contract` on table `deals` live under
`deals/contract/`. The resource's validators reject any other key with
*"This file wasn't uploaded for this field"* — otherwise anyone who can
edit a record could attach another resource's private file and read it
back through their own.

## Reading files back

`createReadUrlAction(resource, field, key)` in the admin only signs keys
under that field's prefix, and only for roles with read, create, or update
access to the resource (per your [policy](/guides/roles-and-policies/), if
one exists).

## The `<FileField>` widget

`components/admin/fields/file-field.tsx` checks type, size (10 MB default,
configurable via `maxBytes`), and content in the browser first, for
instant feedback — then the server repeats every check regardless. It
supports drag-and-drop, upload progress and cancel, and previews images
(a local preview while uploading, the stored image through a signed read
URL afterward). It's keyboard-operable and axe-clean (WCAG 2.2 AA) in both
themes.

## What's not handled yet

Replacing or removing a file, or deleting the record it belongs to, leaves
the old object in R2. Orphan cleanup is tracked, not built — see the
framework repo's `phases.md` Backlog.

## Declaring a file field

```ts
avatar: field.file(["image"], { required: false }),
contract: field.file(["pdf", "document"]),
```

See [field type grammar](/concepts/field-grammar/) for the full category
list.
