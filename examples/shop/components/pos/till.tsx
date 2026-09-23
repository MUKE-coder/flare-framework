"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, CreditCardIcon, DownloadIcon, MinusIcon, PlusIcon, SearchIcon, SmartphoneIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  sku: string;
  kind: "stock" | "digital";
  price: number;
  stock: number | null;
}

interface Line {
  product: Product;
  quantity: number;
}

interface Receipt {
  reference: string;
  total: number;
  downloads: { name: string; url: string }[];
  downloadHours: number;
}

const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });

const PAYMENTS = [
  { value: "cash", label: "Cash", icon: BanknoteIcon },
  { value: "card", label: "Card", icon: CreditCardIcon },
  { value: "mobile", label: "Mobile", icon: SmartphoneIcon },
] as const;

/**
 * The till: tap products, take payment, hand over a receipt.
 *
 * Built for a counter, not a desk — the buttons are big, the basket is always visible,
 * and nothing needs a second screen. Prices are only ever displayed here; the server
 * prices the sale from the database.
 */
export function Till() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<(typeof PAYMENTS)[number]["value"]>("cash");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, startTransition] = useTransition();

  // Searching as they type, with a pause so a fast typist doesn't make a request a letter.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await fetch(`/api/orders/checkout?q=${encodeURIComponent(query)}`);
      const body = (await response.json()) as { products?: Product[] };
      setProducts(body.products ?? []);
      setLoading(false);
    }, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0), [lines]);

  const add = (product: Product) => {
    setReceipt(null);
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (!existing) return [...current, { product, quantity: 1 }];
      // Stock runs out; digital doesn't.
      if (product.kind === "stock" && existing.quantity >= (product.stock ?? 0)) {
        toast.warning(`That's all the ${product.name} there is.`);
        return current;
      }
      return current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
    });
  };

  const change = (id: string, by: number) =>
    setLines((current) =>
      current.flatMap((line) => {
        if (line.product.id !== id) return [line];
        const quantity = line.quantity + by;
        return quantity <= 0 ? [] : [{ ...line, quantity }];
      }),
    );

  const checkout = () =>
    startTransition(async () => {
      const response = await fetch("/api/orders/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paidWith: payment, lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })) }),
      });
      const body = (await response.json()) as {
        order?: { reference: string; total: number };
        downloads?: Receipt["downloads"];
        downloadHours?: number;
        error?: string;
      };
      if (!response.ok || !body.order) {
        toast.error(body.error ?? "That sale didn't go through.");
        return;
      }
      setReceipt({
        reference: body.order.reference,
        total: body.order.total,
        downloads: body.downloads ?? [],
        downloadHours: body.downloadHours ?? 24,
      });
      setLines([]);
      toast.success(`${body.order.reference} · ${money(body.order.total)}`);
      // The shelf just changed, and so did today's takings.
      router.refresh();
      setQuery("");
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or SKU…"
            aria-label="Search products"
            autoFocus
          />
        </InputGroup>

        {loading && products.length === 0 ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : products.length === 0 ? (
          <Empty className="rounded-lg border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Nothing to sell</EmptyTitle>
              <EmptyDescription>{query ? "No product matches that." : "Add a product and mark it active."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const soldOut = product.kind === "stock" && (product.stock ?? 0) <= 0;
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={soldOut}
                  onClick={() => add(product)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
                    soldOut ? "opacity-50" : "hover:border-primary hover:bg-muted/50",
                  )}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="font-medium">{product.name}</span>
                    <Badge variant={product.kind === "digital" ? "secondary" : "outline"}>{product.kind}</Badge>
                  </span>
                  <span className="text-sm text-muted-foreground">{product.sku}</span>
                  <span className="mt-1 flex w-full items-baseline justify-between">
                    <span className="text-lg font-semibold tabular-nums">{money(product.price)}</span>
                    {product.kind === "stock" && (
                      <span className="text-xs text-muted-foreground tabular-nums">{soldOut ? "sold out" : `${product.stock} left`}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Basket</h2>

          {lines.length === 0 && !receipt && <p className="py-6 text-center text-sm text-muted-foreground">Tap a product to start a sale.</p>}

          {receipt && lines.length === 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/5 p-4">
              <span className="text-sm font-medium">{receipt.reference}</span>
              <span className="text-2xl font-semibold tabular-nums">{money(receipt.total)}</span>
              <span className="text-xs text-muted-foreground">Paid. Next customer.</span>
              {receipt.downloads.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-success/30 pt-3">
                  <span className="text-xs text-muted-foreground">
                    Downloads, good for {receipt.downloadHours} hours:
                  </span>
                  {receipt.downloads.map((download) => (
                    <Button key={download.url} variant="outline" size="sm" className="justify-start" asChild>
                      <a href={download.url} download>
                        <DownloadIcon data-icon="inline-start" />
                        <span className="truncate">{download.name}</span>
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {lines.map((line) => (
            <div key={line.product.id} className="flex items-center gap-2 border-b pb-3 last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{line.product.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{money(line.product.price)} each</span>
              </span>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="size-7" aria-label={`One fewer ${line.product.name}`} onClick={() => change(line.product.id, -1)}>
                  <MinusIcon />
                </Button>
                <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                <Button variant="outline" size="icon" className="size-7" aria-label={`One more ${line.product.name}`} onClick={() => change(line.product.id, 1)}>
                  <PlusIcon />
                </Button>
              </span>
              <span className="w-16 text-right text-sm font-medium tabular-nums">{money(line.product.price * line.quantity)}</span>
            </div>
          ))}

          {lines.length > 0 && (
            <>
              <div className="flex items-baseline justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-2xl font-semibold tabular-nums">{money(total)}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {PAYMENTS.map((option) => (
                  <Button
                    key={option.value}
                    variant={payment === option.value ? "default" : "outline"}
                    onClick={() => setPayment(option.value)}
                    aria-pressed={payment === option.value}
                  >
                    <option.icon data-icon="inline-start" />
                    {option.label}
                  </Button>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="icon" aria-label="Clear the basket" onClick={() => setLines([])} disabled={pending}>
                  <Trash2Icon />
                </Button>
                <Button className="flex-1" onClick={checkout} disabled={pending}>
                  {pending && <Spinner data-icon="inline-start" />}
                  Take {money(total)}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
