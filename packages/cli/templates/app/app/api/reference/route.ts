import { apiDocs } from "@/lib/api-docs";
import { canArea } from "@/lib/dashboard";

/** Scalar's API reference, pinned to one release, reading /api/openapi.json. */
const SCALAR = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.71.0";

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

export async function GET() {
  // The roles screen grants this page, so the tick there has to mean something: without
  // this check, unticking it would only hide the sidebar link and the URL would still
  // work. `visibility: "public"` is the deliberate exception — it says the document is
  // for everyone, visitors included, and that is not ours to override.
  if (apiDocs.visibility !== "public" && !(await canArea("@api-reference"))) {
    return new Response("Not found", { status: 404 });
  }

  const config = {
    url: "/api/openapi.json",
    theme: "default",
    layout: "modern",
    hideModels: false,
    defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
    metaData: { title: apiDocs.title },
    // Scalar's own hosted extras (toolbar, developer tools, MCP generator, AI chat) don't belong in an app.
    showToolbar: "never",
    showDeveloperTools: "never",
    mcp: { disabled: true },
    agent: { disabled: true },
  };
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(apiDocs.title)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${SCALAR}"></script>
    <script>Scalar.createApiReference("#app", ${JSON.stringify(config).replace(/</g, "\u003c")});</script>
  </body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
