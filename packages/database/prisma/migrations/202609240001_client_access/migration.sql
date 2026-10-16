ALTER TABLE "users" ADD COLUMN "clientId" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_clientId_organization_id_fkey" FOREIGN KEY ("clientId", "organization_id") REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
