-- Additive Phase 8 migration. Preserve all existing tables, indexes and authority triggers.
-- CreateTable
CREATE TABLE "QualityJourneyTriageAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "executionCycleId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "predecessorReportRevisionId" TEXT,
    "inputHash" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyTriageAssignment_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyTriageAssignment_executionCycleId_fkey" FOREIGN KEY ("executionCycleId") REFERENCES "QualityJourneyExecutionCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyTriageAssignment_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyTriageAssignment_predecessorReportRevisionId_fkey" FOREIGN KEY ("predecessorReportRevisionId") REFERENCES "QualityJourneyTriageReport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyTriageReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "reportJson" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyTriageReport_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyTriageReport_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "QualityJourneyTriageAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyReportReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "reportRevisionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "successorCycleId" TEXT REFERENCES "QualityJourneyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyReportReview_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyReportReview_reportRevisionId_fkey" FOREIGN KEY ("reportRevisionId") REFERENCES "QualityJourneyTriageReport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyTriageAssignment_workItemId_key" ON "QualityJourneyTriageAssignment"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyTriageAssignment_predecessorReportRevisionId_key" ON "QualityJourneyTriageAssignment"("predecessorReportRevisionId");

-- CreateIndex
CREATE INDEX "QualityJourneyTriageAssignment_journeyId_executionCycleId_idx" ON "QualityJourneyTriageAssignment"("journeyId", "executionCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyTriageReport_assignmentId_key" ON "QualityJourneyTriageReport"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyTriageReport_journeyId_idempotencyKey_key" ON "QualityJourneyTriageReport"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyReportReview_reportRevisionId_key" ON "QualityJourneyReportReview"("reportRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyReportReview_journeyId_idempotencyKey_key" ON "QualityJourneyReportReview"("journeyId", "idempotencyKey");

CREATE TRIGGER "QualityJourneyTriageAssignment_update_immutable" BEFORE UPDATE ON "QualityJourneyTriageAssignment" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyTriageAssignment_delete_immutable" BEFORE DELETE ON "QualityJourneyTriageAssignment" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyTriageReport_update_immutable" BEFORE UPDATE ON "QualityJourneyTriageReport" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyTriageReport_delete_immutable" BEFORE DELETE ON "QualityJourneyTriageReport" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyReportReview_update_immutable" BEFORE UPDATE ON "QualityJourneyReportReview" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyReportReview_delete_immutable" BEFORE DELETE ON "QualityJourneyReportReview" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyTriageAssignment_scope" BEFORE INSERT ON "QualityJourneyTriageAssignment"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" e JOIN "QualityJourneyWorkItem" w ON w.id = NEW.workItemId WHERE e.id = NEW.executionCycleId AND e.journeyId = NEW.journeyId AND w.journeyId = e.journeyId AND w.targetProjectId = e.targetProjectId AND w.cycleId = e.cycleId AND w.role = 'TRIAGER' AND w.inputHash = NEW.inputHash)
OR (NEW.predecessorReportRevisionId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageReport" r JOIN "QualityJourneyTriageAssignment" a ON a.id = r.assignmentId WHERE r.id = NEW.predecessorReportRevisionId AND r.journeyId = NEW.journeyId AND a.executionCycleId = NEW.executionCycleId))
BEGIN SELECT RAISE(ABORT, 'Quality Journey triage assignment scope mismatch'); END;
CREATE TRIGGER "QualityJourneyTriageReport_scope" BEFORE INSERT ON "QualityJourneyTriageReport"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageAssignment" a WHERE a.id = NEW.assignmentId AND a.journeyId = NEW.journeyId)
BEGIN SELECT RAISE(ABORT, 'Quality Journey report scope mismatch'); END;
CREATE TRIGGER "QualityJourneyReportReview_scope" BEFORE INSERT ON "QualityJourneyReportReview"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageReport" r WHERE r.id = NEW.reportRevisionId AND r.journeyId = NEW.journeyId)
BEGIN SELECT RAISE(ABORT, 'Quality Journey report review scope mismatch'); END;

ALTER TABLE "QualityJourney" ADD COLUMN "activeTriageReportId" TEXT REFERENCES "QualityJourneyTriageReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "QualityJourney_activeTriageReportId_key" ON "QualityJourney"("activeTriageReportId");

CREATE TRIGGER "QualityJourney_active_report_scope" BEFORE UPDATE OF "activeTriageReportId" ON "QualityJourney"
WHEN NEW.activeTriageReportId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageReport" r WHERE r.id = NEW.activeTriageReportId AND r.journeyId = NEW.id)
BEGIN SELECT RAISE(ABORT, 'Quality Journey active report scope mismatch'); END;
CREATE TRIGGER "QualityJourney_remediation_cycle_immutable" BEFORE UPDATE ON "QualityJourneyCycle"
WHEN EXISTS (SELECT 1 FROM "QualityJourneyReportReview" WHERE successorCycleId = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Quality Journey remediation cycle is immutable'); END;
CREATE TRIGGER "QualityJourney_remediation_cycle_append_only" BEFORE DELETE ON "QualityJourneyCycle"
WHEN EXISTS (SELECT 1 FROM "QualityJourneyReportReview" WHERE successorCycleId = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Quality Journey remediation cycle is append-only'); END;

CREATE UNIQUE INDEX "QualityJourneyReportReview_successorCycleId_key" ON "QualityJourneyReportReview"("successorCycleId");
CREATE TRIGGER "QualityJourneyReportReview_successor_scope" BEFORE INSERT ON "QualityJourneyReportReview"
WHEN NEW.successorCycleId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCycle" c WHERE c.id = NEW.successorCycleId AND c.journeyId = NEW.journeyId)
BEGIN SELECT RAISE(ABORT, 'Quality Journey remediation successor scope mismatch'); END;
ALTER TABLE "QualityJourneyExecutionRerunProposal" ADD COLUMN "reportRevisionId" TEXT;
ALTER TABLE "QualityJourneyExecutionRerunProposal" ADD COLUMN "reportHash" TEXT;
CREATE TRIGGER "QualityJourneyExecutionRerunProposal_report_immutable" BEFORE UPDATE OF "reportRevisionId", "reportHash" ON "QualityJourneyExecutionRerunProposal"
BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun report binding is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionRerunProposal_report_scope" BEFORE INSERT ON "QualityJourneyExecutionRerunProposal"
WHEN (NEW.reportRevisionId IS NULL) != (NEW.reportHash IS NULL) OR (NEW.reportRevisionId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageReport" r JOIN "QualityJourneyTriageAssignment" a ON a.id = r.assignmentId WHERE r.id = NEW.reportRevisionId AND r.journeyId = NEW.journeyId AND r.contentHash = NEW.reportHash AND a.executionCycleId = NEW.sourceExecutionCycleId))
BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun report scope mismatch'); END;
