---
title: Local disk
description: Files on the filesystem, like Laravel's local disk. No account, no network, nothing to configure.
---

Files on the machine the app is running on, the way Laravel's `local` disk
works. **Next.js only** — a Worker has no filesystem to write to.

```bash
npx flare create shop --storage disk
```

## There is nothing to get

No account, no card, no credentials. That is the whole appeal:

```ini
STORAGE_DRIVER=disk
# STORAGE_DIR=storage/app      # the default
```

| Flare needs | Where it comes from |
| --- | --- |
| `STORAGE_DIR` | You choose it. Defaults to `storage/app`, relative to the app |

## Where the files land

```
storage/app/
├─ objects/        ← the bytes, under the key the app chose
└─ meta/           ← one small file per object, holding its content type
```

The sidecar in `meta/` is why a file called `IMG_0421` with no extension still
comes back as an image rather than a download — the type is recorded at upload
instead of guessed at read.

**Add it to `.gitignore`:**

```
storage/
```

A new app from `flare create --storage disk` already has that line. If you
switched to `disk` later, add it yourself — the first thing somebody uploads
should not end up in a commit.

## Two places it does not belong

**Anything that scales horizontally.** Two instances do not share a filesystem,
so the second one serves 404s for everything the first one wrote. There is no
warning for this at runtime; it just looks like files going missing at random.

**Anything serverless** — Vercel, Lambda, Workers — where the filesystem is
read-only and whatever you do write does not outlive the request. Deployed to
Vercel, this driver raises an error saying so, rather than failing an upload for
no stated reason.

## Where it does

**Developing without Docker.** The default `r2` driver points at MinIO from the
compose file; `disk` needs neither.

**One server you own.** A VPS or a single container, where a mounted volume is
simpler than a bucket and you would rather not add a third party. Back the volume
up, because nothing else is holding those files.

## Reads stay private

A read URL is a short-lived signed token that `app/api/storage/route.ts`
redeems, so whoever issued it decided the viewer was allowed it. The files are
never served straight off the filesystem, which is also why nothing under
`storage/` needs to be inside `public/`.

## Moving off it later

One line, plus that provider's credentials:

```ini
STORAGE_DRIVER=r2
```

Files already on disk stay on disk — switching decides where the *next* upload
goes, not where the old ones live. To move them, copy `storage/app/objects/` into
the new bucket under the same keys and the existing records keep resolving.
