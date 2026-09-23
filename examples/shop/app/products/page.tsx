import { ProductCard } from "@/components/store/product-card";
import { StoreHeader } from "@/components/store/store-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { listProducts } from "@/lib/store";

export const metadata = { title: "All products" };

export default async function ProductsPage() {
  const products = await listProducts();
  return (
    <>
      <StoreHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">All products</h1>
        {products.length === 0 ? (
          <Empty className="rounded-lg border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Nothing for sale yet</EmptyTitle>
              <EmptyDescription>Add a product in the dashboard and mark it active.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
