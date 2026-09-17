/**
 * Derive a down migration from up SQL (as written by drizzle-kit or by hand).
 * Only statements with an exact, lossless inverse are reversed; anything else
 * (table rebuilds, data changes, drops) makes the migration irreversible, and the
 * developer writes `migrations/down/<name>.sql` instead.
 */

export type DownResult = { reversible: true; sql: string } | { reversible: false; reason: string };

const IDENT = "(`[^`]+`|\"[^\"]+\"|\\[[^\\]]+\\]|[A-Za-z_][\\w$]*)";

/** Split on drizzle-kit breakpoints and top-level semicolons; drop comments and blanks. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  for (const chunk of sql.split("--> statement-breakpoint")) {
    let current = "";
    let quote: string | null = null;
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i]!;
      if (quote) {
        current += char;
        if (char === quote) quote = null;
        continue;
      }
      if (char === "-" && chunk[i + 1] === "-") {
        const end = chunk.indexOf("\n", i);
        i = end === -1 ? chunk.length : end;
        current += "\n";
        continue;
      }
      if (char === "'" || char === '"' || char === "`") quote = char;
      if (char === ";") {
        statements.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    statements.push(current);
  }
  return statements.map((statement) => statement.trim()).filter(Boolean);
}

function inverse(statement: string): string | null {
  const s = statement.replace(/\s+/g, " ").trim();
  let m: RegExpExecArray | null;

  if ((m = new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?${IDENT}`, "i").exec(s))) return `DROP TABLE IF EXISTS ${m[1]};`;
  if ((m = new RegExp(`^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?${IDENT}`, "i").exec(s))) return `DROP INDEX IF EXISTS ${m[1]};`;
  if ((m = new RegExp(`^CREATE VIEW (?:IF NOT EXISTS )?${IDENT}`, "i").exec(s))) return `DROP VIEW IF EXISTS ${m[1]};`;
  if ((m = new RegExp(`^CREATE TRIGGER (?:IF NOT EXISTS )?${IDENT}`, "i").exec(s))) return `DROP TRIGGER IF EXISTS ${m[1]};`;
  if ((m = new RegExp(`^ALTER TABLE ${IDENT} RENAME TO ${IDENT}$`, "i").exec(s))) return `ALTER TABLE ${m[2]} RENAME TO ${m[1]};`;
  if ((m = new RegExp(`^ALTER TABLE ${IDENT} RENAME COLUMN ${IDENT} TO ${IDENT}$`, "i").exec(s))) {
    return `ALTER TABLE ${m[1]} RENAME COLUMN ${m[3]} TO ${m[2]};`;
  }
  // SQLite can't drop a column that has a REFERENCES/UNIQUE/PRIMARY KEY constraint.
  if ((m = new RegExp(`^ALTER TABLE ${IDENT} ADD (?:COLUMN )?${IDENT}(.*)$`, "i").exec(s))) {
    if (/\b(REFERENCES|UNIQUE|PRIMARY KEY)\b/i.test(m[3]!)) return null;
    return `ALTER TABLE ${m[1]} DROP COLUMN ${m[2]};`;
  }
  return null;
}

export function deriveDown(upSql: string): DownResult {
  const statements = splitStatements(upSql);
  if (statements.length === 0) return { reversible: false, reason: "the migration is empty" };
  const down: string[] = [];
  for (const statement of statements) {
    const reversed = inverse(statement);
    if (!reversed) {
      const preview = statement.replace(/\s+/g, " ").slice(0, 80);
      return { reversible: false, reason: `can't automatically reverse: ${preview}${statement.length > 80 ? "…" : ""}` };
    }
    down.unshift(reversed);
  }
  return { reversible: true, sql: `${down.join("\n")}\n` };
}
