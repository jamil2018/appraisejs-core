# Graph Report - prisma

## Corpus Check
- 70 files from prisma/schema.prisma and migrations
- Verdict: schema-aware graph generated because Graphify AST extraction does not currently produce Prisma/SQL nodes.

## Summary
- 1264 nodes · 2802 edges · 208 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `String` - 524 edges
2. `schema.prisma` - 178 edges
3. `TargetProject` - 147 edges
4. `DateTime` - 135 edges
5. `PlanProjection` - 91 edges
6. `TestRun` - 73 edges
7. `ValidationAstPublishOperation` - 62 edges
8. `ProviderWorkflowRun` - 56 edges
9. `TestCase` - 52 edges
10. `Int` - 43 edges

## Surprising Connections (you probably didn't know these)
- `TestSuite` --relates_to--> `Module`  [EXTRACTED]
  schema.prisma L17
- `TestSuite.moduleId` --foreign_key_to--> `Module`  [EXTRACTED]
  schema.prisma L17
- `TestSuite` --relates_to--> `TestCase`  [EXTRACTED]
  schema.prisma L18
- `TestSuite` --relates_to--> `Tag`  [EXTRACTED]
  schema.prisma L19
- `TestSuite` --relates_to--> `TestSuiteMetrics`  [EXTRACTED]
  schema.prisma L20
- `TestSuite` --relates_to--> `TestRunTestCase`  [EXTRACTED]
  schema.prisma L21
- `TestSuite` --relates_to--> `TargetProject`  [EXTRACTED]
  schema.prisma L23
- `TestSuite.targetProjectId` --foreign_key_to--> `TargetProject`  [EXTRACTED]
  schema.prisma L23

## Import Cycles
- None detected.

## Communities (208 total)
### Community 0 - "schema.prisma"
Nodes (3): schema.prisma, datasource db (sqlite), Prisma client generator

### Community 1 - "TestSuite"
Nodes (14): TestSuite, TestSuite.id, TestSuite.name, TestSuite.description, TestSuite.createdAt, TestSuite.updatedAt, TestSuite.moduleId, TestSuite.module (+more)

### Community 2 - "Review"
Nodes (9): Review, Review.id, Review.testCaseId, Review.reviewerId, Review.status, Review.comments, Review.createdAt, Review.updatedAt (+more)

### Community 3 - "LinkedJiraTicket"
Nodes (9): LinkedJiraTicket, LinkedJiraTicket.id, LinkedJiraTicket.testCaseId, LinkedJiraTicket.jiraTicketId, LinkedJiraTicket.jiraTicketUrl, LinkedJiraTicket.jiraStatus, LinkedJiraTicket.createdAt, LinkedJiraTicket.updatedAt (+more)

### Community 4 - "StepDefinition"
Nodes (19): StepDefinition, StepDefinition.id, StepDefinition.version, StepDefinition.status, StepDefinition.title, StepDefinition.description, StepDefinition.definitionJson, StepDefinition.definitionHash (+more)

### Community 5 - "StepDefinitionDraft"
Nodes (18): StepDefinitionDraft, StepDefinitionDraft.id, StepDefinitionDraft.proposedStepId, StepDefinitionDraft.proposedVersion, StepDefinitionDraft.revision, StepDefinitionDraft.draftJson, StepDefinitionDraft.draftHash, StepDefinitionDraft.reuseJustification (+more)

### Community 6 - "StepDefinitionSearchReceipt"
Nodes (8): StepDefinitionSearchReceipt, StepDefinitionSearchReceipt.id, StepDefinitionSearchReceipt.indexHash, StepDefinitionSearchReceipt.candidateReferencesJson, StepDefinitionSearchReceipt.planId, StepDefinitionSearchReceipt.correlationId, StepDefinitionSearchReceipt.searchedAt, StepDefinitionSearchReceipt.expiresAt

### Community 7 - "StepDefinitionDraftArtifact"
Nodes (16): StepDefinitionDraftArtifact, StepDefinitionDraftArtifact.draftId, StepDefinitionDraftArtifact.contractSource, StepDefinitionDraftArtifact.handlerSource, StepDefinitionDraftArtifact.examplesJson, StepDefinitionDraftArtifact.manifestJson, StepDefinitionDraftArtifact.sourceHash, StepDefinitionDraftArtifact.compiledSource (+more)

### Community 8 - "StepReviewedExtension"
Nodes (19): StepReviewedExtension, StepReviewedExtension.id, StepReviewedExtension.version, StepReviewedExtension.exportName, StepReviewedExtension.runtime, StepReviewedExtension.capabilitiesJson, StepReviewedExtension.contractSource, StepReviewedExtension.source (+more)

### Community 9 - "StepHumanProjection"
Nodes (8): StepHumanProjection, StepHumanProjection.stepId, StepHumanProjection.stepVersion, StepHumanProjection.signature, StepHumanProjection.groupId, StepHumanProjection.projectionJson, StepHumanProjection.projectionHash, StepHumanProjection.definition

### Community 10 - "StepExecutionBinding"
Nodes (7): StepExecutionBinding, StepExecutionBinding.stepId, StepExecutionBinding.stepVersion, StepExecutionBinding.kind, StepExecutionBinding.bindingJson, StepExecutionBinding.bindingHash, StepExecutionBinding.definition

### Community 11 - "StepPublicationReceipt"
Nodes (10): StepPublicationReceipt, StepPublicationReceipt.stepId, StepPublicationReceipt.stepVersion, StepPublicationReceipt.receiptJson, StepPublicationReceipt.receiptHash, StepPublicationReceipt.registryManifestHash, StepPublicationReceipt.conformanceRunId, StepPublicationReceipt.reviewAuthority (+more)

### Community 12 - "StepDefinitionDeprecation"
Nodes (9): StepDefinitionDeprecation, StepDefinitionDeprecation.stepId, StepDefinitionDeprecation.stepVersion, StepDefinitionDeprecation.reason, StepDefinitionDeprecation.actor, StepDefinitionDeprecation.replacementStepId, StepDefinitionDeprecation.replacementVersion, StepDefinitionDeprecation.deprecatedAt (+more)

