CREATE TYPE "AssignmentOrigin" AS ENUM ('MANUAL', 'OPTIMIZER', 'ESCALATION', 'SYSTEM');

ALTER TABLE "resource_assignments"
  ADD COLUMN "origin" "AssignmentOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "role" TEXT;

CREATE UNIQUE INDEX "resource_assignments_one_active_resource_uidx"
  ON "resource_assignments"("resource_id")
  WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE');
