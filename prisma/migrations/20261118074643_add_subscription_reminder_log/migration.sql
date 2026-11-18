-- CreateEnum
CREATE TYPE "SubscriptionReminderType" AS ENUM ('DAYS_7_BEFORE', 'DAYS_3_BEFORE', 'DAYS_1_BEFORE', 'ON_EXPIRY', 'GRACE_PERIOD');

-- CreateTable
CREATE TABLE "subscription_reminder_logs" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "reminderType" "SubscriptionReminderType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_reminder_logs_subscriptionId_reminderType_key" ON "subscription_reminder_logs"("subscriptionId", "reminderType");

-- AddForeignKey
ALTER TABLE "subscription_reminder_logs" ADD CONSTRAINT "subscription_reminder_logs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
