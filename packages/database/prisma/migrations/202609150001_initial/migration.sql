-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_units" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ASSIGNED',

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "roleId" UUID NOT NULL,
    "businessUnitId" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "businessUnitId" UUID,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "position" TEXT NOT NULL DEFAULT 'WORKER',
    "joiningDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "businessUnitId" UUID NOT NULL,
    "userId" UUID,
    "departmentId" UUID,
    "supervisorId" UUID,
    "managerId" UUID,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gstNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "businessUnitId" UUID NOT NULL,
    "managerId" UUID,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "position" TEXT,
    "clientId" UUID NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "contact" TEXT,
    "requirement" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "businessUnitId" UUID NOT NULL,
    "salespersonId" UUID,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "leadId" UUID NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "services" TEXT NOT NULL,
    "renewalStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "businessUnitId" UUID NOT NULL,
    "clientId" UUID NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "wasteType" TEXT NOT NULL DEFAULT 'MIXED',
    "expectedDailyWaste" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "businessUnitId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "contractId" UUID,
    "managerId" UUID,
    "supervisorId" UUID,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "businessUnitId" UUID NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_assignments" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "supervisorId" UUID,
    "shiftId" UUID NOT NULL,

    CONSTRAINT "site_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfc_cards" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cardHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "employeeId" UUID NOT NULL,

    CONSTRAINT "nfc_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_devices" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,

    CONSTRAINT "attendance_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyDeparture" BOOLEAN NOT NULL DEFAULT false,
    "correctionReason" TEXT,
    "businessUnitId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "deviceId" UUID,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_taps" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,

    CONSTRAINT "attendance_taps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_categorys" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "waste_categorys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_records" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "stage" TEXT NOT NULL DEFAULT 'COLLECTED',
    "notes" TEXT,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "waste_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "services" TEXT,
    "rate" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "businessUnitId" UUID NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "capacity" DECIMAL(12,3),
    "businessUnitId" UUID NOT NULL,
    "vendorId" UUID,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposals" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "disposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(12,3) NOT NULL,
    "method" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "notes" TEXT,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "wasteRecordId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "vehicleId" UUID,

    CONSTRAINT "disposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "assigneeId" UUID NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "assigneeId" UUID,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_visits" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "checklist" JSONB NOT NULL,
    "notes" TEXT,
    "actionItems" TEXT,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "managerId" UUID NOT NULL,

    CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "machineCode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "installationDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "capacity" DECIMAL(12,3) NOT NULL,
    "operatingHours" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maintenanceDue" TIMESTAMP(3),
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_events" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "machineId" UUID NOT NULL,

    CONSTRAINT "machine_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_batchs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "inputKg" DECIMAL(12,3) NOT NULL,
    "outputKg" DECIMAL(12,3),
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "qualityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "operatorId" UUID NOT NULL,

    CONSTRAINT "production_batchs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "downtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "technicianId" UUID,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "partCode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "maintenanceId" UUID NOT NULL,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "contractId" UUID,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "vendorId" UUID,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "businessUnitId" UUID NOT NULL,
    "siteId" UUID,
    "employeeId" UUID,
    "clientId" UUID,
    "contractId" UUID,
    "vendorId" UUID,
    "machineId" UUID,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "deliveredAt" TIMESTAMP(3),
    "businessUnitId" UUID,
    "siteId" UUID,
    "userId" UUID NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "organization_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "requestId" TEXT,
    "businessUnitId" UUID,
    "siteId" UUID,
    "actorId" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "business_units_organization_id_deleted_at_idx" ON "business_units"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "business_units_id_organization_id_key" ON "business_units"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_units_organization_id_code_key" ON "business_units"("organization_id", "code");

-- CreateIndex
CREATE INDEX "roles_organization_id_deleted_at_idx" ON "roles"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_organization_id_key" ON "roles"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_name_key" ON "roles"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_organization_id_deleted_at_idx" ON "role_permissions"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_id_organization_id_key" ON "role_permissions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_deleted_at_idx" ON "users"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "users_organization_id_businessUnitId_idx" ON "users"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_organization_id_key" ON "users"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_organization_id_deleted_at_idx" ON "sessions"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_id_organization_id_key" ON "sessions"("id", "organization_id");

