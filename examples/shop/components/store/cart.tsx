"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * The basket, kept in the browser.
 *
 * A cart is a list of intentions, not a record: it holds ids and quantities and nothing
 * else. Every price the customer is charged is worked out again on the server at
 * checkout, so a basket tampered with in the browser buys nothing at the wrong price.
 *
 * localStorage rather than a table, because a basket that outlives the tab but not the
 * browser is what people expect, and it costs no database.
 */

export interface CartLine {
  productId: string;
  quantity: number;
}

interface CartValue {
  lines: CartLine[];
  count: number;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  /** False until localStorage has been read, so the server and first paint agree. */
  ready: boolean;
}

const KEY = "shop.cart.v1";
const CartContext = createContext<CartValue | null>(null);

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((line): line is CartLine => typeof line === "object" && line !== null && typeof (line as CartLine).productId === "string")
      .map((line) => ({ productId: line.productId, quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)) }));
  } catch {
    // Private mode, blocked storage, or something else wrote nonsense under our key.
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  // Read after mount: the server has no localStorage, and rendering a count it can't
  // know would make the first paint disagree with the markup it sent.
  useEffect(() => {
    setLines(read());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      // Nothing to do; the basket still works for this tab.
    }
  }, [lines, ready]);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      ready,
      count: lines.reduce((total, line) => total + line.quantity, 0),
      add: (productId, quantity = 1) =>
        setLines((current) => {
          const existing = current.find((line) => line.productId === productId);
          if (!existing) return [...current, { productId, quantity }];
          return current.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + quantity } : line));
        }),
      setQuantity: (productId, quantity) =>
        setLines((current) =>
          quantity <= 0
            ? current.filter((line) => line.productId !== productId)
            : current.map((line) => (line.productId === productId ? { ...line, quantity } : line)),
        ),
      remove: (productId) => setLines((current) => current.filter((line) => line.productId !== productId)),
      clear: () => setLines([]),
    }),
    [lines, ready],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>.");
  return value;
}
