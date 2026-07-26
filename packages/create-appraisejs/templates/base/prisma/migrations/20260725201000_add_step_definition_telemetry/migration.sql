CREATE TABLE "StepDefinitionTelemetryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surface" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "stepId" TEXT,
    "stepVersion" TEXT,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StepDefinitionTelemetryEvent_surface_outcome_createdAt_idx"
ON "StepDefinitionTelemetryEvent"("surface", "outcome", "createdAt");
CREATE INDEX "StepDefinitionTelemetryEvent_stepId_stepVersion_createdAt_idx"
ON "StepDefinitionTelemetryEvent"("stepId", "stepVersion", "createdAt");