-- CreateIndex
CREATE INDEX "departments_organization_id_deleted_at_idx" ON "departments"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "departments_organization_id_businessUnitId_idx" ON "departments"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_id_organization_id_key" ON "departments"("id", "organization_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_deleted_at_idx" ON "employees"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "employees_organization_id_businessUnitId_idx" ON "employees"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_id_organization_id_key" ON "employees"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_employeeCode_key" ON "employees"("organization_id", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_organization_id_key" ON "employees"("userId", "organization_id");

-- CreateIndex
CREATE INDEX "clients_organization_id_deleted_at_idx" ON "clients"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "clients_organization_id_businessUnitId_idx" ON "clients"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_id_organization_id_key" ON "clients"("id", "organization_id");

-- CreateIndex
CREATE INDEX "contacts_organization_id_deleted_at_idx" ON "contacts"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_id_organization_id_key" ON "contacts"("id", "organization_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_deleted_at_idx" ON "leads"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "leads_organization_id_businessUnitId_idx" ON "leads"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_id_organization_id_key" ON "leads"("id", "organization_id");

-- CreateIndex
CREATE INDEX "follow_ups_organization_id_deleted_at_idx" ON "follow_ups"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_id_organization_id_key" ON "follow_ups"("id", "organization_id");

-- CreateIndex
CREATE INDEX "contracts_organization_id_deleted_at_idx" ON "contracts"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "contracts_organization_id_businessUnitId_idx" ON "contracts"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_id_organization_id_key" ON "contracts"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_organization_id_contractNumber_key" ON "contracts"("organization_id", "contractNumber");

-- CreateIndex
CREATE INDEX "sites_organization_id_deleted_at_idx" ON "sites"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "sites_organization_id_businessUnitId_idx" ON "sites"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "sites_id_organization_id_key" ON "sites"("id", "organization_id");

-- CreateIndex
CREATE INDEX "shifts_organization_id_deleted_at_idx" ON "shifts"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "shifts_organization_id_businessUnitId_idx" ON "shifts"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_id_organization_id_key" ON "shifts"("id", "organization_id");

-- CreateIndex
CREATE INDEX "site_assignments_organization_id_deleted_at_idx" ON "site_assignments"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "site_assignments_organization_id_businessUnitId_idx" ON "site_assignments"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "site_assignments_organization_id_siteId_idx" ON "site_assignments"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "site_assignments_id_organization_id_key" ON "site_assignments"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "nfc_cards_cardHash_key" ON "nfc_cards"("cardHash");

-- CreateIndex
CREATE INDEX "nfc_cards_organization_id_deleted_at_idx" ON "nfc_cards"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "nfc_cards_id_organization_id_key" ON "nfc_cards"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_devices_keyHash_key" ON "attendance_devices"("keyHash");

-- CreateIndex
CREATE INDEX "attendance_devices_organization_id_deleted_at_idx" ON "attendance_devices"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "attendance_devices_organization_id_businessUnitId_idx" ON "attendance_devices"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "attendance_devices_organization_id_siteId_idx" ON "attendance_devices"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_devices_id_organization_id_key" ON "attendance_devices"("id", "organization_id");

