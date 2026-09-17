import { columnName, storedFields, type Resource } from "./define.js";
import { camelCase } from "./naming.js";

export interface BelongsToRelation {
  /** Field key on this resource, e.g. "companyId". */
  key: string;
  /** Relation accessor name, e.g. "company". */
  name: string;
  target: string;
  required: boolean;
  onDelete: "cascade" | "restrict" | "set null";
  /** Stable name shared by both sides (Drizzle `relationName`). */
  relationName: string;
}

export interface HasManyRelation {
  key: string;
  target: string;
  /** belongsTo key on the target pointing back here. */
  foreignKey: string;
  relationName: string;
}

export interface ResourceRelations {
  belongsTo: BelongsToRelation[];
  hasMany: HasManyRelation[];
}

export interface RelationGraph {
  byResource: Record<string, ResourceRelations>;
  /** hasMany declarations whose target resource doesn't exist yet. */
  pending: { resource: string; key: string; target: string }[];
}

export class RelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelationError";
  }
}

const relationNameFor = (table: string, key: string) => `${table}_${columnName(key)}`;

/**
 * Resolve belongsTo/hasMany across all resources. Throws for belongsTo targets that
 * don't exist and for hasMany declarations without a matching belongsTo on the target.
 */
export function relationGraph(resources: readonly Resource[]): RelationGraph {
  const byName = new Map(resources.map((resource) => [resource.name, resource]));
  const graph: RelationGraph = { byResource: {}, pending: [] };

  for (const resource of resources) {
    const relations: ResourceRelations = { belongsTo: [], hasMany: [] };
    for (const [key, def] of storedFields(resource)) {
      if (def.kind !== "belongsTo") continue;
      if (!byName.has(def.target)) {
        throw new RelationError(`${resource.name}.${key} belongs to "${def.target}", but there is no ${def.target} resource.`);
      }
      relations.belongsTo.push({
        key,
        name: key.replace(/Id$/, ""),
        target: def.target,
        required: def.required,
        onDelete: def.onDelete ?? "restrict",
        relationName: relationNameFor(resource.table, key),
      });
    }
    graph.byResource[resource.name] = relations;
  }

  for (const resource of resources) {
    for (const [key, def] of Object.entries(resource.fields)) {
      if (def.kind !== "hasMany") continue;
      const target = byName.get(def.target);
      if (!target) {
        graph.pending.push({ resource: resource.name, key, target: def.target });
        continue;
      }
      const foreignKey = def.foreignKey ?? `${camelCase(resource.name)}Id`;
      const back = graph.byResource[target.name]!.belongsTo.find((relation) => relation.key === foreignKey);
      if (!back || back.target !== resource.name) {
        throw new RelationError(
          `${resource.name}.${key} is hasMany(${target.name}), but ${target.name} has no ${foreignKey}: belongsTo(${resource.name}) field. ` +
            `Add it to ${target.name}, or set foreignKey to the field that points back.`,
        );
      }
      graph.byResource[resource.name]!.hasMany.push({ key, target: target.name, foreignKey, relationName: back.relationName });
    }
  }

  // Relational query results put columns and relations on one object, so names must not collide.
  for (const resource of resources) {
    const { belongsTo, hasMany } = graph.byResource[resource.name]!;
    const taken = new Set(Object.keys(resource.fields));
    for (const { key, name } of belongsTo) {
      if (taken.has(name)) {
        throw new RelationError(`${resource.name}.${key} exposes relation "${name}", which collides with the ${resource.name}.${name} field. Rename one of them.`);
      }
      taken.add(name);
    }
    for (const { key } of hasMany) {
      if (belongsTo.some((relation) => relation.name === key)) {
        throw new RelationError(`${resource.name}.${key} collides with a belongsTo relation of the same name.`);
      }
    }
  }

  return graph;
}
