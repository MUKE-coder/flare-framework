import { storedFields, optionLabel, type Resource } from "@flaredev/core";
import { resourceStats, trend } from "@/lib/dashboard";
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
  // The status split is asked for up front so the totals, the trend and the split all
  // come from the one grouped query rather than three.
  const statusField = storedFields(resource).find(([, def]) => def.kind === "enum" && def.filterable !== false);
  const { total, current, previous, values } = await resourceStats(resource.name, statusField?.[0]);

  const stats: Stat[] = [
    {
      label: `Total ${resource.pluralLabel.toLowerCase()}`,
      value: total,
      icon: resourceIcon(resource.icon),
    },
    {
      label: "New this week",
      value: current,
      change: trend(current, previous),
      hint: `${previous.toLocaleString()} the week before`,
    },
  ];

  if (statusField && total > 0) {
    const [, def] = statusField;
    if (def.kind === "enum") {
      // Two options at most: a strip of eight cards is a wall, not a summary.
      for (const option of def.options.slice(0, 2)) {
        const value = values[option] ?? 0;
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
