// The resource engine, in your app.
//
// Re-exported from one place so a route reads `from "@/lib/resource"`. Every file
// behind it is in this folder and is yours to change.
//
// This is the Next.js stack, so the row adapter is Prisma over Postgres. The
// Cloudflare stack has drizzle-rows.ts here instead. Both implement ResourceRows,
// which is the whole contract — about fifty lines in rows.ts, and the reason a
// descriptor doesn't care which database it is on.
export * from "./rows";
export * from "./http";
export * from "./query";
export * from "./store";
export * from "./handlers";
export * from "./prisma-rows";
