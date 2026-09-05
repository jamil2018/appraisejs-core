CREATE TABLE "QualityJourneyExecutionCycle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "predecessorExecutionCycleId" TEXT,
  "preparedCapsulesJson" TEXT NOT NULL,
  "preparedCapsulesHash" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "environmentSnapshotJson" TEXT NOT NULL,
  "environmentSnapshotHash" TEXT NOT NULL,
  "environmentSnapshotVersion" INTEGER NOT NULL,
  "targetFingerprint" TEXT NOT NULL,
  "browserEngine" TEXT NOT NULL DEFAULT 'CHROMIUM',
  "stateHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "cancellationReason" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  CONSTRAINT "QualityJourneyExecutionCycle_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyExecutionCycle_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyExecutionCycle_journeyId_idempotencyKey_key" ON "QualityJourneyExecutionCycle"("journeyId", "idempotencyKey");
CREATE INDEX "QualityJourneyExecutionCycle_journeyId_cycleId_status_idx" ON "QualityJourneyExecutionCycle"("journeyId", "cycleId", "status");
CREATE INDEX "QualityJourneyExecutionCycle_targetProjectId_status_idx" ON "QualityJourneyExecutionCycle"("targetProjectId", "status");
CREATE TRIGGER "QualityJourneyExecutionCycle_journey_cycle_scope" BEFORE INSERT ON "QualityJourneyExecutionCycle" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyCycle" cycle JOIN "QualityJourney" journey ON journey."id" = cycle."journeyId" WHERE cycle."id" = NEW."cycleId" AND cycle."journeyId" = NEW."journeyId" AND journey."targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cycle does not belong to its journey target scope'); END;
CREATE TRIGGER "QualityJourneyExecutionCycle_environment_scope" BEFORE INSERT ON "QualityJourneyExecutionCycle" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "Environment" WHERE "id" = NEW."environmentId" AND "targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution environment is outside its target scope'); END;
CREATE TRIGGER "QualityJourneyExecutionCycle_predecessor_scope" BEFORE INSERT ON "QualityJourneyExecutionCycle" FOR EACH ROW WHEN NEW."predecessorExecutionCycleId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."predecessorExecutionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "status" IN ('COMPLETED', 'CANCELLED')) BEGIN SELECT RAISE(ABORT, 'Quality Journey execution predecessor is outside its terminal journey target scope'); END;
CREATE TRIGGER "QualityJourneyExecutionCycle_frozen_identity" BEFORE UPDATE OF "id", "journeyId", "targetProjectId", "cycleId", "predecessorExecutionCycleId", "preparedCapsulesJson", "preparedCapsulesHash", "environmentId", "environmentSnapshotJson", "environmentSnapshotHash", "environmentSnapshotVersion", "targetFingerprint", "browserEngine", "stateHash", "idempotencyKey", "requestHash" ON "QualityJourneyExecutionCycle" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cycle binding is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionCycle_append_only" BEFORE DELETE ON "QualityJourneyExecutionCycle" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cycles are append-only'); END;

CREATE TABLE "QualityJourneyExecutionTestRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "executionCycleId" TEXT NOT NULL,
  "preparedCapsuleId" TEXT NOT NULL,
  "testRunId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyExecutionTestRun_executionCycleId_fkey" FOREIGN KEY ("executionCycleId") REFERENCES "QualityJourneyExecutionCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyExecutionTestRun_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyExecutionTestRun_testRunId_key" ON "QualityJourneyExecutionTestRun"("testRunId");
