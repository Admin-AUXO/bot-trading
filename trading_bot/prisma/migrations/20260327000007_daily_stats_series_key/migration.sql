-- Add a stable series identifier so aggregate rows do not depend on nullable strategy semantics.
ALTER TABLE "DailyStats" ADD COLUMN "seriesKey" TEXT;

UPDATE "DailyStats"
SET "seriesKey" = CASE
  WHEN "strategy" IS NULL THEN 'ALL'
  ELSE "strategy"::text
END
WHERE "seriesKey" IS NULL;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY "date", "mode", "configProfile", "seriesKey"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "DailyStats"
)
DELETE FROM "DailyStats"
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

ALTER TABLE "DailyStats" ALTER COLUMN "seriesKey" SET NOT NULL;

CREATE UNIQUE INDEX "DailyStats_date_seriesKey_mode_configProfile_key"
  ON "DailyStats" ("date", "seriesKey", "mode", "configProfile");
