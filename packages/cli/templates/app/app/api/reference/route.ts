import { apiDocs } from "@/lib/api-docs";

/** Scalar's API reference, pinned to one release, reading /api/openapi.json. */
const SCALAR = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.71.0";

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

export function GET() {
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
