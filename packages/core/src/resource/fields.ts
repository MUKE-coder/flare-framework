/**
 * Field builders for resource descriptors.
 *
 * Every builder returns a plain, serializable object. The API layer, admin UI and
 * generator all read these objects at runtime, so changing a label or a validation
 * rule in a descriptor takes effect without re-running the generator. Only
 * storage-level changes (kind, nullability, uniqueness, relations) need a migration.
 */

export type FieldKind =
  | "string"
  | "text"
  | "int"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "multiselect"
  | "file"
  | "belongsTo"
  | "hasMany";

/** Options shared by every stored (non-hasMany) field. */
export interface CommonOptions<T> {
  label?: string;
  /** Required fields must be present on create and can't be null. Default true. */
  required?: boolean;
  unique?: boolean;
  /** Used when the field is omitted on create (also written as the column default). */
  default?: T;
  helpText?: string;
  placeholder?: string;
  /** Show as a column in list views. Default true for most kinds, false for long text. */
  list?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  /** Included in free-text search. Default true for string fields. */
  searchable?: boolean;
}

/**
 * What a string holds. Each format is still a text column; the format decides
 * validation, the admin input and how the value is shown.
 *
 * - email, url: validated addresses (url: http or https)
 * - tel: an international number, stored E.164 (`+256772123456`), entered with a country picker
 * - domain: a hostname such as `example.com`, stored lowercase
 * - country: an ISO 3166-1 alpha-2 code (`UG`), chosen from a searchable list
 * - color: a hex colour (`#f2541d`)
 * - slug: lowercase words joined by hyphens (`my-first-post`)
 */
export type StringFormat = "email" | "url" | "tel" | "domain" | "country" | "color" | "slug";
export const STRING_FORMATS: readonly StringFormat[] = ["email", "url", "tel", "domain", "country", "color", "slug"];

export interface StringOptions extends CommonOptions<string> {
  maxLength?: number;
  minLength?: number;
  format?: StringFormat;
  pattern?: string;
}
export interface TextOptions extends CommonOptions<string> {
  maxLength?: number;
  minLength?: number;
}
export interface NumberOptions extends CommonOptions<number> {
  min?: number;
  max?: number;
}
export type BooleanOptions = CommonOptions<boolean>;
export type DateOptions = CommonOptions<string>;
export interface EnumOptions<O extends string> extends CommonOptions<O> {
  /** Display labels per option value. */
  optionLabels?: Partial<Record<O, string>>;
  /** Admin input: a dropdown (default) or radio buttons (best for a few options). */
  widget?: "select" | "radio";
}
export interface MultiSelectOptions<O extends string> extends Omit<CommonOptions<O[]>, "unique"> {
  optionLabels?: Partial<Record<O, string>>;
  /** Fewest / most options that can be picked. A required field needs at least one. */
  minItems?: number;
  maxItems?: number;
}
export interface FileOptions extends CommonOptions<string> {
  /** Maximum upload size in bytes. Default 10 MiB. */
  maxBytes?: number;
}
export interface BelongsToOptions extends Omit<CommonOptions<string>, "default" | "unique"> {
  /** What happens to this record when the parent is deleted. Default "restrict". */
  onDelete?: "cascade" | "restrict" | "set null";
  unique?: boolean;
}
export interface HasManyOptions {
  label?: string;
  /** The belongsTo field on the related resource pointing back here. Default: camelCase of this resource's name. */
  foreignKey?: string;
}

type Req<O> = O extends { required: false } ? false : true;

interface Base<K extends FieldKind, R extends boolean> {
  kind: K;
  required: R;
}

export type StringField<R extends boolean = boolean> = Base<"string", R> & StringOptions;
export type TextField<R extends boolean = boolean> = Base<"text", R> & TextOptions;
export type IntField<R extends boolean = boolean> = Base<"int", R> & NumberOptions;
export type FloatField<R extends boolean = boolean> = Base<"float", R> & NumberOptions;
export type BooleanField<R extends boolean = boolean> = Base<"boolean", R> & BooleanOptions;
export type DateField<R extends boolean = boolean> = Base<"date", R> & DateOptions;
export type DateTimeField<R extends boolean = boolean> = Base<"datetime", R> & DateOptions;
export type EnumField<O extends string = string, R extends boolean = boolean> = Base<"enum", R> &
  EnumOptions<O> & { options: readonly O[] };
export type MultiSelectField<O extends string = string, R extends boolean = boolean> = Base<"multiselect", R> &
  MultiSelectOptions<O> & { options: readonly O[] };
export type FileField<R extends boolean = boolean> = Base<"file", R> &
  FileOptions & {
    /** Accepted categories from the `file:[image,pdf]` grammar. */
    accept: readonly FileCategory[];
  };
export type BelongsToField<R extends boolean = boolean> = Base<"belongsTo", R> &
  BelongsToOptions & {
    /** PascalCase name of the related resource. */
    target: string;
  };
export type HasManyField = { kind: "hasMany"; required: false; target: string } & HasManyOptions;

export type Field =
  | StringField
  | TextField
  | IntField
  | FloatField
  | BooleanField
  | DateField
  | DateTimeField
  | EnumField
  | MultiSelectField
  | FileField
  | BelongsToField
  | HasManyField;

export type StoredField = Exclude<Field, HasManyField>;

/** File categories usable in `file:[...]` and the MIME types each allows. */
export const FILE_CATEGORIES = {
  // For a field that holds whatever someone has: a drive, an attachment, a backup.
  // Nothing is checked beyond the size limit, so don't reach for it out of convenience.
  any: ["*/*"],
  image: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"],
  pdf: ["application/pdf"],
  video: ["video/*"],
  audio: ["audio/*"],
  text: ["text/plain"],
  csv: ["text/csv"],
  document: [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
  ],
  spreadsheet: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.spreadsheet",
  ],
  // Browsers disagree about what a .zip is — Windows sends x-zip-compressed — and an
  // archive field that refuses an ordinary zip is no use, so the aliases are listed too.
  archive: [
    "application/zip",
    "application/x-zip-compressed",
    "application/x-zip",
    "application/gzip",
    "application/x-gzip",
    "application/x-7z-compressed",
    "application/vnd.rar",
    "application/x-rar-compressed",
  ],
} as const;

export type FileCategory = keyof typeof FILE_CATEGORIES;

export function mimeTypesFor(accept: readonly FileCategory[]): string[] {
  return [...new Set(accept.flatMap((category) => FILE_CATEGORIES[category]))];
}

/** Upload limit for file fields without an explicit `maxBytes` (10 MB). */
export const DEFAULT_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** The upload limit a file field enforces. */
export const fileMaxBytes = (field: { maxBytes?: number }) => field.maxBytes ?? DEFAULT_FILE_MAX_BYTES;

function build<K extends FieldKind, O extends object>(kind: K, options: O | undefined, extra: object = {}) {
  return { kind, ...extra, ...options, required: (options as { required?: boolean } | undefined)?.required !== false };
}

