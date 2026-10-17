-- Daily manual marks do not invent clock-in/out times. NFC timestamps remain intact.
ALTER TABLE "attendances" ALTER COLUMN "checkIn" DROP NOT NULL;
ALTER TABLE "attendances" ADD COLUMN "manualOverrideBy" UUID;
