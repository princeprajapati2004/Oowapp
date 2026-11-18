-- CreateTable
CREATE TABLE "subscription_terms_versions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "subscription_terms_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_terms_acceptances" (
    "id" TEXT NOT NULL,
    "termsVersionId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_terms_versions_planId_version_key" ON "subscription_terms_versions"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_terms_acceptances_termsVersionId_adminId_key" ON "subscription_terms_acceptances"("termsVersionId", "adminId");

-- AddForeignKey
ALTER TABLE "subscription_terms_versions" ADD CONSTRAINT "subscription_terms_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_terms_acceptances" ADD CONSTRAINT "subscription_terms_acceptances_termsVersionId_fkey" FOREIGN KEY ("termsVersionId") REFERENCES "subscription_terms_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_terms_acceptances" ADD CONSTRAINT "subscription_terms_acceptances_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
