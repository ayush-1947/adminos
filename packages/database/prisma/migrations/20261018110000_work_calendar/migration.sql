CREATE TABLE "work_calendars" (
  "organizationId" UUID NOT NULL PRIMARY KEY REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workingWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
  "trackingFrom" DATE NOT NULL DEFAULT CURRENT_DATE,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "work_calendar_days" (
  "id" UUID NOT NULL PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "date" DATE NOT NULL,
  "working" BOOLEAN NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "work_calendar_days_organizationId_date_key" ON "work_calendar_days"("organizationId", "date");
-- Begin tracking at release; do not turn historic sample dates into missed days.
INSERT INTO "work_calendars" ("organizationId", "trackingFrom", "updatedAt")
SELECT "id", (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE, CURRENT_TIMESTAMP FROM "organizations";
