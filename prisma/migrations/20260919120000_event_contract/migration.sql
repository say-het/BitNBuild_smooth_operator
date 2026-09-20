-- Establish the controlled event taxonomy and complete canonical envelope storage.
CREATE TYPE "EventType" AS ENUM (
  'EMERGENCY_REPORT',
  'EMERGENCY_CALL',
  'SENSOR_READING',
  'FIELD_UPDATE',
  'RESOURCE_UPDATE',
  'HOSPITAL_UPDATE',
  'WEATHER_UPDATE',
  'ROAD_UPDATE',
  'SYSTEM_ALERT'
);

-- Prompt 2 used REPORT for its single baseline verification event.
UPDATE "events" SET "event_type" = 'EMERGENCY_REPORT' WHERE "event_type" = 'REPORT';

ALTER TABLE "events"
  ALTER COLUMN "event_type" TYPE "EventType" USING ("event_type"::"EventType"),
  ADD COLUMN "location_accuracy_meters" INTEGER,
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "events" ADD CONSTRAINT "events_location_accuracy_check" CHECK (
  "location_accuracy_meters" IS NULL OR "location_accuracy_meters" >= 0
);
