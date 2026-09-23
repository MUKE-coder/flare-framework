---
title: "Tutorial: a drive"
description: Folders inside folders, files dropped in by the pile, and a delete that takes a folder's contents with it.
---

A place to keep files: folders nested as deep as you like, a dropzone that
takes a whole pile at once with a progress bar each, download, rename, and a
delete that doesn't leave a folder's contents scattered at the root.

Two things carry it:

- **A folder points at its parent.** One table, one self-referencing
  relation, and the tree comes out of it — including the breadcrumb.
- **Bytes never pass through the app.** The browser gets a signed URL and
  PUTs straight to R2, so a hundred-megabyte file costs the Worker nothing.

The finished app is `examples/drive` in the framework repo. Expect about an
hour. Do the [quickstart](/start/quickstart/) first.

## 1. Create the app

```bash
npm create flare-framework@latest drive
cd drive
```

## 2. A folder that points at a folder

```bash
npx flare gen resource Folder --icon folder \
  --fields 'name:string, parent:belongsTo(Folder)?'
```

A `belongsTo` to the resource being defined is allowed, and it's the whole
tree: `parent_id` is nullable, so a row with no parent is at the root, and
`on delete set null` means removing a folder can't leave a row pointing at
something that isn't there.

Look at the migration it wrote — the foreign key goes back to the same
table, and `parent_id` is indexed, which is what makes "what's in this
folder" one fast query however many folders there are:

```sql
FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
CREATE INDEX `folders_parent_id_idx` ON `folders` (`parent_id`);
```

## 3. A file that can be anything

```bash
npx flare gen resource File --icon file \
  --fields 'name:string, folder:belongsTo(Folder)?, content:file:[any]:100mb, size:int, contentType:string?'
```

Two parts of `content:file:[any]:100mb` are worth stopping on.

`[any]` is the one file category that checks nothing beyond the size. Every
other category — `image`, `pdf`, `archive` — restricts what can be uploaded
and verifies the file's leading bytes really are that type. A drive can't do
that, because a drive holds whatever someone has. Don't reach for `any` out
of convenience; reach for it when the point is that anything goes.

`:100mb` is the upload limit. Without it a file field allows 10 MB, which
makes a drive a toy. 100 MB is the ceiling, because an upload streams
through the Worker and that's what one request will carry.

`size` and `contentType` are ordinary columns. The file field itself stores
only the object key; a drive wants to show "2.4 MB" and pick an icon without
fetching anything, so it keeps those as its own fields and fills them in at
upload.

```bash
npx flare migrate
npx flare dev
```

## 4. Reading the tree

`lib/drive.ts` holds the queries. The interesting one is the breadcrumb,
which walks up the parents:

```ts
/** How deep the tree is allowed to be, so a cycle can't walk forever. */
const MAX_DEPTH = 64;

export async function trail(id: string | null): Promise<DriveFolder[]> {
  const path: DriveFolder[] = [];
  const seen = new Set<string>();
  let current = id;
  while (current && path.length < MAX_DEPTH && !seen.has(current)) {
    seen.add(current);
    const folder = await getFolder(current);
    if (!folder) break;
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}
```

The depth cap and the `seen` set are not paranoia about your own UI — they're
there because a loop in the data (a bad import, a hand-written UPDATE) would
otherwise hang the page rather than render a wrong breadcrumb.

Listing a folder's contents is `where parent_id = ?`, or `is null` at the
root:

```ts
export async function childFolders(parentId: string | null): Promise<DriveFolder[]> {
  return getDb()
    .select()
    .from(folders)
    .where(parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId))
    .orderBy(asc(folders.name));
}
```

:::caution[Keep pure helpers out of this file]
`formatBytes` belongs in its own module, not next to these queries. The
uploader is a client component, and importing anything from a file that also
imports `@/db` drags `cloudflare:workers` into the browser bundle, where it
can't go — you get a 500 and `Failed to resolve import "cloudflare:workers"`.
One small `lib/bytes.ts` avoids it.
:::

## 5. Uploading a pile of files

The dropzone already takes `multiple`. What's new is the queue.

Each file is three steps: ask the server to sign an upload, PUT the bytes
straight to storage, then save the record.

```tsx
const contentType = file.type || "application/octet-stream";
const signed = await createUploadUrlAction("File", "content", { name: file.name, type: contentType, size: file.size });
if (!signed.ok) throw new Error(signed.error);

await put(signed.data.url, file, (loaded) => update(job.id, { loaded }), signal);

const saved = await saveFileAction({ name: file.name, folderId, content: signed.data.key, size: file.size, contentType });
if (!saved.ok) throw new Error(saved.error);
```

`createUploadUrlAction` is generated — it's the same action the dashboard's
own file widget uses, so the permission check, the accepted types and the
size limit are already enforced there. Anything you check in the browser is
for a quick failure, not for safety.

