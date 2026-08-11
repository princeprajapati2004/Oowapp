// Applies the schema to whatever database DATABASE_URL points at, run as
// part of `npm run build`. Postgres has a real migration history
// (prisma/migrations), so it gets `migrate deploy`. MySQL/MariaDB has no
// migration history yet — those migrations are Postgres SQL and won't run
// against MySQL — so it gets `prisma db push` instead, which syncs the
// schema directly without needing one.
import "dotenv/config";
import { execSync } from "node:child_process";
import { detectDbProvider } from "./detect-db-provider.mjs";

const provider = detectDbProvider(process.env.DATABASE_URL);

if (provider === "postgresql") {
  execSync("prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log("[db-deploy] MySQL/MariaDB target — no migration history for this provider, running `prisma db push`.");
  execSync("prisma db push", { stdio: "inherit" });
}
