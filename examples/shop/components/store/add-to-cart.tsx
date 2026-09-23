"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon, ShoppingBagIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCart } from "./cart";

/** Choose how many, then put them in the basket. */
export function AddToCart({ productId, name, max }: { productId: string; name: string; max: number | null }) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const ceiling = max ?? Infinity;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-md border p-1">
        <Button variant="ghost" size="icon" className="size-8" aria-label="One fewer" onClick={() => setQuantity((n) => Math.max(1, n - 1))}>
          <MinusIcon />
        </Button>
        <span className="w-8 text-center text-sm tabular-nums">{quantity}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="One more"
          disabled={quantity >= ceiling}
          onClick={() => setQuantity((n) => Math.min(ceiling, n + 1))}
        >
          <PlusIcon />
        </Button>
      </div>
      <Button
        onClick={() => {
          add(productId, quantity);
          toast.success(`${quantity} × ${name} in your basket`);
        }}
      >
        <ShoppingBagIcon data-icon="inline-start" />
        Add to basket
      </Button>
    </div>
  );
}
