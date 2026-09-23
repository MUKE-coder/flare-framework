import { STRING_FORMATS, type CreateInput, type Field, type RecordOf, type StoredField, type UpdateInput } from "./fields.js";
import { camelCase, humanize, kebabCase, pascalCase, pluralize, snakeCase } from "./naming.js";

export const RESERVED_FIELD_NAMES = ["id", "createdAt", "updatedAt"] as const;

type FieldKey<Fields> = Extract<keyof Fields, string>;

export interface ResourceConfig<Fields extends Record<string, Field>> {
  /** PascalCase singular name, e.g. "Contact", "OrderItem". */
  name: string;
  fields: Fields;
  /** Database table. Default: snake_case plural ("order_items"). */
  table?: string;
  /** URL segment for the API and admin. Default: kebab-case plural ("order-items"). */
  slug?: string;
  label?: string;
  pluralLabel?: string;
  /** lucide-react icon name for navigation, e.g. "users". Default: a generic document icon. */
  icon?: string;
  /**
   * Heading this resource sits under in the dashboard sidebar, e.g. "Sales". Resources
   * without one share a "Resources" group, which is all a small app needs.
   */
  group?: string;
  /** Field used to represent a record in lists and relation pickers. Default: first string field. */
  titleField?: FieldKey<Fields>;
  defaultSort?: { field: FieldKey<Fields> | "createdAt" | "updatedAt"; direction: "asc" | "desc" };
  /** Page size for list endpoints and tables. Default 25. */
  perPage?: number;
  /**
   * Your logic, beside the fields it belongs to. Every write — the REST API, the
   * dashboard's forms, a seed, an import — goes through the same store, so a hook here
   * runs for all of them, and there's one place to read to know what happens on a write.
   */
  hooks?: ResourceHooks;
  /**
   * Values worked out from the record rather than stored: a total from a quantity and a
   * price, a full name from two columns. They're added to every record the API and the
   * dashboard return, and there's no column and no migration behind them.
   */
  computed?: Record<string, (record: Record<string, unknown>) => unknown>;
}

/** What a hook is handed: the request's own database and who is making it. */
export interface HookContext {
  /** Drizzle, already bound to this request. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  /** The signed-in user, when the write came from somewhere that has one. */
  user?: { id: string; email: string; role?: string | null } | null;
}