CREATE UNIQUE INDEX "QualityJourneyExecutionTestRun_executionCycleId_preparedCapsuleId_key" ON "QualityJourneyExecutionTestRun"("executionCycleId", "preparedCapsuleId");
CREATE INDEX "QualityJourneyExecutionTestRun_preparedCapsuleId_idx" ON "QualityJourneyExecutionTestRun"("preparedCapsuleId");
CREATE TRIGGER "QualityJourneyExecutionTestRun_insert_scope" BEFORE INSERT ON "QualityJourneyExecutionTestRun" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" cycle JOIN "TestRun" run ON run."id" = NEW."testRunId" WHERE cycle."id" = NEW."executionCycleId" AND run."runId" = NEW."runId" AND run."targetProjectId" = cycle."targetProjectId" AND run."environmentId" = cycle."environmentId" AND run."environmentSnapshotJson" = cycle."environmentSnapshotJson" AND run."environmentSnapshotHash" = cycle."environmentSnapshotHash" AND run."environmentSnapshotVersion" = cycle."environmentSnapshotVersion" AND run."browserEngine" = cycle."browserEngine" AND EXISTS (SELECT 1 FROM json_each(cycle."preparedCapsulesJson") WHERE json_extract(value, '$.preparedCapsuleId') = NEW."preparedCapsuleId")) BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun binding is outside the frozen cycle scope'); END;
CREATE TRIGGER "QualityJourneyExecutionTestRun_frozen_identity" BEFORE UPDATE OF "id", "executionCycleId", "preparedCapsuleId", "testRunId", "runId" ON "QualityJourneyExecutionTestRun" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution test-run binding is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionTestRun_append_only" BEFORE DELETE ON "QualityJourneyExecutionTestRun" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution test-run bindings are append-only'); END;
CREATE TRIGGER "QualityJourneyExecutionTestRun_test_run_identity" BEFORE UPDATE OF "id", "runId", "intent", "targetProjectId", "environmentId", "environmentSnapshotJson", "environmentSnapshotHash", "environmentSnapshotVersion", "browserEngine" ON "TestRun" FOR EACH ROW WHEN EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "testRunId" = OLD."id") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun identity is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionTestRun_case_identity" BEFORE UPDATE OF "testRunId", "testCaseId", "testSuiteId" ON "TestRunTestCase" FOR EACH ROW WHEN EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "testRunId" = OLD."testRunId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun case identity is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionTestRun_case_append_only" BEFORE DELETE ON "TestRunTestCase" FOR EACH ROW WHEN EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "testRunId" = OLD."testRunId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun cases are append-only'); END;
CREATE TRIGGER "QualityJourneyExecutionTestRun_case_no_late_insert" BEFORE INSERT ON "TestRunTestCase" FOR EACH ROW WHEN EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "testRunId" = NEW."testRunId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun cases are append-only'); END;

CREATE TABLE "QualityJourneyExecutionConsent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "executionCycleId" TEXT,
  "scopeJson" TEXT NOT NULL,
  "scopeHash" TEXT NOT NULL,
  "grantSource" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT,
  "grantedAt" DATETIME,
  "expiresAt" DATETIME,
  "usedAt" DATETIME,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyExecutionConsent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyExecutionConsent_executionCycleId_fkey" FOREIGN KEY ("executionCycleId") REFERENCES "QualityJourneyExecutionCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "QualityJourneyExecutionConsent_journeyId_scopeHash_status_idx" ON "QualityJourneyExecutionConsent"("journeyId", "scopeHash", "status");
CREATE INDEX "QualityJourneyExecutionConsent_targetProjectId_status_idx" ON "QualityJourneyExecutionConsent"("targetProjectId", "status");
CREATE TRIGGER "QualityJourneyExecutionConsent_scope_identity" BEFORE UPDATE OF "id", "journeyId", "targetProjectId", "scopeJson", "scopeHash", "grantSource" ON "QualityJourneyExecutionConsent" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consent scope is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionConsent_cycle_scope" BEFORE INSERT ON "QualityJourneyExecutionConsent" FOR EACH ROW WHEN NEW."executionCycleId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."executionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consent cycle is outside its journey target scope'); END;
CREATE TRIGGER "QualityJourneyExecutionConsent_cycle_scope_update" BEFORE UPDATE OF "executionCycleId" ON "QualityJourneyExecutionConsent" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."executionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consent cycle is outside its journey target scope'); END;
CREATE TRIGGER "QualityJourneyExecutionConsent_cycle_once" BEFORE UPDATE OF "executionCycleId" ON "QualityJourneyExecutionConsent" FOR EACH ROW WHEN OLD."executionCycleId" IS NOT NULL OR NEW."executionCycleId" IS NULL BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consent cycle binding is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionConsent_append_only" BEFORE DELETE ON "QualityJourneyExecutionConsent" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consents are append-only'); END;

CREATE TABLE "QualityJourneyExecutionCancellationReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "executionCycleId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyExecutionCancellationReceipt_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyExecutionCancellationReceipt_executionCycleId_fkey" FOREIGN KEY ("executionCycleId") REFERENCES "QualityJourneyExecutionCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyExecutionCancellationReceipt_journeyId_idempotencyKey_key" ON "QualityJourneyExecutionCancellationReceipt"("journeyId", "idempotencyKey");
CREATE INDEX "QualityJourneyExecutionCancellationReceipt_executionCycleId_createdAt_idx" ON "QualityJourneyExecutionCancellationReceipt"("executionCycleId", "createdAt");
CREATE TRIGGER "QualityJourneyExecutionCancellationReceipt_cycle_scope" BEFORE INSERT ON "QualityJourneyExecutionCancellationReceipt" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."executionCycleId" AND "journeyId" = NEW."journeyId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cancellation receipt is outside its journey scope'); END;
CREATE TRIGGER "QualityJourneyExecutionCancellationReceipt_immutable_update" BEFORE UPDATE ON "QualityJourneyExecutionCancellationReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cancellation receipts are immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionCancellationReceipt_append_only" BEFORE DELETE ON "QualityJourneyExecutionCancellationReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cancellation receipts are append-only'); END;

