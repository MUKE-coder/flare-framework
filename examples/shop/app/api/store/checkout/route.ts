import { dashboardStore } from "@/lib/dashboard";
import { currentAccount, customerForAccount, productsByIds } from "@/lib/store";

/**
 * The shop front's checkout.
 *
 * The till's endpoint (`/api/orders/checkout`) is for staff and takes payment at the
 * counter; this one is for a customer buying online, so it needs a signed-in account,
 * attaches the order to their customer record, and never touches stock itself — the
 * OrderItem hook does that, the same way it does for a sale at the till.
 */

/** GET /api/store/checkout?ids=a,b — prices for a basket. */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);

  const products = (await productsByIds(ids)).filter((product) => product.active !== false);
  return Response.json({
    products: products.map(({ id, name, sku, kind, price, stock }) => ({ id, name, sku, kind, price, stock })),
  });
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return Response.json({ error: "Sign in to place an order." }, { status: 401 });

  const body = (await request.json()) as { lines?: { productId: string; quantity: number }[] };
  const lines = (body.lines ?? []).filter((line) => line.productId && Number(line.quantity) > 0).slice(0, 50);
  if (lines.length === 0) return Response.json({ error: "There's nothing in your basket." }, { status: 400 });

  const found = await productsByIds([...new Set(lines.map((line) => line.productId))]);
  const byId = new Map(found.map((product) => [product.id, product]));

  // Priced and checked in full before anything is written, so a basket that can't be
  // sold doesn't leave half an order behind.
  const priced = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) return Response.json({ error: "One of those products is no longer for sale." }, { status: 400 });
    const quantity = Math.floor(Number(line.quantity));
    if (product.kind === "stock" && (product.stock ?? 0) < quantity) {
      return Response.json({ error: `Only ${product.stock ?? 0} of ${product.name} left.` }, { status: 409 });
    }
    priced.push({ product, quantity });
  }

  const total = priced.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const customer = await customerForAccount(account, true);

  const order = await dashboardStore("Order").create({
    channel: "online",
    status: "paid",
    paidWith: "card",
    customerId: customer?.id,
    total: Math.round(total * 100) / 100,
    note: `Ordered online by ${account.email}`,
  });
  if (!order.ok) return Response.json({ error: order.error }, { status: order.status });

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

  return Response.json({ ok: true, order: { id: order.data.id, reference: order.data.reference, total: order.data.total } });
}
