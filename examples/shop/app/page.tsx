import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ProductCard } from "@/components/store/product-card";
import { StoreHeader } from "@/components/store/store-header";
import { listCategories, listProducts } from "@/lib/store";

export const metadata = { title: "shop" };

/** The shop front: what we sell, and the way into each part of it. */
export default async function Home() {
  const [categories, products] = await Promise.all([listCategories(), listProducts()]);

  return (
    <>
      <StoreHeader />
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="flex flex-col items-start gap-4 py-14 md:py-20">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Things for a desk, and things to download.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            A small workshop shop. Everything here is in stock or instantly downloadable, and the till in the back room runs on the same catalogue.
          </p>
          <Button asChild size="lg">
            <Link href="/products">
              Browse everything
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </section>

        {categories.length > 0 && (
          <section className="flex flex-col gap-4 pb-12">
            <h2 className="text-sm font-medium text-muted-foreground">Categories</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((category) => (
                <Card key={category.id} className="transition-colors hover:border-primary">
                  <CardContent className="flex items-center justify-between gap-4">
                    <span className="flex flex-col">
                      <Link href={`/categories/${category.slug}`} className="font-medium hover:underline">
                        {category.name}
                      </Link>
                      {category.description && <span className="text-sm text-muted-foreground">{category.description}</span>}
                    </span>
                    <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">Latest</h2>
          {products.length === 0 ? (
            <Empty className="rounded-lg border border-dashed">
              <EmptyHeader>
                <EmptyTitle>Nothing for sale yet</EmptyTitle>
                <EmptyDescription>Add a product in the dashboard and mark it active.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.slice(0, 6).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
