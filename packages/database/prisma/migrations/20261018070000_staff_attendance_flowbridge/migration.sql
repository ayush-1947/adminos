-- CreateTable
CREATE TABLE "staff_days" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "siteId" UUID,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "source" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "startLatitude" DOUBLE PRECISION,
    "startLongitude" DOUBLE PRECISION,
    "startAccuracy" DOUBLE PRECISION,
    "endLatitude" DOUBLE PRECISION,
    "endLongitude" DOUBLE PRECISION,
    "endAccuracy" DOUBLE PRECISION,
    "startPhoto" BYTEA,
    "endPhoto" BYTEA,
    "startMime" TEXT,
    "endMime" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_leaves" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_contacts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "whatsappId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "city" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "state" TEXT NOT NULL DEFAULT 'NEW',
    "leadId" UUID,
    "submission" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_messages" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "metaId" TEXT,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_campaigns" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT 'Hi',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_days_organizationId_workDate_idx" ON "staff_days"("organizationId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "staff_days_userId_workDate_key" ON "staff_days"("userId", "workDate");

-- CreateIndex
CREATE INDEX "staff_leaves_organizationId_reviewerId_status_idx" ON "staff_leaves"("organizationId", "reviewerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_leaves_userId_workDate_key" ON "staff_leaves"("userId", "workDate");

-- CreateIndex
CREATE INDEX "flow_contacts_organizationId_updatedAt_idx" ON "flow_contacts"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "flow_contacts_organizationId_whatsappId_key" ON "flow_contacts"("organizationId", "whatsappId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_messages_metaId_key" ON "flow_messages"("metaId");

-- CreateIndex
CREATE INDEX "flow_messages_contactId_createdAt_idx" ON "flow_messages"("contactId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "flow_events_eventKey_key" ON "flow_events"("eventKey");

-- CreateIndex
CREATE INDEX "flow_events_status_nextAttemptAt_idx" ON "flow_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "flow_campaigns_organizationId_idx" ON "flow_campaigns"("organizationId");

-- AddForeignKey
ALTER TABLE "staff_days" ADD CONSTRAINT "staff_days_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_days" ADD CONSTRAINT "staff_days_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_contacts" ADD CONSTRAINT "flow_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_messages" ADD CONSTRAINT "flow_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "flow_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_events" ADD CONSTRAINT "flow_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_campaigns" ADD CONSTRAINT "flow_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
