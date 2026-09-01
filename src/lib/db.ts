import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createAdapter(url: string) {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return new PrismaPg({
      connectionString: url,
      max: 15,
      connectionTimeoutMillis: 10_000,
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
  return new PrismaClient({ adapter: createAdapter(url) });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