### Community 13 - "StepDefinitionTelemetryEvent"
Nodes (10): StepDefinitionTelemetryEvent, StepDefinitionTelemetryEvent.id, StepDefinitionTelemetryEvent.surface, StepDefinitionTelemetryEvent.outcome, StepDefinitionTelemetryEvent.stepId, StepDefinitionTelemetryEvent.stepVersion, StepDefinitionTelemetryEvent.correlationId, StepDefinitionTelemetryEvent.planId (+more)

### Community 14 - "StepDefinitionStatus"
Nodes (3): StepDefinitionStatus, StepDefinitionStatus.ready, StepDefinitionStatus.deprecated

### Community 15 - "StepExecutionKind"
Nodes (4): StepExecutionKind, StepExecutionKind.operation, StepExecutionKind.composition, StepExecutionKind.reviewed_extension

### Community 16 - "TestCase"
Nodes (16): TestCase, TestCase.id, TestCase.title, TestCase.description, TestCase.createdAt, TestCase.updatedAt, TestCase.linkedJiraTickets, TestCase.reviews (+more)

### Community 17 - "TestCaseStep"
Nodes (11): TestCaseStep, TestCaseStep.id, TestCaseStep.flowNodeId, TestCaseStep.testCaseId, TestCaseStep.order, TestCaseStep.gherkinStep, TestCaseStep.icon, TestCaseStep.label (+more)

### Community 18 - "TestCaseFlowBlock"
Nodes (7): TestCaseFlowBlock, TestCaseFlowBlock.id, TestCaseFlowBlock.name, TestCaseFlowBlock.testCaseId, TestCaseFlowBlock.order, TestCaseFlowBlock.testCase, TestCaseFlowBlock.nodes

### Community 19 - "TestCaseFlowBlockNode"
Nodes (5): TestCaseFlowBlockNode, TestCaseFlowBlockNode.id, TestCaseFlowBlockNode.flowNodeId, TestCaseFlowBlockNode.flowBlockId, TestCaseFlowBlockNode.flowBlock

### Community 20 - "TemplateTestCase"
Nodes (10): TemplateTestCase, TemplateTestCase.id, TemplateTestCase.name, TemplateTestCase.description, TemplateTestCase.createdAt, TemplateTestCase.updatedAt, TemplateTestCase.steps, TemplateTestCase.flowBlocks (+more)

### Community 21 - "TemplateTestCaseStep"
Nodes (11): TemplateTestCaseStep, TemplateTestCaseStep.id, TemplateTestCaseStep.flowNodeId, TemplateTestCaseStep.order, TemplateTestCaseStep.gherkinStep, TemplateTestCaseStep.icon, TemplateTestCaseStep.label, TemplateTestCaseStep.templateTestCaseId (+more)

### Community 22 - "TemplateTestCaseFlowBlock"
Nodes (7): TemplateTestCaseFlowBlock, TemplateTestCaseFlowBlock.id, TemplateTestCaseFlowBlock.name, TemplateTestCaseFlowBlock.templateTestCaseId, TemplateTestCaseFlowBlock.order, TemplateTestCaseFlowBlock.templateTestCase, TemplateTestCaseFlowBlock.nodes

### Community 23 - "TemplateTestCaseFlowBlockNode"
Nodes (5): TemplateTestCaseFlowBlockNode, TemplateTestCaseFlowBlockNode.id, TemplateTestCaseFlowBlockNode.flowNodeId, TemplateTestCaseFlowBlockNode.flowBlockId, TemplateTestCaseFlowBlockNode.flowBlock

### Community 24 - "TemplateTestCaseStepParameter"
Nodes (11): TemplateTestCaseStepParameter, TemplateTestCaseStepParameter.id, TemplateTestCaseStepParameter.name, TemplateTestCaseStepParameter.defaultValue, TemplateTestCaseStepParameter.order, TemplateTestCaseStepParameter.testCaseStepId, TemplateTestCaseStepParameter.locatorId, TemplateTestCaseStepParameter.type (+more)

### Community 25 - "TestCaseStepParameter"
Nodes (10): TestCaseStepParameter, TestCaseStepParameter.id, TestCaseStepParameter.name, TestCaseStepParameter.value, TestCaseStepParameter.order, TestCaseStepParameter.testCaseStepId, TestCaseStepParameter.locatorId, TestCaseStepParameter.type (+more)

### Community 26 - "Locator"
Nodes (13): Locator, Locator.id, Locator.name, Locator.value, Locator.createdAt, Locator.updatedAt, Locator.locatorGroupId, Locator.locatorGroup (+more)

### Community 27 - "LocatorGroup"
Nodes (11): LocatorGroup, LocatorGroup.id, LocatorGroup.name, LocatorGroup.route, LocatorGroup.createdAt, LocatorGroup.updatedAt, LocatorGroup.moduleId, LocatorGroup.locators (+more)

### Community 28 - "Module"
Nodes (12): Module, Module.id, Module.name, Module.parentId, Module.createdAt, Module.updatedAt, Module.locatorGroups, Module.parent (+more)

### Community 29 - "TestRunTestCase"
Nodes (12): TestRunTestCase, TestRunTestCase.id, TestRunTestCase.testRunId, TestRunTestCase.testCaseId, TestRunTestCase.testSuiteId, TestRunTestCase.status, TestRunTestCase.result, TestRunTestCase.tracePath (+more)

### Community 30 - "TestRun"
Nodes (27): TestRun, TestRun.id, TestRun.name, TestRun.preparationKey, TestRun.runId, TestRun.startedAt, TestRun.completedAt, TestRun.status (+more)

### Community 31 - "PlanProjection"
Nodes (37): PlanProjection, PlanProjection.id, PlanProjection.planId, PlanProjection.slug, PlanProjection.legacyPlanId, PlanProjection.revision, PlanProjection.lifecycle, PlanProjection.goal (+more)

