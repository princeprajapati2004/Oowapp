-- AddPrinterSystem
-- Additive only. New enums, two new tables (printer_profiles, print_jobs),
-- and a new NOT NULL column with a default on shops — no existing data
-- touched, no backfill required.

-- CreateEnum
CREATE TYPE "PrinterConnectionType" AS ENUM ('BLUETOOTH', 'WIFI', 'USB', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PrinterConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "PrintJobDocumentType" AS ENUM ('BILL', 'KITCHEN_TICKET', 'TEST');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PRINTING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED');

-- AlterTable
ALTER TABLE "shops" ADD COLUMN "autoPrintCompletedBill" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "printer_profiles" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectionType" "PrinterConnectionType" NOT NULL,
    "paperSize" "PrintFormat" NOT NULL,
    "purpose" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "port" INTEGER,
    "protocol" TEXT,
    "bluetoothDeviceId" TEXT,
    "bluetoothDeviceName" TEXT,
    "usbVendorId" INTEGER,
    "usbProductId" INTEGER,
    "status" "PrinterConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "statusMessage" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "lastTestAt" TIMESTAMP(3),
    "lastTestSuccess" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "printerId" TEXT,
    "documentType" "PrintJobDocumentType" NOT NULL,
    "orderId" TEXT,
    "format" "PrintFormat" NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printer_profiles_shopId_idx" ON "printer_profiles"("shopId");

-- CreateIndex
CREATE INDEX "print_jobs_shopId_idx" ON "print_jobs"("shopId");

-- CreateIndex
CREATE INDEX "print_jobs_printerId_idx" ON "print_jobs"("printerId");

-- AddForeignKey
ALTER TABLE "printer_profiles" ADD CONSTRAINT "printer_profiles_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
