-- Migration: Email OTP verification + Kitchen Order Tickets (KOT)
-- Created: 2026-08-07

-- ── Email Verification ────────────────────────────────────────────────────────

-- Add emailVerified field to admins
ALTER TABLE "admins" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- For existing admins, mark them as verified so they don't get locked out
UPDATE "admins" SET "emailVerified" = true;

-- Create enum for email verification purpose
CREATE TYPE "EmailVerificationPurpose" AS ENUM ('SIGNUP', 'PASSWORD_RESET');

-- Create email_verifications table
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "purpose" "EmailVerificationPurpose" NOT NULL,
    "otpHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_verifications_adminId_idx" ON "email_verifications"("adminId");

ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Kitchen Order Tickets (KOT) ───────────────────────────────────────────────

-- Create enum for KOT status
CREATE TYPE "KotStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- Create kitchen_tickets table
CREATE TABLE "kitchen_tickets" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "kotNumber" INTEGER NOT NULL,
    "status" "KotStatus" NOT NULL DEFAULT 'PENDING',
    "staffId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kitchen_tickets_shopId_idx" ON "kitchen_tickets"("shopId");
CREATE INDEX "kitchen_tickets_tableSessionId_idx" ON "kitchen_tickets"("tableSessionId");

ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_tableSessionId_fkey"
    FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create kot_items table
CREATE TABLE "kot_items" (
    "id" TEXT NOT NULL,
    "kitchenTicketId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "kot_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kot_items_kitchenTicketId_idx" ON "kot_items"("kitchenTicketId");

ALTER TABLE "kot_items" ADD CONSTRAINT "kot_items_kitchenTicketId_fkey"
    FOREIGN KEY ("kitchenTicketId") REFERENCES "kitchen_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kot_items" ADD CONSTRAINT "kot_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── AuditAction enum values ───────────────────────────────────────────────────
ALTER TYPE "AuditAction" ADD VALUE 'EMAIL_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET_COMPLETED';