CREATE TABLE "QualityJourneyExecutionEvidenceReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "executionCycleId" TEXT NOT NULL,
  "testRunId" TEXT NOT NULL,
  "runtimeBytesHash" TEXT NOT NULL,
  "receiptHash" TEXT NOT NULL,
  "evidenceJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyExecutionEvidenceReceipt_executionCycleId_fkey" FOREIGN KEY ("executionCycleId") REFERENCES "QualityJourneyExecutionCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyExecutionEvidenceReceipt_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyExecutionEvidenceReceipt_testRunId_key" ON "QualityJourneyExecutionEvidenceReceipt"("testRunId");
CREATE UNIQUE INDEX "QualityJourneyExecutionEvidenceReceipt_receiptHash_key" ON "QualityJourneyExecutionEvidenceReceipt"("receiptHash");
CREATE INDEX "QualityJourneyExecutionEvidenceReceipt_executionCycleId_createdAt_idx" ON "QualityJourneyExecutionEvidenceReceipt"("executionCycleId", "createdAt");
CREATE TRIGGER "QualityJourneyExecutionEvidenceReceipt_binding_scope" BEFORE INSERT ON "QualityJourneyExecutionEvidenceReceipt" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "executionCycleId" = NEW."executionCycleId" AND "testRunId" = NEW."testRunId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution evidence is outside its TestRun binding scope'); END;
CREATE TRIGGER "QualityJourneyExecutionEvidenceReceipt_immutable_update" BEFORE UPDATE ON "QualityJourneyExecutionEvidenceReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution evidence is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionEvidenceReceipt_immutable_delete" BEFORE DELETE ON "QualityJourneyExecutionEvidenceReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution evidence is append-only'); END;

CREATE TABLE "QualityJourneyExecutionRerunProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "sourceExecutionCycleId" TEXT NOT NULL,
  "successorExecutionCycleId" TEXT,
  "sourceEvidenceJson" TEXT NOT NULL,
  "selectedScenariosJson" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "proposalHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "approvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyExecutionRerunProposal_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyExecutionRerunProposal_sourceExecutionCycleId_fkey" FOREIGN KEY ("sourceExecutionCycleId") REFERENCES "QualityJourneyExecutionCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyExecutionRerunProposal_successorExecutionCycleId_fkey" FOREIGN KEY ("successorExecutionCycleId") REFERENCES "QualityJourneyExecutionCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyExecutionRerunProposal_successorExecutionCycleId_key" ON "QualityJourneyExecutionRerunProposal"("successorExecutionCycleId");
CREATE UNIQUE INDEX "QualityJourneyExecutionRerunProposal_proposalHash_key" ON "QualityJourneyExecutionRerunProposal"("proposalHash");
CREATE UNIQUE INDEX "QualityJourneyExecutionRerunProposal_journeyId_idempotencyKey_key" ON "QualityJourneyExecutionRerunProposal"("journeyId", "idempotencyKey");
CREATE INDEX "QualityJourneyExecutionRerunProposal_targetProjectId_status_idx" ON "QualityJourneyExecutionRerunProposal"("targetProjectId", "status");
CREATE TRIGGER "QualityJourneyExecutionRerunProposal_source_scope" BEFORE INSERT ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."sourceExecutionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposal source is outside its journey target scope'); END;
CREATE TRIGGER "QualityJourneyExecutionRerunProposal_scope_identity" BEFORE UPDATE OF "id", "journeyId", "targetProjectId", "sourceExecutionCycleId", "sourceEvidenceJson", "selectedScenariosJson", "reason", "proposalHash", "idempotencyKey", "requestHash" ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposal scope is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionRerunProposal_successor_scope" BEFORE UPDATE OF "successorExecutionCycleId" ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."successorExecutionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "predecessorExecutionCycleId" = NEW."sourceExecutionCycleId") BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposal successor is outside its frozen source scope'); END;
CREATE TRIGGER "QualityJourneyExecutionRerunProposal_successor_once" BEFORE UPDATE OF "successorExecutionCycleId" ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW WHEN OLD."successorExecutionCycleId" IS NOT NULL OR NEW."successorExecutionCycleId" IS NULL BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposal successor binding is immutable'); END;
CREATE TRIGGER "QualityJourneyExecutionRerunProposal_append_only" BEFORE DELETE ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposals are append-only'); END;
