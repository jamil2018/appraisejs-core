-- DropIndex
DROP INDEX "AppraiseProjectIdentity_projectFingerprint_key";

-- DropIndex
DROP INDEX "BaselineAttempt_testRunId_idx";

-- DropIndex
DROP INDEX "BaselineAttempt_planProjectionId_createdAt_idx";

-- DropIndex
DROP INDEX "BaselineAttemptEvent_attemptId_createdAt_idx";

-- DropIndex
DROP INDEX "BaselineAttemptEvent_attemptId_sequence_key";

-- DropIndex
DROP INDEX "BaselineAttemptEvent_attemptId_idempotencyKey_key";

-- DropIndex
DROP INDEX "DelegatedAuthorizationNonce_expiresAt_idx";

-- DropIndex
DROP INDEX "DelegatedCoordinatorConsumption_receiptId_consumedAt_idx";

-- DropIndex
DROP INDEX "DelegatedCoordinatorConsumption_receiptId_permission_operationKey_key";

-- DropIndex
DROP INDEX "DelegatedCoordinatorReceipt_targetFingerprint_expiresAt_idx";

-- DropIndex
DROP INDEX "DelegatedCoordinatorReceipt_delegatedCoordinatorId_expiresAt_idx";

-- DropIndex
DROP INDEX "DelegatedCoordinatorReceipt_nonce_key";

-- DropIndex
DROP INDEX "DelegatedValidationAstSubmission_targetFingerprint_planHash_receivedAt_idx";

-- DropIndex
DROP INDEX "DelegatedValidationAstSubmission_nonce_key";

-- DropIndex
DROP INDEX "LifecycleCertificationReceipt_status_recordedAt_idx";

-- DropIndex
DROP INDEX "LifecycleCertificationReceipt_recordedAt_idx";

-- DropIndex
DROP INDEX "PlanCoordinatorLease_leaseExpiresAt_idx";

-- DropIndex
DROP INDEX "PlanCoordinatorLease_connectionId_key";

-- DropIndex
DROP INDEX "PlanCoordinatorLease_planProjectionId_key";

-- DropIndex
DROP INDEX "PlanEvent_publishOperationId_validationId_key";

-- DropIndex
DROP INDEX "PlanEvent_publishOperationId_type_key";

-- DropIndex
DROP INDEX "PlanEvent_planProjectionId_acknowledgedAt_sequence_idx";

-- DropIndex
DROP INDEX "PlanEvent_planProjectionId_sequence_key";

-- DropIndex
DROP INDEX "PlanOperationMetric_recordedAt_idx";

-- DropIndex
DROP INDEX "PlanOperationMetric_planProjectionId_recordedAt_idx";

-- DropIndex
DROP INDEX "PlanPersonalLayout_planProjectionId_owner_key";

-- DropIndex
DROP INDEX "PlanProjection_legacyPlanId_idx";

-- DropIndex
DROP INDEX "PlanProjection_slug_idx";

-- DropIndex
DROP INDEX "PlanProjection_targetProjectId_idx";

-- DropIndex
DROP INDEX "PlanProjection_conflicted_idx";

-- DropIndex
DROP INDEX "PlanProjection_stale_idx";

-- DropIndex
-- DropIndex
DROP INDEX "PlanRevision_planProjectionId_sourceHash_key";

-- DropIndex
DROP INDEX "PlanSyncIssue_planProjectionId_resolvedAt_idx";

-- DropIndex
DROP INDEX "PlanTaskProjection_planProjectionId_position_idx";

-- DropIndex
DROP INDEX "PlanTaskProjection_planProjectionId_taskId_key";

-- DropIndex
DROP INDEX "ProviderAdapterRegistration_enabled_launchEnabled_probeStatus_idx";

-- DropIndex
DROP INDEX "ProviderAdapterRegistration_providerKind_enabled_idx";

-- DropIndex
DROP INDEX "ProviderAdapterRegistration_key_key";

-- DropIndex
DROP INDEX "ProviderArtifactSnapshot_runId_capturedAt_idx";

-- DropIndex
DROP INDEX "ProviderArtifactSnapshot_runId_path_kind_key";

-- DropIndex
DROP INDEX "ProviderPermissionDecision_runId_decidedAt_idx";

-- DropIndex
DROP INDEX "ProviderPermissionDecision_runId_requestId_key";

-- DropIndex
DROP INDEX "ProviderRunEvent_runId_createdAt_idx";

-- DropIndex
DROP INDEX "ProviderRunEvent_runId_sequence_key";

-- DropIndex
DROP INDEX "ProviderWorkflowRun_createdAt_idx";

-- DropIndex
DROP INDEX "ProviderWorkflowRun_providerKind_status_idx";

-- DropIndex
DROP INDEX "ProviderWorkflowRun_targetProjectId_idx";

-- DropIndex
DROP INDEX "ProviderWorkflowRun_planProjectionId_idx";

-- DropIndex
DROP INDEX "RepositoryExportJob_targetProjectId_validationHash_idx";

-- DropIndex
DROP INDEX "RepositoryExportJob_state_updatedAt_idx";

-- DropIndex
DROP INDEX "RepositoryExportJob_targetProjectId_validationHash_destinationPath_key";

-- DropIndex
DROP INDEX "RepositoryExportJob_idempotencyKey_key";

-- DropIndex
DROP INDEX "RepositoryExportReceipt_targetProjectId_validationHash_idx";

-- DropIndex
DROP INDEX "RepositoryExportReceipt_targetProjectId_validationHash_destinationPath_key";

-- DropIndex
DROP INDEX "RepositoryExportReceipt_jobId_key";

-- DropIndex
DROP INDEX "ValidationAstPublishOperation_targetProjectId_phase_idx";

-- DropIndex
DROP INDEX "ValidationAstPublishOperation_planProjectionId_phase_idx";

-- DropIndex
DROP INDEX "ValidationAstPublishOperation_phase_updatedAt_idx";

-- DropIndex
DROP INDEX "ValidationAstPublishOperation_operationHash_key";

-- DropIndex
DROP INDEX "ValidationAstPublishOperation_planId_idempotencyKey_key";

-- DropIndex
DROP INDEX "ValidationExtensionReview_artifactHash_idx";

-- DropIndex
DROP INDEX "ValidationExtensionReview_operationId_extensionId_version_key";

-- DropIndex
DROP INDEX "ValidationResourceProposal_targetProjectId_createdAt_idx";

-- DropIndex
DROP INDEX "ValidationResourceProposal_targetProjectId_proposalHash_key";

