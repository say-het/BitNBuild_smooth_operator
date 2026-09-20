CREATE TYPE "AIAnalysisType" AS ENUM ('INCIDENT_INTELLIGENCE');
CREATE TYPE "AIAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

CREATE TABLE "ai_analyses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "analysis_id" TEXT NOT NULL, "event_id" UUID NOT NULL,
  "analysis_type" "AIAnalysisType" NOT NULL, "provider" TEXT NOT NULL, "model" TEXT NOT NULL,
  "status" "AIAnalysisStatus" NOT NULL DEFAULT 'PENDING', "result" JSONB, "confidence" DECIMAL(4,3),
  "evidence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "error_code" TEXT, "error_message" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0, "metadata" JSONB, "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_analyses_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  CONSTRAINT "ai_analyses_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 3)
);

CREATE TABLE "incident_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "candidate_id" TEXT NOT NULL, "event_id" UUID NOT NULL,
  "analysis_id" UUID NOT NULL, "incident_type" "IncidentType" NOT NULL, "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL, "severity" INTEGER NOT NULL, "priority" "IncidentPriority" NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL, "estimated_victims" INTEGER, "estimated_injured" INTEGER,
  "estimated_trapped" INTEGER, "hazards" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "required_capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6), "location_confidence" DECIMAL(4,3), "evidence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incident_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "incident_candidates_severity_check" CHECK ("severity" BETWEEN 1 AND 5),
  CONSTRAINT "incident_candidates_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "incident_candidates_location_confidence_check" CHECK ("location_confidence" IS NULL OR ("location_confidence" >= 0 AND "location_confidence" <= 1)),
  CONSTRAINT "incident_candidates_counts_check" CHECK (("estimated_victims" IS NULL OR "estimated_victims" >= 0) AND ("estimated_injured" IS NULL OR "estimated_injured" >= 0) AND ("estimated_trapped" IS NULL OR "estimated_trapped" >= 0)),
  CONSTRAINT "incident_candidates_coordinates_check" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
);

CREATE UNIQUE INDEX "ai_analyses_analysis_id_key" ON "ai_analyses"("analysis_id");
CREATE UNIQUE INDEX "ai_analyses_event_id_analysis_type_key" ON "ai_analyses"("event_id", "analysis_type");
CREATE INDEX "ai_analyses_status_idx" ON "ai_analyses"("status");
CREATE INDEX "ai_analyses_analysis_type_idx" ON "ai_analyses"("analysis_type");
CREATE INDEX "ai_analyses_created_at_idx" ON "ai_analyses"("created_at" DESC);
CREATE UNIQUE INDEX "incident_candidates_candidate_id_key" ON "incident_candidates"("candidate_id");
CREATE UNIQUE INDEX "incident_candidates_analysis_id_key" ON "incident_candidates"("analysis_id");
CREATE INDEX "incident_candidates_event_id_idx" ON "incident_candidates"("event_id");
CREATE INDEX "incident_candidates_incident_type_idx" ON "incident_candidates"("incident_type");
CREATE INDEX "incident_candidates_priority_idx" ON "incident_candidates"("priority");
CREATE INDEX "incident_candidates_created_at_idx" ON "incident_candidates"("created_at" DESC);

ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_candidates" ADD CONSTRAINT "incident_candidates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_candidates" ADD CONSTRAINT "incident_candidates_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "ai_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
