// Shared by scripts/select-db-provider.mjs and scripts/db-deploy.mjs.
// Prisma's schema `provider` field can't be an env var (it changes which SQL
// dialect the query engine speaks), so we infer it from DATABASE_URL's
// scheme instead — that's the one thing switching databases actually means
// changing.
export function detectDbProvider(url) {
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (url.startsWith("mysql://") || url.startsWith("mariadb://")) return "mysql";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgresql";
  const scheme = url.split("://")[0];
  throw new Error(
    `Unrecognized DATABASE_URL scheme "${scheme}://". Expected postgres:// (or postgresql://) or mysql:// (or mariadb://).`
  );
}
