import { defineSeed } from "@flaredev/core";
import { categories, products } from "@/db/schema";

/**
 * The shop's opening stock: a few things in boxes, a few things to download.
 *
 * Written out rather than generated, because a demo shop reads better with real names
 * and believable prices — and because this is the file you'd edit to load your own
 * catalogue on the first deploy.
 */
export default defineSeed(async ({ db, log }) => {
  const rows = [
    { name: "Workshop", slug: "workshop", description: "Tools and things for a desk." },
    { name: "Downloads", slug: "downloads", description: "Licences, kits and source code." },
  ];
  const saved = await db.insert(categories).values(rows).returning({ id: categories.id, slug: categories.slug });
  const byslug = Object.fromEntries(saved.map((row: { id: string; slug: string }) => [row.slug, row.id]));

  const catalogue = [
    { sku: "LAMP-01", name: "Brushed steel desk lamp", kind: "stock", price: 89, stock: 24, category: "workshop", description: "Warm dimmable light, weighted base." },
    { sku: "CHAIR-02", name: "Oak office chair", kind: "stock", price: 340, stock: 6, category: "workshop", description: "Solid oak frame, wool seat." },
    { sku: "MAT-03", name: "Canvas mouse mat", kind: "stock", price: 18, stock: 120, category: "workshop" },
    { sku: "MUG-04", name: "Copper travel mug", kind: "stock", price: 26, stock: 48, category: "workshop" },
    { sku: "BOX-05", name: "Recycled storage box", kind: "stock", price: 14, stock: 3, category: "workshop", description: "Nearly out — reorder." },
    { sku: "SRC-10", name: "Point-of-sale source code", kind: "digital", price: 149, category: "downloads", description: "The till in this shop, as a repository." },
    { sku: "ICON-11", name: "Workshop icon pack", kind: "digital", price: 29, category: "downloads" },
    { sku: "COURSE-12", name: "Selling online: a short course", kind: "digital", price: 79, category: "downloads" },
  ];

  await db.insert(products).values(
    catalogue.map((item) => ({
      sku: item.sku,
      name: item.name,
      kind: item.kind as "stock" | "digital",
      price: item.price,
      // A digital product has no shelf, so it has no stock either.
      stock: item.kind === "stock" ? item.stock : null,
      description: item.description ?? null,
      categoryId: byslug[item.category] ?? null,
      active: true,
    })),
  );

  log(`stocked ${catalogue.length} products in ${rows.length} categories`);
});
