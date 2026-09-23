import { storedFields, optionLabel, type Resource } from "@flaredev/core";
import { recentCounts, recordCount, trend, valueCounts } from "@/lib/dashboard";
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
      const counts = await valueCounts(resource.name, key);
      // Two options at most: a strip of eight cards is a wall, not a summary.
      for (const option of def.options.slice(0, 2)) {
        const value = counts[option] ?? 0;
        stats.push({
          label: optionLabel(def, option),
          value,
          hint: `${Math.round((value / total) * 100)}% of all`,
        });
      }
    }
  }

  return <StatCards stats={stats.slice(0, 4)} />;
}
