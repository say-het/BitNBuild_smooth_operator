CREATE TYPE "SimulationScenarioType" AS ENUM ('INDUSTRIAL_FIRE', 'FLOOD', 'ROAD_ACCIDENT', 'EARTHQUAKE');
CREATE TYPE "SimulationStatus" AS ENUM ('CREATED', 'RUNNING', 'PAUSED', 'COMPLETED', 'STOPPED', 'FAILED');

CREATE TABLE "simulation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" TEXT NOT NULL,
  "scenario_type" "SimulationScenarioType" NOT NULL,
  "status" "SimulationStatus" NOT NULL DEFAULT 'CREATED',
  "seed" INTEGER NOT NULL,
  "time_scale" INTEGER NOT NULL,
  "simulation_time_seconds" INTEGER NOT NULL DEFAULT 0,
  "events_generated" INTEGER NOT NULL DEFAULT 0,
  "next_event_index" INTEGER NOT NULL DEFAULT 0,
  "configuration" JSONB NOT NULL,
  "world_state" JSONB NOT NULL,
  "failure" JSONB,
  "started_at" TIMESTAMPTZ(3),
  "ended_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "simulation_runs_time_scale_check" CHECK ("time_scale" IN (1, 5, 10, 20)),
  CONSTRAINT "simulation_runs_time_check" CHECK ("simulation_time_seconds" >= 0),
  CONSTRAINT "simulation_runs_event_counts_check" CHECK ("events_generated" >= 0 AND "next_event_index" >= 0)
);

CREATE TABLE "simulation_ground_truth_incidents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "simulation_run_id" UUID NOT NULL,
  "ground_truth_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL,
  "start_offset_seconds" INTEGER NOT NULL,
  "severity" INTEGER NOT NULL,
  "estimated_victims" INTEGER NOT NULL,
  "hazards" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "required_capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "truth" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_ground_truth_incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "simulation_truth_severity_check" CHECK ("severity" BETWEEN 1 AND 5),
  CONSTRAINT "simulation_truth_victims_check" CHECK ("estimated_victims" >= 0),
  CONSTRAINT "simulation_truth_start_check" CHECK ("start_offset_seconds" >= 0)
);

CREATE UNIQUE INDEX "simulation_runs_run_id_key" ON "simulation_runs"("run_id");
CREATE INDEX "simulation_runs_status_idx" ON "simulation_runs"("status");
CREATE INDEX "simulation_runs_scenario_type_idx" ON "simulation_runs"("scenario_type");
CREATE INDEX "simulation_runs_created_at_idx" ON "simulation_runs"("created_at" DESC);
CREATE UNIQUE INDEX "simulation_ground_truth_incidents_simulation_run_id_ground_key" ON "simulation_ground_truth_incidents"("simulation_run_id", "ground_truth_id");
CREATE INDEX "simulation_ground_truth_incidents_simulation_run_id_idx" ON "simulation_ground_truth_incidents"("simulation_run_id");

ALTER TABLE "simulation_ground_truth_incidents"
ADD CONSTRAINT "simulation_ground_truth_incidents_simulation_run_id_fkey"
FOREIGN KEY ("simulation_run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
