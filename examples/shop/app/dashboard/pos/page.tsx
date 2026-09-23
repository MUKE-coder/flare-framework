import { and, eq, gte, sql } from "drizzle-orm";
import { BanknoteIcon, ReceiptIcon, ShoppingBagIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards } from "@/components/dashboard/stat-card";
import { Till } from "@/components/pos/till";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { requireDashboard } from "@/lib/dashboard";

export const metadata = { title: "Till" };

/** Today's takings, so whoever is on the counter can see how the day is going. */
async function today() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [row] = await getDb()
    .select({ sales: sql<number>`count(*)`, taken: sql<number>`coalesce(sum(${orders.total}), 0)` })
    .from(orders)
    .where(and(eq(orders.channel, "pos"), gte(orders.createdAt, since)));
  return { sales: row?.sales ?? 0, taken: row?.taken ?? 0 };
}

export default async function PosPage() {
  await requireDashboard("/dashboard/pos");
  const { sales, taken } = await today();

  return (
    <>
      <PageHeader title="Till" description="Sell to whoever is standing in front of you." crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Till" }]} />
      <StatCards
        stats={[
          { label: "Sales today", value: sales, icon: ReceiptIcon },
          { label: "Taken today", value: taken.toLocaleString(undefined, { style: "currency", currency: "USD" }), icon: BanknoteIcon },
          { label: "Channel", value: "Counter", hint: "online orders come in through the API", icon: ShoppingBagIcon },
        ]}
      />
      <Till />
    </>
  );
}