### Community 32 - "BaselineAttempt"
Nodes (14): BaselineAttempt, BaselineAttempt.id, BaselineAttempt.planProjectionId, BaselineAttempt.validationId, BaselineAttempt.validationRevision, BaselineAttempt.validationHash, BaselineAttempt.browser, BaselineAttempt.environment (+more)

### Community 33 - "BaselineAttemptEvent"
Nodes (9): BaselineAttemptEvent, BaselineAttemptEvent.id, BaselineAttemptEvent.attemptId, BaselineAttemptEvent.kind, BaselineAttemptEvent.payloadJson, BaselineAttemptEvent.idempotencyKey, BaselineAttemptEvent.sequence, BaselineAttemptEvent.createdAt (+more)

### Community 34 - "TargetProject"
Nodes (38): TargetProject, TargetProject.id, TargetProject.canonicalPath, TargetProject.displayName, TargetProject.description, TargetProject.packageName, TargetProject.packageManager, TargetProject.packageJson (+more)

### Community 35 - "AgentPreflightReceipt"
Nodes (15): AgentPreflightReceipt, AgentPreflightReceipt.id, AgentPreflightReceipt.coordinatorId, AgentPreflightReceipt.schemaVersion, AgentPreflightReceipt.status, AgentPreflightReceipt.ready, AgentPreflightReceipt.snapshotHash, AgentPreflightReceipt.snapshotJson (+more)

### Community 36 - "PlanOperationMetric"
Nodes (15): PlanOperationMetric, PlanOperationMetric.id, PlanOperationMetric.planProjectionId, PlanOperationMetric.phase, PlanOperationMetric.operation, PlanOperationMetric.statusCode, PlanOperationMetric.durationMs, PlanOperationMetric.waitMs (+more)

### Community 37 - "LifecycleCertificationReceipt"
Nodes (9): LifecycleCertificationReceipt, LifecycleCertificationReceipt.id, LifecycleCertificationReceipt.schemaVersion, LifecycleCertificationReceipt.status, LifecycleCertificationReceipt.matrixHash, LifecycleCertificationReceipt.matrixJson, LifecycleCertificationReceipt.durationMs, LifecycleCertificationReceipt.gitCommit (+more)

### Community 38 - "ValidationResourceProposal"
Nodes (10): ValidationResourceProposal, ValidationResourceProposal.id, ValidationResourceProposal.planId, ValidationResourceProposal.targetProjectId, ValidationResourceProposal.idempotencyKey, ValidationResourceProposal.proposalHash, ValidationResourceProposal.proposalJson, ValidationResourceProposal.resultJson (+more)

### Community 39 - "ProjectResourceOwnership"
Nodes (13): ProjectResourceOwnership, ProjectResourceOwnership.id, ProjectResourceOwnership.entityType, ProjectResourceOwnership.entityId, ProjectResourceOwnership.scope, ProjectResourceOwnership.targetProjectId, ProjectResourceOwnership.origin, ProjectResourceOwnership.provenanceJson (+more)

### Community 40 - "ProjectResourceImport"
Nodes (11): ProjectResourceImport, ProjectResourceImport.id, ProjectResourceImport.sourceOwnershipId, ProjectResourceImport.destinationProjectId, ProjectResourceImport.sharingMode, ProjectResourceImport.sourceContentHash, ProjectResourceImport.actor, ProjectResourceImport.propagationPolicy (+more)

### Community 41 - "ResourceScope"
Nodes (7): ResourceScope, ResourceScope.system, ResourceScope.global_library, ResourceScope.project, ResourceScope.publication, ResourceScope.runtime, ResourceScope.quarantined

### Community 42 - "ResourceSharingMode"
Nodes (3): ResourceSharingMode, ResourceSharingMode.immutable_reference, ResourceSharingMode.copy

### Community 43 - "RepositoryExportPolicy"
Nodes (4): RepositoryExportPolicy, RepositoryExportPolicy.disabled, RepositoryExportPolicy.optional, RepositoryExportPolicy.required

### Community 44 - "RepositoryExportJobState"
Nodes (6): RepositoryExportJobState, RepositoryExportJobState.queued, RepositoryExportJobState.running, RepositoryExportJobState.conflict, RepositoryExportJobState.succeeded, RepositoryExportJobState.failed

### Community 45 - "RepositoryExportJob"
Nodes (20): RepositoryExportJob, RepositoryExportJob.id, RepositoryExportJob.targetProjectId, RepositoryExportJob.publishOperationId, RepositoryExportJob.validationHash, RepositoryExportJob.destinationPath, RepositoryExportJob.policy, RepositoryExportJob.state (+more)

### Community 46 - "RepositoryExportReceipt"
Nodes (11): RepositoryExportReceipt, RepositoryExportReceipt.id, RepositoryExportReceipt.jobId, RepositoryExportReceipt.targetProjectId, RepositoryExportReceipt.validationHash, RepositoryExportReceipt.manifestHash, RepositoryExportReceipt.destinationPath, RepositoryExportReceipt.receiptJson (+more)

### Community 47 - "RuntimeCapsule"
Nodes (17): RuntimeCapsule, RuntimeCapsule.id, RuntimeCapsule.targetProjectId, RuntimeCapsule.testRunId, RuntimeCapsule.validationHash, RuntimeCapsule.capsuleHash, RuntimeCapsule.manifestHash, RuntimeCapsule.manifestJson (+more)

### Community 48 - "RuntimeCapsuleExecutionAttempt"
Nodes (18): RuntimeCapsuleExecutionAttempt, RuntimeCapsuleExecutionAttempt.id, RuntimeCapsuleExecutionAttempt.testRunId, RuntimeCapsuleExecutionAttempt.capsuleId, RuntimeCapsuleExecutionAttempt.receiptHash, RuntimeCapsuleExecutionAttempt.preflightResultJson, RuntimeCapsuleExecutionAttempt.preflightResultHash, RuntimeCapsuleExecutionAttempt.preflightCheckedAt (+more)

