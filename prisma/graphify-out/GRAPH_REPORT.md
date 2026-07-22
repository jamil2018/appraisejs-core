# Graph Report - prisma

## Corpus Check
- 59 files from prisma/schema.prisma and migrations
- Verdict: schema-aware graph generated because Graphify AST extraction does not currently produce Prisma/SQL nodes.

## Summary
- 1262 nodes · 2840 edges · 189 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `String` - 515 edges
2. `schema.prisma` - 169 edges
3. `TargetProject` - 157 edges
4. `DateTime` - 138 edges
5. `PlanProjection` - 91 edges
6. `TestRun` - 73 edges
7. `ValidationAstPublishOperation` - 62 edges
8. `ProviderWorkflowRun` - 56 edges
9. `TestCase` - 52 edges
10. `StepDefinition` - 46 edges

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

## Communities (189 total)
### Community 0 - "schema.prisma"
Nodes (3): schema.prisma, datasource db (sqlite), Prisma client generator

### Community 1 - "TestSuite"
Nodes (14): TestSuite, TestSuite.id, TestSuite.name, TestSuite.description, TestSuite.createdAt, TestSuite.updatedAt, TestSuite.moduleId, TestSuite.module (+more)

### Community 2 - "Review"
Nodes (9): Review, Review.id, Review.testCaseId, Review.reviewerId, Review.status, Review.comments, Review.createdAt, Review.updatedAt (+more)

### Community 3 - "LinkedJiraTicket"
Nodes (9): LinkedJiraTicket, LinkedJiraTicket.id, LinkedJiraTicket.testCaseId, LinkedJiraTicket.jiraTicketId, LinkedJiraTicket.jiraTicketUrl, LinkedJiraTicket.jiraStatus, LinkedJiraTicket.createdAt, LinkedJiraTicket.updatedAt (+more)

### Community 4 - "TemplateStep"
Nodes (21): TemplateStep, TemplateStep.id, TemplateStep.name, TemplateStep.description, TemplateStep.createdAt, TemplateStep.updatedAt, TemplateStep.signature, TemplateStep.functionDefinition (+more)

### Community 5 - "StepDefinition"
Nodes (20): StepDefinition, StepDefinition.id, StepDefinition.version, StepDefinition.status, StepDefinition.title, StepDefinition.description, StepDefinition.definitionJson, StepDefinition.definitionHash (+more)

### Community 6 - "StepDefinitionDraft"
Nodes (13): StepDefinitionDraft, StepDefinitionDraft.id, StepDefinitionDraft.proposedStepId, StepDefinitionDraft.proposedVersion, StepDefinitionDraft.revision, StepDefinitionDraft.draftJson, StepDefinitionDraft.draftHash, StepDefinitionDraft.validationReportJson (+more)

### Community 7 - "StepHumanProjection"
Nodes (8): StepHumanProjection, StepHumanProjection.stepId, StepHumanProjection.stepVersion, StepHumanProjection.signature, StepHumanProjection.groupId, StepHumanProjection.projectionJson, StepHumanProjection.projectionHash, StepHumanProjection.definition

### Community 8 - "StepExecutionBinding"
Nodes (7): StepExecutionBinding, StepExecutionBinding.stepId, StepExecutionBinding.stepVersion, StepExecutionBinding.kind, StepExecutionBinding.bindingJson, StepExecutionBinding.bindingHash, StepExecutionBinding.definition

### Community 9 - "StepPublicationReceipt"
Nodes (10): StepPublicationReceipt, StepPublicationReceipt.stepId, StepPublicationReceipt.stepVersion, StepPublicationReceipt.receiptJson, StepPublicationReceipt.receiptHash, StepPublicationReceipt.registryManifestHash, StepPublicationReceipt.conformanceRunId, StepPublicationReceipt.reviewAuthority (+more)

### Community 10 - "StepDefinitionDeprecation"
Nodes (9): StepDefinitionDeprecation, StepDefinitionDeprecation.stepId, StepDefinitionDeprecation.stepVersion, StepDefinitionDeprecation.reason, StepDefinitionDeprecation.actor, StepDefinitionDeprecation.replacementStepId, StepDefinitionDeprecation.replacementVersion, StepDefinitionDeprecation.deprecatedAt (+more)

### Community 11 - "StepCompatibilityReference"
Nodes (10): StepCompatibilityReference, StepCompatibilityReference.id, StepCompatibilityReference.legacyKind, StepCompatibilityReference.legacyValue, StepCompatibilityReference.stepId, StepCompatibilityReference.stepVersion, StepCompatibilityReference.createdAt, StepCompatibilityReference.lastUsedAt (+more)

### Community 12 - "StepDefinitionStatus"
Nodes (3): StepDefinitionStatus, StepDefinitionStatus.ready, StepDefinitionStatus.deprecated

### Community 13 - "StepExecutionKind"
Nodes (4): StepExecutionKind, StepExecutionKind.operation, StepExecutionKind.composition, StepExecutionKind.reviewed_extension

### Community 14 - "TemplateStepParameter"
Nodes (9): TemplateStepParameter, TemplateStepParameter.id, TemplateStepParameter.name, TemplateStepParameter.createdAt, TemplateStepParameter.updatedAt, TemplateStepParameter.templateStepId, TemplateStepParameter.order, TemplateStepParameter.type (+more)

### Community 15 - "TemplateStepGroup"
Nodes (10): TemplateStepGroup, TemplateStepGroup.id, TemplateStepGroup.name, TemplateStepGroup.description, TemplateStepGroup.type, TemplateStepGroup.createdAt, TemplateStepGroup.updatedAt, TemplateStepGroup.templateSteps (+more)

