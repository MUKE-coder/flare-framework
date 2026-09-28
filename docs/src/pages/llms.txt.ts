import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

/**
 * /llms.txt — the docs as one list, for a language model to read.
 *
 * Built from the content collection rather than written by hand, so a page added to
 * the sidebar cannot be missing here. The format follows llmstxt.org: a title, a
 * summary, then links grouped under headings, each with a one-line description.
 *
 * The descriptions are the pages' own frontmatter. If one reads badly here, fix it on
 * the page — it is the same sentence the search results show.
 */

const SITE = "https://flare-docs.codetotech.com";

/** Sidebar order, roughly: the order someone should read them in. */
const SECTIONS: { title: string; match: (slug: string) => boolean; note?: string }[] = [
  { title: "Start here", match: (slug) => slug === "" || slug.startsWith("start/") },
  { title: "Core concepts", match: (slug) => slug.startsWith("concepts/") },
  {
    title: "Guides",
    match: (slug) => slug.startsWith("guides/") && !slug.includes("deployment") && !slug.includes("drizzle") && !slug.includes("prisma-to"),
  },
  {
    title: "The Cloudflare stack",
    match: (slug) => ["guides/deployment", "guides/drizzle-cheatsheet", "guides/prisma-to-drizzle", "guides/realtime", "guides/security", "guides/tunnels", "guides/migrations-and-seeds"].includes(slug),
    note: "Workers, D1 and Drizzle.",
  },
  { title: "The Next.js stack", match: (slug) => slug === "guides/vercel-deployment", note: "Next.js on Vercel, Postgres and Prisma." },
  { title: "Tutorials", match: (slug) => slug.startsWith("tutorials/") },
  { title: "Reference", match: (slug) => slug.startsWith("reference/") || slug.startsWith("examples/") },
];

export const GET: APIRoute = async () => {
  const docs = await getCollection("docs");
  const pages = docs
    .map((entry) => ({
      slug: entry.id.replace(/(^|\/)index$/, "").replace(/\.mdx?$/, ""),
      title: entry.data.title,
      description: entry.data.description ?? "",
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const seen = new Set<string>();
  const lines: string[] = [
    "# Flare",
    "",
    "> A fullstack framework that generates a database table, REST API, validators, typed client and admin dashboard from one resource descriptor. Apps run on Cloudflare Workers (vinext, D1, Drizzle) or on Next.js (Vercel, Postgres, Prisma) — the descriptors, generated code and dashboard are the same on both.",
    "",
    "Install: `pnpm create flare-framework myapp` (add `-- --stack next` for the Next.js stack).",
    "Agent skill: `npx skills add MUKE-coder/flare-framework@flare` — the rules, the CLI and the field grammar, packaged for a coding agent.",
    "",
  ];

  for (const section of SECTIONS) {
    const matched = pages.filter((page) => !seen.has(page.slug) && section.match(page.slug));
    if (matched.length === 0) continue;
    lines.push(`## ${section.title}`, "");
    if (section.note) lines.push(section.note, "");
    for (const page of matched) {
      seen.add(page.slug);
      const url = `${SITE}/${page.slug}${page.slug ? "/" : ""}`;
      lines.push(`- [${page.title}](${url})${page.description ? `: ${page.description}` : ""}`);
    }
    lines.push("");
  }

  const rest = pages.filter((page) => !seen.has(page.slug));
  if (rest.length > 0) {
    lines.push("## Everything else", "");
    for (const page of rest) lines.push(`- [${page.title}](${SITE}/${page.slug}/)${page.description ? `: ${page.description}` : ""}`);
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
};
