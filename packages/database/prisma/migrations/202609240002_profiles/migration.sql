CREATE TABLE "person_profiles" (
 "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "subjectType" TEXT NOT NULL, "subjectId" UUID NOT NULL,
 "designation" TEXT, "phone" TEXT, "address" TEXT, "dateOfBirth" DATE, "emergencyContact" TEXT,
 "governmentIdType" TEXT, "governmentIdNumber" TEXT, "monthlyPay" DECIMAL(14,2), "notes" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "person_profiles_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "person_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "person_profiles_organization_id_subjectType_subjectId_key" ON "person_profiles"("organization_id", "subjectType", "subjectId");
CREATE UNIQUE INDEX "person_profiles_id_organization_id_key" ON "person_profiles"("id", "organization_id");
CREATE TABLE "profile_assets" (
 "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "profileId" UUID NOT NULL, "kind" TEXT NOT NULL,
 "name" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL, "content" BYTEA NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" UUID NOT NULL,
 CONSTRAINT "profile_assets_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "profile_assets_profileId_organization_id_fkey" FOREIGN KEY ("profileId", "organization_id") REFERENCES "person_profiles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "profile_assets_profileId_kind_idx" ON "profile_assets"("profileId", "kind");
CREATE TABLE "staff_payments" (
 "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "profileId" UUID NOT NULL, "amount" DECIMAL(14,2) NOT NULL,
 "paidAt" TIMESTAMP(3) NOT NULL, "period" TEXT NOT NULL, "method" TEXT NOT NULL, "reference" TEXT, "notes" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" UUID NOT NULL,
 CONSTRAINT "staff_payments_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "staff_payments_profileId_organization_id_fkey" FOREIGN KEY ("profileId", "organization_id") REFERENCES "person_profiles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "staff_payments_profileId_paidAt_idx" ON "staff_payments"("profileId", "paidAt");