### Community 16 - "StepBlock"
Nodes (10): StepBlock, StepBlock.id, StepBlock.name, StepBlock.description, StepBlock.intent, StepBlock.createdAt, StepBlock.updatedAt, StepBlock.steps (+more)

### Community 17 - "StepBlockStep"
Nodes (10): StepBlockStep, StepBlockStep.id, StepBlockStep.stepBlockId, StepBlockStep.templateStepId, StepBlockStep.order, StepBlockStep.parameterMap, StepBlockStep.operationInvocationJson, StepBlockStep.compositionVersionHash (+more)

### Community 18 - "TestCase"
Nodes (16): TestCase, TestCase.id, TestCase.title, TestCase.description, TestCase.createdAt, TestCase.updatedAt, TestCase.linkedJiraTickets, TestCase.reviews (+more)

### Community 19 - "TestCaseStep"
Nodes (13): TestCaseStep, TestCaseStep.id, TestCaseStep.flowNodeId, TestCaseStep.testCaseId, TestCaseStep.order, TestCaseStep.gherkinStep, TestCaseStep.icon, TestCaseStep.label (+more)

### Community 20 - "TestCaseFlowBlock"
Nodes (7): TestCaseFlowBlock, TestCaseFlowBlock.id, TestCaseFlowBlock.name, TestCaseFlowBlock.testCaseId, TestCaseFlowBlock.order, TestCaseFlowBlock.testCase, TestCaseFlowBlock.nodes

### Community 21 - "TestCaseFlowBlockNode"
Nodes (5): TestCaseFlowBlockNode, TestCaseFlowBlockNode.id, TestCaseFlowBlockNode.flowNodeId, TestCaseFlowBlockNode.flowBlockId, TestCaseFlowBlockNode.flowBlock

### Community 22 - "TemplateTestCase"
Nodes (10): TemplateTestCase, TemplateTestCase.id, TemplateTestCase.name, TemplateTestCase.description, TemplateTestCase.createdAt, TemplateTestCase.updatedAt, TemplateTestCase.steps, TemplateTestCase.flowBlocks (+more)

### Community 23 - "TemplateTestCaseStep"
Nodes (13): TemplateTestCaseStep, TemplateTestCaseStep.id, TemplateTestCaseStep.flowNodeId, TemplateTestCaseStep.order, TemplateTestCaseStep.gherkinStep, TemplateTestCaseStep.icon, TemplateTestCaseStep.label, TemplateTestCaseStep.templateTestCaseId (+more)

### Community 24 - "TemplateTestCaseFlowBlock"
Nodes (7): TemplateTestCaseFlowBlock, TemplateTestCaseFlowBlock.id, TemplateTestCaseFlowBlock.name, TemplateTestCaseFlowBlock.templateTestCaseId, TemplateTestCaseFlowBlock.order, TemplateTestCaseFlowBlock.templateTestCase, TemplateTestCaseFlowBlock.nodes

### Community 25 - "TemplateTestCaseFlowBlockNode"
Nodes (5): TemplateTestCaseFlowBlockNode, TemplateTestCaseFlowBlockNode.id, TemplateTestCaseFlowBlockNode.flowNodeId, TemplateTestCaseFlowBlockNode.flowBlockId, TemplateTestCaseFlowBlockNode.flowBlock

### Community 26 - "TemplateTestCaseStepParameter"
Nodes (11): TemplateTestCaseStepParameter, TemplateTestCaseStepParameter.id, TemplateTestCaseStepParameter.name, TemplateTestCaseStepParameter.defaultValue, TemplateTestCaseStepParameter.order, TemplateTestCaseStepParameter.testCaseStepId, TemplateTestCaseStepParameter.locatorId, TemplateTestCaseStepParameter.type (+more)

### Community 27 - "TestCaseStepParameter"
Nodes (10): TestCaseStepParameter, TestCaseStepParameter.id, TestCaseStepParameter.name, TestCaseStepParameter.value, TestCaseStepParameter.order, TestCaseStepParameter.testCaseStepId, TestCaseStepParameter.locatorId, TestCaseStepParameter.type (+more)

### Community 28 - "Locator"
Nodes (13): Locator, Locator.id, Locator.name, Locator.value, Locator.createdAt, Locator.updatedAt, Locator.locatorGroupId, Locator.locatorGroup (+more)

### Community 29 - "LocatorGroup"
Nodes (11): LocatorGroup, LocatorGroup.id, LocatorGroup.name, LocatorGroup.route, LocatorGroup.createdAt, LocatorGroup.updatedAt, LocatorGroup.moduleId, LocatorGroup.locators (+more)

### Community 30 - "Module"
Nodes (12): Module, Module.id, Module.name, Module.parentId, Module.createdAt, Module.updatedAt, Module.locatorGroups, Module.parent (+more)

### Community 31 - "TestRunTestCase"
Nodes (12): TestRunTestCase, TestRunTestCase.id, TestRunTestCase.testRunId, TestRunTestCase.testCaseId, TestRunTestCase.testSuiteId, TestRunTestCase.status, TestRunTestCase.result, TestRunTestCase.tracePath (+more)

### Community 32 - "TestRun"
Nodes (27): TestRun, TestRun.id, TestRun.name, TestRun.preparationKey, TestRun.runId, TestRun.startedAt, TestRun.completedAt, TestRun.status (+more)

### Community 33 - "PlanProjection"
Nodes (37): PlanProjection, PlanProjection.id, PlanProjection.planId, PlanProjection.slug, PlanProjection.legacyPlanId, PlanProjection.revision, PlanProjection.lifecycle, PlanProjection.goal (+more)

