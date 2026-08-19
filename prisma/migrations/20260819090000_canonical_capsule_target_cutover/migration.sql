-- This unreleased cutover deliberately removes all application data. Built-in
-- Step Definitions are re-established by the canonical readiness/sync workflow
-- after migration; volatile registry rows are never embedded in migration SQL.
PRAGMA foreign_keys=OFF;
PRAGMA legacy_alter_table=ON;

DELETE FROM "AssessmentRunBinding";
DELETE FROM "AssessmentExecutionCredentialBinding";
DELETE FROM "AssessmentExecutionAuthorizationGrant";
DELETE FROM "AssessmentExecutionRequest";
DELETE FROM "CredentialAuthorizationUiSession";
DELETE FROM "AssessmentDecision";
DELETE FROM "EvidenceReceipt";
DELETE FROM "AssessmentRun";
DELETE FROM "Assessment";
DELETE FROM "EvaluationSubjectRevision";
DELETE FROM "ObligationValidationVersion";
DELETE FROM "QualityValidationExtensionReview";
DELETE FROM "QualityValidationPublication";
DELETE FROM "ValidationVersion";
DELETE FROM "QualityObligationRevision";
DELETE FROM "RequirementQuery";
DELETE FROM "RequirementSnapshot";
DELETE FROM "RequirementDriftReport";
DELETE FROM "QualityPlanRevision";
DELETE FROM "QualityPlan";
DELETE FROM "AssessmentPreparation";
DELETE FROM "AgentPreflightReceipt";
DELETE FROM "LifecycleCertificationReceipt";
DELETE FROM "RuntimeCapsuleExecutionAttempt";
DELETE FROM "RuntimeCapsuleBlobReference";
DELETE FROM "RuntimeCapsuleLease";
DELETE FROM "RuntimeCapsuleBlob";
DELETE FROM "RuntimeCapsule";
DELETE FROM "TestRunLog";
DELETE FROM "ReportTestCase";
DELETE FROM "ReportHook";
DELETE FROM "ReportStep";
DELETE FROM "ReportScenarioTag";
DELETE FROM "ReportScenario";
DELETE FROM "ReportFeatureTag";
DELETE FROM "ReportFeature";
DELETE FROM "Report";
DELETE FROM "TestRunTestCase";
DELETE FROM "_TagToTestRun";
DELETE FROM "_TagToTestSuite";
DELETE FROM "_TagToTestCase";
DELETE FROM "_TestSuiteTestCases";
DELETE FROM "TestRun";
DELETE FROM "TestCaseMetrics";
DELETE FROM "TestSuiteMetrics";
DELETE FROM "DashboardMetrics";
DELETE FROM "Review";
DELETE FROM "LinkedJiraTicket";
DELETE FROM "TestCaseFlowBlockNode";
DELETE FROM "TestCaseFlowBlock";
DELETE FROM "TestCaseStepParameter";
DELETE FROM "TestCaseStep";
DELETE FROM "TestCase";
DELETE FROM "TemplateTestCaseFlowBlockNode";
DELETE FROM "TemplateTestCaseFlowBlock";
DELETE FROM "TemplateTestCaseStepParameter";
DELETE FROM "TemplateTestCaseStep";
DELETE FROM "TemplateTestCase";
DELETE FROM "ConflictResolution";
DELETE FROM "Locator";
DELETE FROM "LocatorGroup";
DELETE FROM "TestSuite";
DELETE FROM "Module";
DELETE FROM "Tag";
DELETE FROM "Environment";
DELETE FROM "ProjectResourceImport";
DELETE FROM "ProjectResourceOwnership";
DELETE FROM "StepDefinitionDeprecation";
DELETE FROM "StepPublicationReceipt";
DELETE FROM "StepExecutionBinding";
DELETE FROM "StepHumanProjection";
DELETE FROM "StepDefinitionDraftArtifact";
DELETE FROM "StepDefinitionSearchReceipt";
DELETE FROM "StepDefinitionTelemetryEvent";
DELETE FROM "StepDefinitionDraft";
DELETE FROM "StepReviewedExtension";
DELETE FROM "StepDefinition";
DELETE FROM "TargetProject";

-- Clean ownership constraints are rebuilt after the reset so no synthetic or
-- unowned legacy rows can survive into the capsule-only model.
DROP TABLE "TargetProject";
CREATE TABLE "TargetProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "canonicalIdentity" TEXT NOT NULL,
    "canonicalPath" TEXT,
    "normalizedRemoteOrigin" TEXT,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "packageName" TEXT,
    "packageManager" TEXT,
    "packageJson" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (("kind" = 'LOCAL_WORKSPACE' AND "canonicalPath" IS NOT NULL AND "normalizedRemoteOrigin" IS NULL) OR ("kind" = 'REMOTE_BLACK_BOX' AND "canonicalPath" IS NULL AND "normalizedRemoteOrigin" IS NOT NULL AND "packageName" IS NULL AND "packageManager" IS NULL AND "packageJson" IS NULL))
);

