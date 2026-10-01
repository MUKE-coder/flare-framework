import Link from "next/link";
import { ListIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Switch a `softDelete` resource's list between its records and its trash.
 *
 * Two links rather than a control with state: the view is `?deleted=only` in the URL, like
 * `?page` and `?sort`, so it is linkable, it survives a reload, and the back button means
 * what it looks like it means. Dropping the other parameters is deliberate — a filter or a
 * page number from the live list rarely makes sense against the trash.
 */
export function TrashToggle({ basePath, viewingTrash }: { basePath: string; viewingTrash: boolean }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Which records to show">
      <Button asChild size="sm" variant={viewingTrash ? "ghost" : "secondary"}>
        <Link href={basePath} aria-current={viewingTrash ? undefined : "page"}>
          <ListIcon data-icon="inline-start" />
          Records
        </Link>
      </Button>
      <Button asChild size="sm" variant={viewingTrash ? "secondary" : "ghost"}>
        <Link href={`${basePath}?deleted=only`} aria-current={viewingTrash ? "page" : undefined}>
          <Trash2Icon data-icon="inline-start" />
          Trash
        </Link>
      </Button>
    </div>
  );
}
