-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- AlterTable shops: add restaurant table configuration
ALTER TABLE "shops" ADD COLUMN "enableTableQr" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shops" ADD COLUMN "tableNames" TEXT;

-- AlterTable orders: add order lifecycle status
ALTER TABLE "orders" ADD COLUMN "status" "OrderStatus" NOT NULL DEFAULT 'PENDING';