### Community 34 - "BaselineAttempt"
Nodes (14): BaselineAttempt, BaselineAttempt.id, BaselineAttempt.planProjectionId, BaselineAttempt.validationId, BaselineAttempt.validationRevision, BaselineAttempt.validationHash, BaselineAttempt.browser, BaselineAttempt.environment (+more)

### Community 35 - "BaselineAttemptEvent"
Nodes (9): BaselineAttemptEvent, BaselineAttemptEvent.id, BaselineAttemptEvent.attemptId, BaselineAttemptEvent.kind, BaselineAttemptEvent.payloadJson, BaselineAttemptEvent.idempotencyKey, BaselineAttemptEvent.sequence, BaselineAttemptEvent.createdAt (+more)

### Community 36 - "TargetProject"
Nodes (40): TargetProject, TargetProject.id, TargetProject.canonicalPath, TargetProject.displayName, TargetProject.description, TargetProject.packageName, TargetProject.packageManager, TargetProject.packageJson (+more)

### Community 37 - "AgentPreflightReceipt"
Nodes (15): AgentPreflightReceipt, AgentPreflightReceipt.id, AgentPreflightReceipt.coordinatorId, AgentPreflightReceipt.schemaVersion, AgentPreflightReceipt.status, AgentPreflightReceipt.ready, AgentPreflightReceipt.snapshotHash, AgentPreflightReceipt.snapshotJson (+more)

### Community 38 - "PlanOperationMetric"
Nodes (15): PlanOperationMetric, PlanOperationMetric.id, PlanOperationMetric.planProjectionId, PlanOperationMetric.phase, PlanOperationMetric.operation, PlanOperationMetric.statusCode, PlanOperationMetric.durationMs, PlanOperationMetric.waitMs (+more)

### Community 39 - "LifecycleCertificationReceipt"
Nodes (9): LifecycleCertificationReceipt, LifecycleCertificationReceipt.id, LifecycleCertificationReceipt.schemaVersion, LifecycleCertificationReceipt.status, LifecycleCertificationReceipt.matrixHash, LifecycleCertificationReceipt.matrixJson, LifecycleCertificationReceipt.durationMs, LifecycleCertificationReceipt.gitCommit (+more)

### Community 40 - "ValidationResourceProposal"
Nodes (10): ValidationResourceProposal, ValidationResourceProposal.id, ValidationResourceProposal.planId, ValidationResourceProposal.targetProjectId, ValidationResourceProposal.idempotencyKey, ValidationResourceProposal.proposalHash, ValidationResourceProposal.proposalJson, ValidationResourceProposal.resultJson (+more)

### Community 41 - "ProjectResourceOwnership"
Nodes (13): ProjectResourceOwnership, ProjectResourceOwnership.id, ProjectResourceOwnership.entityType, ProjectResourceOwnership.entityId, ProjectResourceOwnership.scope, ProjectResourceOwnership.targetProjectId, ProjectResourceOwnership.origin, ProjectResourceOwnership.provenanceJson (+more)

### Community 42 - "ProjectResourceImport"
Nodes (11): ProjectResourceImport, ProjectResourceImport.id, ProjectResourceImport.sourceOwnershipId, ProjectResourceImport.destinationProjectId, ProjectResourceImport.sharingMode, ProjectResourceImport.sourceContentHash, ProjectResourceImport.actor, ProjectResourceImport.propagationPolicy (+more)

### Community 43 - "ResourceScope"
Nodes (7): ResourceScope, ResourceScope.system, ResourceScope.global_library, ResourceScope.project, ResourceScope.publication, ResourceScope.runtime, ResourceScope.quarantined

### Community 44 - "ResourceSharingMode"
Nodes (3): ResourceSharingMode, ResourceSharingMode.immutable_reference, ResourceSharingMode.copy

### Community 45 - "RepositoryExportPolicy"
Nodes (4): RepositoryExportPolicy, RepositoryExportPolicy.disabled, RepositoryExportPolicy.optional, RepositoryExportPolicy.required

### Community 46 - "RepositoryExportJobState"
Nodes (6): RepositoryExportJobState, RepositoryExportJobState.queued, RepositoryExportJobState.running, RepositoryExportJobState.conflict, RepositoryExportJobState.succeeded, RepositoryExportJobState.failed

### Community 47 - "RepositoryExportJob"
Nodes (20): RepositoryExportJob, RepositoryExportJob.id, RepositoryExportJob.targetProjectId, RepositoryExportJob.publishOperationId, RepositoryExportJob.validationHash, RepositoryExportJob.destinationPath, RepositoryExportJob.policy, RepositoryExportJob.state (+more)

### Community 48 - "RepositoryExportReceipt"
Nodes (11): RepositoryExportReceipt, RepositoryExportReceipt.id, RepositoryExportReceipt.jobId, RepositoryExportReceipt.targetProjectId, RepositoryExportReceipt.validationHash, RepositoryExportReceipt.manifestHash, RepositoryExportReceipt.destinationPath, RepositoryExportReceipt.receiptJson (+more)

### Community 49 - "RuntimeCapsule"
Nodes (17): RuntimeCapsule, RuntimeCapsule.id, RuntimeCapsule.targetProjectId, RuntimeCapsule.testRunId, RuntimeCapsule.validationHash, RuntimeCapsule.capsuleHash, RuntimeCapsule.manifestHash, RuntimeCapsule.manifestJson (+more)

### Community 50 - "RuntimeCapsuleExecutionAttempt"
Nodes (18): RuntimeCapsuleExecutionAttempt, RuntimeCapsuleExecutionAttempt.id, RuntimeCapsuleExecutionAttempt.testRunId, RuntimeCapsuleExecutionAttempt.capsuleId, RuntimeCapsuleExecutionAttempt.receiptHash, RuntimeCapsuleExecutionAttempt.preflightResultJson, RuntimeCapsuleExecutionAttempt.preflightResultHash, RuntimeCapsuleExecutionAttempt.preflightCheckedAt (+more)