DROP TABLE "TestCase";
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TestCase_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "TemplateTestCase";
CREATE TABLE "TemplateTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TemplateTestCase_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "Module";
CREATE TABLE "Module" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "Module_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Module_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "TestSuite";
CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "moduleId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TestSuite_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestSuite_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "LocatorGroup";
CREATE TABLE "LocatorGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT '/',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "moduleId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "LocatorGroup_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LocatorGroup_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "Locator";
CREATE TABLE "Locator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "locatorGroupId" TEXT,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "Locator_locatorGroupId_fkey" FOREIGN KEY ("locatorGroupId") REFERENCES "LocatorGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Locator_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "Environment";
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "expectedPageTitle" TEXT,
    "apiBaseUrl" TEXT,
    "username" TEXT,
    "passwordEnvironmentVariable" TEXT,
    "credentialState" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "Environment_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (("credentialState" = 'NONE' AND "passwordEnvironmentVariable" IS NULL) OR ("credentialState" = 'REFERENCE_CONFIGURED' AND "passwordEnvironmentVariable" IS NOT NULL))
);

DROP TABLE "Tag";
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tagExpression" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FILTER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "Tag_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "TestRun";
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "preparationKey" TEXT,
    "runId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "intent" TEXT NOT NULL DEFAULT 'INDEPENDENT',
    "evidenceHealth" TEXT NOT NULL DEFAULT 'invalid_missing_report',
    "updatedAt" DATETIME NOT NULL,
    "environmentId" TEXT NOT NULL,
    "testWorkersCount" INTEGER DEFAULT 1,
    "browserEngine" TEXT NOT NULL DEFAULT 'CHROMIUM',
    "logPath" TEXT,
    "reportPath" TEXT,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRun_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("intent" IN ('INDEPENDENT', 'ASSESSMENT'))
);

DROP TABLE "Report";
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reportPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "testRunId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "Report_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "TestCaseMetrics";
CREATE TABLE "TestCaseMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "isRepeatedlyFailing" BOOLEAN NOT NULL DEFAULT false,
    "isFlaky" BOOLEAN NOT NULL DEFAULT false,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "failureRate" REAL NOT NULL DEFAULT 0,
    "totalRecentRuns" INTEGER NOT NULL DEFAULT 0,
    "failedRecentRuns" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" DATETIME,
    "lastFailedAt" DATETIME,
    "lastPassedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TestCaseMetrics_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCaseMetrics_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "TestSuiteMetrics";
CREATE TABLE "TestSuiteMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testSuiteId" TEXT NOT NULL,
    "lastExecutedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TestSuiteMetrics_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestSuiteMetrics_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "DashboardMetrics";
CREATE TABLE "DashboardMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "failedRecentRunsCount" INTEGER NOT NULL DEFAULT 0,
    "repeatedlyFailingTestsCount" INTEGER NOT NULL DEFAULT 0,
    "flakyTestsCount" INTEGER NOT NULL DEFAULT 0,
    "suitesNotExecutedRecentlyCount" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "DashboardMetrics_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "ProjectResourceOwnership";
