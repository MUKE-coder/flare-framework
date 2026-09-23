import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, customers, orderItems, orders, products } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * What the shop front reads.
 *
 * The dashboard goes through the generated store, which applies the admin's policies.
 * These are the customer's view instead: only active products, and only the signed-in
 * person's own orders. Nothing here is behind a role, so each query says out loud what
 * it will show.
 */

export interface StoreProduct {
  id: string;
  name: string;
  sku: string;
  kind: "stock" | "digital";
  price: number;
  stock: number | null;
  description: string | null;
  image: string | null;
  downloadFile: string | null;
  categoryId: string | null;
  active: boolean;
}

/** Whether there is anything to sell: digital always, stock only while it lasts. */
export const inStock = (product: Pick<StoreProduct, "kind" | "stock">) => product.kind === "digital" || (product.stock ?? 0) > 0;

export async function listCategories() {
  return getDb().select().from(categories).orderBy(asc(categories.name));
}

export async function categoryBySlug(slug: string) {
  const [row] = await getDb().select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return row ?? null;
}

/** Active products, newest first, optionally within one category. */
export async function listProducts(categoryId?: string): Promise<StoreProduct[]> {
  const where = categoryId ? and(eq(products.active, true), eq(products.categoryId, categoryId)) : eq(products.active, true);
  const rows = await getDb().select().from(products).where(where).orderBy(desc(products.createdAt)).limit(60);
  return rows as StoreProduct[];
}

export async function productById(id: string): Promise<StoreProduct | null> {
  const [row] = await getDb().select().from(products).where(and(eq(products.id, id), eq(products.active, true))).limit(1);
  return (row as StoreProduct | undefined) ?? null;
}

/** The products in a basket, in one query. */
export async function productsByIds(ids: string[]): Promise<StoreProduct[]> {
  if (ids.length === 0) return [];
  const rows = await getDb().select().from(products).where(inArray(products.id, ids));
  return rows as StoreProduct[];
}

/** The signed-in person, or null. */
export async function currentAccount() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
}

/**
 * The customer record for the signed-in person, made on first purchase.
 *
 * Customers are matched by email: the account is who signs in, the customer is who the
 * shop sells to, and one shop may well have taken an order from that address over the
 * counter before they ever made an account.
 */
export async function customerForAccount(account: { email: string; name: string }, create = false) {
  const db = getDb();
  const [existing] = await db.select().from(customers).where(eq(customers.email, account.email)).limit(1);
  if (existing || !create) return existing ?? null;
  const [made] = await db.insert(customers).values({ name: account.name || account.email, email: account.email }).returning();
  return made ?? null;
}

/** This customer's orders, newest first. */
export async function ordersForCustomer(customerId: string) {
  return getDb().select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt)).limit(50);
}

/** One order and its lines — only if it belongs to this customer. */
export async function orderForCustomer(orderId: string, customerId: string) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, customerId))).limit(1);
  if (!order) return null;
  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { order, lines };
}

/**
 * What a bought file should be called when it lands in someone's downloads.
 *
 * The object key ends in the extension the file was uploaded with; the name is what the
 * customer recognises. Both, so "Point-of-sale source code.zip" opens with a double
 * click rather than asking what it is.
 */
export function downloadName(name: string, objectKey: string): string {
  const match = /\.[A-Za-z0-9]{1,8}$/.exec(objectKey);
  return `${name.replace(/[^\w .-]/g, "")}${match ? match[0] : ""}`;
}

/** "$89.00" — one place, so the till, the shop front and the receipts agree. */
export const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });
