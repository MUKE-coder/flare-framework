/**
 * Turning an enum option into a Prisma enum member name, and back.
 *
 * In core rather than in the CLI because three places need the same rule and they must
 * not drift: the Prisma schema generator writes the members, the seed writer writes
 * values through them, and the app's own Prisma store has to translate in both
 * directions at runtime.
 *
 * A Prisma enum member has to be an identifier, so an option that is not one is renamed
 * and the real value is kept with `@map`. That mapping applies to the database column,
 * not to the client: Prisma's generated client speaks member names, so `A+` stored in
 * Postgres arrives in JavaScript as `A_2b`. Translating at the store boundary is what
 * keeps that out of the rest of the app — the point of the exercise is that the user
 * sees `A+`.
 */

/** Characters a Prisma enum member may contain as-is. */
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

/**
 * The identifier a Prisma enum member gets. `in-progress` can't be one, so it becomes
 * `in_progress`, and `A+` becomes `A_2b`, each with the real value in `@map`.
 *
 * Anything going through the Prisma client — `createMany` in a seed, a `where` clause —
 * has to use this name rather than the value stored in the column, so it is exported
 * and shared rather than written twice.
 *
 * `-` and a space become `_` rather than `_2d` and `_20`. That is not the tidiest rule,
 * but it is the right one: both were reachable long before the rest of the punctuation
 * was — `-` through the field grammar, a space through a hand-written descriptor — and
 * escaping them now would quietly rename `in_progress` in every schema already
 * generated, breaking every `where` clause written against it.
 *
 * Everything else is escaped by code point, which is what stops two options flattening
 * onto one member: `A+` and `A-` both became `A_` before this, and a Prisma schema that
 * declares the same member twice does not generate at all. The separators can still
 * collide with each other (`in progress` against `in-progress`), so callers check with
 * `enumMemberCollision` rather than trusting this to be injective.
 */
export function prismaEnumMember(option: string): string {
  let member = "";
  for (const char of option) {
    if (IDENTIFIER_CHAR.test(char)) member += char;
    else if (char === "-" || char === " ") member += "_";
    else member += `_${char.codePointAt(0)!.toString(16)}`;
  }
  return /^\d/.test(member) ? `v_${member}` : member;
}

/**
 * The first pair of options that would end up as the same member name, if there is one.
 *
 * Escaping by code point rules out the collisions that come up in practice, but not all
 * of them: `in progress` and `in-progress` both fold to `in_progress`, an option spelled
 * literally `A_2b` collides with `A+`, and `A_` with `A-`. Rare, and worth catching
 * anyway — the alternative is a Prisma schema that declares one member twice and fails to
 * generate, with an error that says nothing about which two options caused it.
 */
export function enumMemberCollision(options: readonly string[]): { a: string; b: string; member: string } | undefined {
  const seen = new Map<string, string>();
  for (const option of options) {
    const member = prismaEnumMember(option);
    const first = seen.get(member);
    if (first !== undefined) return { a: first, b: option, member };
    seen.set(member, option);
  }
  return undefined;
}

/**
 * The two lookups a store needs to translate a resource's enum values, by field.
 *
 * Built once per resource rather than per row. `toMember` is used on the way in — to
 * Prisma — and `toValue` on the way out; a field whose options are all identifiers
 * already is left out of both, so the common case costs nothing.
 */
export interface EnumTranslation {
  toMember: Record<string, string>;
  toValue: Record<string, string>;
}

/**
 * Translation tables for every enum field whose options are not already identifiers.
 *
 * `fields` is the resource's stored fields, as `storedFields()` gives them. Taking that
 * rather than a `Resource` keeps this usable from a store that was handed a descriptor
 * and from the generator, which works field by field.
 */
export function enumTranslations(fields: Iterable<readonly [string, { kind: string; options?: readonly string[] }]>): Record<string, EnumTranslation> {
  const out: Record<string, EnumTranslation> = {};
  for (const [key, def] of fields) {
    // Only `enum` becomes a Prisma enum. A multiselect is a Postgres `String[]` and
    // stores its options verbatim, so it needs no translation.
    if (def.kind !== "enum") continue;
    const options = def.options ?? [];
    // Nothing to translate when every option is already a legal member name, which is
    // the usual case: "draft", "published".
    if (options.every((option) => prismaEnumMember(option) === option)) continue;
    const toMember: Record<string, string> = {};
    const toValue: Record<string, string> = {};
    for (const option of options) {
      const member = prismaEnumMember(option);
      toMember[option] = member;
      toValue[member] = option;
    }
    out[key] = { toMember, toValue };
  }
  return out;
}
