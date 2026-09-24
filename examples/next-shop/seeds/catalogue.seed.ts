import { defineSeed } from "@flaredev/core";

/**
 * A catalogue big enough to be worth searching.
 *
 * 2,000 is enough to browse, page and search against. It is not enough to show what a
 * full-text index is for: at this size a sequential scan is just as quick, and the
 * difference only appears in the hundreds of thousands. The search page's comments have
 * the measurements.
 */
export default defineSeed(async ({ db, insertMany, fake, log }) => {
  const prisma = db as unknown as {
    category: { createMany(args: { data: unknown[] }): Promise<unknown>; findMany(): Promise<{ id: string }[]> };
  };

  await prisma.category.createMany({
    data: [
      { name: "Workshop", slug: "workshop", description: "Tools and things for a desk.", updatedAt: new Date() },
      { name: "Downloads", slug: "downloads", description: "Licences, kits and source code.", updatedAt: new Date() },
      { name: "Materials", slug: "materials", description: "Timber, steel, canvas.", updatedAt: new Date() },
    ],
  });
  const categories = await prisma.category.findMany();

  await insertMany(
    "product",
    Array.from({ length: 2_000 }, (_, index) => {
      const digital = index % 5 === 0;
      return {
        name: fake.product(digital),
        sku: `${digital ? "DL" : "ST"}-${String(index + 1).padStart(5, "0")}`,
        kind: digital ? "digital" : "stock",
        price: fake.float(5, 900),
        stock: digital ? null : fake.int(0, 200),
        description: fake.paragraph(2),
        tags: fake.some(["new", "sale", "clearance"], 0, 2),
        categoryId: fake.pick(categories).id,
        active: fake.bool(0.9),
        updatedAt: new Date(),
      };
    }),
  );

  log(`stocked 2,000 products across ${categories.length} categories`);
});
