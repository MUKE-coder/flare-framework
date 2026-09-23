import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { inStock, money, type StoreProduct } from "@/lib/store";
import { ProductImage } from "./product-image";

/** One product in a grid: picture, name, price, and whether it can be bought. */
export function ProductCard({ product }: { product: StoreProduct }) {
  const available = inStock(product);
  return (
    <Card className="overflow-hidden py-0">
      <Link href={`/products/${product.id}`} className="block">
        <ProductImage objectKey={product.image} alt={product.name} />
        <CardContent className="flex flex-col gap-1 p-4">
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium leading-tight">{product.name}</span>
            {product.kind === "digital" && <Badge variant="secondary">Download</Badge>}
          </span>
          <span className="text-sm text-muted-foreground">{product.sku}</span>
          <span className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-semibold tabular-nums">{money(product.price)}</span>
            {!available && <span className="text-xs text-muted-foreground">Sold out</span>}
          </span>
        </CardContent>
      </Link>
    </Card>
  );
}