CREATE TABLE "ProjectResourceOwnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "provenanceJson" TEXT NOT NULL DEFAULT '{}',
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectResourceOwnership_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DROP TABLE "AssessmentRun";
CREATE TABLE "AssessmentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "qualityPlanRevisionId" TEXT NOT NULL,
    "evaluationSubjectRevisionId" TEXT NOT NULL,
    "idempotencyScope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "stopReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "executionRequestId" TEXT,
    "executionRequestHash" TEXT,
    "executionAuthorizationGrantId" TEXT,
    CONSTRAINT "AssessmentRun_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRun_assessmentId_targetProjectId_qualityPlanRevisionId_fkey" FOREIGN KEY ("assessmentId", "targetProjectId", "qualityPlanRevisionId") REFERENCES "Assessment" ("id", "targetProjectId", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRun_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRun_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRun_executionRequestId_fkey" FOREIGN KEY ("executionRequestId") REFERENCES "AssessmentExecutionRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRun_executionAuthorizationGrantId_fkey" FOREIGN KEY ("executionAuthorizationGrantId") REFERENCES "AssessmentExecutionAuthorizationGrant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TargetProject_canonicalIdentity_key" ON "TargetProject"("canonicalIdentity");
CREATE UNIQUE INDEX "TargetProject_fingerprint_key" ON "TargetProject"("fingerprint");
CREATE INDEX "TargetProject_displayName_idx" ON "TargetProject"("displayName");
CREATE INDEX "TargetProject_canonicalPath_idx" ON "TargetProject"("canonicalPath");
CREATE INDEX "TargetProject_normalizedRemoteOrigin_idx" ON "TargetProject"("normalizedRemoteOrigin");
CREATE INDEX "TargetProject_fingerprint_idx" ON "TargetProject"("fingerprint");
CREATE INDEX "TestCase_targetProjectId_idx" ON "TestCase"("targetProjectId");
CREATE UNIQUE INDEX "TemplateTestCase_targetProjectId_name_key" ON "TemplateTestCase"("targetProjectId", "name");
CREATE INDEX "Module_targetProjectId_idx" ON "Module"("targetProjectId");
CREATE INDEX "TestSuite_targetProjectId_idx" ON "TestSuite"("targetProjectId");
CREATE UNIQUE INDEX "LocatorGroup_targetProjectId_name_key" ON "LocatorGroup"("targetProjectId", "name");
CREATE INDEX "Locator_targetProjectId_idx" ON "Locator"("targetProjectId");
CREATE UNIQUE INDEX "Environment_targetProjectId_name_key" ON "Environment"("targetProjectId", "name");
CREATE UNIQUE INDEX "Tag_targetProjectId_name_type_key" ON "Tag"("targetProjectId", "name", "type");
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");
CREATE INDEX "TestRun_completedAt_idx" ON "TestRun"("completedAt");
CREATE INDEX "TestRun_result_idx" ON "TestRun"("result");
CREATE INDEX "TestRun_evidenceHealth_idx" ON "TestRun"("evidenceHealth");
CREATE INDEX "TestRun_targetProjectId_idx" ON "TestRun"("targetProjectId");
CREATE INDEX "TestRun_targetProjectId_startedAt_id_idx" ON "TestRun"("targetProjectId", "startedAt", "id");
CREATE UNIQUE INDEX "TestRun_targetProjectId_preparationKey_key" ON "TestRun"("targetProjectId", "preparationKey");
CREATE INDEX "Report_targetProjectId_idx" ON "Report"("targetProjectId");
CREATE UNIQUE INDEX "TestCaseMetrics_testCaseId_key" ON "TestCaseMetrics"("testCaseId");
CREATE INDEX "TestCaseMetrics_isRepeatedlyFailing_idx" ON "TestCaseMetrics"("isRepeatedlyFailing");
CREATE INDEX "TestCaseMetrics_isFlaky_idx" ON "TestCaseMetrics"("isFlaky");
CREATE UNIQUE INDEX "TestSuiteMetrics_testSuiteId_key" ON "TestSuiteMetrics"("testSuiteId");
CREATE INDEX "TestSuiteMetrics_lastExecutedAt_idx" ON "TestSuiteMetrics"("lastExecutedAt");
CREATE UNIQUE INDEX "DashboardMetrics_targetProjectId_key" ON "DashboardMetrics"("targetProjectId");
CREATE INDEX "ProjectResourceOwnership_targetProjectId_entityType_idx" ON "ProjectResourceOwnership"("targetProjectId", "entityType");
CREATE INDEX "ProjectResourceOwnership_scope_entityType_idx" ON "ProjectResourceOwnership"("scope", "entityType");
CREATE UNIQUE INDEX "ProjectResourceOwnership_entityType_entityId_key" ON "ProjectResourceOwnership"("entityType", "entityId");
CREATE UNIQUE INDEX "AssessmentRun_executionRequestId_key" ON "AssessmentRun"("executionRequestId");
CREATE UNIQUE INDEX "AssessmentRun_executionAuthorizationGrantId_key" ON "AssessmentRun"("executionAuthorizationGrantId");
CREATE INDEX "AssessmentRun_assessmentId_status_idx" ON "AssessmentRun"("assessmentId", "status");
CREATE INDEX "AssessmentRun_targetProjectId_status_idx" ON "AssessmentRun"("targetProjectId", "status");
CREATE UNIQUE INDEX "AssessmentRun_id_targetProjectId_key" ON "AssessmentRun"("id", "targetProjectId");
CREATE UNIQUE INDEX "AssessmentRun_id_targetProjectId_qualityPlanRevisionId_key" ON "AssessmentRun"("id", "targetProjectId", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "AssessmentRun_idempotencyScope_idempotencyKey_key" ON "AssessmentRun"("idempotencyScope", "idempotencyKey");

PRAGMA foreign_keys=ON;
PRAGMA legacy_alter_table=OFF;
PRAGMA foreign_key_check;
