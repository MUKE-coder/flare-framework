/**
 * Finding the statements in a migration that throw data away.
 *
 * Prisma works out a migration by diffing your schema against the database, and it cannot
 * see anything the schema does not describe. A GIN index, a generated column, a trigger or
 * a partial index written by hand is invisible to it — so `prisma migrate dev` decides the
 * database has drifted and offers to drop them. On a database that matters that is not a
 * prompt anyone should be answering at speed.
 *
 * So `flare gen migration` on the Next.js stack writes the migration without applying it,
 * runs it past this, and refuses when something destructive is in there. The migration is
 * still written: the answer is usually to edit it, not to abandon it.
 */

export interface DestructiveStatement {
  /** The statement, as written, trimmed to one line. */
  statement: string;
  /** What it destroys, for the message. */
  kind: string;
  /** 1-indexed line in the migration file. */
  line: number;
}

/**
 * SQL with comments and string literals removed, so a scan reads statements only.
 *
 * Prisma annotates its own output with `-- DropTable` and similar, and a column default or
 * a seeded row can contain the word DROP. Neither is a statement, and both would otherwise
 * be reported.
 */
function stripNoise(sql: string): string {
  let out = "";
  let index = 0;
  while (index < sql.length) {
    const two = sql.slice(index, index + 2);
    if (two === "--") {
      const end = sql.indexOf("\n", index);
      const stop = end === -1 ? sql.length : end;
      // Spaces, not nothing: every branch here keeps the output the same length as the
      // input, so an offset into the stripped text is also an offset into the original.
      // That is what lets the scan ignore a quoted identifier while the message still
      // names it. The newline itself is left for the line count.
      out += " ".repeat(stop - index);
      index = stop;
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", index + 2);
      const skipped = sql.slice(index, end === -1 ? sql.length : end + 2);
      out += skipped.replaceAll(/[^\n]/g, " ");
      index = end === -1 ? sql.length : end + 2;
      continue;
    }
    const char = sql[index]!;
    if (char === "'" || char === '"' || char === "`") {
      // Walk to the matching quote, doubling being the SQL escape.
      let at = index + 1;
      while (at < sql.length) {
        if (sql[at] === char) {
          if (sql[at + 1] === char) at += 2;
          else break;
        } else at += 1;
      }
      const literal = sql.slice(index, Math.min(at + 1, sql.length));
      out += literal.replaceAll(/[^\n]/g, " ");
      index = at + 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * What each pattern destroys. Ordered: the first match wins, so `DROP COLUMN` is reported
 * as a column rather than as the `ALTER TABLE` around it.
 */
const PATTERNS: [RegExp, string][] = [
  [/\bDROP\s+COLUMN\b/i, "a column, and the values in it"],
  [/\bDROP\s+TABLE\b/i, "a table, and every row in it"],
  [/\bTRUNCATE\b/i, "every row in a table"],
  [/\bDROP\s+(?:MATERIALIZED\s+)?VIEW\b/i, "a view"],
  [/\bDROP\s+INDEX\b/i, "an index — if it was written by hand, Prisma cannot recreate it"],
  [/\bDROP\s+TRIGGER\b/i, "a trigger — Prisma does not know about it and will not put it back"],
  [/\bDROP\s+FUNCTION\b/i, "a function"],
  [/\bDROP\s+CONSTRAINT\b/i, "a constraint"],
  [/\bDROP\s+TYPE\b/i, "a type"],
  [/\bDROP\s+SEQUENCE\b/i, "a sequence"],
  [/\bDROP\s+SCHEMA\b/i, "a schema, and everything in it"],
  [/\bDROP\s+DATABASE\b/i, "the database"],
];

/**
 * The destructive statements in a migration, in the order they would run.
 *
 * Split on semicolons at statement level. Good enough for migration SQL, which is a list
 * of statements rather than a program: a semicolon inside a literal is already gone by the
 * time this runs, and dollar-quoted function bodies are the one case this would misread —
 * a `DROP` inside one is reported, which errs the right way.
 */
export function destructiveStatements(sql: string): DestructiveStatement[] {
  const cleaned = stripNoise(sql);
  const found: DestructiveStatement[] = [];
  let start = 0;

  for (let index = 0; index <= cleaned.length; index += 1) {
    if (index !== cleaned.length && cleaned[index] !== ";") continue;
    const statement = cleaned.slice(start, index);
    const trimmed = statement.trim();
    const from = start;
    start = index + 1;
    if (!trimmed) continue;

    // Matched against the stripped text, so a comment or a string literal that happens to
    // say "drop table" is not mistaken for a statement.
    const match = PATTERNS.find(([pattern]) => pattern.test(trimmed));
    if (!match) continue;

    // Reported from the original, so the message names the table rather than blanking it:
    // in Postgres "orders" is an identifier, and it is the useful half of the line.
    const offset = from + statement.search(/\S/);
    found.push({
      statement: sql.slice(offset, index).trim().replaceAll(/\s+/g, " ").slice(0, 160),
      kind: match[1],
      line: cleaned.slice(0, offset).split("\n").length,
    });
  }
  return found;
}

/** Whether a migration would throw anything away. */
export const isDestructive = (sql: string): boolean => destructiveStatements(sql).length > 0;
