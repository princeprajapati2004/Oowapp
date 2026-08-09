// Rewrites the `provider` line in prisma/schema.prisma to match whatever
// DATABASE_URL currently points at (postgresql or mysql). Runs before
// `prisma generate` / `db push` / `migrate deploy` so those commands always
// target the right SQL dialect. Safe to run repeatedly — it's a no-op if
// the file already matches.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectDbProvider } from "./detect-db-provider.mjs";

const schemaPath = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));

if (!process.env.DATABASE_URL) {
  // Runs from `postinstall`, which fires on a bare `npm install` before
  // .env necessarily exists (fresh clone, CI cache warm-up). Leave
  // schema.prisma as committed rather than failing the install.
  console.log("[select-db-provider] DATABASE_URL not set — leaving schema.prisma as-is.");
  process.exit(0);
}

const provider = detectDbProvider(process.env.DATABASE_URL);

const original = readFileSync(schemaPath, "utf8");
const updated = original.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")([a-z]+)(")/s,
  `$1${provider}$3`
);

if (updated === original) {
  console.log(`[select-db-provider] schema.prisma already targets "${provider}".`);
} else {
  writeFileSync(schemaPath, updated);
  console.log(`[select-db-provider] schema.prisma provider set to "${provider}".`);
}
