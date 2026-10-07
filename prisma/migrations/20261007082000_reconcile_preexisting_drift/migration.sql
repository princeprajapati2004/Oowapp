-- Pre-existing drift reconciliation — UNRELATED to Phase 0 multi-business
-- work. Discovered while testing Phase 0 on a fresh local database: the
-- committed migration history (prisma/migrations/) was far behind
-- schema.prisma — many past features (Returns, Party/CRM, Purchases,
-- Wallet, Referral, Cashback, Notifications, Menu Import, and several base
-- columns like admins.phone) were applied to real environments via
-- `prisma db push` directly and never got a migration file generated.
-- This migration is the full `prisma migrate diff` output bringing a
-- database that matches the last *tracked* migration up to current
-- schema.prisma. Auto-generated, not hand-authored — review before
-- applying to any environment that already has this drift applied via
-- db push (should be a safe no-op there) vs one that's missing it entirely
-- (this brings it fully up to date).
-- CreateEnum
CREATE TYPE "PrintAgentStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'ITEM_RETURNED', 'REFUND_PENDING', 'REFUND_PROCESSING', 'REFUNDED', 'REFUND_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('WRONG_ITEM', 'MISSING_ITEM', 'DAMAGED_ITEM', 'QUALITY_ISSUE', 'CHANGED_MIND', 'DUPLICATE_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('ORIGINAL_PAYMENT_METHOD', 'UPI', 'CASH', 'BANK_TRANSFER', 'WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnItemCondition" AS ENUM ('RESELLABLE', 'DAMAGED', 'WASTE', 'NOT_RESELLABLE');

-- CreateEnum
CREATE TYPE "LossDamageType" AS ENUM ('LOST', 'DAMAGED', 'BROKEN', 'SPOILED', 'WASTED', 'MISSING', 'OTHER');

