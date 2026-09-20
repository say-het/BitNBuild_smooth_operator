ALTER TABLE "alerts" ADD COLUMN "dedup_key" TEXT;

CREATE INDEX "alerts_dedup_key_idx" ON "alerts"("dedup_key");

CREATE UNIQUE INDEX "alerts_one_active_dedup_key_uidx"
  ON "alerts"("dedup_key")
  WHERE "dedup_key" IS NOT NULL AND "status" IN ('ACTIVE', 'ACKNOWLEDGED');
