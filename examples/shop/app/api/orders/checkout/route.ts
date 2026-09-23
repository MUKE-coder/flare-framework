import { authorize, currentUser } from "@/lib/api";
import { storage } from "@/lib/storage";
import { dashboardStore } from "@/lib/dashboard";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { inArray } from "drizzle-orm";
import orderResource from "@/resources/order.resource";

/** How long a download link from the till stays good. */
const DOWNLOAD_HOURS = 24;

/** ".zip" from "downloads/kit-a83f.zip"; nothing if the key has no extension. */
function extensionOf(key: string): string {
  const match = /\.[A-Za-z0-9]{1,8}$/.exec(key);
  return match ? match[0] : "";
}

/**
 * POST /api/orders/checkout
 *
 * One sale: an order, its lines, and the stock that moved. The till posts here.
 *
 * Prices come from the database, never from the browser — a till that trusts the price
 * in the request is a till that can be told a laptop costs a pound.
 */
export async function POST(request: Request) {
  const denied = await authorize({ request, resource: orderResource, action: "create" });
  if (denied) return denied;

  const body = (await request.json()) as {
    lines?: { productId: string; quantity: number }[];
    paidWith?: "cash" | "card" | "mobile";
    customerId?: string | null;
    note?: string;
  };

  const lines = (body.lines ?? []).filter((line) => line.productId && Number(line.quantity) > 0);
  if (lines.length === 0) return Response.json({ error: "There's nothing in the basket." }, { status: 400 });

  const db = getDb();
  const ids = [...new Set(lines.map((line) => line.productId))];
  const found = await db.select().from(products).where(inArray(products.id, ids));
  const byId = new Map(found.map((product) => [product.id, product]));

  // Everything is checked before anything is written: a basket that can't be sold in
  // full shouldn't leave half an order behind.
  const priced = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) return Response.json({ error: "One of those products no longer exists." }, { status: 400 });
    if (!product.active) return Response.json({ error: `${product.name} isn't for sale.` }, { status: 400 });
    const quantity = Math.floor(Number(line.quantity));
    if (product.kind === "stock" && (product.stock ?? 0) < quantity) {
      return Response.json({ error: `Only ${product.stock ?? 0} of ${product.name} left.` }, { status: 409 });
    }
    priced.push({ product, quantity });
  }

  const total = priced.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const user = await currentUser();

  const order = await dashboardStore("Order").create({
    channel: "pos",
    status: "paid",
    paidWith: body.paidWith ?? "cash",
    customerId: body.customerId ?? undefined,
    total: Math.round(total * 100) / 100,
    note: body.note || `Sold at the till by ${user?.email ?? "staff"}`,
  });
  if (!order.ok) return Response.json({ error: order.error }, { status: order.status });

  // Each line goes through the store, so the OrderItem hook takes the stock down.
  const items = dashboardStore("OrderItem");
  for (const { product, quantity } of priced) {
    const line = await items.create({
      orderId: String(order.data.id),
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
    });
    if (!line.ok) return Response.json({ error: line.error }, { status: line.status });
  }

  // What the customer walks away with: a receipt, and a link for anything digital.
  //
  // The link is signed and expires; the file itself stays private in R2, so the only way
  // to it is a link the shop issued for a sale that was paid for. A day is long enough
  // for someone to get home and download it, and short enough not to be a back door.
  const downloads = await Promise.all(
    priced
      .filter(({ product }) => product.kind === "digital" && product.downloadFile)
      .map(async ({ product }) => ({
        name: product.name,
        url: await storage.createReadUrl({
          key: product.downloadFile as string,
          expiresIn: DOWNLOAD_HOURS * 3600,
          downloadAs: `${product.sku} ${product.name}`.replace(/[^\w .-]/g, "") + extensionOf(product.downloadFile as string),
        }),
      })),
  );

  return Response.json({
    ok: true,
    order: { id: order.data.id, reference: order.data.reference, total: order.data.total },
    downloads,
    downloadHours: DOWNLOAD_HOURS,
  });
}

/** The products the till can sell, newest first, filtered by `?q=`. */
export async function GET(request: Request) {
  const denied = await authorize({ request, resource: orderResource, action: "create" });
  if (denied) return denied;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const store = dashboardStore("Product");
  const params = new URLSearchParams({ perPage: "24", "filter[active]": "true" });
  if (query) params.set("q", query);
  const result = await store.list(params);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  return Response.json({
    products: result.data.data.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      kind: product.kind,
      price: product.price,
      stock: product.stock,
    })),
  });
}
