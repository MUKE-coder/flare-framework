import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { LocalTime } from "@/components/dashboard/local-time";
import { StoreHeader } from "@/components/store/store-header";
import { currentAccount, customerForAccount, money, ordersForCustomer } from "@/lib/store";

export const metadata = { title: "Your orders" };

/** Everything this person has bought. Their own orders only — matched on their email. */
export default async function OrdersPage() {
  const account = await currentAccount();
  if (!account) redirect("/sign-in?next=/account/orders");

  const customer = await customerForAccount(account);
  const orders = customer ? await ordersForCustomer(customer.id) : [];

  return (
    <>
      <StoreHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your orders</h1>
        {orders.length === 0 ? (
          <Empty className="rounded-lg border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No orders yet</EmptyTitle>
              <EmptyDescription>
                <Link href="/products" className="underline">
                  Have a look at what's for sale.
                </Link>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <span className="flex flex-col">
                    <Link href={`/account/orders/${order.id}`} className="font-medium hover:underline">
                      {order.reference}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      <LocalTime value={order.createdAt} />
                    </span>
                  </span>
                  <Badge variant="secondary">{order.status}</Badge>
                  <span className="font-semibold tabular-nums">{money(order.total)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
