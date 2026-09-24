import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireDashboard } from "@/lib/dashboard";
import { timedSearch } from "@/lib/search";

export const metadata = { title: "Search" };

const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });

/** Full-text search across the catalogue, ranked, straight out of Postgres. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireDashboard("/dashboard/search");
  const term = (await searchParams).q ?? "";
  const { hits, ms } = await timedSearch(term);

  return (
    <>
      <PageHeader
        title="Search"
        description="Ranked full-text search over every product, out of Postgres."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Search" }]}
      />

      <form method="get" className="max-w-md">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput name="q" defaultValue={term} placeholder="lamp, walnut, licence…" aria-label="Search products" autoFocus />
        </InputGroup>
      </form>

      {term && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {hits.length} {hits.length === 1 ? "match" : "matches"} in {ms} ms
        </p>
      )}

      {term && hits.length === 0 ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing matches “{term}”</EmptyTitle>
            <EmptyDescription>Try a single word — the index is built from product names and descriptions.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hits.map((hit) => (
            <Card key={hit.id}>
              <CardContent className="flex flex-col gap-1 py-4">
                <span className="flex items-start justify-between gap-2">
                  <Link href={`/dashboard/products/${hit.id}`} className="font-medium hover:underline">
                    {hit.name}
                  </Link>
                  <Badge variant={hit.kind === "digital" ? "secondary" : "outline"}>{hit.kind}</Badge>
                </span>
                <span className="text-xs text-muted-foreground">{hit.sku}</span>
                <span className="mt-1 flex items-baseline justify-between">
                  <span className="font-semibold tabular-nums">{money(hit.price)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">rank {hit.rank.toFixed(3)}</span>
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