-- DropIndex
DROP INDEX "ValidationResourceProposal_planId_idempotencyKey_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AppraiseProjectIdentity";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "BaselineAttempt";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "BaselineAttemptEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DelegatedAuthorizationNonce";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DelegatedCoordinatorConsumption";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DelegatedCoordinatorReceipt";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DelegatedValidationAstSubmission";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LifecycleCertificationReceipt";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanCoordinatorLease";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanOperationMetric";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanPersonalLayout";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanProjection";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanRevision";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanSyncIssue";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanTaskProjection";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProviderAdapterRegistration";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProviderArtifactSnapshot";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProviderPermissionDecision";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProviderRunEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProviderWorkflowRun";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RepositoryExportJob";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RepositoryExportReceipt";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ValidationAstPublishOperation";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ValidationExtensionReview";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ValidationResourceProposal";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "QualityJourney" (
    "activeTriageReportId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "rootIdempotencyKey" TEXT NOT NULL,
    "rootRequestHash" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'INTAKE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "activeCycleId" TEXT NOT NULL,
    "activeRevisionIdsJson" TEXT NOT NULL DEFAULT '{}',
    "analysisReviewHash" TEXT,
    "unresolvedQuestionIdsJson" TEXT NOT NULL DEFAULT '[]',
    "blockerIdsJson" TEXT NOT NULL DEFAULT '[]',
    "activeWorkItemIdsJson" TEXT NOT NULL DEFAULT '[]',
    "stateHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "activeDiscoveryRevisionId" TEXT,
    "activeScenarioPortfolioRevisionId" TEXT,
    CONSTRAINT "QualityJourney_activeTriageReportId_fkey" FOREIGN KEY ("activeTriageReportId") REFERENCES "QualityJourneyTriageReport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourney_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourney_activeDiscoveryRevisionId_fkey" FOREIGN KEY ("activeDiscoveryRevisionId") REFERENCES "QualityJourneyDiscoveryRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourney_activeScenarioPortfolioRevisionId_fkey" FOREIGN KEY ("activeScenarioPortfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identityKey" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "revisionId" TEXT,
    "contentHash" TEXT NOT NULL,
    "artifactJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyArtifact_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAnalysisRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "artifactRecordId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "artifactRevisionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "predecessorRevisionId" TEXT,
    "submissionIdempotencyKey" TEXT NOT NULL,
    "submissionHash" TEXT NOT NULL,
    "submittedWorkItemId" TEXT NOT NULL,
    "submittedAttemptId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAnalysisRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisRevision_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisRevision_submittedWorkItemId_fkey" FOREIGN KEY ("submittedWorkItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisRevision_submittedAttemptId_fkey" FOREIGN KEY ("submittedAttemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisRevision_predecessorRevisionId_fkey" FOREIGN KEY ("predecessorRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAnalysisQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "analysisRevisionId" TEXT NOT NULL,
    "artifactRecordId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAnalysisQuestion_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisQuestion_analysisRevisionId_fkey" FOREIGN KEY ("analysisRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisQuestion_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAnalysisAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "questionRecordId" TEXT NOT NULL,
    "artifactRecordId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "correctionOfAnswerId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAnalysisAnswer_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisAnswer_questionRecordId_fkey" FOREIGN KEY ("questionRecordId") REFERENCES "QualityJourneyAnalysisQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisAnswer_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisAnswer_correctionOfAnswerId_fkey" FOREIGN KEY ("correctionOfAnswerId") REFERENCES "QualityJourneyAnalysisAnswer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAnalysisPublication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "analysisRevisionId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "reviewHash" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAnalysisPublication_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisPublication_analysisRevisionId_fkey" FOREIGN KEY ("analysisRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAnalysisDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "analysisRevisionId" TEXT NOT NULL,
    "artifactRecordId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "reviewHash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAnalysisDecision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisDecision_analysisRevisionId_fkey" FOREIGN KEY ("analysisRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAnalysisDecision_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyDiscoveryRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "analysisRevisionId" TEXT NOT NULL,
    "analysisDecisionId" TEXT NOT NULL,
    "analysisArtifactId" TEXT NOT NULL,
    "analysisRevisionArtifactId" TEXT NOT NULL,
    "analysisRevisionContentHash" TEXT NOT NULL,
    "analysisApprovalArtifactId" TEXT NOT NULL,
    "analysisApprovalContentHash" TEXT NOT NULL,
    "approvedRequirementSetHash" TEXT NOT NULL,
    "environmentRegistryHash" TEXT NOT NULL,
    "locatorRegistryHash" TEXT NOT NULL,
    "resourceRegistryHash" TEXT NOT NULL,
    "stepDefinitionRegistryHash" TEXT NOT NULL,
    "operationRegistryHash" TEXT NOT NULL,
    "scoutScopeJson" TEXT NOT NULL,
    "scoutInputHash" TEXT NOT NULL,
    "resourceScopeJson" TEXT NOT NULL,
    "resourceInputHash" TEXT NOT NULL,
    "scopeHash" TEXT NOT NULL,
    "scoutWorkItemId" TEXT NOT NULL,
    "resourceWorkItemId" TEXT NOT NULL,
    "targetObservationJson" TEXT,
    "targetObservationHash" TEXT,
    "targetObservationIdempotencyKey" TEXT,
    "targetObservationSubmittedAt" DATETIME,
    "resourceResolutionJson" TEXT,
    "resourceResolutionHash" TEXT,
    "resourceResolutionIdempotencyKey" TEXT,
    "resourceResolutionSubmittedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'COLLECTING',
    "predecessorRevisionId" TEXT,
    "retryIdempotencyKey" TEXT,
    "retryRequestHash" TEXT,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,
    "completionHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "invalidatedAt" DATETIME,
    "supersededAt" DATETIME,
    CONSTRAINT "QualityJourneyDiscoveryRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyDiscoveryRevision_analysisRevisionId_fkey" FOREIGN KEY ("analysisRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyDiscoveryRevision_analysisDecisionId_fkey" FOREIGN KEY ("analysisDecisionId") REFERENCES "QualityJourneyAnalysisDecision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyDiscoveryRevision_scoutWorkItemId_fkey" FOREIGN KEY ("scoutWorkItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyDiscoveryRevision_resourceWorkItemId_fkey" FOREIGN KEY ("resourceWorkItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyDiscoveryRevision_predecessorRevisionId_fkey" FOREIGN KEY ("predecessorRevisionId") REFERENCES "QualityJourneyDiscoveryRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyScenarioPortfolioRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "discoveryRevisionId" TEXT NOT NULL,
    "discoveryCompletionHash" TEXT NOT NULL,
    "predecessorPortfolioRevisionId" TEXT,
    "artifactRecordId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "artifactRevisionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "behavioralIntentHash" TEXT NOT NULL,
    "enrichmentHash" TEXT NOT NULL,
    "layoutHash" TEXT NOT NULL,
    "coverageRationale" TEXT NOT NULL,
    "graphJson" TEXT NOT NULL,
    "submissionIdempotencyKey" TEXT NOT NULL,
    "submissionHash" TEXT NOT NULL,
    "submittedWorkItemId" TEXT NOT NULL,
    "submittedAttemptId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "reviewHash" TEXT,
    "approvedIntentHash" TEXT,
    "approvedCoverageHash" TEXT,
    "decisionSetHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "supersededAt" DATETIME,
    CONSTRAINT "QualityJourneyScenarioPortfolioRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioPortfolioRevision_discoveryRevisionId_fkey" FOREIGN KEY ("discoveryRevisionId") REFERENCES "QualityJourneyDiscoveryRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioPortfolioRevision_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioPortfolioRevision_submittedWorkItemId_fkey" FOREIGN KEY ("submittedWorkItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioPortfolioRevision_submittedAttemptId_fkey" FOREIGN KEY ("submittedAttemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioPortfolioRevision_predecessorPortfolioRevisionId_fkey" FOREIGN KEY ("predecessorPortfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyScenarioRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioRevisionId" TEXT NOT NULL,
    "stableScenarioId" TEXT NOT NULL,
    "scenarioRevisionId" TEXT NOT NULL,
    "behavioralIntentJson" TEXT NOT NULL,
    "behavioralIntentHash" TEXT NOT NULL,
    "enrichmentJson" TEXT NOT NULL,
    "enrichmentHash" TEXT NOT NULL,
    "layoutJson" TEXT NOT NULL,
    "layoutHash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyScenarioRevision_portfolioRevisionId_fkey" FOREIGN KEY ("portfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyPreparedRuntimeCapsule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "materializationId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "capsuleHash" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyPreparedRuntimeCapsule_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyPreparedRuntimeCapsule_materializationId_fkey" FOREIGN KEY ("materializationId") REFERENCES "QualityJourneyAutomationMaterialization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAutomationMaterialization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "scenarioRevisionId" TEXT NOT NULL,
    "scenarioContentHash" TEXT NOT NULL,
    "portfolioRevisionId" TEXT NOT NULL,
    "portfolioContentHash" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "decisionHash" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "ownerTokenHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "materializationHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'MATERIALIZED',
    "failureKind" TEXT,
    "failureJson" TEXT,
    "suiteId" TEXT,
    "testCaseId" TEXT,
    "artifactRecordId" TEXT NOT NULL,
    "portfolioRecordId" TEXT NOT NULL,
    "artifactJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAutomationMaterialization_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationMaterialization_scenarioRevisionId_fkey" FOREIGN KEY ("scenarioRevisionId") REFERENCES "QualityJourneyScenarioRevision" ("scenarioRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationMaterialization_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationMaterialization_portfolioRecordId_fkey" FOREIGN KEY ("portfolioRecordId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationMaterialization_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "QualityJourneyScenarioDecision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationMaterialization_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationMaterialization_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAutomationTargetBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "semanticHash" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "suiteHash" TEXT NOT NULL,
    "testCaseHash" TEXT NOT NULL,
    "stepHash" TEXT NOT NULL,
    "bindingJson" TEXT NOT NULL,
    "resourceHashJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAutomationTargetBinding_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationTargetBinding_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAutomationMaterializationBinding" (
    "materializationId" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAutomationMaterializationBinding_materializationId_fkey" FOREIGN KEY ("materializationId") REFERENCES "QualityJourneyAutomationMaterialization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationMaterializationBinding_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "QualityJourneyAutomationTargetBinding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyAutomationRequestReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "ownerTokenHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAutomationRequestReceipt_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationRequestReceipt_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationRequestReceipt_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyScenarioDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioRevisionId" TEXT NOT NULL,
    "scenarioRevisionId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "feedback" TEXT,
    "actor" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "carriedFromDecisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyScenarioDecision_portfolioRevisionId_fkey" FOREIGN KEY ("portfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioDecision_scenarioRevisionId_fkey" FOREIGN KEY ("scenarioRevisionId") REFERENCES "QualityJourneyScenarioRevision" ("scenarioRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioDecision_carriedFromDecisionId_fkey" FOREIGN KEY ("carriedFromDecisionId") REFERENCES "QualityJourneyScenarioDecision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyScenarioReviewComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioRevisionId" TEXT NOT NULL,
    "scenarioRevisionId" TEXT,
    "comment" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "disposition" TEXT NOT NULL DEFAULT 'OPEN',
    "disposedAt" DATETIME,
    "disposedBy" TEXT,
    "dispositionIdempotencyKey" TEXT,
    "dispositionRequestHash" TEXT,
    "createResponseJson" TEXT,
    "dispositionResponseJson" TEXT,
    "actor" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyScenarioReviewComment_portfolioRevisionId_fkey" FOREIGN KEY ("portfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioReviewComment_scenarioRevisionId_fkey" FOREIGN KEY ("scenarioRevisionId") REFERENCES "QualityJourneyScenarioRevision" ("scenarioRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyScenarioDecisionReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "portfolioRevisionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyScenarioDecisionReceipt_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyScenarioDecisionReceipt_portfolioRevisionId_fkey" FOREIGN KEY ("portfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "contentJson" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "predecessorCycleId" TEXT,
    "scopeJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyCycle_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "QualityJourneyExecutionRerunProposal" (
    "reportRevisionId" TEXT,
    "reportHash" TEXT,
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

-- CreateTable
CREATE TABLE "QualityJourneyCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "eventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyCommand_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "commandId" TEXT,
    "predecessorStateHash" TEXT NOT NULL,
    "successorStateHash" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyWorkItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ELIGIBLE',
    "inputHash" TEXT NOT NULL,
    "roleContractDigest" TEXT NOT NULL,
    "inputArtifactRefsJson" TEXT NOT NULL DEFAULT '[]',
    "allowedOutputsJson" TEXT NOT NULL DEFAULT '[]',
    "completionCriteriaJson" TEXT NOT NULL DEFAULT '[]',
    "authorizationScopeJson" TEXT NOT NULL DEFAULT '{}',
    "currentAttempt" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityJourneyWorkItem_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyWorkAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "supersedesAuthorizationId" TEXT,
    "role" TEXT NOT NULL,
    "roleContractDigest" TEXT NOT NULL,
    "capabilityProfileId" TEXT NOT NULL,
    "capabilityProfileHash" TEXT NOT NULL,
    "authorizationJson" TEXT NOT NULL,
    "authorizationHash" TEXT NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "revokedAt" DATETIME,
    "revokedBy" TEXT,
    "revocationReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyWorkAuthorization_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyWorkAuthorization_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyWorkAuthorization_supersedesAuthorizationId_fkey" FOREIGN KEY ("supersedesAuthorizationId") REFERENCES "QualityJourneyWorkAuthorization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyWorkAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workItemId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED',
    "leaseId" TEXT NOT NULL,
    "ownerTokenHash" TEXT NOT NULL,
    "leaseExpiresAt" DATETIME NOT NULL,
    "heartbeatSeconds" INTEGER NOT NULL,
    "authorizationId" TEXT,
    "assignmentId" TEXT,
    "assignmentJson" TEXT,
    "assignmentHash" TEXT,
    "spawnRequestId" TEXT,
    "spawnRequestJson" TEXT,
    "spawnRequestHash" TEXT,
    "dispatchKey" TEXT,
    "dispatchAdapterId" TEXT,
    "dispatchReservedAt" DATETIME,
    "dispatchStartedAt" DATETIME,
    "spawnReceiptId" TEXT,
    "spawnReceiptJson" TEXT,
    "spawnReceiptHash" TEXT,
    "replacesAttemptId" TEXT,
    "replacementProjectionHash" TEXT,
    "predecessorDiagnosticsJson" TEXT,
    "resultJson" TEXT,
    "resultHash" TEXT,
    "failureJson" TEXT,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "QualityJourneyWorkAttempt_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyWorkAttempt_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "QualityJourneyWorkAuthorization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyWorkAttempt_replacesAttemptId_fkey" FOREIGN KEY ("replacesAttemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyBlocker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "responsibleActor" TEXT NOT NULL,
    "affectedNodeIdsJson" TEXT NOT NULL DEFAULT '[]',
    "requiredResolution" TEXT NOT NULL,
    "safeResumeCommand" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "resolutionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "QualityJourneyBlocker_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyArtifactLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "sourceJson" TEXT NOT NULL,
    "targetJson" TEXT NOT NULL,
    "linkHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyArtifactLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    "successorCycleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyReportReview_successorCycleId_fkey" FOREIGN KEY ("successorCycleId") REFERENCES "QualityJourneyCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyReportReview_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyReportReview_reportRevisionId_fkey" FOREIGN KEY ("reportRevisionId") REFERENCES "QualityJourneyTriageReport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyClosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "reportRevisionId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "reportHash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "closureJson" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "closedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityJourneyClosure_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyClosure_reportRevisionId_fkey" FOREIGN KEY ("reportRevisionId") REFERENCES "QualityJourneyTriageReport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DashboardMetrics" (
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
INSERT INTO "new_DashboardMetrics" ("createdAt", "failedRecentRunsCount", "flakyTestsCount", "id", "lastUpdatedAt", "repeatedlyFailingTestsCount", "suitesNotExecutedRecentlyCount", "targetProjectId") SELECT "createdAt", "failedRecentRunsCount", "flakyTestsCount", "id", "lastUpdatedAt", "repeatedlyFailingTestsCount", "suitesNotExecutedRecentlyCount", "targetProjectId" FROM "DashboardMetrics";
DROP TABLE "DashboardMetrics";
ALTER TABLE "new_DashboardMetrics" RENAME TO "DashboardMetrics";
CREATE UNIQUE INDEX "DashboardMetrics_targetProjectId_key" ON "DashboardMetrics"("targetProjectId");
CREATE TABLE "new_Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "expectedPageTitle" TEXT,
    "apiBaseUrl" TEXT,
    "username" TEXT,
    "passwordEnvironmentVariable" TEXT,
    "credentialState" TEXT NOT NULL DEFAULT 'NONE',
    "scopeVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "Environment_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Environment" ("apiBaseUrl", "baseUrl", "createdAt", "credentialState", "expectedPageTitle", "id", "name", "passwordEnvironmentVariable", "targetProjectId", "updatedAt", "username") SELECT "apiBaseUrl", "baseUrl", "createdAt", "credentialState", "expectedPageTitle", "id", "name", "passwordEnvironmentVariable", "targetProjectId", "updatedAt", "username" FROM "Environment";
DROP TABLE "Environment";
ALTER TABLE "new_Environment" RENAME TO "Environment";
CREATE UNIQUE INDEX "Environment_targetProjectId_name_key" ON "Environment"("targetProjectId", "name");
CREATE TABLE "new_Locator" (
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
INSERT INTO "new_Locator" ("createdAt", "id", "locatorGroupId", "name", "targetProjectId", "updatedAt", "value") SELECT "createdAt", "id", "locatorGroupId", "name", "targetProjectId", "updatedAt", "value" FROM "Locator";
DROP TABLE "Locator";
ALTER TABLE "new_Locator" RENAME TO "Locator";
CREATE INDEX "Locator_targetProjectId_idx" ON "Locator"("targetProjectId");
CREATE TABLE "new_LocatorGroup" (
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
INSERT INTO "new_LocatorGroup" ("createdAt", "id", "moduleId", "name", "route", "targetProjectId", "updatedAt") SELECT "createdAt", "id", "moduleId", "name", "route", "targetProjectId", "updatedAt" FROM "LocatorGroup";
DROP TABLE "LocatorGroup";
ALTER TABLE "new_LocatorGroup" RENAME TO "LocatorGroup";
CREATE UNIQUE INDEX "LocatorGroup_targetProjectId_name_key" ON "LocatorGroup"("targetProjectId", "name");
CREATE TABLE "new_Module" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "Module_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Module_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Module" ("createdAt", "id", "name", "parentId", "targetProjectId", "updatedAt") SELECT "createdAt", "id", "name", "parentId", "targetProjectId", "updatedAt" FROM "Module";
DROP TABLE "Module";
ALTER TABLE "new_Module" RENAME TO "Module";
CREATE INDEX "Module_targetProjectId_idx" ON "Module"("targetProjectId");
CREATE TABLE "new_ProjectResourceOwnership" (
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
INSERT INTO "new_ProjectResourceOwnership" ("contentHash", "createdAt", "entityId", "entityType", "id", "origin", "provenanceJson", "scope", "targetProjectId", "updatedAt") SELECT "contentHash", "createdAt", "entityId", "entityType", "id", "origin", "provenanceJson", "scope", "targetProjectId", "updatedAt" FROM "ProjectResourceOwnership";
DROP TABLE "ProjectResourceOwnership";
ALTER TABLE "new_ProjectResourceOwnership" RENAME TO "ProjectResourceOwnership";
CREATE INDEX "ProjectResourceOwnership_targetProjectId_entityType_idx" ON "ProjectResourceOwnership"("targetProjectId", "entityType");
CREATE INDEX "ProjectResourceOwnership_scope_entityType_idx" ON "ProjectResourceOwnership"("scope", "entityType");
CREATE UNIQUE INDEX "ProjectResourceOwnership_entityType_entityId_key" ON "ProjectResourceOwnership"("entityType", "entityId");
CREATE TABLE "new_Report" (
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
INSERT INTO "new_Report" ("createdAt", "description", "id", "name", "reportPath", "targetProjectId", "testRunId", "updatedAt") SELECT "createdAt", "description", "id", "name", "reportPath", "targetProjectId", "testRunId", "updatedAt" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
CREATE INDEX "Report_targetProjectId_idx" ON "Report"("targetProjectId");
CREATE TABLE "new_StepDefinitionSearchReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "indexHash" TEXT NOT NULL,
    "candidateReferencesJson" TEXT NOT NULL,
    "journeyId" TEXT,
    "correlationId" TEXT NOT NULL,
    "searchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);
INSERT INTO "new_StepDefinitionSearchReceipt" ("candidateReferencesJson", "correlationId", "expiresAt", "id", "indexHash", "searchedAt") SELECT "candidateReferencesJson", "correlationId", "expiresAt", "id", "indexHash", "searchedAt" FROM "StepDefinitionSearchReceipt";
DROP TABLE "StepDefinitionSearchReceipt";
ALTER TABLE "new_StepDefinitionSearchReceipt" RENAME TO "StepDefinitionSearchReceipt";
CREATE INDEX "StepDefinitionSearchReceipt_expiresAt_idx" ON "StepDefinitionSearchReceipt"("expiresAt");
CREATE INDEX "StepDefinitionSearchReceipt_journeyId_correlationId_idx" ON "StepDefinitionSearchReceipt"("journeyId", "correlationId");
CREATE TABLE "new_StepDefinitionTelemetryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surface" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "stepId" TEXT,
    "stepVersion" TEXT,
    "correlationId" TEXT,
    "journeyId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_StepDefinitionTelemetryEvent" ("correlationId", "createdAt", "id", "outcome", "payloadJson", "stepId", "stepVersion", "surface") SELECT "correlationId", "createdAt", "id", "outcome", "payloadJson", "stepId", "stepVersion", "surface" FROM "StepDefinitionTelemetryEvent";
DROP TABLE "StepDefinitionTelemetryEvent";
ALTER TABLE "new_StepDefinitionTelemetryEvent" RENAME TO "StepDefinitionTelemetryEvent";
CREATE INDEX "StepDefinitionTelemetryEvent_surface_outcome_createdAt_idx" ON "StepDefinitionTelemetryEvent"("surface", "outcome", "createdAt");
CREATE INDEX "StepDefinitionTelemetryEvent_stepId_stepVersion_createdAt_idx" ON "StepDefinitionTelemetryEvent"("stepId", "stepVersion", "createdAt");
CREATE TABLE "new_Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tagExpression" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FILTER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "Tag_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Tag" ("createdAt", "id", "name", "tagExpression", "targetProjectId", "type", "updatedAt") SELECT "createdAt", "id", "name", "tagExpression", "targetProjectId", "type", "updatedAt" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
CREATE UNIQUE INDEX "Tag_targetProjectId_name_type_key" ON "Tag"("targetProjectId", "name", "type");
CREATE TABLE "new_TargetProject" (
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
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TargetProject" ("kind", "canonicalIdentity", "canonicalPath", "createdAt", "description", "displayName", "fingerprint", "id", "lastDetectedAt", "packageJson", "packageManager", "packageName", "updatedAt")
SELECT 'LOCAL_WORKSPACE', COALESCE("canonicalPath", "fingerprint"), "canonicalPath", "createdAt", "description", "displayName", "fingerprint", "id", "lastDetectedAt", "packageJson", "packageManager", "packageName", "updatedAt" FROM "TargetProject";
DROP TABLE "TargetProject";
ALTER TABLE "new_TargetProject" RENAME TO "TargetProject";
CREATE UNIQUE INDEX "TargetProject_canonicalIdentity_key" ON "TargetProject"("canonicalIdentity");
CREATE UNIQUE INDEX "TargetProject_fingerprint_key" ON "TargetProject"("fingerprint");
CREATE INDEX "TargetProject_displayName_idx" ON "TargetProject"("displayName");
CREATE INDEX "TargetProject_canonicalPath_idx" ON "TargetProject"("canonicalPath");
CREATE INDEX "TargetProject_normalizedRemoteOrigin_idx" ON "TargetProject"("normalizedRemoteOrigin");
CREATE INDEX "TargetProject_fingerprint_idx" ON "TargetProject"("fingerprint");
CREATE TABLE "new_TemplateTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TemplateTestCase_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TemplateTestCase" ("createdAt", "description", "id", "name", "targetProjectId", "updatedAt") SELECT "createdAt", "description", "id", "name", "targetProjectId", "updatedAt" FROM "TemplateTestCase";
DROP TABLE "TemplateTestCase";
ALTER TABLE "new_TemplateTestCase" RENAME TO "TemplateTestCase";
CREATE UNIQUE INDEX "TemplateTestCase_targetProjectId_name_key" ON "TemplateTestCase"("targetProjectId", "name");
CREATE TABLE "new_TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TestCase_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("createdAt", "description", "id", "targetProjectId", "title", "updatedAt") SELECT "createdAt", "description", "id", "targetProjectId", "title", "updatedAt" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE INDEX "TestCase_targetProjectId_idx" ON "TestCase"("targetProjectId");
CREATE TABLE "new_TestCaseMetrics" (
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
INSERT INTO "new_TestCaseMetrics" ("consecutiveFailures", "createdAt", "failedRecentRuns", "failureRate", "id", "isFlaky", "isRepeatedlyFailing", "lastExecutedAt", "lastFailedAt", "lastPassedAt", "targetProjectId", "testCaseId", "totalRecentRuns", "updatedAt") SELECT "consecutiveFailures", "createdAt", "failedRecentRuns", "failureRate", "id", "isFlaky", "isRepeatedlyFailing", "lastExecutedAt", "lastFailedAt", "lastPassedAt", "targetProjectId", "testCaseId", "totalRecentRuns", "updatedAt" FROM "TestCaseMetrics";
DROP TABLE "TestCaseMetrics";
ALTER TABLE "new_TestCaseMetrics" RENAME TO "TestCaseMetrics";
CREATE UNIQUE INDEX "TestCaseMetrics_testCaseId_key" ON "TestCaseMetrics"("testCaseId");
CREATE INDEX "TestCaseMetrics_isRepeatedlyFailing_idx" ON "TestCaseMetrics"("isRepeatedlyFailing");
CREATE INDEX "TestCaseMetrics_isFlaky_idx" ON "TestCaseMetrics"("isFlaky");
CREATE TABLE "new_TestRun" (
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
    "environmentSnapshotHash" TEXT,
    "environmentSnapshotJson" TEXT,
    "environmentSnapshotVersion" INTEGER,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRun_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestRun" ("browserEngine", "completedAt", "environmentId", "evidenceHealth", "id", "logPath", "name", "preparationKey", "reportPath", "result", "runId", "startedAt", "status", "targetProjectId", "testWorkersCount", "updatedAt") SELECT "browserEngine", "completedAt", "environmentId", "evidenceHealth", "id", "logPath", "name", "preparationKey", "reportPath", "result", "runId", "startedAt", "status", "targetProjectId", "testWorkersCount", "updatedAt" FROM "TestRun";
DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");
CREATE INDEX "TestRun_completedAt_idx" ON "TestRun"("completedAt");
CREATE INDEX "TestRun_result_idx" ON "TestRun"("result");
CREATE INDEX "TestRun_evidenceHealth_idx" ON "TestRun"("evidenceHealth");
CREATE INDEX "TestRun_targetProjectId_idx" ON "TestRun"("targetProjectId");
CREATE INDEX "TestRun_targetProjectId_startedAt_id_idx" ON "TestRun"("targetProjectId", "startedAt", "id");
CREATE UNIQUE INDEX "TestRun_targetProjectId_preparationKey_key" ON "TestRun"("targetProjectId", "preparationKey");
CREATE TABLE "new_TestSuite" (
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
INSERT INTO "new_TestSuite" ("createdAt", "description", "id", "moduleId", "name", "targetProjectId", "updatedAt") SELECT "createdAt", "description", "id", "moduleId", "name", "targetProjectId", "updatedAt" FROM "TestSuite";
DROP TABLE "TestSuite";
ALTER TABLE "new_TestSuite" RENAME TO "TestSuite";
CREATE INDEX "TestSuite_targetProjectId_idx" ON "TestSuite"("targetProjectId");
CREATE TABLE "new_TestSuiteMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testSuiteId" TEXT NOT NULL,
    "lastExecutedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    CONSTRAINT "TestSuiteMetrics_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestSuiteMetrics_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestSuiteMetrics" ("createdAt", "id", "lastExecutedAt", "targetProjectId", "testSuiteId", "updatedAt") SELECT "createdAt", "id", "lastExecutedAt", "targetProjectId", "testSuiteId", "updatedAt" FROM "TestSuiteMetrics";
DROP TABLE "TestSuiteMetrics";
ALTER TABLE "new_TestSuiteMetrics" RENAME TO "TestSuiteMetrics";
CREATE UNIQUE INDEX "TestSuiteMetrics_testSuiteId_key" ON "TestSuiteMetrics"("testSuiteId");
CREATE INDEX "TestSuiteMetrics_lastExecutedAt_idx" ON "TestSuiteMetrics"("lastExecutedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourney_activeTriageReportId_key" ON "QualityJourney"("activeTriageReportId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourney_activeDiscoveryRevisionId_key" ON "QualityJourney"("activeDiscoveryRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourney_activeScenarioPortfolioRevisionId_key" ON "QualityJourney"("activeScenarioPortfolioRevisionId");

-- CreateIndex
CREATE INDEX "QualityJourney_targetProjectId_status_idx" ON "QualityJourney"("targetProjectId", "status");

-- CreateIndex
CREATE INDEX "QualityJourney_targetProjectId_stage_idx" ON "QualityJourney"("targetProjectId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourney_targetProjectId_rootIdempotencyKey_key" ON "QualityJourney"("targetProjectId", "rootIdempotencyKey");

-- CreateIndex
CREATE INDEX "QualityJourneyArtifact_targetProjectId_kind_idx" ON "QualityJourneyArtifact"("targetProjectId", "kind");

-- CreateIndex
CREATE INDEX "QualityJourneyArtifact_journeyId_artifactId_idx" ON "QualityJourneyArtifact"("journeyId", "artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyArtifact_journeyId_identityKey_key" ON "QualityJourneyArtifact"("journeyId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_artifactRecordId_key" ON "QualityJourneyAnalysisRevision"("artifactRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_predecessorRevisionId_key" ON "QualityJourneyAnalysisRevision"("predecessorRevisionId");

-- CreateIndex
CREATE INDEX "QualityJourneyAnalysisRevision_journeyId_createdAt_idx" ON "QualityJourneyAnalysisRevision"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "QualityJourneyAnalysisRevision_targetProjectId_cycleId_idx" ON "QualityJourneyAnalysisRevision"("targetProjectId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_journeyId_artifactRevisionId_key" ON "QualityJourneyAnalysisRevision"("journeyId", "artifactRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_journeyId_revision_key" ON "QualityJourneyAnalysisRevision"("journeyId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_journeyId_submissionIdempotencyKey_key" ON "QualityJourneyAnalysisRevision"("journeyId", "submissionIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisQuestion_artifactRecordId_key" ON "QualityJourneyAnalysisQuestion"("artifactRecordId");

-- CreateIndex
CREATE INDEX "QualityJourneyAnalysisQuestion_journeyId_required_idx" ON "QualityJourneyAnalysisQuestion"("journeyId", "required");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisQuestion_analysisRevisionId_questionId_key" ON "QualityJourneyAnalysisQuestion"("analysisRevisionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisAnswer_artifactRecordId_key" ON "QualityJourneyAnalysisAnswer"("artifactRecordId");

-- CreateIndex
CREATE INDEX "QualityJourneyAnalysisAnswer_questionRecordId_createdAt_idx" ON "QualityJourneyAnalysisAnswer"("questionRecordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisAnswer_journeyId_answerId_key" ON "QualityJourneyAnalysisAnswer"("journeyId", "answerId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisAnswer_journeyId_idempotencyKey_key" ON "QualityJourneyAnalysisAnswer"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisAnswer_correctionOfAnswerId_key" ON "QualityJourneyAnalysisAnswer"("correctionOfAnswerId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisPublication_analysisRevisionId_key" ON "QualityJourneyAnalysisPublication"("analysisRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisPublication_commandId_key" ON "QualityJourneyAnalysisPublication"("commandId");

-- CreateIndex
CREATE INDEX "QualityJourneyAnalysisPublication_journeyId_publishedAt_idx" ON "QualityJourneyAnalysisPublication"("journeyId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisDecision_analysisRevisionId_key" ON "QualityJourneyAnalysisDecision"("analysisRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisDecision_artifactRecordId_key" ON "QualityJourneyAnalysisDecision"("artifactRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAnalysisDecision_commandId_key" ON "QualityJourneyAnalysisDecision"("commandId");

-- CreateIndex
CREATE INDEX "QualityJourneyAnalysisDecision_journeyId_createdAt_idx" ON "QualityJourneyAnalysisDecision"("journeyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_scoutWorkItemId_key" ON "QualityJourneyDiscoveryRevision"("scoutWorkItemId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_resourceWorkItemId_key" ON "QualityJourneyDiscoveryRevision"("resourceWorkItemId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_predecessorRevisionId_key" ON "QualityJourneyDiscoveryRevision"("predecessorRevisionId");

-- CreateIndex
CREATE INDEX "QualityJourneyDiscoveryRevision_journeyId_status_idx" ON "QualityJourneyDiscoveryRevision"("journeyId", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyDiscoveryRevision_targetProjectId_createdAt_idx" ON "QualityJourneyDiscoveryRevision"("targetProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "QualityJourneyDiscoveryRevision_analysisRevisionId_idx" ON "QualityJourneyDiscoveryRevision"("analysisRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_journeyId_targetObservationIdempotencyKey_key" ON "QualityJourneyDiscoveryRevision"("journeyId", "targetObservationIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_journeyId_resourceResolutionIdempotencyKey_key" ON "QualityJourneyDiscoveryRevision"("journeyId", "resourceResolutionIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_journeyId_retryIdempotencyKey_key" ON "QualityJourneyDiscoveryRevision"("journeyId", "retryIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_predecessorPortfolioRevisionId_key" ON "QualityJourneyScenarioPortfolioRevision"("predecessorPortfolioRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_artifactRecordId_key" ON "QualityJourneyScenarioPortfolioRevision"("artifactRecordId");

-- CreateIndex
CREATE INDEX "QualityJourneyScenarioPortfolioRevision_journeyId_status_idx" ON "QualityJourneyScenarioPortfolioRevision"("journeyId", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyScenarioPortfolioRevision_targetProjectId_createdAt_idx" ON "QualityJourneyScenarioPortfolioRevision"("targetProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "QualityJourneyScenarioPortfolioRevision_discoveryRevisionId_idx" ON "QualityJourneyScenarioPortfolioRevision"("discoveryRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_journeyId_artifactRevisionId_key" ON "QualityJourneyScenarioPortfolioRevision"("journeyId", "artifactRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_journeyId_revision_key" ON "QualityJourneyScenarioPortfolioRevision"("journeyId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_journeyId_submissionIdempotencyKey_key" ON "QualityJourneyScenarioPortfolioRevision"("journeyId", "submissionIdempotencyKey");

-- CreateIndex
CREATE INDEX "QualityJourneyScenarioRevision_stableScenarioId_idx" ON "QualityJourneyScenarioRevision"("stableScenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioRevision_portfolioRevisionId_scenarioRevisionId_key" ON "QualityJourneyScenarioRevision"("portfolioRevisionId", "scenarioRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioRevision_portfolioRevisionId_stableScenarioId_key" ON "QualityJourneyScenarioRevision"("portfolioRevisionId", "stableScenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioRevision_scenarioRevisionId_key" ON "QualityJourneyScenarioRevision"("scenarioRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyPreparedRuntimeCapsule_materializationId_key" ON "QualityJourneyPreparedRuntimeCapsule"("materializationId");

-- CreateIndex
CREATE INDEX "QualityJourneyPreparedRuntimeCapsule_targetProjectId_cycleId_idx" ON "QualityJourneyPreparedRuntimeCapsule"("targetProjectId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyPreparedRuntimeCapsule_journeyId_materializationId_key" ON "QualityJourneyPreparedRuntimeCapsule"("journeyId", "materializationId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_artifactRecordId_key" ON "QualityJourneyAutomationMaterialization"("artifactRecordId");

-- CreateIndex
CREATE INDEX "QualityJourneyAutomationMaterialization_workItemId_attemptId_idx" ON "QualityJourneyAutomationMaterialization"("workItemId", "attemptId");

-- CreateIndex
CREATE INDEX "QualityJourneyAutomationMaterialization_targetProjectId_cycleId_idx" ON "QualityJourneyAutomationMaterialization"("targetProjectId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_journeyId_idempotencyKey_key" ON "QualityJourneyAutomationMaterialization"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_journeyId_scenarioRevisionId_inputHash_status_failureKind_idempotencyKey_key" ON "QualityJourneyAutomationMaterialization"("journeyId", "scenarioRevisionId", "inputHash", "status", "failureKind", "idempotencyKey");

-- CreateIndex
CREATE INDEX "QualityJourneyAutomationTargetBinding_journeyId_targetProjectId_idx" ON "QualityJourneyAutomationTargetBinding"("journeyId", "targetProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAutomationTargetBinding_targetProjectId_semanticHash_key" ON "QualityJourneyAutomationTargetBinding"("targetProjectId", "semanticHash");

-- CreateIndex
CREATE INDEX "QualityJourneyAutomationMaterializationBinding_bindingId_idx" ON "QualityJourneyAutomationMaterializationBinding"("bindingId");

-- CreateIndex
CREATE INDEX "QualityJourneyAutomationRequestReceipt_attemptId_idx" ON "QualityJourneyAutomationRequestReceipt"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyAutomationRequestReceipt_journeyId_idempotencyKey_key" ON "QualityJourneyAutomationRequestReceipt"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "QualityJourneyScenarioDecision_portfolioRevisionId_decision_idx" ON "QualityJourneyScenarioDecision"("portfolioRevisionId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioDecision_portfolioRevisionId_scenarioRevisionId_key" ON "QualityJourneyScenarioDecision"("portfolioRevisionId", "scenarioRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioDecision_portfolioRevisionId_idempotencyKey_key" ON "QualityJourneyScenarioDecision"("portfolioRevisionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "QualityJourneyScenarioReviewComment_portfolioRevisionId_scenarioRevisionId_idx" ON "QualityJourneyScenarioReviewComment"("portfolioRevisionId", "scenarioRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioReviewComment_portfolioRevisionId_idempotencyKey_key" ON "QualityJourneyScenarioReviewComment"("portfolioRevisionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioReviewComment_portfolioRevisionId_dispositionIdempotencyKey_key" ON "QualityJourneyScenarioReviewComment"("portfolioRevisionId", "dispositionIdempotencyKey");

-- CreateIndex
CREATE INDEX "QualityJourneyScenarioDecisionReceipt_portfolioRevisionId_createdAt_idx" ON "QualityJourneyScenarioDecisionReceipt"("portfolioRevisionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyScenarioDecisionReceipt_journeyId_idempotencyKey_key" ON "QualityJourneyScenarioDecisionReceipt"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "QualityJourneyRevision_journeyId_createdAt_idx" ON "QualityJourneyRevision"("journeyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyRevision_journeyId_revision_key" ON "QualityJourneyRevision"("journeyId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyCycle_journeyId_sequence_key" ON "QualityJourneyCycle"("journeyId", "sequence");

-- CreateIndex
CREATE INDEX "QualityJourneyExecutionCycle_journeyId_cycleId_status_idx" ON "QualityJourneyExecutionCycle"("journeyId", "cycleId", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyExecutionCycle_targetProjectId_status_idx" ON "QualityJourneyExecutionCycle"("targetProjectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionCycle_journeyId_idempotencyKey_key" ON "QualityJourneyExecutionCycle"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionTestRun_testRunId_key" ON "QualityJourneyExecutionTestRun"("testRunId");

-- CreateIndex
CREATE INDEX "QualityJourneyExecutionTestRun_preparedCapsuleId_idx" ON "QualityJourneyExecutionTestRun"("preparedCapsuleId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionTestRun_executionCycleId_preparedCapsuleId_key" ON "QualityJourneyExecutionTestRun"("executionCycleId", "preparedCapsuleId");

-- CreateIndex
CREATE INDEX "QualityJourneyExecutionConsent_journeyId_scopeHash_status_idx" ON "QualityJourneyExecutionConsent"("journeyId", "scopeHash", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyExecutionConsent_targetProjectId_status_idx" ON "QualityJourneyExecutionConsent"("targetProjectId", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyExecutionCancellationReceipt_executionCycleId_createdAt_idx" ON "QualityJourneyExecutionCancellationReceipt"("executionCycleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionCancellationReceipt_journeyId_idempotencyKey_key" ON "QualityJourneyExecutionCancellationReceipt"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionEvidenceReceipt_testRunId_key" ON "QualityJourneyExecutionEvidenceReceipt"("testRunId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionEvidenceReceipt_receiptHash_key" ON "QualityJourneyExecutionEvidenceReceipt"("receiptHash");

-- CreateIndex
CREATE INDEX "QualityJourneyExecutionEvidenceReceipt_executionCycleId_createdAt_idx" ON "QualityJourneyExecutionEvidenceReceipt"("executionCycleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionRerunProposal_successorExecutionCycleId_key" ON "QualityJourneyExecutionRerunProposal"("successorExecutionCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionRerunProposal_proposalHash_key" ON "QualityJourneyExecutionRerunProposal"("proposalHash");

-- CreateIndex
CREATE INDEX "QualityJourneyExecutionRerunProposal_targetProjectId_status_idx" ON "QualityJourneyExecutionRerunProposal"("targetProjectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyExecutionRerunProposal_journeyId_idempotencyKey_key" ON "QualityJourneyExecutionRerunProposal"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "QualityJourneyCommand_targetProjectId_createdAt_idx" ON "QualityJourneyCommand"("targetProjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyCommand_journeyId_idempotencyKey_key" ON "QualityJourneyCommand"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyCommand_journeyId_id_key" ON "QualityJourneyCommand"("journeyId", "id");

-- CreateIndex
CREATE INDEX "QualityJourneyEvent_targetProjectId_createdAt_idx" ON "QualityJourneyEvent"("targetProjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyEvent_journeyId_sequence_key" ON "QualityJourneyEvent"("journeyId", "sequence");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkItem_journeyId_status_idx" ON "QualityJourneyWorkItem"("journeyId", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkItem_journeyId_role_cycleId_idx" ON "QualityJourneyWorkItem"("journeyId", "role", "cycleId");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkItem_targetProjectId_status_idx" ON "QualityJourneyWorkItem"("targetProjectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyWorkAuthorization_supersedesAuthorizationId_key" ON "QualityJourneyWorkAuthorization"("supersedesAuthorizationId");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAuthorization_targetProjectId_role_idx" ON "QualityJourneyWorkAuthorization"("targetProjectId", "role");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAuthorization_journeyId_workItemId_idx" ON "QualityJourneyWorkAuthorization"("journeyId", "workItemId");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAuthorization_workItemId_createdAt_idx" ON "QualityJourneyWorkAuthorization"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAuthorization_revokedAt_idx" ON "QualityJourneyWorkAuthorization"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_leaseId_key" ON "QualityJourneyWorkAttempt"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_dispatchKey_key" ON "QualityJourneyWorkAttempt"("dispatchKey");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAttempt_leaseExpiresAt_status_idx" ON "QualityJourneyWorkAttempt"("leaseExpiresAt", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAttempt_authorizationId_attempt_idx" ON "QualityJourneyWorkAttempt"("authorizationId", "attempt");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAttempt_replacesAttemptId_idx" ON "QualityJourneyWorkAttempt"("replacesAttemptId");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAttempt_dispatchReservedAt_idx" ON "QualityJourneyWorkAttempt"("dispatchReservedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_workItemId_attempt_key" ON "QualityJourneyWorkAttempt"("workItemId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_assignmentId_key" ON "QualityJourneyWorkAttempt"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_spawnRequestId_key" ON "QualityJourneyWorkAttempt"("spawnRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_spawnReceiptId_key" ON "QualityJourneyWorkAttempt"("spawnReceiptId");

-- CreateIndex
CREATE INDEX "QualityJourneyBlocker_journeyId_status_idx" ON "QualityJourneyBlocker"("journeyId", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyBlocker_targetProjectId_status_idx" ON "QualityJourneyBlocker"("targetProjectId", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyArtifactLink_targetProjectId_cycleId_idx" ON "QualityJourneyArtifactLink"("targetProjectId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyArtifactLink_journeyId_linkHash_key" ON "QualityJourneyArtifactLink"("journeyId", "linkHash");

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
CREATE UNIQUE INDEX "QualityJourneyReportReview_successorCycleId_key" ON "QualityJourneyReportReview"("successorCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyReportReview_journeyId_idempotencyKey_key" ON "QualityJourneyReportReview"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyClosure_journeyId_key" ON "QualityJourneyClosure"("journeyId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyClosure_reportRevisionId_key" ON "QualityJourneyClosure"("reportRevisionId");
-- Journey authority and immutability triggers are preserved explicitly because Prisma's schema diff does not emit SQLite triggers.
CREATE TRIGGER "QualityJourney_active_report_scope" BEFORE UPDATE OF "activeTriageReportId" ON "QualityJourney"
WHEN NEW.activeTriageReportId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageReport" r WHERE r.id = NEW.activeTriageReportId AND r.journeyId = NEW.id)
BEGIN SELECT RAISE(ABORT, 'Quality Journey active report scope mismatch'); END;

CREATE TRIGGER "QualityJourney_remediation_cycle_append_only" BEFORE DELETE ON "QualityJourneyCycle"
WHEN EXISTS (SELECT 1 FROM "QualityJourneyReportReview" WHERE successorCycleId = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Quality Journey remediation cycle is append-only'); END;

CREATE TRIGGER "QualityJourney_remediation_cycle_immutable" BEFORE UPDATE ON "QualityJourneyCycle"
WHEN EXISTS (SELECT 1 FROM "QualityJourneyReportReview" WHERE successorCycleId = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Quality Journey remediation cycle is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisAnswer_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisAnswer" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisAnswer is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisAnswer_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisAnswer" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisAnswer is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisDecision_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisDecision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisDecision is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisDecision_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisDecision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisDecision is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisPublication_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisPublication" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisPublication is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisPublication_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisPublication" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisPublication is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisQuestion_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisQuestion" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisQuestion is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisQuestion_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisQuestion" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisQuestion is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisRevision_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisRevision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisRevision is immutable'); END;

CREATE TRIGGER "QualityJourneyAnalysisRevision_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisRevision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisRevision is immutable'); END;

CREATE TRIGGER "QualityJourneyArtifact_no_delete" BEFORE DELETE ON "QualityJourneyArtifact" BEGIN SELECT RAISE(ABORT, 'QualityJourneyArtifact is immutable'); END;

CREATE TRIGGER "QualityJourneyArtifact_no_update" BEFORE UPDATE ON "QualityJourneyArtifact" BEGIN SELECT RAISE(ABORT, 'QualityJourneyArtifact is immutable'); END;

CREATE TRIGGER "QualityJourneyArtifactLink_no_delete" BEFORE DELETE ON "QualityJourneyArtifactLink" BEGIN SELECT RAISE(ABORT, 'QualityJourneyArtifactLink is immutable'); END;

CREATE TRIGGER "QualityJourneyArtifactLink_no_update" BEFORE UPDATE ON "QualityJourneyArtifactLink" BEGIN SELECT RAISE(ABORT, 'QualityJourneyArtifactLink is immutable'); END;

CREATE TRIGGER "QualityJourneyAutomationMaterialization_immutable_delete" BEFORE DELETE ON "QualityJourneyAutomationMaterialization" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materializations are append-only'); END;

CREATE TRIGGER "QualityJourneyAutomationMaterialization_immutable_update" BEFORE UPDATE ON "QualityJourneyAutomationMaterialization" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materializations are immutable'); END;

CREATE TRIGGER "QualityJourneyAutomationMaterializationBinding_immutable_delete" BEFORE DELETE ON "QualityJourneyAutomationMaterializationBinding" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materialization bindings are append-only'); END;

CREATE TRIGGER "QualityJourneyAutomationMaterializationBinding_immutable_update" BEFORE UPDATE ON "QualityJourneyAutomationMaterializationBinding" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materialization bindings are immutable'); END;

CREATE TRIGGER "QualityJourneyAutomationRequestReceipt_immutable_delete" BEFORE DELETE ON "QualityJourneyAutomationRequestReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator request receipts are append-only'); END;

CREATE TRIGGER "QualityJourneyAutomationRequestReceipt_immutable_update" BEFORE UPDATE ON "QualityJourneyAutomationRequestReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator request receipts are immutable'); END;

CREATE TRIGGER "QualityJourneyAutomationTargetBinding_immutable_delete"
BEFORE DELETE ON "QualityJourneyAutomationTargetBinding"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator target bindings are append-only'); END;

CREATE TRIGGER "QualityJourneyAutomationTargetBinding_immutable_update"
BEFORE UPDATE ON "QualityJourneyAutomationTargetBinding"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator target bindings are immutable'); END;

CREATE TRIGGER "QualityJourneyClosure_immutable_delete" BEFORE DELETE ON "QualityJourneyClosure"
BEGIN SELECT RAISE(ABORT, 'Quality Journey closure receipts are immutable'); END;

CREATE TRIGGER "QualityJourneyClosure_immutable_update" BEFORE UPDATE ON "QualityJourneyClosure"
BEGIN SELECT RAISE(ABORT, 'Quality Journey closure receipts are immutable'); END;

CREATE TRIGGER "QualityJourneyCommand_no_delete" BEFORE DELETE ON "QualityJourneyCommand" BEGIN SELECT RAISE(ABORT, 'QualityJourneyCommand is immutable'); END;

CREATE TRIGGER "QualityJourneyCommand_no_update" BEFORE UPDATE ON "QualityJourneyCommand" BEGIN SELECT RAISE(ABORT, 'QualityJourneyCommand is immutable'); END;

CREATE TRIGGER "QualityJourneyCycle_no_delete" BEFORE DELETE ON "QualityJourneyCycle" BEGIN SELECT RAISE(ABORT, 'QualityJourneyCycle is immutable'); END;

CREATE TRIGGER "QualityJourneyCycle_no_update" BEFORE UPDATE ON "QualityJourneyCycle" BEGIN SELECT RAISE(ABORT, 'QualityJourneyCycle is immutable'); END;

CREATE TRIGGER "QualityJourneyDiscoveryRevision_identity_immutable"
BEFORE UPDATE OF "journeyId", "targetProjectId", "cycleId", "analysisRevisionId", "analysisDecisionId", "analysisArtifactId", "analysisRevisionArtifactId", "analysisRevisionContentHash", "analysisApprovalArtifactId", "analysisApprovalContentHash", "approvedRequirementSetHash", "environmentRegistryHash", "locatorRegistryHash", "resourceRegistryHash", "stepDefinitionRegistryHash", "operationRegistryHash", "scoutScopeJson", "scoutInputHash", "resourceScopeJson", "resourceInputHash", "scopeHash", "scoutWorkItemId", "resourceWorkItemId", "predecessorRevisionId", "retryIdempotencyKey", "retryRequestHash" ON "QualityJourneyDiscoveryRevision"
BEGIN SELECT RAISE(ABORT, 'QualityJourneyDiscoveryRevision authority is immutable'); END;

CREATE TRIGGER "QualityJourneyEvent_no_delete" BEFORE DELETE ON "QualityJourneyEvent" BEGIN SELECT RAISE(ABORT, 'QualityJourneyEvent is append-only'); END;

CREATE TRIGGER "QualityJourneyEvent_no_update" BEFORE UPDATE ON "QualityJourneyEvent" BEGIN SELECT RAISE(ABORT, 'QualityJourneyEvent is append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionCancellationReceipt_append_only" BEFORE DELETE ON "QualityJourneyExecutionCancellationReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cancellation receipts are append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionCancellationReceipt_cycle_scope" BEFORE INSERT ON "QualityJourneyExecutionCancellationReceipt" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."executionCycleId" AND "journeyId" = NEW."journeyId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cancellation receipt is outside its journey scope'); END;

CREATE TRIGGER "QualityJourneyExecutionCancellationReceipt_immutable_update" BEFORE UPDATE ON "QualityJourneyExecutionCancellationReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cancellation receipts are immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionConsent_append_only" BEFORE DELETE ON "QualityJourneyExecutionConsent" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consents are append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionConsent_cycle_once" BEFORE UPDATE OF "executionCycleId" ON "QualityJourneyExecutionConsent" FOR EACH ROW WHEN OLD."executionCycleId" IS NOT NULL OR NEW."executionCycleId" IS NULL BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consent cycle binding is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionConsent_cycle_scope" BEFORE INSERT ON "QualityJourneyExecutionConsent" FOR EACH ROW WHEN NEW."executionCycleId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."executionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consent cycle is outside its journey target scope'); END;

CREATE TRIGGER "QualityJourneyExecutionConsent_cycle_scope_update" BEFORE UPDATE OF "executionCycleId" ON "QualityJourneyExecutionConsent" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."executionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consent cycle is outside its journey target scope'); END;

CREATE TRIGGER "QualityJourneyExecutionConsent_scope_identity" BEFORE UPDATE OF "id", "journeyId", "targetProjectId", "scopeJson", "scopeHash", "grantSource" ON "QualityJourneyExecutionConsent" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution consent scope is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionCycle_append_only" BEFORE DELETE ON "QualityJourneyExecutionCycle" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cycles are append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionCycle_environment_scope" BEFORE INSERT ON "QualityJourneyExecutionCycle" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "Environment" WHERE "id" = NEW."environmentId" AND "targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution environment is outside its target scope'); END;

CREATE TRIGGER "QualityJourneyExecutionCycle_frozen_identity" BEFORE UPDATE OF "id", "journeyId", "targetProjectId", "cycleId", "predecessorExecutionCycleId", "preparedCapsulesJson", "preparedCapsulesHash", "environmentId", "environmentSnapshotJson", "environmentSnapshotHash", "environmentSnapshotVersion", "targetFingerprint", "browserEngine", "stateHash", "idempotencyKey", "requestHash" ON "QualityJourneyExecutionCycle" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cycle binding is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionCycle_journey_cycle_scope" BEFORE INSERT ON "QualityJourneyExecutionCycle" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyCycle" cycle JOIN "QualityJourney" journey ON journey."id" = cycle."journeyId" WHERE cycle."id" = NEW."cycleId" AND cycle."journeyId" = NEW."journeyId" AND journey."targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution cycle does not belong to its journey target scope'); END;

CREATE TRIGGER "QualityJourneyExecutionCycle_predecessor_scope" BEFORE INSERT ON "QualityJourneyExecutionCycle" FOR EACH ROW WHEN NEW."predecessorExecutionCycleId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."predecessorExecutionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "status" IN ('COMPLETED', 'CANCELLED')) BEGIN SELECT RAISE(ABORT, 'Quality Journey execution predecessor is outside its terminal journey target scope'); END;

CREATE TRIGGER "QualityJourneyExecutionEvidenceReceipt_binding_scope" BEFORE INSERT ON "QualityJourneyExecutionEvidenceReceipt" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "executionCycleId" = NEW."executionCycleId" AND "testRunId" = NEW."testRunId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution evidence is outside its TestRun binding scope'); END;

CREATE TRIGGER "QualityJourneyExecutionEvidenceReceipt_immutable_delete" BEFORE DELETE ON "QualityJourneyExecutionEvidenceReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution evidence is append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionEvidenceReceipt_immutable_update" BEFORE UPDATE ON "QualityJourneyExecutionEvidenceReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution evidence is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionRerunProposal_append_only" BEFORE DELETE ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposals are append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionRerunProposal_report_immutable" BEFORE UPDATE OF "reportRevisionId", "reportHash" ON "QualityJourneyExecutionRerunProposal"
BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun report binding is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionRerunProposal_report_scope" BEFORE INSERT ON "QualityJourneyExecutionRerunProposal"
WHEN (NEW.reportRevisionId IS NULL) != (NEW.reportHash IS NULL) OR (NEW.reportRevisionId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageReport" r JOIN "QualityJourneyTriageAssignment" a ON a.id = r.assignmentId WHERE r.id = NEW.reportRevisionId AND r.journeyId = NEW.journeyId AND r.contentHash = NEW.reportHash AND a.executionCycleId = NEW.sourceExecutionCycleId))
BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun report scope mismatch'); END;

CREATE TRIGGER "QualityJourneyExecutionRerunProposal_scope_identity" BEFORE UPDATE OF "id", "journeyId", "targetProjectId", "sourceExecutionCycleId", "sourceEvidenceJson", "selectedScenariosJson", "reason", "proposalHash", "idempotencyKey", "requestHash" ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposal scope is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionRerunProposal_source_scope" BEFORE INSERT ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."sourceExecutionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId") BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposal source is outside its journey target scope'); END;

CREATE TRIGGER "QualityJourneyExecutionRerunProposal_successor_once" BEFORE UPDATE OF "successorExecutionCycleId" ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW WHEN OLD."successorExecutionCycleId" IS NOT NULL OR NEW."successorExecutionCycleId" IS NULL BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposal successor binding is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionRerunProposal_successor_scope" BEFORE UPDATE OF "successorExecutionCycleId" ON "QualityJourneyExecutionRerunProposal" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" WHERE "id" = NEW."successorExecutionCycleId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "predecessorExecutionCycleId" = NEW."sourceExecutionCycleId") BEGIN SELECT RAISE(ABORT, 'Quality Journey rerun proposal successor is outside its frozen source scope'); END;

CREATE TRIGGER "QualityJourneyExecutionTestRun_append_only" BEFORE DELETE ON "QualityJourneyExecutionTestRun" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution test-run bindings are append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionTestRun_case_append_only" BEFORE DELETE ON "TestRunTestCase" FOR EACH ROW WHEN EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "testRunId" = OLD."testRunId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun cases are append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionTestRun_case_identity" BEFORE UPDATE OF "testRunId", "testCaseId", "testSuiteId" ON "TestRunTestCase" FOR EACH ROW WHEN EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "testRunId" = OLD."testRunId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun case identity is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionTestRun_case_no_late_insert" BEFORE INSERT ON "TestRunTestCase" FOR EACH ROW WHEN EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "testRunId" = NEW."testRunId") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun cases are append-only'); END;

CREATE TRIGGER "QualityJourneyExecutionTestRun_frozen_identity" BEFORE UPDATE OF "id", "executionCycleId", "preparedCapsuleId", "testRunId", "runId" ON "QualityJourneyExecutionTestRun" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Quality Journey execution test-run binding is immutable'); END;

CREATE TRIGGER "QualityJourneyExecutionTestRun_insert_scope" BEFORE INSERT ON "QualityJourneyExecutionTestRun" FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" cycle JOIN "TestRun" run ON run."id" = NEW."testRunId" WHERE cycle."id" = NEW."executionCycleId" AND run."intent" = 'QUALITY_JOURNEY' AND run."runId" = NEW."runId" AND run."targetProjectId" = cycle."targetProjectId" AND run."environmentId" = cycle."environmentId" AND run."environmentSnapshotJson" = cycle."environmentSnapshotJson" AND run."environmentSnapshotHash" = cycle."environmentSnapshotHash" AND run."environmentSnapshotVersion" = cycle."environmentSnapshotVersion" AND run."browserEngine" = cycle."browserEngine" AND EXISTS (SELECT 1 FROM json_each(cycle."preparedCapsulesJson") WHERE json_extract(value, '$.preparedCapsuleId') = NEW."preparedCapsuleId")) BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun binding is outside the frozen cycle scope'); END;

CREATE TRIGGER "QualityJourneyExecutionTestRun_test_run_identity" BEFORE UPDATE OF "id", "runId", "intent", "targetProjectId", "environmentId", "environmentSnapshotJson", "environmentSnapshotHash", "environmentSnapshotVersion", "browserEngine" ON "TestRun" FOR EACH ROW WHEN EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" WHERE "testRunId" = OLD."id") BEGIN SELECT RAISE(ABORT, 'Quality Journey execution TestRun identity is immutable'); END;

CREATE TRIGGER "QualityJourneyPreparedRuntimeCapsule_immutable_delete"
BEFORE DELETE ON "QualityJourneyPreparedRuntimeCapsule"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Prepared runtime capsules are append-only'); END;

CREATE TRIGGER "QualityJourneyPreparedRuntimeCapsule_immutable_update"
BEFORE UPDATE ON "QualityJourneyPreparedRuntimeCapsule"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Prepared runtime capsules are immutable'); END;

CREATE TRIGGER "QualityJourneyReportReview_delete_immutable" BEFORE DELETE ON "QualityJourneyReportReview" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyReportReview_scope" BEFORE INSERT ON "QualityJourneyReportReview"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageReport" r WHERE r.id = NEW.reportRevisionId AND r.journeyId = NEW.journeyId)
BEGIN SELECT RAISE(ABORT, 'Quality Journey report review scope mismatch'); END;

CREATE TRIGGER "QualityJourneyReportReview_successor_scope" BEFORE INSERT ON "QualityJourneyReportReview"
WHEN NEW.successorCycleId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCycle" c WHERE c.id = NEW.successorCycleId AND c.journeyId = NEW.journeyId)
BEGIN SELECT RAISE(ABORT, 'Quality Journey remediation successor scope mismatch'); END;

CREATE TRIGGER "QualityJourneyReportReview_update_immutable" BEFORE UPDATE ON "QualityJourneyReportReview" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyRevision_no_delete" BEFORE DELETE ON "QualityJourneyRevision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyRevision is immutable'); END;

CREATE TRIGGER "QualityJourneyRevision_no_update" BEFORE UPDATE ON "QualityJourneyRevision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyRevision is immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioDecision_immutable_delete"
BEFORE DELETE ON "QualityJourneyScenarioDecision"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario decisions are immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioDecision_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioDecision"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario decisions are immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioDecision_portfolio_membership_insert"
BEFORE INSERT ON "QualityJourneyScenarioDecision"
FOR EACH ROW WHEN NOT EXISTS (
  SELECT 1 FROM "QualityJourneyScenarioRevision"
  WHERE "portfolioRevisionId" = NEW."portfolioRevisionId" AND "scenarioRevisionId" = NEW."scenarioRevisionId"
)
BEGIN SELECT RAISE(ABORT, 'Scenario decision must reference a scenario in its portfolio'); END;

CREATE TRIGGER "QualityJourneyScenarioDecisionReceipt_immutable_delete"
BEFORE DELETE ON "QualityJourneyScenarioDecisionReceipt"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario decision receipts are append-only'); END;

CREATE TRIGGER "QualityJourneyScenarioDecisionReceipt_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioDecisionReceipt"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario decision receipts are immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioPortfolioRevision_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioPortfolioRevision"
FOR EACH ROW WHEN
  NEW."journeyId" IS NOT OLD."journeyId" OR
  NEW."targetProjectId" IS NOT OLD."targetProjectId" OR
  NEW."cycleId" IS NOT OLD."cycleId" OR
  NEW."discoveryRevisionId" IS NOT OLD."discoveryRevisionId" OR
  NEW."discoveryCompletionHash" IS NOT OLD."discoveryCompletionHash" OR
  NEW."predecessorPortfolioRevisionId" IS NOT OLD."predecessorPortfolioRevisionId" OR
  NEW."artifactRecordId" IS NOT OLD."artifactRecordId" OR
  NEW."artifactId" IS NOT OLD."artifactId" OR
  NEW."artifactRevisionId" IS NOT OLD."artifactRevisionId" OR
  NEW."revision" IS NOT OLD."revision" OR
  NEW."contentHash" IS NOT OLD."contentHash" OR
  NEW."behavioralIntentHash" IS NOT OLD."behavioralIntentHash" OR
  NEW."enrichmentHash" IS NOT OLD."enrichmentHash" OR
  NEW."layoutHash" IS NOT OLD."layoutHash" OR
  NEW."coverageRationale" IS NOT OLD."coverageRationale" OR
  NEW."graphJson" IS NOT OLD."graphJson" OR
  NEW."submissionIdempotencyKey" IS NOT OLD."submissionIdempotencyKey" OR
  NEW."submissionHash" IS NOT OLD."submissionHash" OR
  NEW."submittedWorkItemId" IS NOT OLD."submittedWorkItemId" OR
  NEW."submittedAttemptId" IS NOT OLD."submittedAttemptId" OR
  NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Scenario portfolio authority and graph are immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioPortfolioRevision_review_transition"
BEFORE UPDATE OF "status", "reviewHash", "reviewedAt", "supersededAt", "approvedIntentHash", "approvedCoverageHash", "decisionSetHash"
ON "QualityJourneyScenarioPortfolioRevision"
FOR EACH ROW WHEN NOT (
  (OLD."status" = 'PUBLISHED' AND NEW."status" IN ('PUBLISHED', 'IN_REVIEW')) OR
  (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('IN_REVIEW', 'APPROVED', 'REVISION_REQUIRED')) OR
  (OLD."status" IN ('APPROVED', 'REVISION_REQUIRED') AND NEW."status" = OLD."status")
) OR
  (NEW."status" <> 'IN_REVIEW' AND NEW."reviewHash" IS NOT OLD."reviewHash") OR
  (OLD."reviewedAt" IS NOT NULL AND NEW."reviewedAt" IS NOT OLD."reviewedAt") OR
  (OLD."reviewedAt" IS NULL AND NEW."reviewedAt" IS NOT NULL AND NOT (OLD."status" = 'PUBLISHED' AND NEW."status" = 'IN_REVIEW')) OR
  (OLD."status" = 'PUBLISHED' AND NEW."status" = 'IN_REVIEW' AND (NEW."reviewedAt" IS NULL OR NEW."reviewHash" IS NULL)) OR
  (OLD."supersededAt" IS NOT NULL AND NEW."supersededAt" IS NOT OLD."supersededAt") OR
  (OLD."supersededAt" IS NULL AND NEW."supersededAt" IS NOT NULL AND NOT (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'REVISION_REQUIRED')) OR
  (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'REVISION_REQUIRED' AND NEW."supersededAt" IS NULL) OR
  (OLD."approvedIntentHash" IS NOT NULL AND NEW."approvedIntentHash" IS NOT OLD."approvedIntentHash") OR
  (OLD."approvedCoverageHash" IS NOT NULL AND NEW."approvedCoverageHash" IS NOT OLD."approvedCoverageHash") OR
  (OLD."decisionSetHash" IS NOT NULL AND NEW."decisionSetHash" IS NOT OLD."decisionSetHash") OR
  ((NEW."approvedIntentHash" IS NOT NULL OR NEW."approvedCoverageHash" IS NOT NULL OR NEW."decisionSetHash" IS NOT NULL) AND NOT (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'APPROVED')) OR
  (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'APPROVED' AND (NEW."approvedIntentHash" IS NULL OR NEW."approvedCoverageHash" IS NULL OR NEW."decisionSetHash" IS NULL))
BEGIN SELECT RAISE(ABORT, 'Scenario portfolio review transition is invalid or immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_disposition_transition"
BEFORE UPDATE OF "disposition", "disposedAt", "disposedBy", "dispositionIdempotencyKey", "dispositionRequestHash", "createResponseJson", "dispositionResponseJson"
ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN
  NOT ((OLD."disposition" = 'OPEN' AND NEW."disposition" IN ('OPEN', 'DISPOSED')) OR (OLD."disposition" = 'DISPOSED' AND NEW."disposition" = 'DISPOSED')) OR
  (OLD."disposedAt" IS NOT NULL AND NEW."disposedAt" IS NOT OLD."disposedAt") OR
  (OLD."disposedBy" IS NOT NULL AND NEW."disposedBy" IS NOT OLD."disposedBy") OR
  (OLD."dispositionIdempotencyKey" IS NOT NULL AND NEW."dispositionIdempotencyKey" IS NOT OLD."dispositionIdempotencyKey") OR
  (OLD."dispositionRequestHash" IS NOT NULL AND NEW."dispositionRequestHash" IS NOT OLD."dispositionRequestHash") OR
  (OLD."createResponseJson" IS NOT NULL AND NEW."createResponseJson" IS NOT OLD."createResponseJson") OR
  (OLD."dispositionResponseJson" IS NOT NULL AND NEW."dispositionResponseJson" IS NOT OLD."dispositionResponseJson") OR
  (NEW."disposition" = 'OPEN' AND (NEW."disposedAt" IS NOT NULL OR NEW."disposedBy" IS NOT NULL OR NEW."dispositionIdempotencyKey" IS NOT NULL OR NEW."dispositionRequestHash" IS NOT NULL OR NEW."dispositionResponseJson" IS NOT NULL)) OR
  (NEW."disposition" = 'DISPOSED' AND (NEW."disposedAt" IS NULL OR NEW."disposedBy" IS NULL OR NEW."dispositionIdempotencyKey" IS NULL OR NEW."dispositionRequestHash" IS NULL))
BEGIN SELECT RAISE(ABORT, 'Scenario comment disposition is one-time and immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_immutable_delete"
BEFORE DELETE ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario comments are append-only'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN
  NEW."portfolioRevisionId" IS NOT OLD."portfolioRevisionId" OR
  NEW."scenarioRevisionId" IS NOT OLD."scenarioRevisionId" OR
  NEW."comment" IS NOT OLD."comment" OR
  NEW."blocking" IS NOT OLD."blocking" OR
  NEW."actor" IS NOT OLD."actor" OR
  NEW."idempotencyKey" IS NOT OLD."idempotencyKey" OR
  NEW."requestHash" IS NOT OLD."requestHash" OR
  NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Scenario comment evidence is immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_initial_disposition"
BEFORE INSERT ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN
  NEW."disposition" <> 'OPEN' OR
  NEW."disposedAt" IS NOT NULL OR
  NEW."disposedBy" IS NOT NULL OR
  NEW."dispositionIdempotencyKey" IS NOT NULL OR
  NEW."dispositionRequestHash" IS NOT NULL OR
  NEW."dispositionResponseJson" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Scenario comments must begin OPEN without a disposition receipt'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_portfolio_membership_insert"
BEFORE INSERT ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN NEW."scenarioRevisionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "QualityJourneyScenarioRevision"
  WHERE "portfolioRevisionId" = NEW."portfolioRevisionId" AND "scenarioRevisionId" = NEW."scenarioRevisionId"
)
BEGIN SELECT RAISE(ABORT, 'Scenario comment must reference a scenario in its portfolio'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_portfolio_membership_update"
BEFORE UPDATE OF "portfolioRevisionId", "scenarioRevisionId" ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN NEW."scenarioRevisionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "QualityJourneyScenarioRevision"
  WHERE "portfolioRevisionId" = NEW."portfolioRevisionId" AND "scenarioRevisionId" = NEW."scenarioRevisionId"
)
BEGIN SELECT RAISE(ABORT, 'Scenario comment must reference a scenario in its portfolio'); END;

CREATE TRIGGER "QualityJourneyScenarioRevision_immutable_delete"
BEFORE DELETE ON "QualityJourneyScenarioRevision"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario revisions are immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioRevision_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioRevision"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario revisions are immutable'); END;

CREATE TRIGGER "QualityJourneyTriageAssignment_delete_immutable" BEFORE DELETE ON "QualityJourneyTriageAssignment" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyTriageAssignment_scope" BEFORE INSERT ON "QualityJourneyTriageAssignment"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" e JOIN "QualityJourneyWorkItem" w ON w.id = NEW.workItemId WHERE e.id = NEW.executionCycleId AND e.journeyId = NEW.journeyId AND w.journeyId = e.journeyId AND w.targetProjectId = e.targetProjectId AND w.cycleId = e.cycleId AND w.role = 'TRIAGER' AND w.inputHash = NEW.inputHash)
OR (NEW.predecessorReportRevisionId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageReport" r JOIN "QualityJourneyTriageAssignment" a ON a.id = r.assignmentId WHERE r.id = NEW.predecessorReportRevisionId AND r.journeyId = NEW.journeyId AND a.executionCycleId = NEW.executionCycleId))
BEGIN SELECT RAISE(ABORT, 'Quality Journey triage assignment scope mismatch'); END;

CREATE TRIGGER "QualityJourneyTriageAssignment_update_immutable" BEFORE UPDATE ON "QualityJourneyTriageAssignment" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyTriageReport_delete_immutable" BEFORE DELETE ON "QualityJourneyTriageReport" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyTriageReport_scope" BEFORE INSERT ON "QualityJourneyTriageReport"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyTriageAssignment" a WHERE a.id = NEW.assignmentId AND a.journeyId = NEW.journeyId)
BEGIN SELECT RAISE(ABORT, 'Quality Journey report scope mismatch'); END;

CREATE TRIGGER "QualityJourneyTriageReport_update_immutable" BEFORE UPDATE ON "QualityJourneyTriageReport" BEGIN SELECT RAISE(ABORT, 'Quality Journey triage history is immutable'); END;

CREATE TRIGGER "QualityJourneyWorkAttempt_assignment_no_change"
BEFORE UPDATE OF "authorizationId", "assignmentId", "assignmentJson", "assignmentHash", "spawnRequestId", "spawnRequestJson", "spawnRequestHash", "dispatchKey", "replacesAttemptId", "replacementProjectionHash", "predecessorDiagnosticsJson" ON "QualityJourneyWorkAttempt"
WHEN OLD."assignmentId" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAttempt assignment lineage is immutable'); END;

CREATE TRIGGER "QualityJourneyWorkAttempt_receipt_no_change"
BEFORE UPDATE OF "spawnReceiptId", "spawnReceiptJson", "spawnReceiptHash" ON "QualityJourneyWorkAttempt"
WHEN OLD."spawnReceiptId" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAttempt spawn receipt is immutable'); END;

CREATE TRIGGER "QualityJourneyWorkAuthorization_authority_fields_immutable"
BEFORE UPDATE OF "journeyId", "targetProjectId", "workItemId", "supersedesAuthorizationId", "role", "roleContractDigest", "capabilityProfileId", "capabilityProfileHash", "authorizationJson", "authorizationHash", "maxAttempts" ON "QualityJourneyWorkAuthorization"
BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAuthorization authority is immutable'); END;

CREATE TRIGGER "QualityJourneyWorkAuthorization_no_delete" BEFORE DELETE ON "QualityJourneyWorkAuthorization" BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAuthorization is immutable'); END;
