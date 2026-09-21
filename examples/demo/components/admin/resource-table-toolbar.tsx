"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { optionLabel, storedFields, type Resource } from "@flaredev/core";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hrefWith } from "./query";

const ALL = "__all__";

/** Search box and enum/boolean filters for ResourceTable; all state goes into the URL. */
export function ResourceTableToolbar({ resource }: { resource: Resource }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams().toString());
  const [q, setQ] = useState(params.get("q") ?? "");

  const fields = storedFields(resource);
  const searchable = fields.some(([, def]) => def.searchable ?? def.kind === "string");
  // Relation filters need a lookup UI; the toolbar offers the ones with fixed options.
  const filters = fields.filter(([, def]) => (def.filterable ?? ["enum", "boolean"].includes(def.kind)) && ["enum", "boolean"].includes(def.kind));
  const hasActive = params.has("q") || [...params.keys()].some((key) => key.startsWith("filter["));

  const go = (changes: Record<string, string | null>) => router.push(hrefWith(pathname, params, changes));

  function onSearch(event: FormEvent) {
    event.preventDefault();
    go({ q: q.trim() || null });
  }

  if (!searchable && filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {searchable && (
        <form onSubmit={onSearch} role="search" className="w-full sm:w-72">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={`Search ${resource.pluralLabel.toLowerCase()}…`}
              aria-label={`Search ${resource.pluralLabel.toLowerCase()}`}
            />
          </InputGroup>
        </form>
      )}

      {filters.map(([key, def]) => {
        const param = `filter[${key}]`;
        const options = def.kind === "enum" ? def.options.map((value) => ({ value, label: optionLabel(def, value) })) : [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ];
        return (
          <Select key={key} value={params.get(param) ?? ALL} onValueChange={(value) => go({ [param]: value === ALL ? null : value })}>
            <SelectTrigger className="min-w-36" aria-label={`Filter by ${def.label}`}>
              <span className="text-muted-foreground">{def.label}:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>Any</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        );
      })}

      {hasActive && (
        <Button
          variant="ghost"
          onClick={() => {
            setQ("");
            router.push(pathname);
          }}
        >
          <XIcon data-icon="inline-start" />
          Clear
        </Button>
      )}
    </div>
  );
}
