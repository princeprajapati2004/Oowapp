/**
 * Seed the first SuperAdmin from environment variables.
 * Run once: npm run db:seed
 *
 * Required env vars:
 *   SUPER_ADMIN_SEED_EMAIL
 *   SUPER_ADMIN_SEED_PASSWORD
 *   DATABASE_URL
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SUPER_ADMIN_SEED_EMAIL;
  const password = process.env.SUPER_ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SUPER_ADMIN_SEED_EMAIL and SUPER_ADMIN_SEED_PASSWORD must be set in .env"
    );
  }

  const existing = await db.superAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`SuperAdmin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const sa = await db.superAdmin.create({
    data: {
      email,
      passwordHash,
      name: "Platform Owner",
    },
  });

  console.log(`SuperAdmin created: ${sa.email} (id: ${sa.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
