DROP INDEX "PlanEvent_publishOperationId_type_key";

CREATE INDEX "PlanEvent_publishOperationId_type_idx" ON "PlanEvent"("publishOperationId", "type");
