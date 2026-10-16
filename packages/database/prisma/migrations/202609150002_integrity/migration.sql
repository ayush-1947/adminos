ALTER TABLE "contracts" ADD CONSTRAINT "contract_dates" CHECK ("endDate" >= "startDate"), ADD CONSTRAINT "contract_value" CHECK ("value" >= 0);
ALTER TABLE "sites" ADD CONSTRAINT "site_coordinates" CHECK ((latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)), ADD CONSTRAINT "site_expected_nonnegative" CHECK ("expectedDailyWaste" >= 0);
ALTER TABLE "shifts" ADD CONSTRAINT "shift_minutes" CHECK ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 0 AND 1439 AND "graceMinutes" BETWEEN 0 AND 180);
ALTER TABLE "site_assignments" ADD CONSTRAINT "assignment_dates" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "attendances" ADD CONSTRAINT "attendance_times" CHECK ("checkOut" IS NULL OR "checkOut" > "checkIn"), ADD CONSTRAINT "attendance_overtime" CHECK ("overtimeMinutes" >= 0);
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_positive" CHECK (quantity > 0), ADD CONSTRAINT "waste_unit" CHECK (unit = 'KG'), ADD CONSTRAINT "waste_stage" CHECK (stage IN ('COLLECTED','SEGREGATED','WEIGHED','STORED','DISPOSED'));
ALTER TABLE "disposals" ADD CONSTRAINT "disposal_positive" CHECK (quantity > 0);
ALTER TABLE "production_batchs" ADD CONSTRAINT "batch_weights" CHECK ("inputKg" > 0 AND ("outputKg" IS NULL OR "outputKg" BETWEEN 0 AND "inputKg")), ADD CONSTRAINT "batch_times" CHECK ("endTime" IS NULL OR ("endTime" > "startTime" AND "outputKg" IS NOT NULL));
ALTER TABLE "invoices" ADD CONSTRAINT "invoice_positive" CHECK (amount > 0), ADD CONSTRAINT "invoice_dates" CHECK ("dueAt" >= "issuedAt");
ALTER TABLE "payments" ADD CONSTRAINT "payment_positive" CHECK (amount > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expense_positive" CHECK (amount > 0);
ALTER TABLE "machines" ADD CONSTRAINT "machine_state" CHECK (status IN ('RUNNING','IDLE','OFFLINE','MAINTENANCE','ERROR')), ADD CONSTRAINT "machine_capacity" CHECK (capacity > 0 AND "operatingHours" >= 0);
ALTER TABLE "tickets" ADD CONSTRAINT "ticket_state" CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED'));
ALTER TABLE "documents" ADD CONSTRAINT "document_one_owner" CHECK (num_nonnulls("employeeId","clientId","contractId","vendorId","machineId") = 1 OR ("siteId" IS NOT NULL AND num_nonnulls("employeeId","clientId","contractId","vendorId","machineId") = 0)), ADD CONSTRAINT "document_size" CHECK (size > 0 AND size <= 10485760);
CREATE INDEX "waste_operational_date" ON "waste_records" ("organization_id", "businessUnitId", "recordedAt");
CREATE INDEX "attendance_operational_date" ON "attendances" ("organization_id", "siteId", "workDate");
CREATE INDEX "production_operational_date" ON "production_batchs" ("organization_id", "siteId", "startTime");
CREATE INDEX "events_machine_time" ON "machine_events" ("organization_id", "machineId", "recordedAt");
CREATE INDEX "sessions_expiry" ON "sessions" ("expiresAt");
-- Supabase browser/anonymous roles must not access ERP tables directly. API
-- traffic uses a server-only PostgreSQL role; API scope is always enforced.
DO $$ DECLARE row record; BEGIN
  FOR row IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', row.tablename);
  END LOOP;
END $$;
