ALTER TABLE "StepDefinitionDraft" ADD COLUMN "reuseEvidenceJson" TEXT;

ALTER TABLE "StepDefinitionTelemetryEvent" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "StepDefinitionTelemetryEvent" ADD COLUMN "planId" TEXT;
CREATE INDEX "StepDefinitionTelemetryEvent_planId_correlationId_createdAt_idx"
ON "StepDefinitionTelemetryEvent"("planId", "correlationId", "createdAt");