export interface ResourceHooks {
  /**
   * Change or check the input before it's written. Return the input (changed or not), or
   * throw to refuse. It runs *before* validation, so it can fill in a field the caller
   * couldn't supply — an order number, a slug — and what it returns is then validated.
   */
  beforeCreate?: (input: Record<string, unknown>, context: HookContext) => Promise<Record<string, unknown>> | Record<string, unknown>;
  afterCreate?: (record: Record<string, unknown>, context: HookContext) => Promise<void> | void;
  beforeUpdate?: (
    input: Record<string, unknown>,
    context: HookContext & { id: string; current: Record<string, unknown> | null },
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  afterUpdate?: (record: Record<string, unknown>, context: HookContext & { previous: Record<string, unknown> | null }) => Promise<void> | void;
  /** Throw to refuse the delete. */
  beforeDelete?: (context: HookContext & { id: string; current: Record<string, unknown> | null }) => Promise<void> | void;
  afterDelete?: (context: HookContext & { id: string }) => Promise<void> | void;
}

export interface Resource<Fields extends Record<string, Field> = Record<string, Field>> {
  name: string;
  table: string;
  slug: string;
  label: string;
  pluralLabel: string;
  icon: string | undefined;
  group: string | undefined;
  hooks: ResourceHooks;
  computed: Record<string, (record: Record<string, unknown>) => unknown>;
  titleField: string;
  defaultSort: { field: string; direction: "asc" | "desc" };
  perPage: number;
  /** Fields with labels filled in. */
  fields: Fields & Record<string, Field & { label: string }>;
  /** Type-only helpers: `typeof contact.$types.record`. Always undefined at runtime. */
  $types: { create: CreateInput<Fields>; update: UpdateInput<Fields>; record: RecordOf<Fields> };
}

export class ResourceDefinitionError extends Error {
  constructor(resource: string, message: string) {
    super(`Resource "${resource}": ${message}`);
    this.name = "ResourceDefinitionError";
  }
}

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

/** Label for a field key; belongsTo keys drop their "Id" suffix ("companyId" → "Company"). */
export function defaultFieldLabel(key: string, field: Field): string {
  return humanize(field.kind === "belongsTo" ? key.replace(/Id$/, "") : key);
}

export function defineResource<const Fields extends Record<string, Field>>(config: ResourceConfig<Fields>): Resource<Fields> {
  const name = config.name;
  const fail = (message: string): never => {
    throw new ResourceDefinitionError(name, message);
  };

  if (!/^[A-Z][A-Za-z0-9]*$/.test(name) || pascalCase(name) !== name) fail("name must be PascalCase, e.g. \"OrderItem\".");

  const entries = Object.entries(config.fields);
  if (entries.length === 0) fail("define at least one field.");

  const fields: Record<string, Field & { label: string }> = {};
  for (const [key, def] of entries) {
    if (!IDENTIFIER.test(key)) fail(`field "${key}" must be camelCase (letters and digits, starting lowercase).`);
    if ((RESERVED_FIELD_NAMES as readonly string[]).includes(key)) fail(`"${key}" is added automatically; don't declare it.`);
    if (def.kind === "enum") {
      if (def.options.length === 0) fail(`enum field "${key}" needs at least one option.`);
      if (new Set(def.options).size !== def.options.length) fail(`enum field "${key}" has duplicate options.`);
      if (def.default !== undefined && !def.options.includes(def.default)) fail(`default of "${key}" isn't one of its options.`);
    }
    if (def.kind === "multiselect") {
      if (def.options.length === 0) fail(`multiselect field "${key}" needs at least one option.`);
      if (new Set(def.options).size !== def.options.length) fail(`multiselect field "${key}" has duplicate options.`);
      if (def.default?.some((value) => !def.options.includes(value))) fail(`default of "${key}" includes a value that isn't one of its options.`);
      if (def.minItems !== undefined && def.maxItems !== undefined && def.minItems > def.maxItems) fail(`"${key}": minItems is larger than maxItems.`);
    }
    if (def.kind === "string" && def.format && !STRING_FORMATS.includes(def.format)) {
      fail(`field "${key}" has unknown format "${def.format}". Formats: ${STRING_FORMATS.join(", ")}.`);
    }
    if (def.kind === "belongsTo" && !key.endsWith("Id")) fail(`belongsTo field "${key}" must end in "Id", e.g. "${camelCase(def.target)}Id".`);
    if ((def.kind === "belongsTo" || def.kind === "hasMany") && pascalCase(def.target) !== def.target) {
      fail(`relation "${key}" must target a PascalCase resource name.`);
    }
    if (def.kind === "belongsTo" && def.onDelete === "set null" && def.required) {
      fail(`"${key}" uses onDelete "set null" but is required; mark it required: false.`);
    }
    if (def.kind === "file" && def.accept.length === 0) fail(`file field "${key}" must accept at least one category.`);
    fields[key] = { ...def, label: def.label ?? defaultFieldLabel(key, def) };
  }

  const stored = entries.filter(([, def]) => def.kind !== "hasMany") as [string, StoredField][];
  const titleField =
    config.titleField ?? stored.find(([, def]) => def.kind === "string" && !["tel", "country", "color"].includes(def.format ?? ""))?.[0] ?? stored.find(([, def]) => def.kind === "string")?.[0] ?? stored[0]?.[0] ?? "id";
  if (config.titleField && !stored.some(([key]) => key === config.titleField)) {
    fail(`titleField "${config.titleField}" isn't a stored field.`);
  }

  const defaultSort = config.defaultSort ?? { field: "createdAt", direction: "desc" as const };
  if (!["createdAt", "updatedAt"].includes(defaultSort.field) && !stored.some(([key]) => key === defaultSort.field)) {
    fail(`defaultSort field "${defaultSort.field}" isn't a stored field.`);
  }

  const perPage = config.perPage ?? 25;
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) fail("perPage must be an integer from 1 to 100.");

  const pluralName = pluralize(name);
  return {
    name,
    table: config.table ?? snakeCase(pluralName),
    slug: config.slug ?? kebabCase(pluralName),
    label: config.label ?? humanize(name),
    pluralLabel: config.pluralLabel ?? humanize(pluralName),
    icon: config.icon,
    group: config.group,
    hooks: config.hooks ?? {},
    computed: config.computed ?? {},
    titleField,
    defaultSort,
    perPage,
    fields: fields as Resource<Fields>["fields"],
    $types: undefined as unknown as Resource<Fields>["$types"],
  };
}

/** Stored (column-backed) fields of a resource, in declaration order. */
export function storedFields(resource: Resource): [string, StoredField & { label: string }][] {
  return Object.entries(resource.fields).filter(([, def]) => def.kind !== "hasMany") as [
    string,
    StoredField & { label: string },
  ][];
}

/** Database column name for a field key ("companyId" → "company_id"). */
export const columnName = (key: string) => snakeCase(key);
