CREATE TYPE "CorrelationStatus" AS ENUM ('PENDING', 'NEW_INCIDENT', 'CORRELATED');

ALTER TABLE "incident_candidates"
  ADD COLUMN "correlation_status" "CorrelationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "correlated_incident_id" UUID,
  ADD COLUMN "correlation_metadata" JSONB,
  ADD COLUMN "correlated_at" TIMESTAMPTZ(3);

ALTER TABLE "incident_events"
  ADD COLUMN "correlation_score" DECIMAL(4,3),
  ADD COLUMN "correlation_metadata" JSONB;

ALTER TABLE "incident_events"
  ADD CONSTRAINT "incident_events_correlation_score_check"
  CHECK ("correlation_score" IS NULL OR ("correlation_score" >= 0 AND "correlation_score" <= 1));

CREATE INDEX "incident_candidates_correlation_status_idx" ON "incident_candidates"("correlation_status");
CREATE INDEX "incident_candidates_correlated_incident_id_idx" ON "incident_candidates"("correlated_incident_id");

ALTER TABLE "incident_candidates"
  ADD CONSTRAINT "incident_candidates_correlated_incident_id_fkey"
  FOREIGN KEY ("correlated_incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