### Community 51 - "RuntimeCapsuleExecutionAttemptState"
Nodes (8): RuntimeCapsuleExecutionAttemptState, RuntimeCapsuleExecutionAttemptState.PREPARED, RuntimeCapsuleExecutionAttemptState.STARTING, RuntimeCapsuleExecutionAttemptState.RUNNING, RuntimeCapsuleExecutionAttemptState.COMPLETED, RuntimeCapsuleExecutionAttemptState.FAILED, RuntimeCapsuleExecutionAttemptState.CANCELLED, RuntimeCapsuleExecutionAttemptState.INTERRUPTED

### Community 52 - "RuntimeCapsuleBlob"
Nodes (12): RuntimeCapsuleBlob, RuntimeCapsuleBlob.id, RuntimeCapsuleBlob.targetProjectId, RuntimeCapsuleBlob.contentHash, RuntimeCapsuleBlob.size, RuntimeCapsuleBlob.storagePath, RuntimeCapsuleBlob.integrityState, RuntimeCapsuleBlob.version (+more)

### Community 53 - "RuntimeCapsuleBlobReference"
Nodes (7): RuntimeCapsuleBlobReference, RuntimeCapsuleBlobReference.id, RuntimeCapsuleBlobReference.capsuleId, RuntimeCapsuleBlobReference.blobId, RuntimeCapsuleBlobReference.filePath, RuntimeCapsuleBlobReference.capsule, RuntimeCapsuleBlobReference.blob

### Community 54 - "RuntimeCapsuleIntegrityState"
Nodes (5): RuntimeCapsuleIntegrityState, RuntimeCapsuleIntegrityState.staging, RuntimeCapsuleIntegrityState.ready, RuntimeCapsuleIntegrityState.missing, RuntimeCapsuleIntegrityState.corrupt

### Community 55 - "RuntimeCapsuleLease"
Nodes (11): RuntimeCapsuleLease, RuntimeCapsuleLease.id, RuntimeCapsuleLease.targetProjectId, RuntimeCapsuleLease.validationHash, RuntimeCapsuleLease.runId, RuntimeCapsuleLease.ownerToken, RuntimeCapsuleLease.leaseExpiresAt, RuntimeCapsuleLease.version (+more)

### Community 56 - "ProviderAdapterRegistration"
Nodes (20): ProviderAdapterRegistration, ProviderAdapterRegistration.id, ProviderAdapterRegistration.key, ProviderAdapterRegistration.displayName, ProviderAdapterRegistration.providerKind, ProviderAdapterRegistration.adapterVersion, ProviderAdapterRegistration.capabilitiesJson, ProviderAdapterRegistration.enabled (+more)

### Community 57 - "ProviderWorkflowRun"
Nodes (33): ProviderWorkflowRun, ProviderWorkflowRun.id, ProviderWorkflowRun.planProjectionId, ProviderWorkflowRun.targetProjectId, ProviderWorkflowRun.providerAdapterId, ProviderWorkflowRun.providerKind, ProviderWorkflowRun.providerProfile, ProviderWorkflowRun.adapterVersion (+more)

### Community 58 - "ProviderRunEvent"
Nodes (9): ProviderRunEvent, ProviderRunEvent.id, ProviderRunEvent.runId, ProviderRunEvent.sequence, ProviderRunEvent.type, ProviderRunEvent.payloadJson, ProviderRunEvent.stream, ProviderRunEvent.createdAt (+more)

### Community 59 - "ProviderPermissionDecision"
Nodes (12): ProviderPermissionDecision, ProviderPermissionDecision.id, ProviderPermissionDecision.runId, ProviderPermissionDecision.requestId, ProviderPermissionDecision.decision, ProviderPermissionDecision.riskTier, ProviderPermissionDecision.requestedScope, ProviderPermissionDecision.payloadJson (+more)

### Community 60 - "ProviderArtifactSnapshot"
Nodes (9): ProviderArtifactSnapshot, ProviderArtifactSnapshot.id, ProviderArtifactSnapshot.runId, ProviderArtifactSnapshot.path, ProviderArtifactSnapshot.kind, ProviderArtifactSnapshot.hash, ProviderArtifactSnapshot.metadataJson, ProviderArtifactSnapshot.capturedAt (+more)

### Community 61 - "PlanTaskProjection"
Nodes (10): PlanTaskProjection, PlanTaskProjection.id, PlanTaskProjection.planProjectionId, PlanTaskProjection.taskId, PlanTaskProjection.title, PlanTaskProjection.description, PlanTaskProjection.acceptanceJson, PlanTaskProjection.validationIntent (+more)

### Community 62 - "PlanSyncIssue"
Nodes (10): PlanSyncIssue, PlanSyncIssue.id, PlanSyncIssue.planProjectionId, PlanSyncIssue.code, PlanSyncIssue.artifactPath, PlanSyncIssue.message, PlanSyncIssue.blocking, PlanSyncIssue.createdAt (+more)

### Community 63 - "PlanRevision"
Nodes (10): PlanRevision, PlanRevision.id, PlanRevision.planProjectionId, PlanRevision.sourceHash, PlanRevision.gitCommit, PlanRevision.dirtyHashesJson, PlanRevision.snapshotJson, PlanRevision.reducedAssurance (+more)

### Community 64 - "PlanEvent"
Nodes (19): PlanEvent, PlanEvent.id, PlanEvent.planProjectionId, PlanEvent.publishOperationId, PlanEvent.validationId, PlanEvent.sequence, PlanEvent.type, PlanEvent.payloadJson (+more)

