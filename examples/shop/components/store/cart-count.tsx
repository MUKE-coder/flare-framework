"use client";

import { useCart } from "./cart";

/** The number on the basket icon. Nothing until the basket has something in it. */
export function CartCount() {
  const { count, ready } = useCart();
  if (!ready || count === 0) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground tabular-nums">
      {count > 9 ? "9+" : count}
    </span>
  );
}
