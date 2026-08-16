-- AddPrintFormat
-- Additive only — new enum type and a NOT NULL column with a default, so
-- every existing shop row picks up A4_STYLE_1 without needing a backfill.

-- CreateEnum
CREATE TYPE "PrintFormat" AS ENUM ('THERMAL_58', 'THERMAL_80', 'A4_STYLE_1', 'A4_STYLE_2', 'A4_STYLE_3', 'A4_STYLE_4', 'A3');

-- AlterTable
ALTER TABLE "shops" ADD COLUMN "printFormat" "PrintFormat" NOT NULL DEFAULT 'A4_STYLE_1';
