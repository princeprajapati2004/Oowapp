import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Postgres-only — MySQL/MariaDB support was dropped along with the
// @prisma/adapter-mariadb import. schema.prisma's provider still gets
// synced from DATABASE_URL's scheme by scripts/select-db-provider.mjs.
function createAdapter(url: string) {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return new PrismaPg({
      connectionString: url,
      // node-postgres defaults: max 10 clients, and — critically —
      // connectionTimeoutMillis: 0, meaning a query queues and waits
      // *forever* for a free client once the pool is exhausted instead of
      // failing fast. Under load that silent queueing is what shows up as
      // the admin dashboard "slowing down" or timing out at the platform's
      // function duration limit rather than a clean, loggable error.
      // max raised slightly above the default: a single admin dashboard
      // load already fires ~9-11 concurrent queries (layout + page +
      // getDashboardAnalytics's internal Promise.all), which was already
      // close to exhausting the default pool on its own.
      // NOTE: this is a per-serverless-instance pool — the DB's own
      // connection limit is (max * concurrent warm instances). If
      // DATABASE_URL isn't pointed at a pooled endpoint (e.g. this
      // project's Prisma Postgres `pooled.db.prisma.io`, or a
      // Neon/Supabase pooler), raising `max` can make connection
      // exhaustion worse, not better — verify the production env var first.
      max: 15,
      connectionTimeoutMillis: 10_000,
    });
  }
  const scheme = url.split("://")[0];
  throw new Error(
    `Unrecognized DATABASE_URL scheme "${scheme}://". Expected postgres:// (or postgresql://).`
  );
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return new PrismaClient({ adapter: createAdapter(url) });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