-- CreateIndex
CREATE INDEX "attendances_organization_id_deleted_at_idx" ON "attendances"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "attendances_organization_id_businessUnitId_idx" ON "attendances"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "attendances_organization_id_siteId_idx" ON "attendances"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_id_organization_id_key" ON "attendances"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_employeeId_siteId_workDate_key" ON "attendances"("employeeId", "siteId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_taps_eventKey_key" ON "attendance_taps"("eventKey");

-- CreateIndex
CREATE INDEX "attendance_taps_organization_id_deleted_at_idx" ON "attendance_taps"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_taps_id_organization_id_key" ON "attendance_taps"("id", "organization_id");

-- CreateIndex
CREATE INDEX "waste_categorys_organization_id_deleted_at_idx" ON "waste_categorys"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "waste_categorys_id_organization_id_key" ON "waste_categorys"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "waste_categorys_organization_id_name_key" ON "waste_categorys"("organization_id", "name");

-- CreateIndex
CREATE INDEX "waste_records_organization_id_deleted_at_idx" ON "waste_records"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "waste_records_organization_id_businessUnitId_idx" ON "waste_records"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "waste_records_organization_id_siteId_idx" ON "waste_records"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "waste_records_id_organization_id_key" ON "waste_records"("id", "organization_id");

-- CreateIndex
CREATE INDEX "vendors_organization_id_deleted_at_idx" ON "vendors"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "vendors_organization_id_businessUnitId_idx" ON "vendors"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_id_organization_id_key" ON "vendors"("id", "organization_id");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_deleted_at_idx" ON "vehicles"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_businessUnitId_idx" ON "vehicles"("organization_id", "businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_id_organization_id_key" ON "vehicles"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organization_id_registration_key" ON "vehicles"("organization_id", "registration");

-- CreateIndex
CREATE INDEX "disposals_organization_id_deleted_at_idx" ON "disposals"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "disposals_organization_id_businessUnitId_idx" ON "disposals"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "disposals_organization_id_siteId_idx" ON "disposals"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "disposals_id_organization_id_key" ON "disposals"("id", "organization_id");

-- CreateIndex
CREATE INDEX "tasks_organization_id_deleted_at_idx" ON "tasks"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "tasks_organization_id_businessUnitId_idx" ON "tasks"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "tasks_organization_id_siteId_idx" ON "tasks"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_organization_id_key" ON "tasks"("id", "organization_id");

-- CreateIndex
CREATE INDEX "tickets_organization_id_deleted_at_idx" ON "tickets"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "tickets_organization_id_businessUnitId_idx" ON "tickets"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "tickets_organization_id_siteId_idx" ON "tickets"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_id_organization_id_key" ON "tickets"("id", "organization_id");

-- CreateIndex
CREATE INDEX "site_visits_organization_id_deleted_at_idx" ON "site_visits"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "site_visits_organization_id_businessUnitId_idx" ON "site_visits"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "site_visits_organization_id_siteId_idx" ON "site_visits"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "site_visits_id_organization_id_key" ON "site_visits"("id", "organization_id");

-- CreateIndex
CREATE INDEX "machines_organization_id_deleted_at_idx" ON "machines"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "machines_organization_id_businessUnitId_idx" ON "machines"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "machines_organization_id_siteId_idx" ON "machines"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "machines_id_organization_id_key" ON "machines"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "machines_organization_id_machineCode_key" ON "machines"("organization_id", "machineCode");

-- CreateIndex
CREATE INDEX "machine_events_organization_id_deleted_at_idx" ON "machine_events"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "machine_events_organization_id_businessUnitId_idx" ON "machine_events"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "machine_events_organization_id_siteId_idx" ON "machine_events"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "machine_events_id_organization_id_key" ON "machine_events"("id", "organization_id");

-- CreateIndex
CREATE INDEX "production_batchs_organization_id_deleted_at_idx" ON "production_batchs"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "production_batchs_organization_id_businessUnitId_idx" ON "production_batchs"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "production_batchs_organization_id_siteId_idx" ON "production_batchs"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "production_batchs_id_organization_id_key" ON "production_batchs"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_batchs_organization_id_batchCode_key" ON "production_batchs"("organization_id", "batchCode");

-- CreateIndex
CREATE INDEX "maintenance_records_organization_id_deleted_at_idx" ON "maintenance_records"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "maintenance_records_organization_id_businessUnitId_idx" ON "maintenance_records"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "maintenance_records_organization_id_siteId_idx" ON "maintenance_records"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_records_id_organization_id_key" ON "maintenance_records"("id", "organization_id");

-- CreateIndex
CREATE INDEX "spare_parts_organization_id_deleted_at_idx" ON "spare_parts"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "spare_parts_id_organization_id_key" ON "spare_parts"("id", "organization_id");

-- CreateIndex
CREATE INDEX "invoices_organization_id_deleted_at_idx" ON "invoices"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "invoices_organization_id_businessUnitId_idx" ON "invoices"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "invoices_organization_id_siteId_idx" ON "invoices"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_organization_id_key" ON "invoices"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_invoiceNumber_key" ON "invoices"("organization_id", "invoiceNumber");

-- CreateIndex
CREATE INDEX "payments_organization_id_deleted_at_idx" ON "payments"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "payments_organization_id_businessUnitId_idx" ON "payments"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "payments_organization_id_siteId_idx" ON "payments"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_organization_id_key" ON "payments"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_reference_key" ON "payments"("organization_id", "reference");

-- CreateIndex
CREATE INDEX "expenses_organization_id_deleted_at_idx" ON "expenses"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "expenses_organization_id_businessUnitId_idx" ON "expenses"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "expenses_organization_id_siteId_idx" ON "expenses"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_id_organization_id_key" ON "expenses"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_objectKey_key" ON "documents"("objectKey");

-- CreateIndex
CREATE INDEX "documents_organization_id_deleted_at_idx" ON "documents"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "documents_organization_id_businessUnitId_idx" ON "documents"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "documents_organization_id_siteId_idx" ON "documents"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_id_organization_id_key" ON "documents"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_organization_id_deleted_at_idx" ON "notifications"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "notifications_organization_id_businessUnitId_idx" ON "notifications"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "notifications_organization_id_siteId_idx" ON "notifications"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_id_organization_id_key" ON "notifications"("id", "organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_deleted_at_idx" ON "audit_logs"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_businessUnitId_idx" ON "audit_logs"("organization_id", "businessUnitId");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_siteId_idx" ON "audit_logs"("organization_id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_id_organization_id_key" ON "audit_logs"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_organization_id_fkey" FOREIGN KEY ("roleId", "organization_id") REFERENCES "roles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_organization_id_fkey" FOREIGN KEY ("roleId", "organization_id") REFERENCES "roles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_organization_id_fkey" FOREIGN KEY ("userId", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_organization_id_fkey" FOREIGN KEY ("userId", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_organization_id_fkey" FOREIGN KEY ("departmentId", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisorId_organization_id_fkey" FOREIGN KEY ("supervisorId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_organization_id_fkey" FOREIGN KEY ("managerId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_managerId_organization_id_fkey" FOREIGN KEY ("managerId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_clientId_organization_id_fkey" FOREIGN KEY ("clientId", "organization_id") REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_salespersonId_organization_id_fkey" FOREIGN KEY ("salespersonId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_leadId_organization_id_fkey" FOREIGN KEY ("leadId", "organization_id") REFERENCES "leads"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_organization_id_fkey" FOREIGN KEY ("clientId", "organization_id") REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_clientId_organization_id_fkey" FOREIGN KEY ("clientId", "organization_id") REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_contractId_organization_id_fkey" FOREIGN KEY ("contractId", "organization_id") REFERENCES "contracts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_managerId_organization_id_fkey" FOREIGN KEY ("managerId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_supervisorId_organization_id_fkey" FOREIGN KEY ("supervisorId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_employeeId_organization_id_fkey" FOREIGN KEY ("employeeId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_supervisorId_organization_id_fkey" FOREIGN KEY ("supervisorId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_shiftId_organization_id_fkey" FOREIGN KEY ("shiftId", "organization_id") REFERENCES "shifts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfc_cards" ADD CONSTRAINT "nfc_cards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfc_cards" ADD CONSTRAINT "nfc_cards_employeeId_organization_id_fkey" FOREIGN KEY ("employeeId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employeeId_organization_id_fkey" FOREIGN KEY ("employeeId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_shiftId_organization_id_fkey" FOREIGN KEY ("shiftId", "organization_id") REFERENCES "shifts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_deviceId_organization_id_fkey" FOREIGN KEY ("deviceId", "organization_id") REFERENCES "attendance_devices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_taps" ADD CONSTRAINT "attendance_taps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_taps" ADD CONSTRAINT "attendance_taps_employeeId_organization_id_fkey" FOREIGN KEY ("employeeId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_taps" ADD CONSTRAINT "attendance_taps_deviceId_organization_id_fkey" FOREIGN KEY ("deviceId", "organization_id") REFERENCES "attendance_devices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_categorys" ADD CONSTRAINT "waste_categorys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_workerId_organization_id_fkey" FOREIGN KEY ("workerId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_categoryId_organization_id_fkey" FOREIGN KEY ("categoryId", "organization_id") REFERENCES "waste_categorys"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vendorId_organization_id_fkey" FOREIGN KEY ("vendorId", "organization_id") REFERENCES "vendors"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_wasteRecordId_organization_id_fkey" FOREIGN KEY ("wasteRecordId", "organization_id") REFERENCES "waste_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_vendorId_organization_id_fkey" FOREIGN KEY ("vendorId", "organization_id") REFERENCES "vendors"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_vehicleId_organization_id_fkey" FOREIGN KEY ("vehicleId", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_organization_id_fkey" FOREIGN KEY ("assigneeId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_clientId_organization_id_fkey" FOREIGN KEY ("clientId", "organization_id") REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigneeId_organization_id_fkey" FOREIGN KEY ("assigneeId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_managerId_organization_id_fkey" FOREIGN KEY ("managerId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_events" ADD CONSTRAINT "machine_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_events" ADD CONSTRAINT "machine_events_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_events" ADD CONSTRAINT "machine_events_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_events" ADD CONSTRAINT "machine_events_machineId_organization_id_fkey" FOREIGN KEY ("machineId", "organization_id") REFERENCES "machines"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batchs" ADD CONSTRAINT "production_batchs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batchs" ADD CONSTRAINT "production_batchs_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batchs" ADD CONSTRAINT "production_batchs_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batchs" ADD CONSTRAINT "production_batchs_machineId_organization_id_fkey" FOREIGN KEY ("machineId", "organization_id") REFERENCES "machines"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batchs" ADD CONSTRAINT "production_batchs_operatorId_organization_id_fkey" FOREIGN KEY ("operatorId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_machineId_organization_id_fkey" FOREIGN KEY ("machineId", "organization_id") REFERENCES "machines"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_technicianId_organization_id_fkey" FOREIGN KEY ("technicianId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_maintenanceId_organization_id_fkey" FOREIGN KEY ("maintenanceId", "organization_id") REFERENCES "maintenance_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_organization_id_fkey" FOREIGN KEY ("clientId", "organization_id") REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contractId_organization_id_fkey" FOREIGN KEY ("contractId", "organization_id") REFERENCES "contracts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_organization_id_fkey" FOREIGN KEY ("invoiceId", "organization_id") REFERENCES "invoices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendorId_organization_id_fkey" FOREIGN KEY ("vendorId", "organization_id") REFERENCES "vendors"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_employeeId_organization_id_fkey" FOREIGN KEY ("employeeId", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_clientId_organization_id_fkey" FOREIGN KEY ("clientId", "organization_id") REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_contractId_organization_id_fkey" FOREIGN KEY ("contractId", "organization_id") REFERENCES "contracts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_vendorId_organization_id_fkey" FOREIGN KEY ("vendorId", "organization_id") REFERENCES "vendors"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_machineId_organization_id_fkey" FOREIGN KEY ("machineId", "organization_id") REFERENCES "machines"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_organization_id_fkey" FOREIGN KEY ("userId", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_businessUnitId_organization_id_fkey" FOREIGN KEY ("businessUnitId", "organization_id") REFERENCES "business_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_siteId_organization_id_fkey" FOREIGN KEY ("siteId", "organization_id") REFERENCES "sites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_organization_id_fkey" FOREIGN KEY ("actorId", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

