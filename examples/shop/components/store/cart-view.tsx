"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useCart } from "./cart";

interface Priced {
  id: string;
  name: string;
  sku: string;
  kind: "stock" | "digital";
  price: number;
  stock: number | null;
}

const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * The basket, priced.
 *
 * The browser holds ids and quantities; the prices and names come from the server every
 * time this renders, so a basket left open overnight shows today's prices rather than
 * yesterday's.
 */
export function CartView({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const { lines, ready, setQuantity, remove, clear } = useCart();
  const [products, setProducts] = useState<Priced[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, startPlacing] = useTransition();

  useEffect(() => {
    if (!ready) return;
    if (lines.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    const ids = lines.map((line) => line.productId).join(",");
    void fetch(`/api/store/checkout?ids=${encodeURIComponent(ids)}`)
      .then((response) => response.json() as Promise<{ products?: Priced[] }>)
      .then((body) => setProducts(body.products ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [ready, lines]);

  const rows = lines
    .map((line) => ({ line, product: products.find((item) => item.id === line.productId) }))
    .filter((row): row is { line: typeof row.line; product: Priced } => Boolean(row.product));
  const total = rows.reduce((sum, row) => sum + row.product.price * row.line.quantity, 0);

  const checkout = () =>
    startPlacing(async () => {
      const response = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const body = (await response.json()) as { order?: { id: string; reference: string }; error?: string };
      if (!response.ok || !body.order) {
        toast.error(body.error ?? "That order didn't go through.");
        return;
      }
      clear();
      toast.success(`Order ${body.order.reference} placed.`);
      router.push(`/account/orders/${body.order.id}`);
    });

  if (!ready || loading) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Empty className="rounded-lg border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Your basket is empty</EmptyTitle>
          <EmptyDescription>
            <Link href="/products" className="underline">
              Have a look at what's for sale.
            </Link>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        {rows.map(({ line, product }) => {
          const ceiling = product.kind === "stock" ? (product.stock ?? 0) : Infinity;
          return (
            <Card key={product.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/products/${product.id}`} className="truncate font-medium hover:underline">
                    {product.name}
                  </Link>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {product.sku} · {money(product.price)} each
                  </span>
                  {product.kind === "stock" && line.quantity > ceiling && (
                    <span className="text-xs text-destructive">Only {ceiling} left — reduce the quantity to order.</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="size-7" aria-label={`One fewer ${product.name}`} onClick={() => setQuantity(product.id, line.quantity - 1)}>
                    <MinusIcon />
                  </Button>
                  <span className="w-7 text-center text-sm tabular-nums">{line.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    aria-label={`One more ${product.name}`}
                    disabled={line.quantity >= ceiling}
                    onClick={() => setQuantity(product.id, line.quantity + 1)}
                  >
                    <PlusIcon />
                  </Button>
                </span>
                <span className="w-20 text-right text-sm font-medium tabular-nums">{money(product.price * line.quantity)}</span>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${product.name}`} onClick={() => remove(product.id)}>
                  <Trash2Icon />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Summary</h2>
          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-2xl font-semibold tabular-nums">{money(total)}</span>
          </div>
          {signedIn ? (
            <Button onClick={checkout} disabled={placing}>
              {placing && <Spinner data-icon="inline-start" />}
              Place order
            </Button>
          ) : (
            <>
              <Button asChild>
                <Link href="/sign-in?next=/cart">Sign in to order</Link>
              </Button>
              <p className="text-xs text-muted-foreground">Your basket is kept while you sign in.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
