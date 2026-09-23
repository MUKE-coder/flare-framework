import { storedFields, optionLabel, type Resource } from "@flaredev/core";
import { dashboardStore, recentCounts, recordCount, trend } from "@/lib/dashboard";
import { resourceIcon } from "./resource-icon";
import { StatCards, type Stat } from "./stat-card";

/**
 * The numbers above a resource's table: how many there are, how many are new, and how
 * they split across the resource's own status field.
 *
 * The split comes from the first enum field the descriptor marks as filterable, which
 * in practice is the status of the thing — a deal's stage, an invoice's state.
 */
export async function ResourceStats({ resource }: { resource: Resource }) {
  const [total, recent] = await Promise.all([recordCount(resource.name), recentCounts(resource.name)]);

  const stats: Stat[] = [
    {
      label: `Total ${resource.pluralLabel.toLowerCase()}`,
      value: total,
      icon: resourceIcon(resource.icon),
    },
    {
      label: "New this week",
      value: recent.current,
      change: trend(recent.current, recent.previous),
      hint: `${recent.previous.toLocaleString()} the week before`,
    },
  ];

  const statusField = storedFields(resource).find(([, def]) => def.kind === "enum" && def.filterable !== false);
  if (statusField && total > 0) {
    const [key, def] = statusField;
    if (def.kind === "enum") {
      const store = dashboardStore(resource.name);
      // Two options at most: a strip of eight cards is a wall, not a summary.
      const counts = await Promise.all(
        def.options.slice(0, 2).map(async (option) => {
          const result = await store.list(new URLSearchParams({ perPage: "1", [`filter[${key}]`]: option }));
          return { option, total: result.ok ? result.data.meta.total : 0 };
        }),
      );
      for (const { option, total: count } of counts) {
        stats.push({
          label: optionLabel(def, option),
          value: count,
          hint: total > 0 ? `${Math.round((count / total) * 100)}% of all` : undefined,
        });
      }
    }
  }

  return <StatCards stats={stats.slice(0, 4)} />;
}
