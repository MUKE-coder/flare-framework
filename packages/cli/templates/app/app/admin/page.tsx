import Link from "next/link";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { resourceIcon } from "@/components/admin/resource-icon";
import { adminPath, adminResources, adminStore } from "@/lib/admin";

/** Admin landing page: one card per resource with its record count. */
export default async function AdminPage() {
  const resources = adminResources();
  const counts = await Promise.all(
    resources.map(async (resource) => {
      const result = await adminStore(resource.name).list(new URLSearchParams({ perPage: "1" }));
      return result.ok ? result.data.meta.total : 0;
    }),
  );

  if (resources.length === 0) {
    return (
      <Empty className="rounded-lg border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No resources yet</EmptyTitle>
          <EmptyDescription>
            Generate one with <code>flare gen resource Contact --fields &quot;name:string, email:string&quot;</code>.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map((resource, index) => {
          const Icon = resourceIcon(resource.icon);
          return (
            <Card key={resource.name}>
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  <Icon className="size-4" />
                  {resource.pluralLabel}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{counts[index]!.toLocaleString()}</CardTitle>
                <CardAction>
                  <Button variant="ghost" size="icon" aria-label={`New ${resource.label.toLowerCase()}`} asChild>
                    <Link href={adminPath(resource, "new")}>
                      <PlusIcon />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <Button variant="link" className="h-auto p-0" asChild>
                  <Link href={adminPath(resource)}>
                    View {resource.pluralLabel.toLowerCase()}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