### Community 49 - "RuntimeCapsuleExecutionAttemptState"
Nodes (8): RuntimeCapsuleExecutionAttemptState, RuntimeCapsuleExecutionAttemptState.PREPARED, RuntimeCapsuleExecutionAttemptState.STARTING, RuntimeCapsuleExecutionAttemptState.RUNNING, RuntimeCapsuleExecutionAttemptState.COMPLETED, RuntimeCapsuleExecutionAttemptState.FAILED, RuntimeCapsuleExecutionAttemptState.CANCELLED, RuntimeCapsuleExecutionAttemptState.INTERRUPTED

### Community 50 - "RuntimeCapsuleBlob"
Nodes (12): RuntimeCapsuleBlob, RuntimeCapsuleBlob.id, RuntimeCapsuleBlob.targetProjectId, RuntimeCapsuleBlob.contentHash, RuntimeCapsuleBlob.size, RuntimeCapsuleBlob.storagePath, RuntimeCapsuleBlob.integrityState, RuntimeCapsuleBlob.version (+more)

### Community 51 - "RuntimeCapsuleBlobReference"
Nodes (7): RuntimeCapsuleBlobReference, RuntimeCapsuleBlobReference.id, RuntimeCapsuleBlobReference.capsuleId, RuntimeCapsuleBlobReference.blobId, RuntimeCapsuleBlobReference.filePath, RuntimeCapsuleBlobReference.capsule, RuntimeCapsuleBlobReference.blob

### Community 52 - "RuntimeCapsuleIntegrityState"
Nodes (5): RuntimeCapsuleIntegrityState, RuntimeCapsuleIntegrityState.staging, RuntimeCapsuleIntegrityState.ready, RuntimeCapsuleIntegrityState.missing, RuntimeCapsuleIntegrityState.corrupt

### Community 53 - "RuntimeCapsuleLease"
Nodes (11): RuntimeCapsuleLease, RuntimeCapsuleLease.id, RuntimeCapsuleLease.targetProjectId, RuntimeCapsuleLease.validationHash, RuntimeCapsuleLease.runId, RuntimeCapsuleLease.ownerToken, RuntimeCapsuleLease.leaseExpiresAt, RuntimeCapsuleLease.version (+more)

### Community 54 - "ProviderAdapterRegistration"
Nodes (20): ProviderAdapterRegistration, ProviderAdapterRegistration.id, ProviderAdapterRegistration.key, ProviderAdapterRegistration.displayName, ProviderAdapterRegistration.providerKind, ProviderAdapterRegistration.adapterVersion, ProviderAdapterRegistration.capabilitiesJson, ProviderAdapterRegistration.enabled (+more)

### Community 55 - "ProviderWorkflowRun"
Nodes (33): ProviderWorkflowRun, ProviderWorkflowRun.id, ProviderWorkflowRun.planProjectionId, ProviderWorkflowRun.targetProjectId, ProviderWorkflowRun.providerAdapterId, ProviderWorkflowRun.providerKind, ProviderWorkflowRun.providerProfile, ProviderWorkflowRun.adapterVersion (+more)

### Community 56 - "ProviderRunEvent"
Nodes (9): ProviderRunEvent, ProviderRunEvent.id, ProviderRunEvent.runId, ProviderRunEvent.sequence, ProviderRunEvent.type, ProviderRunEvent.payloadJson, ProviderRunEvent.stream, ProviderRunEvent.createdAt (+more)

### Community 57 - "ProviderPermissionDecision"
Nodes (12): ProviderPermissionDecision, ProviderPermissionDecision.id, ProviderPermissionDecision.runId, ProviderPermissionDecision.requestId, ProviderPermissionDecision.decision, ProviderPermissionDecision.riskTier, ProviderPermissionDecision.requestedScope, ProviderPermissionDecision.payloadJson (+more)

### Community 58 - "ProviderArtifactSnapshot"
Nodes (9): ProviderArtifactSnapshot, ProviderArtifactSnapshot.id, ProviderArtifactSnapshot.runId, ProviderArtifactSnapshot.path, ProviderArtifactSnapshot.kind, ProviderArtifactSnapshot.hash, ProviderArtifactSnapshot.metadataJson, ProviderArtifactSnapshot.capturedAt (+more)

### Community 59 - "PlanTaskProjection"
Nodes (10): PlanTaskProjection, PlanTaskProjection.id, PlanTaskProjection.planProjectionId, PlanTaskProjection.taskId, PlanTaskProjection.title, PlanTaskProjection.description, PlanTaskProjection.acceptanceJson, PlanTaskProjection.validationIntent (+more)

### Community 60 - "PlanSyncIssue"
Nodes (10): PlanSyncIssue, PlanSyncIssue.id, PlanSyncIssue.planProjectionId, PlanSyncIssue.code, PlanSyncIssue.artifactPath, PlanSyncIssue.message, PlanSyncIssue.blocking, PlanSyncIssue.createdAt (+more)

### Community 61 - "PlanRevision"
Nodes (10): PlanRevision, PlanRevision.id, PlanRevision.planProjectionId, PlanRevision.sourceHash, PlanRevision.gitCommit, PlanRevision.dirtyHashesJson, PlanRevision.snapshotJson, PlanRevision.reducedAssurance (+more)

### Community 62 - "PlanEvent"
Nodes (19): PlanEvent, PlanEvent.id, PlanEvent.planProjectionId, PlanEvent.publishOperationId, PlanEvent.validationId, PlanEvent.sequence, PlanEvent.type, PlanEvent.payloadJson (+more)

### Community 63 - "AppraiseProjectIdentity"
Nodes (6): AppraiseProjectIdentity, AppraiseProjectIdentity.id, AppraiseProjectIdentity.projectFingerprint, AppraiseProjectIdentity.tokenHash, AppraiseProjectIdentity.createdAt, AppraiseProjectIdentity.rotatedAt

### Community 64 - "DelegatedAuthorizationNonce"
Nodes (5): DelegatedAuthorizationNonce, DelegatedAuthorizationNonce.nonce, DelegatedAuthorizationNonce.issuer, DelegatedAuthorizationNonce.expiresAt, DelegatedAuthorizationNonce.consumedAt

