import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AddToCart } from "@/components/store/add-to-cart";
import { ProductImage } from "@/components/store/product-image";
import { StoreHeader } from "@/components/store/store-header";
import { categoryBySlug, inStock, money, productById } from "@/lib/store";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const product = await productById((await params).id);
  return { title: product?.name ?? "Product" };
}

/** One product: what it is, what it costs, and a way to buy it. */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const product = await productById((await params).id);
  if (!product) notFound();

  const [category] = product.categoryId
    ? await getDb().select().from(categories).where(eq(categories.id, product.categoryId)).limit(1)
    : [null];
  const available = inStock(product);

  return (
    <>
      <StoreHeader />
      <main className="mx-auto grid max-w-5xl gap-10 px-6 py-10 md:grid-cols-2">
        <ProductImage objectKey={product.image} alt={product.name} className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border bg-muted" />

        <div className="flex flex-col gap-4">
          {category && (
            <Link href={`/categories/${category.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
              {category.name}
            </Link>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{product.name}</h1>
          <span className="flex items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums">{money(product.price)}</span>
            <Badge variant={product.kind === "digital" ? "secondary" : "outline"}>{product.kind === "digital" ? "Download" : "In a box"}</Badge>
          </span>

          {product.description && <p className="text-muted-foreground">{product.description}</p>}

          <p className="text-sm text-muted-foreground">
            {product.kind === "digital"
              ? "Yours to download as soon as the order is paid."
              : available
                ? `${product.stock} in stock.`
                : "Sold out for now."}
          </p>

          {available ? (
            <AddToCart productId={product.id} name={product.name} max={product.kind === "stock" ? product.stock : null} />
          ) : (
            <p className="text-sm">Check back soon — this one sells out quickly.</p>
          )}
        </div>
      </main>
    </>
  );
}
