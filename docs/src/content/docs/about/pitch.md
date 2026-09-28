---
title: The pitch
description: What Flare does, in one page, with the numbers.
---

## Describe a resource once

```ts
// resources/product.resource.ts
export default defineResource({
  name: "Product",
  fields: {
    name: field.string(),
    sku: field.string({ unique: true }),
    price: field.float(),
    image: field.file({ accept: ["image"], required: false }),
    category: field.belongsTo("Category", { required: false }),
    active: field.boolean(),
  },
});
```

## Run one command

```bash
npx flare gen resource Product
```

## Get all of this

- A **database table** and its migration
- **Zod validators**, strict — no mass assignment
- A **REST API**: list with paging, search, filters and cursors; create, read,
  update, replace, delete
- A **typed client**, so your components never build a URL
- **Policy hooks**, honoured by the API and the dashboard alike
- **Four admin pages** — a sortable, filterable table with CSV import and
  export and saved views; a multi-step form in a sheet; a record page with its
  children; loading skeletons shaped like each one
- An entry in the **OpenAPI document**, rendered at `/api/reference`

Every file lands in your repository. Nothing runs from a black box.

## And the app already had

Auth with passwords, magic links, email codes, passkeys, two-factor and social
sign-in. File uploads to R2. Transactional email. Stripe subscriptions. An
audit log. Six themes. A cost estimator. 404 and error pages. A cache that
invalidates itself on writes.

Before you wrote a line.

## Two stacks, one description

```bash
pnpm create flare-framework myapp                    # Cloudflare Workers, D1, Drizzle
pnpm create flare-framework myapp -- --stack next    # Next.js on Vercel, Postgres, Prisma
```

Your descriptors, hooks, policies, seeds and every component are identical on
both. [Compare them](/start/stacks/).

## Nothing is hidden

The ~900 lines that turn a request into a response are **copied into your
app**, the way shadcn/ui copies a component:

```ts title="app/api/products/route.ts"
export async function POST(request: Request): Promise<Response> {
  try {
    const denied = await authorize({ request, resource: productResource, action: "create" });
    if (denied) return denied;
    if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");

    const read = await readJson(request);
    if ("response" in read) return read.response;

    const result = await store.create(read.body);
    if (!result.ok) return failureResponse(result);

    return Response.json(result.data, { status: 201, headers: { location } });
  } finally {
    await drain(request);
  }
}
```

Ctrl-click any of those and you land in your own code.
[Why it works this way](/concepts/no-magic/).

## What it costs to run

A small app fits inside the free tiers of both stacks. A busy one is
**$5–25/month** on Cloudflare. R2 charges nothing to serve what it stores,
which for a file-heavy app is usually the largest line on the bill.

[The arithmetic](/guides/costs/), measured rather than estimated.

## The trade, stated

Because the code is yours, a fix in a later release does not arrive on its
own. `flare diff` shows what changed upstream; `flare update` applies it, and
refuses to run without `--yes`.

That is the deal, and we would rather you knew it now.

## Try it

```bash
pnpm create flare-framework myapp
cd myapp
npx flare gen resource Contact --fields 'name:string, email:email!, status:enum(lead,customer)'
npx flare migrate
npx flare dev
```

Five minutes to a live, authenticated CRUD app. Then
[deploy it](/guides/deployment/).

---

[Who it's for](/about/who-its-for/) · [Philosophy](/about/philosophy/) ·
[Architecture](/concepts/architecture/) · [Quickstart](/start/quickstart/)
