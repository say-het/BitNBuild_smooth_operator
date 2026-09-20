-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('CITIZEN', 'EMERGENCY_CALL', 'SENSOR', 'FIELD_TEAM', 'HOSPITAL', 'GOVERNMENT', 'WEATHER', 'SIMULATOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EventProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('FIRE', 'FLOOD', 'ROAD_ACCIDENT', 'EARTHQUAKE', 'MEDICAL_EMERGENCY', 'HAZMAT', 'BUILDING_COLLAPSE', 'INFRASTRUCTURE_FAILURE', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentPriority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('CREATED', 'ASSESSING', 'RESOURCE_RECOMMENDED', 'RESOURCE_ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVING', 'RESOLVED', 'DELAYED', 'ESCALATED', 'REOPTIMIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IncidentEventRelationshipType" AS ENUM ('PRIMARY_SIGNAL', 'SUPPORTING_SIGNAL', 'DUPLICATE', 'CORROBORATING_SIGNAL', 'FIELD_UPDATE', 'SYSTEM_UPDATE');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('AMBULANCE', 'FIRE_TRUCK', 'POLICE_UNIT', 'RESCUE_TEAM', 'MEDICAL_TEAM', 'HAZMAT_TEAM', 'HELICOPTER', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'UNAVAILABLE', 'MAINTENANCE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE', 'COMPLETED', 'CANCELLED', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "HospitalStatus" AS ENUM ('OPERATIONAL', 'LIMITED', 'OVERLOADED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SensorType" AS ENUM ('SMOKE', 'WATER_LEVEL', 'TEMPERATURE', 'STRUCTURAL', 'TRAFFIC', 'AIR_QUALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "SensorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'FAULT', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ReadingQuality" AS ENUM ('GOOD', 'SUSPECT', 'BAD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('CRITICAL_INCIDENT', 'RESPONSE_DELAY', 'RESOURCE_SHORTAGE', 'HOSPITAL_OVERLOAD', 'ESCALATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('OPERATOR', 'SYSTEM', 'AI_AGENT', 'RESPONDER', 'SIMULATOR', 'INTEGRATION');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "source" "EventSource" NOT NULL,
    "event_type" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "location" geography(Point, 4326),
    "payload" JSONB NOT NULL,
    "processing_status" "EventProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processing_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "incident_id" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" INTEGER NOT NULL,
    "priority" "IncidentPriority" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'CREATED',
    "confidence" DECIMAL(4,3),
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "estimated_victims" INTEGER,
    "estimated_injured" INTEGER,
    "estimated_trapped" INTEGER,
    "hazards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "location" geography(Point, 4326),
    "detected_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "incident_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "relationship_type" "IncidentEventRelationshipType" NOT NULL,
    "confidence" DECIMAL(4,3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("incident_id","event_id")
);

-- CreateTable
CREATE TABLE "capabilities" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_capabilities" (
    "incident_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "incident_capabilities_pkey" PRIMARY KEY ("incident_id","capability_id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "resource_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "location" geography(Point, 4326),
    "availability" JSONB,
    "capacity" JSONB,
    "current_incident_id" UUID,
    "home_base" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_capabilities" (
    "resource_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "proficiency" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "resource_capabilities_pkey" PRIMARY KEY ("resource_id","capability_id")
);

-- CreateTable
CREATE TABLE "resource_assignments" (
    "id" UUID NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "incident_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "departed_at" TIMESTAMPTZ(3),
    "arrived_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "estimated_arrival" TIMESTAMPTZ(3),
    "actual_arrival" TIMESTAMPTZ(3),
    "assignment_reason" TEXT,
    "distance_meters" INTEGER,
    "estimated_travel_time_seconds" INTEGER,
    "optimization_score" DECIMAL(8,4),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resource_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitals" (
    "id" UUID NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "location" geography(Point, 4326),
    "status" "HospitalStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "total_beds" INTEGER NOT NULL,
    "available_beds" INTEGER NOT NULL,
    "icu_beds" INTEGER NOT NULL,
    "available_icu_beds" INTEGER NOT NULL,
    "emergency_capacity" INTEGER NOT NULL,
    "available_emergency_capacity" INTEGER NOT NULL,
    "ambulance_capacity" INTEGER NOT NULL,
    "status_updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" UUID NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SensorType" NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "location" geography(Point, 4326),
    "status" "SensorStatus" NOT NULL DEFAULT 'ACTIVE',
    "unit" TEXT NOT NULL,
    "thresholds" JSONB,
    "metadata" JSONB,
    "last_reading_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_readings" (
    "id" UUID NOT NULL,
    "reading_id" TEXT NOT NULL,
    "sensor_id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "quality" "ReadingQuality" NOT NULL DEFAULT 'GOOD',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "alert_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "incident_id" UUID,
    "resource_id" UUID,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledged_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "audit_id" TEXT NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "previous_state" JSONB,
    "new_state" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_event_id_key" ON "events"("event_id");

-- CreateIndex
CREATE INDEX "events_source_idx" ON "events"("source");

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE INDEX "events_timestamp_idx" ON "events"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "events_processing_status_idx" ON "events"("processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_incident_id_key" ON "incidents"("incident_id");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_priority_idx" ON "incidents"("priority");

-- CreateIndex
CREATE INDEX "incidents_severity_idx" ON "incidents"("severity");

-- CreateIndex
CREATE INDEX "incidents_type_idx" ON "incidents"("type");

-- CreateIndex
CREATE INDEX "incidents_created_at_idx" ON "incidents"("created_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_updated_at_idx" ON "incidents"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "incident_events_event_id_idx" ON "incident_events"("event_id");

-- CreateIndex
CREATE INDEX "incident_events_relationship_type_idx" ON "incident_events"("relationship_type");

-- CreateIndex
CREATE UNIQUE INDEX "capabilities_code_key" ON "capabilities"("code");

-- CreateIndex
CREATE INDEX "incident_capabilities_capability_id_idx" ON "incident_capabilities"("capability_id");

-- CreateIndex
CREATE UNIQUE INDEX "resources_resource_id_key" ON "resources"("resource_id");

-- CreateIndex
CREATE INDEX "resources_type_idx" ON "resources"("type");

-- CreateIndex
CREATE INDEX "resources_status_idx" ON "resources"("status");

-- CreateIndex
CREATE INDEX "resources_current_incident_id_idx" ON "resources"("current_incident_id");

-- CreateIndex
CREATE INDEX "resource_capabilities_capability_id_idx" ON "resource_capabilities"("capability_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_assignments_assignment_id_key" ON "resource_assignments"("assignment_id");

-- CreateIndex
CREATE INDEX "resource_assignments_incident_id_idx" ON "resource_assignments"("incident_id");

-- CreateIndex
CREATE INDEX "resource_assignments_resource_id_idx" ON "resource_assignments"("resource_id");

-- CreateIndex
CREATE INDEX "resource_assignments_status_idx" ON "resource_assignments"("status");

-- CreateIndex
CREATE INDEX "resource_assignments_incident_id_status_idx" ON "resource_assignments"("incident_id", "status");

-- CreateIndex
CREATE INDEX "resource_assignments_resource_id_status_idx" ON "resource_assignments"("resource_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_hospital_id_key" ON "hospitals"("hospital_id");

-- CreateIndex
CREATE INDEX "hospitals_status_idx" ON "hospitals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sensors_sensor_id_key" ON "sensors"("sensor_id");

-- CreateIndex
CREATE INDEX "sensors_type_idx" ON "sensors"("type");

-- CreateIndex
CREATE INDEX "sensors_status_idx" ON "sensors"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sensor_readings_reading_id_key" ON "sensor_readings"("reading_id");

-- CreateIndex
CREATE INDEX "sensor_readings_sensor_id_timestamp_idx" ON "sensor_readings"("sensor_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "sensor_readings_timestamp_idx" ON "sensor_readings"("timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "alerts_alert_id_key" ON "alerts"("alert_id");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_type_idx" ON "alerts"("type");

-- CreateIndex
CREATE INDEX "alerts_created_at_idx" ON "alerts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "alerts_incident_id_idx" ON "alerts"("incident_id");

-- CreateIndex
CREATE INDEX "alerts_status_created_at_idx" ON "alerts"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_audit_id_key" ON "audit_logs"("audit_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_type_actor_id_idx" ON "audit_logs"("actor_type", "actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_capabilities" ADD CONSTRAINT "incident_capabilities_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_capabilities" ADD CONSTRAINT "incident_capabilities_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_current_incident_id_fkey" FOREIGN KEY ("current_incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_capabilities" ADD CONSTRAINT "resource_capabilities_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_capabilities" ADD CONSTRAINT "resource_capabilities_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Spatial indexes are maintained in SQL because Prisma cannot currently declare GiST indexes
-- for Unsupported PostGIS geography columns.
CREATE INDEX "events_location_gix" ON "events" USING GIST ("location");
CREATE INDEX "incidents_location_gix" ON "incidents" USING GIST ("location");
CREATE INDEX "resources_location_gix" ON "resources" USING GIST ("location");
CREATE INDEX "hospitals_location_gix" ON "hospitals" USING GIST ("location");
CREATE INDEX "sensors_location_gix" ON "sensors" USING GIST ("location");

-- Domain invariants that are stricter than Prisma's portable schema surface.
ALTER TABLE "events" ADD CONSTRAINT "events_coordinates_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_severity_check" CHECK ("severity" BETWEEN 1 AND 5);
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_confidence_check" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1);
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_counts_check" CHECK (
  COALESCE("estimated_victims", 0) >= 0 AND
  COALESCE("estimated_injured", 0) >= 0 AND
  COALESCE("estimated_trapped", 0) >= 0
);
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_coordinates_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolution_time_check" CHECK ("resolved_at" IS NULL OR "resolved_at" >= "detected_at");
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_confidence_check" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1);
ALTER TABLE "incident_capabilities" ADD CONSTRAINT "incident_capabilities_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "resources" ADD CONSTRAINT "resources_coordinates_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "resource_capabilities" ADD CONSTRAINT "resource_capabilities_proficiency_check" CHECK ("proficiency" BETWEEN 1 AND 5);
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_metrics_check" CHECK (
  COALESCE("distance_meters", 0) >= 0 AND
  COALESCE("estimated_travel_time_seconds", 0) >= 0 AND
  ("optimization_score" IS NULL OR "optimization_score" >= 0)
);
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_coordinates_check" CHECK (
  "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
);
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_capacity_check" CHECK (
  "total_beds" >= 0 AND "available_beds" BETWEEN 0 AND "total_beds" AND
  "icu_beds" >= 0 AND "available_icu_beds" BETWEEN 0 AND "icu_beds" AND
  "emergency_capacity" >= 0 AND "available_emergency_capacity" BETWEEN 0 AND "emergency_capacity" AND
  "ambulance_capacity" >= 0
);
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_coordinates_check" CHECK (
  "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
);
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_severity_check" CHECK ("severity" BETWEEN 1 AND 5);
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_lifecycle_check" CHECK (
  ("acknowledged_at" IS NULL OR "acknowledged_at" >= "created_at") AND
  ("resolved_at" IS NULL OR "resolved_at" >= "created_at")
);
