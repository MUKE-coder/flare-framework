// The resource engine, in your app.
//
// Re-exported from one place so a route reads `from "@/lib/resource"`. Every file
// behind it is in this folder and is yours to change.
//
// On the Cloudflare stack the row adapter is Drizzle over D1; a Next.js app has
// prisma-rows.ts here instead. Both implement ResourceRows, which is the whole
// contract — about fifty lines in rows.ts, and the reason a descriptor doesn't care
// which database it is on.
export * from "./rows";
export * from "./query";
export * from "./store";
export * from "./handlers";
export * from "./drizzle-rows";