### Community 65 - "AppraiseProjectIdentity"
Nodes (6): AppraiseProjectIdentity, AppraiseProjectIdentity.id, AppraiseProjectIdentity.projectFingerprint, AppraiseProjectIdentity.tokenHash, AppraiseProjectIdentity.createdAt, AppraiseProjectIdentity.rotatedAt

### Community 66 - "DelegatedAuthorizationNonce"
Nodes (5): DelegatedAuthorizationNonce, DelegatedAuthorizationNonce.nonce, DelegatedAuthorizationNonce.issuer, DelegatedAuthorizationNonce.expiresAt, DelegatedAuthorizationNonce.consumedAt

### Community 67 - "DelegatedCoordinatorReceipt"
Nodes (20): DelegatedCoordinatorReceipt, DelegatedCoordinatorReceipt.id, DelegatedCoordinatorReceipt.parentCoordinatorId, DelegatedCoordinatorReceipt.delegatedCoordinatorId, DelegatedCoordinatorReceipt.targetProjectId, DelegatedCoordinatorReceipt.targetFingerprint, DelegatedCoordinatorReceipt.pathFingerprint, DelegatedCoordinatorReceipt.purpose (+more)

### Community 68 - "DelegatedCoordinatorConsumption"
Nodes (7): DelegatedCoordinatorConsumption, DelegatedCoordinatorConsumption.id, DelegatedCoordinatorConsumption.receiptId, DelegatedCoordinatorConsumption.permission, DelegatedCoordinatorConsumption.operationKey, DelegatedCoordinatorConsumption.consumedAt, DelegatedCoordinatorConsumption.receipt

### Community 69 - "DelegatedValidationAstSubmission"
Nodes (10): DelegatedValidationAstSubmission, DelegatedValidationAstSubmission.id, DelegatedValidationAstSubmission.nonce, DelegatedValidationAstSubmission.targetFingerprint, DelegatedValidationAstSubmission.planHash, DelegatedValidationAstSubmission.issuer, DelegatedValidationAstSubmission.astId, DelegatedValidationAstSubmission.astJson (+more)

### Community 70 - "ValidationAstPublishOperation"
Nodes (39): ValidationAstPublishOperation, ValidationAstPublishOperation.id, ValidationAstPublishOperation.planId, ValidationAstPublishOperation.planProjectionId, ValidationAstPublishOperation.targetProjectId, ValidationAstPublishOperation.targetFingerprint, ValidationAstPublishOperation.idempotencyKey, ValidationAstPublishOperation.operationHash (+more)

### Community 71 - "ValidationExtensionReview"
Nodes (11): ValidationExtensionReview, ValidationExtensionReview.id, ValidationExtensionReview.operationId, ValidationExtensionReview.extensionId, ValidationExtensionReview.version, ValidationExtensionReview.sourceHash, ValidationExtensionReview.compiledHash, ValidationExtensionReview.artifactHash (+more)

### Community 72 - "PlanCoordinatorLease"
Nodes (10): PlanCoordinatorLease, PlanCoordinatorLease.id, PlanCoordinatorLease.planProjectionId, PlanCoordinatorLease.coordinatorId, PlanCoordinatorLease.connectionId, PlanCoordinatorLease.leaseExpiresAt, PlanCoordinatorLease.takeoverApproved, PlanCoordinatorLease.createdAt (+more)

### Community 73 - "PlanPersonalLayout"
Nodes (8): PlanPersonalLayout, PlanPersonalLayout.id, PlanPersonalLayout.planProjectionId, PlanPersonalLayout.owner, PlanPersonalLayout.positionsJson, PlanPersonalLayout.createdAt, PlanPersonalLayout.updatedAt, PlanPersonalLayout.plan

### Community 74 - "TestRunLog"
Nodes (7): TestRunLog, TestRunLog.id, TestRunLog.testRunId, TestRunLog.logs, TestRunLog.createdAt, TestRunLog.updatedAt, TestRunLog.testRun

### Community 75 - "EnvironmentCredentialState"
Nodes (4): EnvironmentCredentialState, EnvironmentCredentialState.NONE, EnvironmentCredentialState.REFERENCE_CONFIGURED, EnvironmentCredentialState.LEGACY_DISABLED

### Community 76 - "Environment"
Nodes (15): Environment, Environment.id, Environment.name, Environment.baseUrl, Environment.expectedPageTitle, Environment.apiBaseUrl, Environment.username, Environment.passwordEnvironmentVariable (+more)

### Community 77 - "Tag"
Nodes (12): Tag, Tag.id, Tag.name, Tag.tagExpression, Tag.type, Tag.createdAt, Tag.updatedAt, Tag.testRuns (+more)

### Community 78 - "ConflictResolution"
Nodes (10): ConflictResolution, ConflictResolution.id, ConflictResolution.entityType, ConflictResolution.entityId, ConflictResolution.conflictType, ConflictResolution.conflictingEntityId, ConflictResolution.resolved, ConflictResolution.createdAt (+more)

### Community 79 - "ReportTestCase"
Nodes (10): ReportTestCase, ReportTestCase.id, ReportTestCase.reportId, ReportTestCase.testCaseId, ReportTestCase.testRunTestCaseId, ReportTestCase.reportScenarioId, ReportTestCase.testRunTestCase, ReportTestCase.report (+more)

### Community 80 - "Report"
Nodes (13): Report, Report.id, Report.name, Report.description, Report.reportPath, Report.createdAt, Report.updatedAt, Report.testRunId (+more)

