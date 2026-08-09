export type DbProvider = "postgresql" | "mysql";

// Same scheme-sniffing as src/lib/db.ts's adapter selection — used where raw
// SQL needs a dialect-specific branch (see src/lib/services/analytics.ts).
export function getDbProvider(): DbProvider {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("mysql://") || url.startsWith("mariadb://")) return "mysql";
  return "postgresql";
}

// Prisma's `mode: "insensitive"` filter is Postgres/MongoDB-only — passing
// it on MySQL/MariaDB throws a client validation error rather than being
// ignored. MySQL's default collation is already case-insensitive, so on
// MySQL we just omit the option. Spread the result into a string filter,
// e.g. `{ contains: search, ...caseInsensitive() }`.
export function caseInsensitive(): { mode: "insensitive" } | Record<string, never> {
  return getDbProvider() === "postgresql" ? { mode: "insensitive" } : {};
}