### Community 65 - "DelegatedCoordinatorReceipt"
Nodes (20): DelegatedCoordinatorReceipt, DelegatedCoordinatorReceipt.id, DelegatedCoordinatorReceipt.parentCoordinatorId, DelegatedCoordinatorReceipt.delegatedCoordinatorId, DelegatedCoordinatorReceipt.targetProjectId, DelegatedCoordinatorReceipt.targetFingerprint, DelegatedCoordinatorReceipt.pathFingerprint, DelegatedCoordinatorReceipt.purpose (+more)

### Community 66 - "DelegatedCoordinatorConsumption"
Nodes (7): DelegatedCoordinatorConsumption, DelegatedCoordinatorConsumption.id, DelegatedCoordinatorConsumption.receiptId, DelegatedCoordinatorConsumption.permission, DelegatedCoordinatorConsumption.operationKey, DelegatedCoordinatorConsumption.consumedAt, DelegatedCoordinatorConsumption.receipt

### Community 67 - "DelegatedValidationAstSubmission"
Nodes (10): DelegatedValidationAstSubmission, DelegatedValidationAstSubmission.id, DelegatedValidationAstSubmission.nonce, DelegatedValidationAstSubmission.targetFingerprint, DelegatedValidationAstSubmission.planHash, DelegatedValidationAstSubmission.issuer, DelegatedValidationAstSubmission.astId, DelegatedValidationAstSubmission.astJson (+more)

### Community 68 - "ValidationAstPublishOperation"
Nodes (39): ValidationAstPublishOperation, ValidationAstPublishOperation.id, ValidationAstPublishOperation.planId, ValidationAstPublishOperation.planProjectionId, ValidationAstPublishOperation.targetProjectId, ValidationAstPublishOperation.targetFingerprint, ValidationAstPublishOperation.idempotencyKey, ValidationAstPublishOperation.operationHash (+more)

### Community 69 - "ValidationExtensionReview"
Nodes (11): ValidationExtensionReview, ValidationExtensionReview.id, ValidationExtensionReview.operationId, ValidationExtensionReview.extensionId, ValidationExtensionReview.version, ValidationExtensionReview.sourceHash, ValidationExtensionReview.compiledHash, ValidationExtensionReview.artifactHash (+more)

### Community 70 - "PlanCoordinatorLease"
Nodes (10): PlanCoordinatorLease, PlanCoordinatorLease.id, PlanCoordinatorLease.planProjectionId, PlanCoordinatorLease.coordinatorId, PlanCoordinatorLease.connectionId, PlanCoordinatorLease.leaseExpiresAt, PlanCoordinatorLease.takeoverApproved, PlanCoordinatorLease.createdAt (+more)

### Community 71 - "PlanPersonalLayout"
Nodes (8): PlanPersonalLayout, PlanPersonalLayout.id, PlanPersonalLayout.planProjectionId, PlanPersonalLayout.owner, PlanPersonalLayout.positionsJson, PlanPersonalLayout.createdAt, PlanPersonalLayout.updatedAt, PlanPersonalLayout.plan

### Community 72 - "TestRunLog"
Nodes (7): TestRunLog, TestRunLog.id, TestRunLog.testRunId, TestRunLog.logs, TestRunLog.createdAt, TestRunLog.updatedAt, TestRunLog.testRun

### Community 73 - "EnvironmentCredentialState"
Nodes (4): EnvironmentCredentialState, EnvironmentCredentialState.NONE, EnvironmentCredentialState.REFERENCE_CONFIGURED, EnvironmentCredentialState.LEGACY_DISABLED

### Community 74 - "Environment"
Nodes (15): Environment, Environment.id, Environment.name, Environment.baseUrl, Environment.expectedPageTitle, Environment.apiBaseUrl, Environment.username, Environment.passwordEnvironmentVariable (+more)

### Community 75 - "Tag"
Nodes (12): Tag, Tag.id, Tag.name, Tag.tagExpression, Tag.type, Tag.createdAt, Tag.updatedAt, Tag.testRuns (+more)

### Community 76 - "ConflictResolution"
Nodes (10): ConflictResolution, ConflictResolution.id, ConflictResolution.entityType, ConflictResolution.entityId, ConflictResolution.conflictType, ConflictResolution.conflictingEntityId, ConflictResolution.resolved, ConflictResolution.createdAt (+more)

### Community 77 - "ReportTestCase"
Nodes (10): ReportTestCase, ReportTestCase.id, ReportTestCase.reportId, ReportTestCase.testCaseId, ReportTestCase.testRunTestCaseId, ReportTestCase.reportScenarioId, ReportTestCase.testRunTestCase, ReportTestCase.report (+more)

### Community 78 - "Report"
Nodes (13): Report, Report.id, Report.name, Report.description, Report.reportPath, Report.createdAt, Report.updatedAt, Report.testRunId (+more)

### Community 79 - "ReportFeature"
Nodes (13): ReportFeature, ReportFeature.id, ReportFeature.reportId, ReportFeature.name, ReportFeature.description, ReportFeature.uri, ReportFeature.line, ReportFeature.keyword (+more)

### Community 80 - "ReportFeatureTag"
Nodes (7): ReportFeatureTag, ReportFeatureTag.id, ReportFeatureTag.reportFeatureId, ReportFeatureTag.tagName, ReportFeatureTag.line, ReportFeatureTag.createdAt, ReportFeatureTag.reportFeature

### Community 81 - "ReportScenario"
Nodes (16): ReportScenario, ReportScenario.id, ReportScenario.reportFeatureId, ReportScenario.name, ReportScenario.description, ReportScenario.line, ReportScenario.keyword, ReportScenario.type (+more)

### Community 82 - "ReportScenarioTag"
Nodes (7): ReportScenarioTag, ReportScenarioTag.id, ReportScenarioTag.reportScenarioId, ReportScenarioTag.tagName, ReportScenarioTag.line, ReportScenarioTag.createdAt, ReportScenarioTag.reportScenario

