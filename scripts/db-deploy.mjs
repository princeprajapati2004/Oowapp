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

console.log(`[db-deploy] Syncing schema for provider "${provider}" using db push…`);
execSync("node_modules/.bin/prisma db push --accept-data-loss", { stdio: "inherit" });
