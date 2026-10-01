import "dotenv/config";
import { storedFields } from "@flaredev/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./lib/generated/prisma/client.js";
import { createResourceStore, prismaRows } from "./lib/resource";
import { toCsv } from "./lib/csv";
import { storage } from "./lib/storage";
import contactResource from "./resources/contact.resource";

/**
 * The two regressions HTTP cannot reach.
 *
 * Export is a server action, and an upload is only real once a byte is in the bucket —
 * which is exactly why both shipped broken (0.8.1 and 0.7.1) with every HTTP check
 * passing.
 */
const ORIGIN = process.env.FLARE_ORIGIN ?? "http://127.0.0.1:3000";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS " : "FAIL "} ${name}${ok || !detail ? "" : ` — ${detail.slice(0, 200)}`}`);
  if (!ok) failures += 1;
};

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const store = createResourceStore({ resource: contactResource, rows: prismaRows(prisma.contact, prisma) });

// 0.8.1 — the export asked for a bigger page than the cap allowed and failed every time.
const listed = await store.list(new URLSearchParams({ page: "1", perPage: "500" }), { maxPerPage: 500 });
check("export paging is allowed its bigger page", listed.ok, listed.ok ? "" : listed.error);

if (listed.ok) {
  const fields = storedFields(contactResource).filter(([, def]) => def.kind !== "file");
  const csv = toCsv(listed.data.data, [{ key: "id", label: "Id" }, ...fields.map(([key, def]) => ({ key, label: def.label }))]);
  const lines = csv.trim().split("\n");
  // Generic on purpose: this script runs against whatever resource CI generated.
  check("the export produces a CSV with a header and rows", lines.length > 1 && lines[0]!.startsWith("Id,"), lines[0] ?? "");
}

// 0.7.1 — the upload returned 201 and stored nothing.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const key = `contacts/avatar/2026/01/${crypto.randomUUID()}-ci.png`;
const upload = await storage.createUploadUrl({ key, contentTypes: ["image/png"], maxBytes: 5 * 1024 * 1024 });
// The signed URL is relative to the app; new URL() leaves an absolute one alone.
const put = await fetch(new URL(upload.url, ORIGIN), { method: "PUT", body: png, headers: { "content-type": "image/png" } });
check("an upload is accepted", put.ok, String(put.status));

const read = await fetch(new URL(await storage.createReadUrl({ key }), ORIGIN));
const back = Buffer.from(await read.arrayBuffer());
check("the bytes come back identical", read.ok && back.equals(png), `${read.status}, ${back.length} bytes`);

await prisma.$disconnect();
console.log(failures === 0 ? "\nAll in-app checks passed." : `\n${failures} in-app check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