### Community 83 - "ReportStep"
Nodes (17): ReportStep, ReportStep.id, ReportStep.reportScenarioId, ReportStep.keyword, ReportStep.line, ReportStep.name, ReportStep.matchLocation, ReportStep.status (+more)

### Community 84 - "ReportHook"
Nodes (12): ReportHook, ReportHook.id, ReportHook.reportScenarioId, ReportHook.keyword, ReportHook.status, ReportHook.duration, ReportHook.errorMessage, ReportHook.errorTrace (+more)

### Community 85 - "TestCaseMetrics"
Nodes (17): TestCaseMetrics, TestCaseMetrics.id, TestCaseMetrics.testCaseId, TestCaseMetrics.isRepeatedlyFailing, TestCaseMetrics.isFlaky, TestCaseMetrics.consecutiveFailures, TestCaseMetrics.failureRate, TestCaseMetrics.totalRecentRuns (+more)

### Community 86 - "TestSuiteMetrics"
Nodes (9): TestSuiteMetrics, TestSuiteMetrics.id, TestSuiteMetrics.testSuiteId, TestSuiteMetrics.lastExecutedAt, TestSuiteMetrics.createdAt, TestSuiteMetrics.updatedAt, TestSuiteMetrics.testSuite, TestSuiteMetrics.targetProjectId (+more)

### Community 87 - "DashboardMetrics"
Nodes (10): DashboardMetrics, DashboardMetrics.id, DashboardMetrics.failedRecentRunsCount, DashboardMetrics.repeatedlyFailingTestsCount, DashboardMetrics.flakyTestsCount, DashboardMetrics.suitesNotExecutedRecentlyCount, DashboardMetrics.lastUpdatedAt, DashboardMetrics.createdAt (+more)

### Community 88 - "TagType"
Nodes (3): TagType, TagType.IDENTIFIER, TagType.FILTER

### Community 89 - "TestRunStatus"
Nodes (6): TestRunStatus, TestRunStatus.QUEUED, TestRunStatus.RUNNING, TestRunStatus.CANCELLING, TestRunStatus.COMPLETED, TestRunStatus.CANCELLED

### Community 90 - "TestRunTestCaseStatus"
Nodes (5): TestRunTestCaseStatus, TestRunTestCaseStatus.PENDING, TestRunTestCaseStatus.RUNNING, TestRunTestCaseStatus.COMPLETED, TestRunTestCaseStatus.CANCELLED

### Community 91 - "TestRunTestCaseResult"
Nodes (4): TestRunTestCaseResult, TestRunTestCaseResult.PASSED, TestRunTestCaseResult.FAILED, TestRunTestCaseResult.UNTESTED

### Community 92 - "TestRunResult"
Nodes (5): TestRunResult, TestRunResult.PENDING, TestRunResult.PASSED, TestRunResult.FAILED, TestRunResult.CANCELLED

### Community 93 - "TestRunEvidenceHealth"
Nodes (9): TestRunEvidenceHealth, TestRunEvidenceHealth.valid, TestRunEvidenceHealth.invalid_empty_run, TestRunEvidenceHealth.invalid_missing_test_cases, TestRunEvidenceHealth.invalid_missing_report, TestRunEvidenceHealth.invalid_placeholder_binary, TestRunEvidenceHealth.invalid_unmatched_scenarios, TestRunEvidenceHealth.invalid_stale_runtime (+more)

### Community 94 - "Role"
Nodes (4): Role, Role.ADMIN, Role.TESTER, Role.REVIEWER

### Community 95 - "ReviewStatus"
Nodes (4): ReviewStatus, ReviewStatus.PENDING, ReviewStatus.APPROVED, ReviewStatus.CHANGES_REQUESTED

### Community 96 - "TestCaseStatus"
Nodes (4): TestCaseStatus, TestCaseStatus.PENDING, TestCaseStatus.IN_PROGRESS, TestCaseStatus.COMPLETED

### Community 97 - "TestCaseResult"
Nodes (7): TestCaseResult, TestCaseResult.PASSED, TestCaseResult.FAILED, TestCaseResult.BLOCKED, TestCaseResult.SKIPPED, TestCaseResult.RETEST, TestCaseResult.UNTESTED

### Community 98 - "StepType"
Nodes (3): StepType, StepType.ACTION, StepType.ASSERTION

### Community 99 - "StepParameterType"
Nodes (6): StepParameterType, StepParameterType.NUMBER, StepParameterType.STRING, StepParameterType.DATE, StepParameterType.BOOLEAN, StepParameterType.LOCATOR

### Community 100 - "StepParameterValueType"
Nodes (4): StepParameterValueType, StepParameterValueType.STRING, StepParameterValueType.NUMBER, StepParameterValueType.LOCATOR

### Community 101 - "StepIcon"
Nodes (13): StepIcon, StepIcon.MOUSE, StepIcon.NAVIGATION, StepIcon.INPUT, StepIcon.DOWNLOAD, StepIcon.API, StepIcon.STORE, StepIcon.FORMAT (+more)

### Community 102 - "BrowserEngine"
Nodes (4): BrowserEngine, BrowserEngine.CHROMIUM, BrowserEngine.FIREFOX, BrowserEngine.WEBKIT

### Community 103 - "StepGroupType"
Nodes (3): StepGroupType, StepGroupType.ACTION, StepGroupType.VALIDATION

### Community 104 - "EntityType"
Nodes (2): EntityType, EntityType.LOCATOR

### Community 105 - "ConflictType"
Nodes (3): ConflictType, ConflictType.DUPLICATE_NAME, ConflictType.DUPLICATE_VALUE

### Community 106 - "StepStatus"
Nodes (6): StepStatus, StepStatus.PASSED, StepStatus.FAILED, StepStatus.SKIPPED, StepStatus.PENDING, StepStatus.UNDEFINED

### Community 107 - "StepKeyword"
Nodes (8): StepKeyword, StepKeyword.GIVEN, StepKeyword.WHEN, StepKeyword.THEN, StepKeyword.AND, StepKeyword.BUT, StepKeyword.BEFORE, StepKeyword.AFTER

### Community 108 - "String"
Nodes (1): String