### Community 81 - "ReportFeature"
Nodes (13): ReportFeature, ReportFeature.id, ReportFeature.reportId, ReportFeature.name, ReportFeature.description, ReportFeature.uri, ReportFeature.line, ReportFeature.keyword (+more)

### Community 82 - "ReportFeatureTag"
Nodes (7): ReportFeatureTag, ReportFeatureTag.id, ReportFeatureTag.reportFeatureId, ReportFeatureTag.tagName, ReportFeatureTag.line, ReportFeatureTag.createdAt, ReportFeatureTag.reportFeature

### Community 83 - "ReportScenario"
Nodes (16): ReportScenario, ReportScenario.id, ReportScenario.reportFeatureId, ReportScenario.name, ReportScenario.description, ReportScenario.line, ReportScenario.keyword, ReportScenario.type (+more)

### Community 84 - "ReportScenarioTag"
Nodes (7): ReportScenarioTag, ReportScenarioTag.id, ReportScenarioTag.reportScenarioId, ReportScenarioTag.tagName, ReportScenarioTag.line, ReportScenarioTag.createdAt, ReportScenarioTag.reportScenario

### Community 85 - "ReportStep"
Nodes (17): ReportStep, ReportStep.id, ReportStep.reportScenarioId, ReportStep.keyword, ReportStep.line, ReportStep.name, ReportStep.matchLocation, ReportStep.status (+more)

### Community 86 - "ReportHook"
Nodes (12): ReportHook, ReportHook.id, ReportHook.reportScenarioId, ReportHook.keyword, ReportHook.status, ReportHook.duration, ReportHook.errorMessage, ReportHook.errorTrace (+more)

### Community 87 - "TestCaseMetrics"
Nodes (17): TestCaseMetrics, TestCaseMetrics.id, TestCaseMetrics.testCaseId, TestCaseMetrics.isRepeatedlyFailing, TestCaseMetrics.isFlaky, TestCaseMetrics.consecutiveFailures, TestCaseMetrics.failureRate, TestCaseMetrics.totalRecentRuns (+more)

### Community 88 - "TestSuiteMetrics"
Nodes (9): TestSuiteMetrics, TestSuiteMetrics.id, TestSuiteMetrics.testSuiteId, TestSuiteMetrics.lastExecutedAt, TestSuiteMetrics.createdAt, TestSuiteMetrics.updatedAt, TestSuiteMetrics.testSuite, TestSuiteMetrics.targetProjectId (+more)

### Community 89 - "DashboardMetrics"
Nodes (10): DashboardMetrics, DashboardMetrics.id, DashboardMetrics.failedRecentRunsCount, DashboardMetrics.repeatedlyFailingTestsCount, DashboardMetrics.flakyTestsCount, DashboardMetrics.suitesNotExecutedRecentlyCount, DashboardMetrics.lastUpdatedAt, DashboardMetrics.createdAt (+more)

### Community 90 - "TagType"
Nodes (3): TagType, TagType.IDENTIFIER, TagType.FILTER

### Community 91 - "TestRunStatus"
Nodes (6): TestRunStatus, TestRunStatus.QUEUED, TestRunStatus.RUNNING, TestRunStatus.CANCELLING, TestRunStatus.COMPLETED, TestRunStatus.CANCELLED

### Community 92 - "TestRunTestCaseStatus"
Nodes (5): TestRunTestCaseStatus, TestRunTestCaseStatus.PENDING, TestRunTestCaseStatus.RUNNING, TestRunTestCaseStatus.COMPLETED, TestRunTestCaseStatus.CANCELLED

### Community 93 - "TestRunTestCaseResult"
Nodes (4): TestRunTestCaseResult, TestRunTestCaseResult.PASSED, TestRunTestCaseResult.FAILED, TestRunTestCaseResult.UNTESTED

### Community 94 - "TestRunResult"
Nodes (5): TestRunResult, TestRunResult.PENDING, TestRunResult.PASSED, TestRunResult.FAILED, TestRunResult.CANCELLED

### Community 95 - "TestRunEvidenceHealth"
Nodes (9): TestRunEvidenceHealth, TestRunEvidenceHealth.valid, TestRunEvidenceHealth.invalid_empty_run, TestRunEvidenceHealth.invalid_missing_test_cases, TestRunEvidenceHealth.invalid_missing_report, TestRunEvidenceHealth.invalid_placeholder_binary, TestRunEvidenceHealth.invalid_unmatched_scenarios, TestRunEvidenceHealth.invalid_stale_runtime (+more)

### Community 96 - "Role"
Nodes (4): Role, Role.ADMIN, Role.TESTER, Role.REVIEWER

### Community 97 - "ReviewStatus"
Nodes (4): ReviewStatus, ReviewStatus.PENDING, ReviewStatus.APPROVED, ReviewStatus.CHANGES_REQUESTED

### Community 98 - "TestCaseStatus"
Nodes (4): TestCaseStatus, TestCaseStatus.PENDING, TestCaseStatus.IN_PROGRESS, TestCaseStatus.COMPLETED

### Community 99 - "TestCaseResult"
Nodes (7): TestCaseResult, TestCaseResult.PASSED, TestCaseResult.FAILED, TestCaseResult.BLOCKED, TestCaseResult.SKIPPED, TestCaseResult.RETEST, TestCaseResult.UNTESTED

### Community 100 - "TemplateStepType"
Nodes (3): TemplateStepType, TemplateStepType.ACTION, TemplateStepType.ASSERTION

### Community 101 - "StepParameterType"
Nodes (6): StepParameterType, StepParameterType.NUMBER, StepParameterType.STRING, StepParameterType.DATE, StepParameterType.BOOLEAN, StepParameterType.LOCATOR