The `|| "application/octet-stream"` matters more than it looks. A browser
leaves `file.type` empty for an extension it doesn't recognise, and an upload
that says nothing about what it is gets refused at signing.

Three files go at once:

```tsx
/** How many files go up at once. More than this and each one just gets slower. */
const AT_ONCE = 3;

function next() {
  while (running.current < AT_ONCE && queue.current.length > 0) {
    const item = queue.current.shift()!;
    void run(item.job, item.file);
  }
}
```

A browser opening thirty connections doesn't finish sooner; it makes every
bar crawl and the estimates meaningless.

Progress needs `XMLHttpRequest` — `fetch` still can't report upload progress
— so the PUT is a small wrapper around `request.upload.onprogress`. Copy
[`components/drive/uploader.tsx`](https://github.com/MUKE-coder/flare-framework/blob/main/examples/drive/components/drive/uploader.tsx)
from the repo.

## 6. Deleting a folder properly

This is the one place where the obvious thing is wrong. `Folder.parent` is
optional, so the foreign key is `on delete set null` — delete a folder and
its children don't disappear, they *move to the root*. A drive where deleting
"2024" scatters two hundred files across the top level is a drive no one will
trust.

So the delete collects the subtree first:

```ts
export async function deleteFolderAction(id: string, parentId: string | null) {
  const ids = await subtree(id);
  const doomed = await getDb().select({ id: files.id, content: files.content }).from(files).where(inArray(files.folderId, ids));

  const fileStore = dashboardStore("File");
  for (const file of doomed) {
    const result = await fileStore.delete(file.id);
    if (!result.ok) return result;
    if (file.content) await storage.delete(file.content).catch(() => undefined);
  }

  const folderStore = dashboardStore("Folder");
  for (const folderId of [...ids].reverse()) {
    const result = await folderStore.delete(folderId);
    if (!result.ok) return result;
  }

  revalidatePath(drivePath(parentId));
  return { ok: true, data: { folders: ids.length, files: doomed.length } };
}
```

Files first, then folders deepest-first, and each one through the store so
its policy and its cache invalidation still run. Tell the person what
happened — "Deleted 2024 and 37 file(s) inside it" — because a delete that
took more than the thing they clicked should say so.

## 7. Downloading

One generated action does it:

```tsx
const result = await createReadUrlAction("File", "content", content, name);
if (!result.ok) {
  toast.error(result.error);
  return;
}
window.location.href = result.data.url;
```

The fourth argument is the name to save it under. Object keys carry an id so
they can't collide, so without it the file arrives called
`3f1c…-invoice.pdf`. The URL is signed and short-lived, and the object itself
is never public.

## 8. The pages

Two routes over one view, because the root is just a folder that isn't one:

```tsx
// app/dashboard/drive/page.tsx
export default async function DrivePage() {
  await requireDashboard("/dashboard/drive");
  return <FolderView folder={null} />;
}

// app/dashboard/drive/[id]/page.tsx
export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireDashboard(`/dashboard/drive/${id}`);
  const folder = await getFolder(id);
  if (!folder) notFound();
  return <FolderView folder={folder} />;
}
```

And a sidebar link, in `lib/dashboard-nav.ts` outside the generated block:

```ts
export const dashboardLinks: DashboardLink[] = [
  { label: "Drive", href: "/dashboard/drive", icon: "hard-drive" },
  ...generatedDashboardLinks,
  { label: "API reference", href: "/api/reference", icon: "book" },
];
```

The generated **Files** and **Folders** pages stay in the sidebar too. That's
worth keeping: the custom view is how people use the drive, and the generated
tables are how you go and look at what's actually in it — with search,
filters, export and the record detail page you didn't write.

## 9. Try it

At `/dashboard/drive`: make a folder, open it, drag in several files at once
and watch them go up three at a time. Download one and check it arrives under
its own name. Then delete the folder and confirm the count in the toast
matches what was inside.

## 10. Deploy

```bash
npx flare deploy
npx flare user:role you@example.com admin --remote
```

Files go to the R2 bucket the app was scaffolded with, so there's nothing to
push up — unlike rows, the objects are only ever where they were uploaded.

## What to do next

- **Move things.** A `beforeUpdate` hook on `Folder` that refuses a parent
  from inside its own subtree, and the breadcrumb's depth cap stops mattering.
- **Sharing.** `createReadUrl` takes an `expiresIn`; a "copy link" action that
  signs a week-long URL is a few lines.
- **Per-person drives.** Add `owner:belongsTo(User)` and a policy, and the
  generated API filters to the signed-in person on its own.
- **Thumbnails.** `contentType` is already stored; for `image/*`, sign a read
  URL and show it on the card.