### Community 109 - "DateTime"
Nodes (1): DateTime

### Community 110 - "Int"
Nodes (1): Int

### Community 111 - "Boolean"
Nodes (1): Boolean

### Community 112 - "Float"
Nodes (1): Float

### Community 113 - "20251026202316_migrate_back_to_sqlite"
Nodes (1): 20251026202316_migrate_back_to_sqlite

### Community 114 - "TemplateStep"
Nodes (1): TemplateStep

### Community 115 - "TemplateStepGroup"
Nodes (1): TemplateStepGroup

### Community 116 - "TemplateStepParameter"
Nodes (1): TemplateStepParameter

### Community 117 - "_TagToTestRun"
Nodes (1): _TagToTestRun

### Community 118 - "_TestSuiteTestCases"
Nodes (1): _TestSuiteTestCases

### Community 119 - "20251104113456_add_type_for_template_step_groups"
Nodes (1): 20251104113456_add_type_for_template_step_groups

### Community 120 - "new_TemplateStepGroup"
Nodes (1): new_TemplateStepGroup

### Community 121 - "20251104170946_add_tags_to_test_suite_and_test_case"
Nodes (1): 20251104170946_add_tags_to_test_suite_and_test_case

### Community 122 - "_TagToTestCase"
Nodes (1): _TagToTestCase

### Community 123 - "_TagToTestSuite"
Nodes (1): _TagToTestSuite

### Community 124 - "20251112190024_add_cascade_delete_to_test_run_test_case"
Nodes (1): 20251112190024_add_cascade_delete_to_test_run_test_case

### Community 125 - "new_TestRunTestCase"
Nodes (1): new_TestRunTestCase

### Community 126 - "20251113181100_add_test_run_log"
Nodes (1): 20251113181100_add_test_run_log

### Community 127 - "20251119191838_add_tag_type"
Nodes (1): 20251119191838_add_tag_type

### Community 128 - "new_Tag"
Nodes (1): new_Tag

### Community 129 - "20251121164059_add_conflict_resolution"
Nodes (1): 20251121164059_add_conflict_resolution

### Community 130 - "20251130190737_add_trace_path_to_test_run_test_case"
Nodes (1): 20251130190737_add_trace_path_to_test_run_test_case

### Community 131 - "20251213074835_add_log_path_to_test_run"
Nodes (1): 20251213074835_add_log_path_to_test_run

### Community 132 - "20251213183952_add_name_property_for_the_test_run_entities"
Nodes (1): 20251213183952_add_name_property_for_the_test_run_entities

### Community 133 - "new_TestRun"
Nodes (1): new_TestRun

### Community 134 - "20251223183400_add_report_model_to_db_schema"
Nodes (1): 20251223183400_add_report_model_to_db_schema

### Community 135 - "20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases"
Nodes (1): 20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases

### Community 136 - "20251224083549_add_comprehensive_report_storage"
Nodes (1): 20251224083549_add_comprehensive_report_storage

### Community 137 - "new_ReportTestCase"
Nodes (1): new_ReportTestCase

### Community 138 - "20251229194422_migrate_duration_to_string"
Nodes (1): 20251229194422_migrate_duration_to_string

### Community 139 - "new_ReportHook"
Nodes (1): new_ReportHook

### Community 140 - "new_ReportStep"
Nodes (1): new_ReportStep

### Community 141 - "20251230124637_add_unique_constraint_to_test_run_name"
Nodes (1): 20251230124637_add_unique_constraint_to_test_run_name

### Community 142 - "20260115094436_add_dashboard_metrics"
Nodes (1): 20260115094436_add_dashboard_metrics

### Community 143 - "20260127172022_add_cascade_delete_to_step_parameters"
Nodes (1): 20260127172022_add_cascade_delete_to_step_parameters

### Community 144 - "new_TemplateTestCaseStepParameter"
Nodes (1): new_TemplateTestCaseStepParameter

### Community 145 - "new_TestCaseStepParameter"
Nodes (1): new_TestCaseStepParameter

### Community 146 - "20260313093000_add_report_step_screenshot_path"
Nodes (1): 20260313093000_add_report_step_screenshot_path

### Community 147 - "20260318120000_add_test_suite_context_to_test_run_test_case"
Nodes (1): 20260318120000_add_test_suite_context_to_test_run_test_case

### Community 148 - "20260318173512_add_support_of_test_suite_level_runs"
Nodes (1): 20260318173512_add_support_of_test_suite_level_runs

### Community 149 - "20260507000000_add_flow_builder_node_grouping"
Nodes (1): 20260507000000_add_flow_builder_node_grouping

### Community 150 - "20260609002500_add_plan_projection_and_sync"
Nodes (1): 20260609002500_add_plan_projection_and_sync

### Community 151 - "20260609090000_add_plan_review_runtime"
Nodes (1): 20260609090000_add_plan_review_runtime

### Community 152 - "20260609160000_add_coordinator_events_api_mcp"
Nodes (1): 20260609160000_add_coordinator_events_api_mcp

### Community 153 - "new_PlanEvent"
Nodes (1): new_PlanEvent

### Community 154 - "20260613015000_add_plan_description"
Nodes (1): 20260613015000_add_plan_description

### Community 155 - "20260628090000_add_target_projects"
Nodes (1): 20260628090000_add_target_projects

### Community 156 - "new_PlanProjection"
Nodes (1): new_PlanProjection

### Community 157 - "20260628103000_add_plan_slug_legacy_identity"
Nodes (1): 20260628103000_add_plan_slug_legacy_identity

### Community 158 - "20260701090000_add_provider_workflow_runs"
Nodes (1): 20260701090000_add_provider_workflow_runs

### Community 159 - "20260701120000_add_provider_registration_settings"
Nodes (1): 20260701120000_add_provider_registration_settings

### Community 160 - "20260708090000_add_test_run_evidence_health"
Nodes (1): 20260708090000_add_test_run_evidence_health

### Community 161 - "20260709090000_add_step_blocks"
Nodes (1): 20260709090000_add_step_blocks

