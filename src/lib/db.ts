import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any;
};

function createAdapter(url: string) {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return new PrismaPg({
      connectionString: url,
      max: 10,
      // Drop idle connections after 20s so the pool never holds a connection
      // that was silently closed by a NAT gateway / remote server idle timeout.
      idleTimeoutMillis: 20_000,
      // Allow up to 30s to acquire/establish a connection over WAN.
      connectionTimeoutMillis: 30_000,
    });
  }
  if (url.startsWith("mysql://") || url.startsWith("mariadb://")) {
    return new PrismaMariaDb(url);
  }
  const scheme = url.split("://")[0];
  throw new Error(
    `Unrecognized DATABASE_URL scheme "${scheme}://". Expected postgres://, postgresql://, mysql://, or mariadb://.`
  );
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const client = new PrismaClient({ adapter: createAdapter(url) });

  // Retry once on transient connection-terminated errors so a stale pool
  // connection that slipped through doesn't surface as a user-visible 500.
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "";
          const isTransient =
            msg.includes("Connection terminated") ||
            msg.includes("Connection closed") ||
            msg.includes("ECONNRESET") ||
            msg.includes("connection timeout");
          if (!isTransient) throw err;
          // Single retry — the failed connection is already removed from the
          // pool by the pg driver, so the next attempt uses a fresh socket.
          return await query(args);
        }
      },
    },
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
