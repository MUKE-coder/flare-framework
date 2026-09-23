import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocalTime } from "@/components/dashboard/local-time";
import { StoreHeader } from "@/components/store/store-header";
import { currentAccount, customerForAccount, downloadName, money, orderForCustomer, productsByIds } from "@/lib/store";
import { storage } from "@/lib/storage";

export const metadata = { title: "Order" };

/** How long a download link on this page is good for. Re-issued every time it renders. */
const DOWNLOAD_HOURS = 24;

/**
 * One order, with the downloads it bought.
 *
 * The links are signed as the page renders rather than stored with the order: a link
 * that expires can always be replaced by opening this page again, while a link saved in
 * the database would be a permanent key to a private file.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await currentAccount();
  if (!account) redirect("/sign-in?next=/account/orders");

  const customer = await customerForAccount(account);
  const found = customer ? await orderForCustomer((await params).id, customer.id) : null;
  if (!found) notFound();
  const { order, lines } = found;

  const bought = await productsByIds(lines.map((line) => String(line.productId)));
  const downloads = await Promise.all(
    bought
      .filter((product) => product.kind === "digital" && product.downloadFile)
      .map(async (product) => ({
        name: product.name,
        url: await storage
          .createReadUrl({
            key: product.downloadFile as string,
            expiresIn: DOWNLOAD_HOURS * 3600,
            downloadAs: downloadName(product.name, product.downloadFile as string),
          })
          .catch(() => null),
      })),
  );

  return (
    <>
      <StoreHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/account/orders" className="text-sm text-muted-foreground hover:text-foreground">
          ← Your orders
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{order.reference}</h1>
          <Badge variant="secondary">{order.status}</Badge>
          <span className="text-sm text-muted-foreground">
            <LocalTime value={order.createdAt} />
          </span>
        </div>

        <Card className="mt-6">
          <CardContent className="flex flex-col gap-3">
            {lines.map((line) => (
              <div key={line.id} className="flex items-baseline justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{line.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {line.quantity} × {money(line.unitPrice)}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{money(line.quantity * line.unitPrice)}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-semibold tabular-nums">{money(order.total)}</span>
            </div>
          </CardContent>
        </Card>

        {downloads.length > 0 && (
          <Card className="mt-4">
            <CardContent className="flex flex-col gap-3">
              <h2 className="text-base font-medium">Your downloads</h2>
              <p className="text-xs text-muted-foreground">Each link is good for {DOWNLOAD_HOURS} hours. Come back here for a fresh one.</p>
              {downloads.map((download) =>
                download.url ? (
                  <Button key={download.name} variant="outline" className="justify-start" asChild>
                    <a href={download.url} download>
                      <DownloadIcon data-icon="inline-start" />
                      <span className="truncate">{download.name}</span>
                    </a>
                  </Button>
                ) : (
                  <p key={download.name} className="text-sm text-muted-foreground">
                    {download.name} — the file isn't ready yet. Get in touch and we'll sort it out.
                  </p>
                ),
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
