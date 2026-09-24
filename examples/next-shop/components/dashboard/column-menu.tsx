"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hrefWith } from "./query";

export interface ColumnOption {
  key: string;
  label: string;
}

/**
 * Which columns the table shows. The choice goes in the URL (`?columns=name,email`)
 * rather than into storage, so a view someone sends you looks the way it looked to them.
 */
export function ColumnMenu({ columns, visible }: { columns: ColumnOption[]; visible: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams().toString());
  const shown = new Set(visible);

  const toggle = (key: string) => {
    const next = new Set(shown);
    if (!next.delete(key)) next.add(key);
    // Nothing selected would leave a table of empty rows; keep at least one column.
    if (next.size === 0) return;
    const all = columns.every((column) => next.has(column.key));
    router.push(hrefWith(pathname, params, { columns: all ? null : columns.filter((column) => next.has(column.key)).map((column) => column.key).join(",") }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Choose columns">
          <Columns3Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.key}
              checked={shown.has(column.key)}
              onCheckedChange={() => toggle(column.key)}
              onSelect={(event) => event.preventDefault()}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