### Community 102 - "StepParameterValueType"
Nodes (4): StepParameterValueType, StepParameterValueType.STRING, StepParameterValueType.NUMBER, StepParameterValueType.LOCATOR

### Community 103 - "TemplateStepIcon"
Nodes (13): TemplateStepIcon, TemplateStepIcon.MOUSE, TemplateStepIcon.NAVIGATION, TemplateStepIcon.INPUT, TemplateStepIcon.DOWNLOAD, TemplateStepIcon.API, TemplateStepIcon.STORE, TemplateStepIcon.FORMAT (+more)

### Community 104 - "BrowserEngine"
Nodes (4): BrowserEngine, BrowserEngine.CHROMIUM, BrowserEngine.FIREFOX, BrowserEngine.WEBKIT

### Community 105 - "TemplateStepGroupType"
Nodes (3): TemplateStepGroupType, TemplateStepGroupType.ACTION, TemplateStepGroupType.VALIDATION

### Community 106 - "EntityType"
Nodes (2): EntityType, EntityType.LOCATOR

### Community 107 - "ConflictType"
Nodes (3): ConflictType, ConflictType.DUPLICATE_NAME, ConflictType.DUPLICATE_VALUE

### Community 108 - "StepStatus"
Nodes (6): StepStatus, StepStatus.PASSED, StepStatus.FAILED, StepStatus.SKIPPED, StepStatus.PENDING, StepStatus.UNDEFINED

### Community 109 - "StepKeyword"
Nodes (8): StepKeyword, StepKeyword.GIVEN, StepKeyword.WHEN, StepKeyword.THEN, StepKeyword.AND, StepKeyword.BUT, StepKeyword.BEFORE, StepKeyword.AFTER

### Community 110 - "String"
Nodes (1): String

### Community 111 - "DateTime"
Nodes (1): DateTime

### Community 112 - "Int"
Nodes (1): Int

### Community 113 - "Boolean"
Nodes (1): Boolean

### Community 114 - "Float"
Nodes (1): Float

### Community 115 - "20251026202316_migrate_back_to_sqlite"
Nodes (1): 20251026202316_migrate_back_to_sqlite

### Community 116 - "_TagToTestRun"
Nodes (1): _TagToTestRun

### Community 117 - "_TestSuiteTestCases"
Nodes (1): _TestSuiteTestCases

### Community 118 - "20251104113456_add_type_for_template_step_groups"
Nodes (1): 20251104113456_add_type_for_template_step_groups

### Community 119 - "new_TemplateStepGroup"
Nodes (1): new_TemplateStepGroup

### Community 120 - "20251104170946_add_tags_to_test_suite_and_test_case"
Nodes (1): 20251104170946_add_tags_to_test_suite_and_test_case

### Community 121 - "_TagToTestCase"
Nodes (1): _TagToTestCase

### Community 122 - "_TagToTestSuite"
Nodes (1): _TagToTestSuite

### Community 123 - "20251112190024_add_cascade_delete_to_test_run_test_case"
Nodes (1): 20251112190024_add_cascade_delete_to_test_run_test_case

### Community 124 - "new_TestRunTestCase"
Nodes (1): new_TestRunTestCase

### Community 125 - "20251113181100_add_test_run_log"
Nodes (1): 20251113181100_add_test_run_log

### Community 126 - "20251119191838_add_tag_type"
Nodes (1): 20251119191838_add_tag_type

### Community 127 - "new_Tag"
Nodes (1): new_Tag

### Community 128 - "20251121164059_add_conflict_resolution"
Nodes (1): 20251121164059_add_conflict_resolution

### Community 129 - "20251130190737_add_trace_path_to_test_run_test_case"
Nodes (1): 20251130190737_add_trace_path_to_test_run_test_case

### Community 130 - "20251213074835_add_log_path_to_test_run"
Nodes (1): 20251213074835_add_log_path_to_test_run

### Community 131 - "20251213183952_add_name_property_for_the_test_run_entities"
Nodes (1): 20251213183952_add_name_property_for_the_test_run_entities

### Community 132 - "new_TestRun"
Nodes (1): new_TestRun

### Community 133 - "20251223183400_add_report_model_to_db_schema"
Nodes (1): 20251223183400_add_report_model_to_db_schema

### Community 134 - "20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases"
Nodes (1): 20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases

### Community 135 - "20251224083549_add_comprehensive_report_storage"
Nodes (1): 20251224083549_add_comprehensive_report_storage

### Community 136 - "new_ReportTestCase"
Nodes (1): new_ReportTestCase

### Community 137 - "20251229194422_migrate_duration_to_string"
Nodes (1): 20251229194422_migrate_duration_to_string

### Community 138 - "new_ReportHook"
Nodes (1): new_ReportHook

### Community 139 - "new_ReportStep"
Nodes (1): new_ReportStep

### Community 140 - "20251230124637_add_unique_constraint_to_test_run_name"
Nodes (1): 20251230124637_add_unique_constraint_to_test_run_name

### Community 141 - "20260115094436_add_dashboard_metrics"
Nodes (1): 20260115094436_add_dashboard_metrics

### Community 142 - "20260127172022_add_cascade_delete_to_step_parameters"
Nodes (1): 20260127172022_add_cascade_delete_to_step_parameters

### Community 143 - "new_TemplateTestCaseStepParameter"
Nodes (1): new_TemplateTestCaseStepParameter

### Community 144 - "new_TestCaseStepParameter"
Nodes (1): new_TestCaseStepParameter

### Community 145 - "20260313093000_add_report_step_screenshot_path"
Nodes (1): 20260313093000_add_report_step_screenshot_path

### Community 146 - "20260318120000_add_test_suite_context_to_test_run_test_case"
Nodes (1): 20260318120000_add_test_suite_context_to_test_run_test_case