### Community 162 - "StepBlock"
Nodes (1): StepBlock

### Community 163 - "StepBlockStep"
Nodes (1): StepBlockStep

### Community 164 - "20260711120000_add_baseline_attempt_history"
Nodes (1): 20260711120000_add_baseline_attempt_history

### Community 165 - "20260711150000_add_delegated_authorization_nonces"
Nodes (1): 20260711150000_add_delegated_authorization_nonces

### Community 166 - "20260711170000_add_delegated_ast_submissions"
Nodes (1): 20260711170000_add_delegated_ast_submissions

### Community 167 - "20260711190000_add_validation_ast_publish_journal"
Nodes (1): 20260711190000_add_validation_ast_publish_journal

### Community 168 - "20260711220000_add_runtime_capsules"
Nodes (1): 20260711220000_add_runtime_capsules

### Community 169 - "20260712010000_add_runtime_capsule_execution_attempt"
Nodes (1): 20260712010000_add_runtime_capsule_execution_attempt

### Community 170 - "20260712020000_add_test_run_preparation_key"
Nodes (1): 20260712020000_add_test_run_preparation_key

### Community 171 - "20260712180000_add_repository_exports"
Nodes (1): 20260712180000_add_repository_exports

### Community 172 - "20260713143000_add_project_resource_ownership"
Nodes (1): 20260713143000_add_project_resource_ownership

### Community 173 - "20260713153000_add_validation_resource_proposals"
Nodes (1): 20260713153000_add_validation_resource_proposals

### Community 174 - "20260713163000_normalize_managed_validation_vocabulary"
Nodes (1): 20260713163000_normalize_managed_validation_vocabulary

### Community 175 - "20260713173000_add_named_plan_hashes"
Nodes (1): 20260713173000_add_named_plan_hashes

### Community 176 - "20260713183000_add_delegated_coordinator_receipts"
Nodes (1): 20260713183000_add_delegated_coordinator_receipts

### Community 177 - "20260713200000_stage_complete_project_ownership"
Nodes (1): 20260713200000_stage_complete_project_ownership

### Community 178 - "20260713210000_add_target_project_description"
Nodes (1): 20260713210000_add_target_project_description

### Community 179 - "20260713211000_scope_test_run_preparation_key"
Nodes (1): 20260713211000_scope_test_run_preparation_key

### Community 180 - "20260714000000_make_template_library_shared"
Nodes (1): 20260714000000_make_template_library_shared

### Community 181 - "20260714143000_add_validation_review_state_receipt"
Nodes (1): 20260714143000_add_validation_review_state_receipt

### Community 182 - "20260714160500_scope_environment_names_to_project"
Nodes (1): 20260714160500_scope_environment_names_to_project

### Community 183 - "20260716190000_replace_environment_password_with_reference"
Nodes (1): 20260716190000_replace_environment_password_with_reference

### Community 184 - "new_Environment"
Nodes (1): new_Environment

### Community 185 - "20260716210000_add_measured_test_run_pagination_index"
Nodes (1): 20260716210000_add_measured_test_run_pagination_index

### Community 186 - "20260718110000_add_agent_preflight_receipts"
Nodes (1): 20260718110000_add_agent_preflight_receipts

### Community 187 - "20260718160000_add_plan_observability"
Nodes (1): 20260718160000_add_plan_observability

### Community 188 - "20260718193000_add_environment_identity_expectation"
Nodes (1): 20260718193000_add_environment_identity_expectation

### Community 189 - "20260720010000_add_canonical_operation_mappings"
Nodes (1): 20260720010000_add_canonical_operation_mappings

### Community 190 - "20260722013000_scope_locator_group_names_to_project"
Nodes (1): 20260722013000_scope_locator_group_names_to_project

### Community 191 - "20260722190000_add_step_definition_registry"
Nodes (1): 20260722190000_add_step_definition_registry

### Community 192 - "StepCompatibilityReference"
Nodes (1): StepCompatibilityReference

### Community 193 - "20260722223000_add_step_definition_reviewed_extensions"
Nodes (1): 20260722223000_add_step_definition_reviewed_extensions

### Community 194 - "20260725190000_add_step_block_migration_ledger"
Nodes (1): 20260725190000_add_step_block_migration_ledger

### Community 195 - "StepBlockMigrationLedger"
Nodes (1): StepBlockMigrationLedger

### Community 196 - "_LegacyCompositionDefinition"
Nodes (1): _LegacyCompositionDefinition

### Community 197 - "20260725193000_make_validation_projection_template_step_optional"
Nodes (1): 20260725193000_make_validation_projection_template_step_optional

### Community 198 - "new_TestCaseStep"
Nodes (1): new_TestCaseStep

### Community 199 - "20260725194500_cut_over_authored_steps_to_step_invocations"
Nodes (1): 20260725194500_cut_over_authored_steps_to_step_invocations

### Community 200 - "IF"
Nodes (1): IF

### Community 201 - "20260725200000_remove_legacy_step_authority"
Nodes (1): 20260725200000_remove_legacy_step_authority

### Community 202 - "20260725201000_add_step_definition_telemetry"
Nodes (1): 20260725201000_add_step_definition_telemetry

### Community 203 - "20260725202000_add_step_definition_reuse_justification"
Nodes (1): 20260725202000_add_step_definition_reuse_justification

### Community 204 - "20260725203000_add_step_definition_review_receipts"
Nodes (1): 20260725203000_add_step_definition_review_receipts

### Community 205 - "20260725204000_harden_step_definition_evidence_and_telemetry"
Nodes (1): 20260725204000_harden_step_definition_evidence_and_telemetry

### Community 206 - "20260725205000_add_reviewed_extension_revocation"
Nodes (1): 20260725205000_add_reviewed_extension_revocation

### Community 207 - "20260725206000_add_step_definition_search_receipts"
Nodes (1): 20260725206000_add_step_definition_search_receipts

## Suggested Questions
- Which models are connected to PlanProjection?
- Which migrations introduced coordinator and plan review tables?
- Which models depend on Locator or TestRun?
- Which enums are used by execution report models?