-- CreateEnum
CREATE TYPE "DamageType" AS ENUM ('BROKEN', 'PACKAGING_DAMAGE', 'FOOD_DAMAGE', 'WATER_DAMAGE', 'ELECTRICAL_DAMAGE', 'EXPIRED', 'QUALITY_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "TableManualState" AS ENUM ('RESERVED', 'CLEANING', 'DISABLED');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "PartyCategory" AS ENUM ('VIP', 'WHOLESALE', 'RETAIL', 'GENERAL');

-- CreateEnum
CREATE TYPE "PartyPaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PartyPaymentDirection" AS ENUM ('RECEIVED', 'PAID');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('RECORDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('ACTIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_ORDER', 'BILL_REQUESTED', 'PAYMENT_RECEIVED', 'PAYMENT_CLAIMED', 'ORDER_STATUS_CHANGED', 'TABLE_OCCUPIED', 'TABLE_RELEASED');

-- CreateEnum
CREATE TYPE "MenuImportSourceType" AS ENUM ('PHOTO', 'PDF', 'EXCEL', 'CSV', 'TEXT');

-- CreateEnum
CREATE TYPE "MenuImportStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "RewardValueType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CASHBACK_CREDIT', 'REFERRAL_CREDIT', 'REDEMPTION_DEBIT', 'ADMIN_ADJUSTMENT', 'REFUND_CREDIT', 'CASHBACK_REVERSAL');

-- CreateEnum
CREATE TYPE "CashbackRedemptionStatus" AS ENUM ('PENDING', 'CREDITED', 'VOIDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PHONE_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'ONBOARDING_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_MARKED_PAID';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_ITEMS_EDITED';
ALTER TYPE "AuditAction" ADD VALUE 'RETURN_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'RETURN_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'RETURN_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'RETURN_ITEM_RETURNED';
ALTER TYPE "AuditAction" ADD VALUE 'RETURN_REFUND_PROCESSED';
ALTER TYPE "AuditAction" ADD VALUE 'RETURN_REFUND_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'RETURN_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'LOSS_DAMAGE_CREATED';

-- AlterEnum
ALTER TYPE "FoodType" ADD VALUE 'EGG';

-- AlterEnum
ALTER TYPE "TableSessionStatus" ADD VALUE 'MERGED';

-- DropForeignKey
ALTER TABLE "phone_otps" DROP CONSTRAINT "phone_otps_shopId_fkey";

-- DropIndex
DROP INDEX "orders_staffId_idx";

-- DropIndex
DROP INDEX "subscriptions_shopId_createdAt_idx";

-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "phone" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "firebaseUid" TEXT,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "walletBalance" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "partyId" TEXT,
ADD COLUMN     "transactionReference" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "costPrice" DECIMAL(10,2),
ADD COLUMN     "offerDiscount" DECIMAL(10,2),
ADD COLUMN     "originalPrice" DECIMAL(10,2),
ADD COLUMN     "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "additionalCharges" JSONB,
ADD COLUMN     "cashbackAmount" DECIMAL(10,2),
ADD COLUMN     "cashbackCampaignId" TEXT,
ADD COLUMN     "cashbackCode" TEXT,
ADD COLUMN     "chargesTotal" DECIMAL(10,2),
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDiscountAmount" DECIMAL(10,2),
ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "courierName" TEXT,
ADD COLUMN     "partyId" TEXT,
ADD COLUMN     "paymentClaimAt" TIMESTAMP(3),
ADD COLUMN     "paymentClaimMethod" TEXT,
ADD COLUMN     "paymentClaimStatus" TEXT,
ADD COLUMN     "returnDeadline" TIMESTAMP(3),
ADD COLUMN     "returnPolicyEnabledAtCompletion" BOOLEAN,
ADD COLUMN     "returnWindowDaysAtCompletion" INTEGER,
ADD COLUMN     "tokenNumber" INTEGER,
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "trackingUrl" TEXT,
ADD COLUMN     "walletAmountUsed" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "print_jobs" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "payload" TEXT;

-- AlterTable
ALTER TABLE "printer_profiles" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "systemPrinterName" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "costPrice" DECIMAL(10,2),
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isCombo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mrp" DECIMAL(10,2),
ADD COLUMN     "offerNote" TEXT,
ADD COLUMN     "offerType" TEXT,
ADD COLUMN     "offerValue" DECIMAL(10,2),
ADD COLUMN     "openingStock" INTEGER,
ADD COLUMN     "productCode" TEXT,
ADD COLUMN     "productType" TEXT,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "wholesalePrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "push_subscriptions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "bhimUpi" TEXT,
ADD COLUMN     "billNumberNext" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "billNumberPrefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "enableOrderBarcodeLabels" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googlePayUpi" TEXT,
ADD COLUMN     "notificationSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "panNumber" TEXT,
ADD COLUMN     "paytmUpi" TEXT,
ADD COLUMN     "phonePeUpi" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "purchaseNumberNext" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "purchaseNumberPrefix" TEXT NOT NULL DEFAULT 'PO-',
ADD COLUMN     "returnPolicyEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "returnWindowDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "timezone" TEXT DEFAULT 'Asia/Kolkata',
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "table_sessions" ADD COLUMN     "guestCount" INTEGER;

-- DropTable
DROP TABLE "phone_otps";

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "PartyType" NOT NULL DEFAULT 'CUSTOMER',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "gstNumber" TEXT,
    "businessName" TEXT,
    "address" TEXT,
    "category" "PartyCategory" NOT NULL DEFAULT 'GENERAL',
    "openingBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_payments" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2),
    "method" "PartyPaymentMethod" NOT NULL DEFAULT 'CASH',
    "direction" "PartyPaymentDirection" NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseId" TEXT,

    CONSTRAINT "party_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "partyPaymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerResponse" TEXT,
    "ownerResponseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_settings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "descriptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mrpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "purchasePriceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wholesalePriceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "partyPricingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "serialNumberEnabled" BOOLEAN NOT NULL DEFAULT false,
    "batchNumberEnabled" BOOLEAN NOT NULL DEFAULT false,
    "barcodeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "productTypeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stockEnabled" BOOLEAN NOT NULL DEFAULT true,
    "productImageEnabled" BOOLEAN NOT NULL DEFAULT true,
    "productCodeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "offerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "categoryRequired" BOOLEAN NOT NULL DEFAULT true,
    "hsnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "hsnRequired" BOOLEAN NOT NULL DEFAULT false,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_product_prices" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "RewardValueType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxDiscountAmount" DECIMAL(10,2),
    "minOrderAmount" DECIMAL(10,2),
    "totalUsageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_categories" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "coupon_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_products" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "orderId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_campaigns" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "rewardType" "RewardValueType" NOT NULL DEFAULT 'PERCENTAGE',
    "rewardValue" DECIMAL(10,2) NOT NULL,
    "maxCashbackAmount" DECIMAL(10,2),
    "minOrderAmount" DECIMAL(10,2),
    "totalUsageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashback_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_redemptions" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cashbackAmount" DECIMAL(10,2) NOT NULL,
    "status" "CashbackRedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_program_configs" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rewardAmount" DECIMAL(10,2) NOT NULL,
    "minQualifyingOrderAmount" DECIMAL(10,2),
    "qualifyingOrderScope" TEXT NOT NULL DEFAULT 'FIRST_ORDER',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_program_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "referrerCustomerId" TEXT NOT NULL,
    "referredCustomerId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "qualifyingOrderId" TEXT,
    "rewardAmount" DECIMAL(10,2),
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT,
    "tableSessionId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL,
    "transactionReference" TEXT,
    "note" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_states" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "state" "TableManualState" NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "table_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_agents" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "computerName" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "version" TEXT,
    "status" "PrintAgentStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_agent_pairing_codes" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_agent_pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'RETURN_REQUESTED',
    "reason" "ReturnReason" NOT NULL,
    "reasonOtherText" TEXT,
    "notes" TEXT,
    "initiatedByType" TEXT NOT NULL,
    "initiatedById" TEXT,
    "requestedRefundAmount" DECIMAL(10,2) NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "itemReturnedById" TEXT,
    "itemReturnedAt" TIMESTAMP(3),
    "refundMethod" "RefundMethod",
    "refundReference" TEXT,
    "refundProcessedById" TEXT,
    "refundProcessedAt" TIMESTAMP(3),
    "refundFailedReason" TEXT,
    "refundFailedAt" TIMESTAMP(3),
    "walletTransactionId" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "allocatedDiscountPerUnit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refundableAmount" DECIMAL(10,2) NOT NULL,
    "condition" "ReturnItemCondition",

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_status_events" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    "note" TEXT,

    CONSTRAINT "return_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_evidence_photos" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedByType" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_evidence_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_damage_records" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" "LossDamageType" NOT NULL,
    "damageType" "DamageType",
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitCost" DECIMAL(10,2),
    "totalLossValue" DECIMAL(10,2),
    "manualValue" DECIMAL(10,2),
    "manualValueReason" TEXT,
    "inventoryBefore" INTEGER,
    "inventoryAfter" INTEGER,
    "evidencePhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "returnItemId" TEXT,
    "clientRequestId" TEXT,
    "createdBy" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loss_damage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "purchaseNumber" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierGstNumber" TEXT,
    "invoiceNumber" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "taxTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2),
    "grandTotal" DECIMAL(10,2) NOT NULL,
    "paidAmount" DECIMAL(10,2),
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'RECORDED',
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "notes" TEXT,
    "clientRequestId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purchasePrice" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2),
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_images" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_imports" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sourceType" "MenuImportSourceType" NOT NULL,
    "fileName" TEXT,
    "status" "MenuImportStatus" NOT NULL,
    "itemsImported" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parties_shopId_idx" ON "parties"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "parties_shopId_phone_key" ON "parties"("shopId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "parties_shopId_gstNumber_key" ON "parties"("shopId", "gstNumber");

-- CreateIndex
CREATE INDEX "party_payments_shopId_idx" ON "party_payments"("shopId");

-- CreateIndex
CREATE INDEX "party_payments_partyId_idx" ON "party_payments"("partyId");

-- CreateIndex
CREATE INDEX "party_payments_purchaseId_idx" ON "party_payments"("purchaseId");

-- CreateIndex
CREATE INDEX "payment_allocations_shopId_idx" ON "payment_allocations"("shopId");

-- CreateIndex
CREATE INDEX "payment_allocations_partyPaymentId_idx" ON "payment_allocations"("partyPaymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_orderId_idx" ON "payment_allocations"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_orderId_key" ON "reviews"("orderId");

-- CreateIndex
CREATE INDEX "reviews_shopId_idx" ON "reviews"("shopId");

-- CreateIndex
CREATE INDEX "reviews_customerId_idx" ON "reviews"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "item_settings_shopId_key" ON "item_settings"("shopId");

-- CreateIndex
CREATE INDEX "party_product_prices_shopId_idx" ON "party_product_prices"("shopId");

-- CreateIndex
CREATE INDEX "party_product_prices_productId_idx" ON "party_product_prices"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "party_product_prices_partyId_productId_key" ON "party_product_prices"("partyId", "productId");

-- CreateIndex
CREATE INDEX "coupons_shopId_idx" ON "coupons"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_shopId_code_key" ON "coupons"("shopId", "code");

-- CreateIndex
CREATE INDEX "coupon_categories_couponId_idx" ON "coupon_categories"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_categories_couponId_categoryId_key" ON "coupon_categories"("couponId", "categoryId");

-- CreateIndex
CREATE INDEX "coupon_products_couponId_idx" ON "coupon_products"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_products_couponId_productId_key" ON "coupon_products"("couponId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_orderId_key" ON "coupon_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_shopId_idx" ON "coupon_redemptions"("shopId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_idx" ON "coupon_redemptions"("couponId");

-- CreateIndex
CREATE INDEX "wallet_transactions_shopId_idx" ON "wallet_transactions"("shopId");

-- CreateIndex
CREATE INDEX "wallet_transactions_customerId_idx" ON "wallet_transactions"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_orderId_type_key" ON "wallet_transactions"("orderId", "type");

-- CreateIndex
CREATE INDEX "cashback_campaigns_shopId_idx" ON "cashback_campaigns"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_campaigns_shopId_code_key" ON "cashback_campaigns"("shopId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_redemptions_orderId_key" ON "cashback_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "cashback_redemptions_shopId_idx" ON "cashback_redemptions"("shopId");

-- CreateIndex
CREATE INDEX "cashback_redemptions_campaignId_idx" ON "cashback_redemptions"("campaignId");

-- CreateIndex
CREATE INDEX "cashback_redemptions_customerId_idx" ON "cashback_redemptions"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_program_configs_shopId_key" ON "referral_program_configs"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredCustomerId_key" ON "referrals"("referredCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_qualifyingOrderId_key" ON "referrals"("qualifyingOrderId");

-- CreateIndex
CREATE INDEX "referrals_shopId_idx" ON "referrals"("shopId");

-- CreateIndex
CREATE INDEX "referrals_referrerCustomerId_idx" ON "referrals"("referrerCustomerId");

-- CreateIndex
CREATE INDEX "payment_records_shopId_idx" ON "payment_records"("shopId");

-- CreateIndex
CREATE INDEX "payment_records_orderId_idx" ON "payment_records"("orderId");

-- CreateIndex
CREATE INDEX "payment_records_tableSessionId_idx" ON "payment_records"("tableSessionId");

-- CreateIndex
CREATE INDEX "table_states_shopId_idx" ON "table_states"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "table_states_shopId_tableNumber_key" ON "table_states"("shopId", "tableNumber");

-- CreateIndex
CREATE INDEX "print_agents_shopId_idx" ON "print_agents"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "print_agent_pairing_codes_code_key" ON "print_agent_pairing_codes"("code");

-- CreateIndex
CREATE INDEX "print_agent_pairing_codes_shopId_idx" ON "print_agent_pairing_codes"("shopId");

-- CreateIndex
CREATE INDEX "return_requests_shopId_idx" ON "return_requests"("shopId");

-- CreateIndex
CREATE INDEX "return_requests_shopId_status_idx" ON "return_requests"("shopId", "status");

-- CreateIndex
CREATE INDEX "return_requests_orderId_idx" ON "return_requests"("orderId");

-- CreateIndex
CREATE INDEX "return_requests_customerId_idx" ON "return_requests"("customerId");

-- CreateIndex
CREATE INDEX "return_items_returnId_idx" ON "return_items"("returnId");

-- CreateIndex
CREATE INDEX "return_items_orderItemId_idx" ON "return_items"("orderItemId");

-- CreateIndex
CREATE INDEX "return_status_events_returnId_idx" ON "return_status_events"("returnId");

-- CreateIndex
CREATE INDEX "return_evidence_photos_returnId_idx" ON "return_evidence_photos"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "loss_damage_records_returnItemId_key" ON "loss_damage_records"("returnItemId");

-- CreateIndex
CREATE INDEX "loss_damage_records_shopId_idx" ON "loss_damage_records"("shopId");

-- CreateIndex
CREATE INDEX "loss_damage_records_shopId_date_idx" ON "loss_damage_records"("shopId", "date");

-- CreateIndex
CREATE INDEX "loss_damage_records_productId_idx" ON "loss_damage_records"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "loss_damage_records_shopId_clientRequestId_key" ON "loss_damage_records"("shopId", "clientRequestId");

-- CreateIndex
CREATE INDEX "purchases_shopId_idx" ON "purchases"("shopId");

-- CreateIndex
CREATE INDEX "purchases_shopId_purchaseDate_idx" ON "purchases"("shopId", "purchaseDate");

-- CreateIndex
CREATE INDEX "purchases_supplierId_idx" ON "purchases"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_shopId_purchaseNumber_key" ON "purchases"("shopId", "purchaseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_shopId_clientRequestId_key" ON "purchases"("shopId", "clientRequestId");

-- CreateIndex
CREATE INDEX "purchase_items_purchaseId_idx" ON "purchase_items"("purchaseId");

-- CreateIndex
CREATE INDEX "purchase_items_productId_idx" ON "purchase_items"("productId");

-- CreateIndex
CREATE INDEX "notifications_shopId_idx" ON "notifications"("shopId");

-- CreateIndex
CREATE INDEX "notifications_shopId_isRead_idx" ON "notifications"("shopId", "isRead");

-- CreateIndex
CREATE INDEX "menu_images_shopId_idx" ON "menu_images"("shopId");

-- CreateIndex
CREATE INDEX "menu_imports_shopId_idx" ON "menu_imports"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_firebaseUid_key" ON "customers"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopId_referralCode_key" ON "customers"("shopId", "referralCode");

-- CreateIndex
CREATE INDEX "expenses_partyId_idx" ON "expenses"("partyId");

-- CreateIndex
CREATE INDEX "orders_partyId_idx" ON "orders"("partyId");

-- CreateIndex
CREATE INDEX "orders_shopId_customerPhone_idx" ON "orders"("shopId", "customerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shopId_billNumber_key" ON "orders"("shopId", "billNumber");

-- CreateIndex
CREATE INDEX "print_jobs_agentId_status_idx" ON "print_jobs"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_shopId_idempotencyKey_key" ON "print_jobs"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "printer_profiles_agentId_idx" ON "printer_profiles"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "printer_profiles_agentId_systemPrinterName_key" ON "printer_profiles"("agentId", "systemPrinterName");

-- CreateIndex
CREATE INDEX "products_hsnCode_idx" ON "products"("hsnCode");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopId_barcode_key" ON "products"("shopId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopId_productCode_key" ON "products"("shopId", "productCode");

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_partyPaymentId_fkey" FOREIGN KEY ("partyPaymentId") REFERENCES "party_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_settings" ADD CONSTRAINT "item_settings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_product_prices" ADD CONSTRAINT "party_product_prices_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_product_prices" ADD CONSTRAINT "party_product_prices_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_product_prices" ADD CONSTRAINT "party_product_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_campaigns" ADD CONSTRAINT "cashback_campaigns_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_redemptions" ADD CONSTRAINT "cashback_redemptions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "cashback_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_redemptions" ADD CONSTRAINT "cashback_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_redemptions" ADD CONSTRAINT "cashback_redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_program_configs" ADD CONSTRAINT "referral_program_configs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerCustomerId_fkey" FOREIGN KEY ("referrerCustomerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredCustomerId_fkey" FOREIGN KEY ("referredCustomerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_states" ADD CONSTRAINT "table_states_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_profiles" ADD CONSTRAINT "printer_profiles_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "print_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "print_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_agent_pairing_codes" ADD CONSTRAINT "print_agent_pairing_codes_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_status_events" ADD CONSTRAINT "return_status_events_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_evidence_photos" ADD CONSTRAINT "return_evidence_photos_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_damage_records" ADD CONSTRAINT "loss_damage_records_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_damage_records" ADD CONSTRAINT "loss_damage_records_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_damage_records" ADD CONSTRAINT "loss_damage_records_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "return_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_images" ADD CONSTRAINT "menu_images_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_imports" ADD CONSTRAINT "menu_imports_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