### Community 147 - "20260318173512_add_support_of_test_suite_level_runs"
Nodes (1): 20260318173512_add_support_of_test_suite_level_runs

### Community 148 - "20260507000000_add_flow_builder_node_grouping"
Nodes (1): 20260507000000_add_flow_builder_node_grouping

### Community 149 - "20260609002500_add_plan_projection_and_sync"
Nodes (1): 20260609002500_add_plan_projection_and_sync

### Community 150 - "20260609090000_add_plan_review_runtime"
Nodes (1): 20260609090000_add_plan_review_runtime

### Community 151 - "20260609160000_add_coordinator_events_api_mcp"
Nodes (1): 20260609160000_add_coordinator_events_api_mcp

### Community 152 - "new_PlanEvent"
Nodes (1): new_PlanEvent

### Community 153 - "20260613015000_add_plan_description"
Nodes (1): 20260613015000_add_plan_description

### Community 154 - "20260628090000_add_target_projects"
Nodes (1): 20260628090000_add_target_projects

### Community 155 - "new_PlanProjection"
Nodes (1): new_PlanProjection

### Community 156 - "20260628103000_add_plan_slug_legacy_identity"
Nodes (1): 20260628103000_add_plan_slug_legacy_identity

### Community 157 - "20260701090000_add_provider_workflow_runs"
Nodes (1): 20260701090000_add_provider_workflow_runs

### Community 158 - "20260701120000_add_provider_registration_settings"
Nodes (1): 20260701120000_add_provider_registration_settings

### Community 159 - "20260708090000_add_test_run_evidence_health"
Nodes (1): 20260708090000_add_test_run_evidence_health

### Community 160 - "20260709090000_add_step_blocks"
Nodes (1): 20260709090000_add_step_blocks

### Community 161 - "20260711120000_add_baseline_attempt_history"
Nodes (1): 20260711120000_add_baseline_attempt_history

### Community 162 - "20260711150000_add_delegated_authorization_nonces"
Nodes (1): 20260711150000_add_delegated_authorization_nonces

### Community 163 - "20260711170000_add_delegated_ast_submissions"
Nodes (1): 20260711170000_add_delegated_ast_submissions

### Community 164 - "20260711190000_add_validation_ast_publish_journal"
Nodes (1): 20260711190000_add_validation_ast_publish_journal

### Community 165 - "20260711220000_add_runtime_capsules"
Nodes (1): 20260711220000_add_runtime_capsules

### Community 166 - "20260712010000_add_runtime_capsule_execution_attempt"
Nodes (1): 20260712010000_add_runtime_capsule_execution_attempt

### Community 167 - "20260712020000_add_test_run_preparation_key"
Nodes (1): 20260712020000_add_test_run_preparation_key

### Community 168 - "20260712180000_add_repository_exports"
Nodes (1): 20260712180000_add_repository_exports

### Community 169 - "20260713143000_add_project_resource_ownership"
Nodes (1): 20260713143000_add_project_resource_ownership

### Community 170 - "20260713153000_add_validation_resource_proposals"
Nodes (1): 20260713153000_add_validation_resource_proposals

### Community 171 - "20260713163000_normalize_managed_validation_vocabulary"
Nodes (1): 20260713163000_normalize_managed_validation_vocabulary

### Community 172 - "20260713173000_add_named_plan_hashes"
Nodes (1): 20260713173000_add_named_plan_hashes

### Community 173 - "20260713183000_add_delegated_coordinator_receipts"
Nodes (1): 20260713183000_add_delegated_coordinator_receipts

### Community 174 - "20260713200000_stage_complete_project_ownership"
Nodes (1): 20260713200000_stage_complete_project_ownership

### Community 175 - "20260713210000_add_target_project_description"
Nodes (1): 20260713210000_add_target_project_description

### Community 176 - "20260713211000_scope_test_run_preparation_key"
Nodes (1): 20260713211000_scope_test_run_preparation_key

### Community 177 - "20260714000000_make_template_library_shared"
Nodes (1): 20260714000000_make_template_library_shared

### Community 178 - "20260714143000_add_validation_review_state_receipt"
Nodes (1): 20260714143000_add_validation_review_state_receipt

### Community 179 - "20260714160500_scope_environment_names_to_project"
Nodes (1): 20260714160500_scope_environment_names_to_project

### Community 180 - "20260716190000_replace_environment_password_with_reference"
Nodes (1): 20260716190000_replace_environment_password_with_reference

### Community 181 - "new_Environment"
Nodes (1): new_Environment

### Community 182 - "20260716210000_add_measured_test_run_pagination_index"
Nodes (1): 20260716210000_add_measured_test_run_pagination_index

### Community 183 - "20260718110000_add_agent_preflight_receipts"
Nodes (1): 20260718110000_add_agent_preflight_receipts

### Community 184 - "20260718160000_add_plan_observability"
Nodes (1): 20260718160000_add_plan_observability

### Community 185 - "20260718193000_add_environment_identity_expectation"
Nodes (1): 20260718193000_add_environment_identity_expectation

### Community 186 - "20260720010000_add_canonical_operation_mappings"
Nodes (1): 20260720010000_add_canonical_operation_mappings

### Community 187 - "20260722013000_scope_locator_group_names_to_project"
Nodes (1): 20260722013000_scope_locator_group_names_to_project

### Community 188 - "20260722190000_add_step_definition_registry"
Nodes (1): 20260722190000_add_step_definition_registry

## Suggested Questions
- Which models are connected to PlanProjection?
- Which migrations introduced coordinator and plan review tables?
- Which models depend on Locator or TestRun?
- Which enums are used by execution report models?