export const field = {
  string: <const O extends StringOptions>(options?: O) => build("string", options) as StringField<Req<O>> & O,
  text: <const O extends TextOptions>(options?: O) =>
    build("text", options, { list: false, searchable: false }) as TextField<Req<O>> & O,
  int: <const O extends NumberOptions>(options?: O) => build("int", options) as IntField<Req<O>> & O,
  float: <const O extends NumberOptions>(options?: O) => build("float", options) as FloatField<Req<O>> & O,
  boolean: <const O extends BooleanOptions>(options?: O) => build("boolean", options) as BooleanField<Req<O>> & O,
  date: <const O extends DateOptions>(options?: O) => build("date", options) as DateField<Req<O>> & O,
  datetime: <const O extends DateOptions>(options?: O) => build("datetime", options) as DateTimeField<Req<O>> & O,
  enum: <const V extends readonly [string, ...string[]], const O extends EnumOptions<V[number]>>(values: V, options?: O) =>
    build("enum", options, { options: values }) as EnumField<V[number], Req<O>> & O,
  /** One of a list, picked from a dropdown. The same as `enum`. */
  select: <const V extends readonly [string, ...string[]], const O extends EnumOptions<V[number]>>(values: V, options?: O) =>
    build("enum", options, { options: values, widget: "select" }) as EnumField<V[number], Req<O>> & O,
  /** One of a list, picked with radio buttons. Stored like `enum`. */
  radio: <const V extends readonly [string, ...string[]], const O extends EnumOptions<V[number]>>(values: V, options?: O) =>
    build("enum", options, { options: values, widget: "radio" }) as EnumField<V[number], Req<O>> & O,
  /** Any number of a list, picked with checkboxes. Stored as a JSON array. */
  multiselect: <const V extends readonly [string, ...string[]], const O extends MultiSelectOptions<V[number]>>(values: V, options?: O) =>
    build("multiselect", options, { options: values, sortable: false }) as MultiSelectField<V[number], Req<O>> & O,
  email: <const O extends Omit<StringOptions, "format">>(options?: O) => build("string", options, { format: "email" }) as StringField<Req<O>> & O,
  url: <const O extends Omit<StringOptions, "format">>(options?: O) => build("string", options, { format: "url" }) as StringField<Req<O>> & O,
  tel: <const O extends Omit<StringOptions, "format">>(options?: O) => build("string", options, { format: "tel" }) as StringField<Req<O>> & O,
  domain: <const O extends Omit<StringOptions, "format">>(options?: O) => build("string", options, { format: "domain" }) as StringField<Req<O>> & O,
  country: <const O extends Omit<StringOptions, "format">>(options?: O) => build("string", options, { format: "country" }) as StringField<Req<O>> & O,
  color: <const O extends Omit<StringOptions, "format">>(options?: O) => build("string", options, { format: "color" }) as StringField<Req<O>> & O,
  slug: <const O extends Omit<StringOptions, "format">>(options?: O) => build("string", options, { format: "slug" }) as StringField<Req<O>> & O,
  file: <const O extends FileOptions>(accept: readonly FileCategory[], options?: O) =>
    build("file", options, { accept, list: false, sortable: false }) as FileField<Req<O>> & O,
  belongsTo: <const O extends BelongsToOptions>(target: string, options?: O) =>
    build("belongsTo", options, { target }) as BelongsToField<Req<O>> & O,
  hasMany: <const O extends HasManyOptions>(target: string, options?: O) =>
    ({ kind: "hasMany", target, ...options, required: false }) as HasManyField & O,
};

// ---------------------------------------------------------------------------
// Type inference

export type FieldValue<F> = F extends { kind: "int" | "float" }
  ? number
  : F extends { kind: "boolean" }
    ? boolean
    : F extends { kind: "enum"; options: readonly (infer O)[] }
      ? O
      : F extends { kind: "multiselect"; options: readonly (infer M)[] }
        ? M[]
      : F extends { kind: "hasMany" }
        ? never
        : string;

type StoredKeys<Fields> = { [K in keyof Fields]: Fields[K] extends { kind: "hasMany" } ? never : K }[keyof Fields];
type RequiredOnCreate<Fields> = {
  [K in StoredKeys<Fields>]: Fields[K] extends { required: true } ? (Fields[K] extends { default: unknown } ? never : K) : never;
}[StoredKeys<Fields>];
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Body accepted when creating a record. */
export type CreateInput<Fields> = Simplify<
  { [K in RequiredOnCreate<Fields>]: FieldValue<Fields[K]> } & {
    [K in Exclude<StoredKeys<Fields>, RequiredOnCreate<Fields>>]?: Fields[K] extends { required: true }
      ? FieldValue<Fields[K]>
      : FieldValue<Fields[K]> | null;
  }
>;

/** Body accepted when updating a record (PATCH semantics: every field optional). */
export type UpdateInput<Fields> = Partial<CreateInput<Fields>>;

/** A record as returned by the JSON API. */
export type RecordOf<Fields> = Simplify<
  { id: string; createdAt: string; updatedAt: string } & {
    [K in StoredKeys<Fields>]: Fields[K] extends { required: true } ? FieldValue<Fields[K]> : FieldValue<Fields[K]> | null;
  }
>;
