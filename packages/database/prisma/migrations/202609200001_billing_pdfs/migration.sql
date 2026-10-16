-- CreateTable
CREATE TABLE "challans" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "challanNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DELIVERY',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "material" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "destination" TEXT,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "notes" TEXT,

    CONSTRAINT "challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_pdfs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "saved_pdfs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challans_organization_id_businessUnitId_siteId_idx" ON "challans"("organization_id", "businessUnitId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "challans_id_organization_id_key" ON "challans"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "challans_organization_id_challanNumber_key" ON "challans"("organization_id", "challanNumber");

-- CreateIndex
CREATE INDEX "saved_pdfs_organization_id_sourceKey_sourceId_created_at_idx" ON "saved_pdfs"("organization_id", "sourceKey", "sourceId", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_pdfs_organization_id_sourceKey_sourceId_fingerprint_key" ON "saved_pdfs"("organization_id", "sourceKey", "sourceId", "fingerprint");

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_clientId_organization_id_fkey" FOREIGN KEY ("clientId", "organization_id") REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_pdfs" ADD CONSTRAINT "saved_pdfs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "challans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_pdfs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "challans" ADD CONSTRAINT "challans_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "challans" ADD CONSTRAINT "challans_kind_valid" CHECK ("kind" IN ('DELIVERY', 'WASTE_COLLECTION', 'WASTE_DISPOSAL'));
ALTER TABLE "saved_pdfs" ADD CONSTRAINT "saved_pdfs_source_valid" CHECK ("sourceKey" IN ('invoices', 'challans'));
ALTER TABLE "saved_pdfs" ADD CONSTRAINT "saved_pdfs_size_valid" CHECK ("size" = octet_length("content") AND "size" > 0);
INSERT INTO "permissions" ("id", "updated_at", "key", "description")
VALUES (gen_random_uuid(), NOW(), 'challans:read', 'Read e-challans'), (gen_random_uuid(), NOW(), 'challans:write', 'Write e-challans')
ON CONFLICT ("key") DO NOTHING;
-- Existing billing roles receive the corresponding operational challan permission.
INSERT INTO "role_permissions" ("id", "updated_at", "organization_id", "roleId", "permissionId")
SELECT gen_random_uuid(), NOW(), rp."organization_id", rp."roleId", target."id"
FROM "role_permissions" rp JOIN "permissions" original ON original."id" = rp."permissionId"
JOIN "permissions" target ON target."key" = REPLACE(original."key", 'invoices:', 'challans:')
WHERE original."key" IN ('invoices:read', 'invoices:write') AND rp."deleted_at" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
