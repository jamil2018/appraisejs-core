# Graph Report - prisma

## Corpus Check
- 101 files from prisma/schema.prisma and migrations
- Verdict: schema-aware graph generated because Graphify AST extraction does not currently produce Prisma/SQL nodes.

## Summary
- 2314 nodes · 5333 edges · 356 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `String` - 964 edges
2. `schema.prisma` - 270 edges
3. `DateTime` - 196 edges
4. `TargetProject` - 193 edges
5. `QualityJourney` - 143 edges
6. `QualityValidationPublication` - 98 edges
7. `Assessment` - 95 edges
8. `QualityJourneyScenarioPortfolioRevision` - 90 edges
9. `QualityPlanRevision` - 89 edges
10. `QualityJourneyDiscoveryRevision` - 83 edges

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

## Communities (356 total)
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
Nodes (8): StepDefinitionSearchReceipt, StepDefinitionSearchReceipt.id, StepDefinitionSearchReceipt.indexHash, StepDefinitionSearchReceipt.candidateReferencesJson, StepDefinitionSearchReceipt.qualityPlanId, StepDefinitionSearchReceipt.correlationId, StepDefinitionSearchReceipt.searchedAt, StepDefinitionSearchReceipt.expiresAt

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
Nodes (10): StepDefinitionTelemetryEvent, StepDefinitionTelemetryEvent.id, StepDefinitionTelemetryEvent.surface, StepDefinitionTelemetryEvent.outcome, StepDefinitionTelemetryEvent.stepId, StepDefinitionTelemetryEvent.stepVersion, StepDefinitionTelemetryEvent.correlationId, StepDefinitionTelemetryEvent.qualityPlanId (+more)

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
Nodes (30): TestRun, TestRun.id, TestRun.name, TestRun.preparationKey, TestRun.runId, TestRun.startedAt, TestRun.completedAt, TestRun.status (+more)

### Community 31 - "TargetProject"
Nodes (50): TargetProject, TargetProject.id, TargetProject.kind, TargetProject.canonicalIdentity, TargetProject.canonicalPath, TargetProject.normalizedRemoteOrigin, TargetProject.displayName, TargetProject.description (+more)

### Community 32 - "QualityJourney"
Nodes (43): QualityJourney, QualityJourney.id, QualityJourney.targetProjectId, QualityJourney.rootIdempotencyKey, QualityJourney.rootRequestHash, QualityJourney.stage, QualityJourney.status, QualityJourney.activeCycleId (+more)

### Community 33 - "QualityJourneyArtifact"
Nodes (19): QualityJourneyArtifact, QualityJourneyArtifact.id, QualityJourneyArtifact.identityKey, QualityJourneyArtifact.journeyId, QualityJourneyArtifact.targetProjectId, QualityJourneyArtifact.cycleId, QualityJourneyArtifact.kind, QualityJourneyArtifact.artifactId (+more)

### Community 34 - "QualityJourneyAnalysisRevision"
Nodes (27): QualityJourneyAnalysisRevision, QualityJourneyAnalysisRevision.id, QualityJourneyAnalysisRevision.journeyId, QualityJourneyAnalysisRevision.targetProjectId, QualityJourneyAnalysisRevision.cycleId, QualityJourneyAnalysisRevision.artifactRecordId, QualityJourneyAnalysisRevision.artifactId, QualityJourneyAnalysisRevision.artifactRevisionId (+more)

### Community 35 - "QualityJourneyAnalysisQuestion"
Nodes (13): QualityJourneyAnalysisQuestion, QualityJourneyAnalysisQuestion.id, QualityJourneyAnalysisQuestion.journeyId, QualityJourneyAnalysisQuestion.analysisRevisionId, QualityJourneyAnalysisQuestion.artifactRecordId, QualityJourneyAnalysisQuestion.questionId, QualityJourneyAnalysisQuestion.contentHash, QualityJourneyAnalysisQuestion.required (+more)

### Community 36 - "QualityJourneyAnalysisAnswer"
Nodes (17): QualityJourneyAnalysisAnswer, QualityJourneyAnalysisAnswer.id, QualityJourneyAnalysisAnswer.journeyId, QualityJourneyAnalysisAnswer.questionRecordId, QualityJourneyAnalysisAnswer.artifactRecordId, QualityJourneyAnalysisAnswer.answerId, QualityJourneyAnalysisAnswer.contentHash, QualityJourneyAnalysisAnswer.actor (+more)

### Community 37 - "QualityJourneyAnalysisPublication"
Nodes (10): QualityJourneyAnalysisPublication, QualityJourneyAnalysisPublication.id, QualityJourneyAnalysisPublication.journeyId, QualityJourneyAnalysisPublication.analysisRevisionId, QualityJourneyAnalysisPublication.commandId, QualityJourneyAnalysisPublication.artifactHash, QualityJourneyAnalysisPublication.reviewHash, QualityJourneyAnalysisPublication.publishedAt (+more)

### Community 38 - "QualityJourneyAnalysisDecision"
Nodes (15): QualityJourneyAnalysisDecision, QualityJourneyAnalysisDecision.id, QualityJourneyAnalysisDecision.journeyId, QualityJourneyAnalysisDecision.analysisRevisionId, QualityJourneyAnalysisDecision.artifactRecordId, QualityJourneyAnalysisDecision.commandId, QualityJourneyAnalysisDecision.contentHash, QualityJourneyAnalysisDecision.reviewHash (+more)

### Community 39 - "QualityJourneyDiscoveryRevision"
Nodes (52): QualityJourneyDiscoveryRevision, QualityJourneyDiscoveryRevision.id, QualityJourneyDiscoveryRevision.journeyId, QualityJourneyDiscoveryRevision.targetProjectId, QualityJourneyDiscoveryRevision.cycleId, QualityJourneyDiscoveryRevision.analysisRevisionId, QualityJourneyDiscoveryRevision.analysisDecisionId, QualityJourneyDiscoveryRevision.analysisArtifactId (+more)

### Community 40 - "QualityJourneyScenarioPortfolioRevision"
Nodes (43): QualityJourneyScenarioPortfolioRevision, QualityJourneyScenarioPortfolioRevision.id, QualityJourneyScenarioPortfolioRevision.journeyId, QualityJourneyScenarioPortfolioRevision.targetProjectId, QualityJourneyScenarioPortfolioRevision.cycleId, QualityJourneyScenarioPortfolioRevision.discoveryRevisionId, QualityJourneyScenarioPortfolioRevision.discoveryCompletionHash, QualityJourneyScenarioPortfolioRevision.predecessorPortfolioRevisionId (+more)

### Community 41 - "QualityJourneyScenarioRevision"
Nodes (17): QualityJourneyScenarioRevision, QualityJourneyScenarioRevision.id, QualityJourneyScenarioRevision.portfolioRevisionId, QualityJourneyScenarioRevision.stableScenarioId, QualityJourneyScenarioRevision.scenarioRevisionId, QualityJourneyScenarioRevision.behavioralIntentJson, QualityJourneyScenarioRevision.behavioralIntentHash, QualityJourneyScenarioRevision.enrichmentJson (+more)

### Community 42 - "QualityJourneyPreparedRuntimeCapsule"
Nodes (14): QualityJourneyPreparedRuntimeCapsule, QualityJourneyPreparedRuntimeCapsule.id, QualityJourneyPreparedRuntimeCapsule.journeyId, QualityJourneyPreparedRuntimeCapsule.targetProjectId, QualityJourneyPreparedRuntimeCapsule.cycleId, QualityJourneyPreparedRuntimeCapsule.materializationId, QualityJourneyPreparedRuntimeCapsule.inputHash, QualityJourneyPreparedRuntimeCapsule.capsuleHash (+more)

### Community 43 - "QualityJourneyAutomationMaterialization"
Nodes (37): QualityJourneyAutomationMaterialization, QualityJourneyAutomationMaterialization.id, QualityJourneyAutomationMaterialization.journeyId, QualityJourneyAutomationMaterialization.targetProjectId, QualityJourneyAutomationMaterialization.cycleId, QualityJourneyAutomationMaterialization.scenarioRevisionId, QualityJourneyAutomationMaterialization.scenarioContentHash, QualityJourneyAutomationMaterialization.portfolioRevisionId (+more)

### Community 44 - "QualityJourneyAutomationTargetBinding"
Nodes (16): QualityJourneyAutomationTargetBinding, QualityJourneyAutomationTargetBinding.id, QualityJourneyAutomationTargetBinding.journeyId, QualityJourneyAutomationTargetBinding.targetProjectId, QualityJourneyAutomationTargetBinding.semanticHash, QualityJourneyAutomationTargetBinding.suiteId, QualityJourneyAutomationTargetBinding.testCaseId, QualityJourneyAutomationTargetBinding.suiteHash (+more)

### Community 45 - "QualityJourneyAutomationMaterializationBinding"
Nodes (6): QualityJourneyAutomationMaterializationBinding, QualityJourneyAutomationMaterializationBinding.materializationId, QualityJourneyAutomationMaterializationBinding.bindingId, QualityJourneyAutomationMaterializationBinding.createdAt, QualityJourneyAutomationMaterializationBinding.materialization, QualityJourneyAutomationMaterializationBinding.targetBinding

### Community 46 - "QualityJourneyAutomationRequestReceipt"
Nodes (14): QualityJourneyAutomationRequestReceipt, QualityJourneyAutomationRequestReceipt.id, QualityJourneyAutomationRequestReceipt.journeyId, QualityJourneyAutomationRequestReceipt.workItemId, QualityJourneyAutomationRequestReceipt.attemptId, QualityJourneyAutomationRequestReceipt.ownerTokenHash, QualityJourneyAutomationRequestReceipt.idempotencyKey, QualityJourneyAutomationRequestReceipt.requestHash (+more)

### Community 47 - "QualityJourneyScenarioDecision"
Nodes (17): QualityJourneyScenarioDecision, QualityJourneyScenarioDecision.id, QualityJourneyScenarioDecision.portfolioRevisionId, QualityJourneyScenarioDecision.scenarioRevisionId, QualityJourneyScenarioDecision.decision, QualityJourneyScenarioDecision.feedback, QualityJourneyScenarioDecision.actor, QualityJourneyScenarioDecision.idempotencyKey (+more)

### Community 48 - "QualityJourneyScenarioReviewComment"
Nodes (19): QualityJourneyScenarioReviewComment, QualityJourneyScenarioReviewComment.id, QualityJourneyScenarioReviewComment.portfolioRevisionId, QualityJourneyScenarioReviewComment.scenarioRevisionId, QualityJourneyScenarioReviewComment.comment, QualityJourneyScenarioReviewComment.blocking, QualityJourneyScenarioReviewComment.disposition, QualityJourneyScenarioReviewComment.disposedAt (+more)

### Community 49 - "QualityJourneyScenarioDecisionReceipt"
Nodes (10): QualityJourneyScenarioDecisionReceipt, QualityJourneyScenarioDecisionReceipt.id, QualityJourneyScenarioDecisionReceipt.journeyId, QualityJourneyScenarioDecisionReceipt.portfolioRevisionId, QualityJourneyScenarioDecisionReceipt.idempotencyKey, QualityJourneyScenarioDecisionReceipt.requestHash, QualityJourneyScenarioDecisionReceipt.resultJson, QualityJourneyScenarioDecisionReceipt.createdAt (+more)

### Community 50 - "QualityJourneyRevision"
Nodes (8): QualityJourneyRevision, QualityJourneyRevision.id, QualityJourneyRevision.journeyId, QualityJourneyRevision.revision, QualityJourneyRevision.contentJson, QualityJourneyRevision.contentHash, QualityJourneyRevision.createdAt, QualityJourneyRevision.journey

### Community 51 - "QualityJourneyCycle"
Nodes (8): QualityJourneyCycle, QualityJourneyCycle.id, QualityJourneyCycle.journeyId, QualityJourneyCycle.sequence, QualityJourneyCycle.predecessorCycleId, QualityJourneyCycle.scopeJson, QualityJourneyCycle.createdAt, QualityJourneyCycle.journey

### Community 52 - "QualityJourneyCommand"
Nodes (11): QualityJourneyCommand, QualityJourneyCommand.id, QualityJourneyCommand.journeyId, QualityJourneyCommand.targetProjectId, QualityJourneyCommand.idempotencyKey, QualityJourneyCommand.requestHash, QualityJourneyCommand.requestJson, QualityJourneyCommand.resultJson (+more)

### Community 53 - "QualityJourneyEvent"
Nodes (12): QualityJourneyEvent, QualityJourneyEvent.id, QualityJourneyEvent.journeyId, QualityJourneyEvent.targetProjectId, QualityJourneyEvent.sequence, QualityJourneyEvent.eventType, QualityJourneyEvent.commandId, QualityJourneyEvent.predecessorStateHash (+more)

### Community 54 - "QualityJourneyWorkItem"
Nodes (26): QualityJourneyWorkItem, QualityJourneyWorkItem.id, QualityJourneyWorkItem.journeyId, QualityJourneyWorkItem.targetProjectId, QualityJourneyWorkItem.cycleId, QualityJourneyWorkItem.role, QualityJourneyWorkItem.status, QualityJourneyWorkItem.inputHash (+more)

### Community 55 - "QualityJourneyWorkAuthorization"
Nodes (25): QualityJourneyWorkAuthorization, QualityJourneyWorkAuthorization.id, QualityJourneyWorkAuthorization.journeyId, QualityJourneyWorkAuthorization.targetProjectId, QualityJourneyWorkAuthorization.workItemId, QualityJourneyWorkAuthorization.supersedesAuthorizationId, QualityJourneyWorkAuthorization.role, QualityJourneyWorkAuthorization.roleContractDigest (+more)

### Community 56 - "QualityJourneyWorkAttempt"
Nodes (42): QualityJourneyWorkAttempt, QualityJourneyWorkAttempt.id, QualityJourneyWorkAttempt.workItemId, QualityJourneyWorkAttempt.attempt, QualityJourneyWorkAttempt.status, QualityJourneyWorkAttempt.leaseId, QualityJourneyWorkAttempt.ownerTokenHash, QualityJourneyWorkAttempt.leaseExpiresAt (+more)

### Community 57 - "QualityJourneyBlocker"
Nodes (16): QualityJourneyBlocker, QualityJourneyBlocker.id, QualityJourneyBlocker.journeyId, QualityJourneyBlocker.targetProjectId, QualityJourneyBlocker.reasonCode, QualityJourneyBlocker.summary, QualityJourneyBlocker.evidenceJson, QualityJourneyBlocker.responsibleActor (+more)

### Community 58 - "QualityJourneyArtifactLink"
Nodes (11): QualityJourneyArtifactLink, QualityJourneyArtifactLink.id, QualityJourneyArtifactLink.journeyId, QualityJourneyArtifactLink.targetProjectId, QualityJourneyArtifactLink.cycleId, QualityJourneyArtifactLink.relation, QualityJourneyArtifactLink.sourceJson, QualityJourneyArtifactLink.targetJson (+more)

### Community 59 - "AssessmentPreparation"
Nodes (14): AssessmentPreparation, AssessmentPreparation.id, AssessmentPreparation.targetProjectId, AssessmentPreparation.idempotencyKey, AssessmentPreparation.inputHash, AssessmentPreparation.qualityPlanId, AssessmentPreparation.qualityPlanRevisionId, AssessmentPreparation.expectedDesignHash (+more)

### Community 60 - "AgentPreflightReceipt"
Nodes (15): AgentPreflightReceipt, AgentPreflightReceipt.id, AgentPreflightReceipt.coordinatorId, AgentPreflightReceipt.schemaVersion, AgentPreflightReceipt.status, AgentPreflightReceipt.ready, AgentPreflightReceipt.snapshotHash, AgentPreflightReceipt.snapshotJson (+more)

### Community 61 - "LifecycleCertificationReceipt"
Nodes (9): LifecycleCertificationReceipt, LifecycleCertificationReceipt.id, LifecycleCertificationReceipt.schemaVersion, LifecycleCertificationReceipt.status, LifecycleCertificationReceipt.matrixHash, LifecycleCertificationReceipt.matrixJson, LifecycleCertificationReceipt.durationMs, LifecycleCertificationReceipt.gitCommit (+more)

### Community 62 - "ProjectResourceOwnership"
Nodes (13): ProjectResourceOwnership, ProjectResourceOwnership.id, ProjectResourceOwnership.entityType, ProjectResourceOwnership.entityId, ProjectResourceOwnership.scope, ProjectResourceOwnership.targetProjectId, ProjectResourceOwnership.origin, ProjectResourceOwnership.provenanceJson (+more)

### Community 63 - "ProjectResourceImport"
Nodes (11): ProjectResourceImport, ProjectResourceImport.id, ProjectResourceImport.sourceOwnershipId, ProjectResourceImport.destinationProjectId, ProjectResourceImport.sharingMode, ProjectResourceImport.sourceContentHash, ProjectResourceImport.actor, ProjectResourceImport.propagationPolicy (+more)

### Community 64 - "ResourceScope"
Nodes (7): ResourceScope, ResourceScope.system, ResourceScope.global_library, ResourceScope.project, ResourceScope.publication, ResourceScope.runtime, ResourceScope.quarantined

### Community 65 - "ResourceSharingMode"
Nodes (3): ResourceSharingMode, ResourceSharingMode.immutable_reference, ResourceSharingMode.copy

### Community 66 - "RuntimeCapsule"
Nodes (19): RuntimeCapsule, RuntimeCapsule.id, RuntimeCapsule.targetProjectId, RuntimeCapsule.testRunId, RuntimeCapsule.validationHash, RuntimeCapsule.qualityPublicationId, RuntimeCapsule.capsuleHash, RuntimeCapsule.manifestHash (+more)

### Community 67 - "RuntimeCapsuleExecutionAttempt"
Nodes (18): RuntimeCapsuleExecutionAttempt, RuntimeCapsuleExecutionAttempt.id, RuntimeCapsuleExecutionAttempt.testRunId, RuntimeCapsuleExecutionAttempt.capsuleId, RuntimeCapsuleExecutionAttempt.receiptHash, RuntimeCapsuleExecutionAttempt.preflightResultJson, RuntimeCapsuleExecutionAttempt.preflightResultHash, RuntimeCapsuleExecutionAttempt.preflightCheckedAt (+more)

### Community 68 - "RuntimeCapsuleExecutionAttemptState"
Nodes (8): RuntimeCapsuleExecutionAttemptState, RuntimeCapsuleExecutionAttemptState.PREPARED, RuntimeCapsuleExecutionAttemptState.STARTING, RuntimeCapsuleExecutionAttemptState.RUNNING, RuntimeCapsuleExecutionAttemptState.COMPLETED, RuntimeCapsuleExecutionAttemptState.FAILED, RuntimeCapsuleExecutionAttemptState.CANCELLED, RuntimeCapsuleExecutionAttemptState.INTERRUPTED

### Community 69 - "RuntimeCapsuleBlob"
Nodes (12): RuntimeCapsuleBlob, RuntimeCapsuleBlob.id, RuntimeCapsuleBlob.targetProjectId, RuntimeCapsuleBlob.contentHash, RuntimeCapsuleBlob.size, RuntimeCapsuleBlob.storagePath, RuntimeCapsuleBlob.integrityState, RuntimeCapsuleBlob.version (+more)

### Community 70 - "RuntimeCapsuleBlobReference"
Nodes (7): RuntimeCapsuleBlobReference, RuntimeCapsuleBlobReference.id, RuntimeCapsuleBlobReference.capsuleId, RuntimeCapsuleBlobReference.blobId, RuntimeCapsuleBlobReference.filePath, RuntimeCapsuleBlobReference.capsule, RuntimeCapsuleBlobReference.blob

### Community 71 - "RuntimeCapsuleIntegrityState"
Nodes (5): RuntimeCapsuleIntegrityState, RuntimeCapsuleIntegrityState.staging, RuntimeCapsuleIntegrityState.ready, RuntimeCapsuleIntegrityState.missing, RuntimeCapsuleIntegrityState.corrupt

### Community 72 - "RuntimeCapsuleLease"
Nodes (11): RuntimeCapsuleLease, RuntimeCapsuleLease.id, RuntimeCapsuleLease.targetProjectId, RuntimeCapsuleLease.validationHash, RuntimeCapsuleLease.runId, RuntimeCapsuleLease.ownerToken, RuntimeCapsuleLease.leaseExpiresAt, RuntimeCapsuleLease.version (+more)

### Community 73 - "TestRunLog"
Nodes (7): TestRunLog, TestRunLog.id, TestRunLog.testRunId, TestRunLog.logs, TestRunLog.createdAt, TestRunLog.updatedAt, TestRunLog.testRun

### Community 74 - "EnvironmentCredentialState"
Nodes (3): EnvironmentCredentialState, EnvironmentCredentialState.NONE, EnvironmentCredentialState.REFERENCE_CONFIGURED

### Community 75 - "CredentialExecutionAuthorizationIssuer"
Nodes (3): CredentialExecutionAuthorizationIssuer, CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION, CredentialExecutionAuthorizationIssuer.HOST_ASSERTION

### Community 76 - "Environment"
Nodes (16): Environment, Environment.id, Environment.name, Environment.baseUrl, Environment.expectedPageTitle, Environment.apiBaseUrl, Environment.username, Environment.passwordEnvironmentVariable (+more)

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

### Community 90 - "QualityPlan"
Nodes (10): QualityPlan, QualityPlan.id, QualityPlan.targetProjectId, QualityPlan.title, QualityPlan.description, QualityPlan.createdAt, QualityPlan.updatedAt, QualityPlan.targetProject (+more)

### Community 91 - "QualityPlanRevision"
Nodes (30): QualityPlanRevision, QualityPlanRevision.id, QualityPlanRevision.targetProjectId, QualityPlanRevision.qualityPlanId, QualityPlanRevision.revision, QualityPlanRevision.status, QualityPlanRevision.approvedAt, QualityPlanRevision.contentHash (+more)

### Community 92 - "RequirementAnalysisRevision"
Nodes (21): RequirementAnalysisRevision, RequirementAnalysisRevision.id, RequirementAnalysisRevision.targetProjectId, RequirementAnalysisRevision.qualityPlanRevisionId, RequirementAnalysisRevision.revision, RequirementAnalysisRevision.status, RequirementAnalysisRevision.decision, RequirementAnalysisRevision.analysisJson (+more)

### Community 93 - "RequirementSnapshot"
Nodes (10): RequirementSnapshot, RequirementSnapshot.id, RequirementSnapshot.qualityPlanRevisionId, RequirementSnapshot.externalRef, RequirementSnapshot.text, RequirementSnapshot.kind, RequirementSnapshot.contentHash, RequirementSnapshot.createdAt (+more)

### Community 94 - "RequirementQuery"
Nodes (10): RequirementQuery, RequirementQuery.id, RequirementQuery.qualityPlanRevisionId, RequirementQuery.prompt, RequirementQuery.status, RequirementQuery.answer, RequirementQuery.rationale, RequirementQuery.createdAt (+more)

### Community 95 - "QualityObligationRevision"
Nodes (17): QualityObligationRevision, QualityObligationRevision.id, QualityObligationRevision.qualityPlanRevisionId, QualityObligationRevision.requirementAnalysisRevisionId, QualityObligationRevision.requirementSnapshotId, QualityObligationRevision.title, QualityObligationRevision.intent, QualityObligationRevision.assertionScopeJson (+more)

### Community 96 - "ValidationDesignRevision"
Nodes (23): ValidationDesignRevision, ValidationDesignRevision.id, ValidationDesignRevision.targetProjectId, ValidationDesignRevision.qualityPlanRevisionId, ValidationDesignRevision.requirementAnalysisRevisionId, ValidationDesignRevision.revision, ValidationDesignRevision.status, ValidationDesignRevision.decision (+more)

### Community 97 - "ValidationVersion"
Nodes (29): ValidationVersion, ValidationVersion.id, ValidationVersion.targetProjectId, ValidationVersion.qualityPlanRevisionId, ValidationVersion.validationDesignRevisionId, ValidationVersion.validationIdentity, ValidationVersion.version, ValidationVersion.status (+more)

### Community 98 - "QualityValidationGeneration"
Nodes (25): QualityValidationGeneration, QualityValidationGeneration.id, QualityValidationGeneration.generationKey, QualityValidationGeneration.targetProjectId, QualityValidationGeneration.qualityPlanRevisionId, QualityValidationGeneration.validationVersionId, QualityValidationGeneration.artifactSchemaVersion, QualityValidationGeneration.preflightAlgorithmVersion (+more)

### Community 99 - "QualityValidationPublication"
Nodes (44): QualityValidationPublication, QualityValidationPublication.id, QualityValidationPublication.generationId, QualityValidationPublication.targetProjectId, QualityValidationPublication.targetFingerprint, QualityValidationPublication.qualityPlanRevisionId, QualityValidationPublication.validationVersionId, QualityValidationPublication.idempotencyKey (+more)

### Community 100 - "QualityValidationPublicationCommandReceipt"
Nodes (11): QualityValidationPublicationCommandReceipt, QualityValidationPublicationCommandReceipt.id, QualityValidationPublicationCommandReceipt.targetProjectId, QualityValidationPublicationCommandReceipt.idempotencyKey, QualityValidationPublicationCommandReceipt.requestHash, QualityValidationPublicationCommandReceipt.generationKey, QualityValidationPublicationCommandReceipt.operationHash, QualityValidationPublicationCommandReceipt.publicationId (+more)

### Community 101 - "QualityValidationExtensionReview"
Nodes (11): QualityValidationExtensionReview, QualityValidationExtensionReview.id, QualityValidationExtensionReview.publicationId, QualityValidationExtensionReview.extensionId, QualityValidationExtensionReview.version, QualityValidationExtensionReview.sourceHash, QualityValidationExtensionReview.compiledHash, QualityValidationExtensionReview.artifactHash (+more)

### Community 102 - "ObligationValidationVersion"
Nodes (9): ObligationValidationVersion, ObligationValidationVersion.id, ObligationValidationVersion.qualityPlanRevisionId, ObligationValidationVersion.qualityObligationRevisionId, ObligationValidationVersion.validationVersionId, ObligationValidationVersion.coverageIntentJson, ObligationValidationVersion.createdAt, ObligationValidationVersion.obligation (+more)

### Community 103 - "EvaluationSubjectRevision"
Nodes (12): EvaluationSubjectRevision, EvaluationSubjectRevision.id, EvaluationSubjectRevision.subjectDigest, EvaluationSubjectRevision.subjectKind, EvaluationSubjectRevision.authority, EvaluationSubjectRevision.metadataJson, EvaluationSubjectRevision.createdAt, EvaluationSubjectRevision.assessments (+more)

### Community 104 - "RemoteEvaluationScopeBinding"
Nodes (32): RemoteEvaluationScopeBinding, RemoteEvaluationScopeBinding.id, RemoteEvaluationScopeBinding.evaluationSubjectRevisionId, RemoteEvaluationScopeBinding.targetProjectId, RemoteEvaluationScopeBinding.qualityPlanId, RemoteEvaluationScopeBinding.qualityPlanRevisionId, RemoteEvaluationScopeBinding.environmentId, RemoteEvaluationScopeBinding.scopeHash (+more)

### Community 105 - "RemoteEvaluationScopePartitionManifest"
Nodes (14): RemoteEvaluationScopePartitionManifest, RemoteEvaluationScopePartitionManifest.id, RemoteEvaluationScopePartitionManifest.targetProjectId, RemoteEvaluationScopePartitionManifest.qualityPlanId, RemoteEvaluationScopePartitionManifest.qualityPlanRevisionId, RemoteEvaluationScopePartitionManifest.designHash, RemoteEvaluationScopePartitionManifest.coverageHash, RemoteEvaluationScopePartitionManifest.manifestHash (+more)

### Community 106 - "RemoteEvaluationScopePartition"
Nodes (12): RemoteEvaluationScopePartition, RemoteEvaluationScopePartition.id, RemoteEvaluationScopePartition.manifestId, RemoteEvaluationScopePartition.partitionKey, RemoteEvaluationScopePartition.environmentId, RemoteEvaluationScopePartition.remoteEvaluationScopeBindingId, RemoteEvaluationScopePartition.validationVersionIdsJson, RemoteEvaluationScopePartition.validationBindingsHash (+more)

### Community 107 - "RemoteEvaluationScopeIssuance"
Nodes (9): RemoteEvaluationScopeIssuance, RemoteEvaluationScopeIssuance.id, RemoteEvaluationScopeIssuance.targetProjectId, RemoteEvaluationScopeIssuance.idempotencyKey, RemoteEvaluationScopeIssuance.requestHash, RemoteEvaluationScopeIssuance.evaluationSubjectRevisionId, RemoteEvaluationScopeIssuance.createdAt, RemoteEvaluationScopeIssuance.targetProject (+more)

### Community 108 - "Assessment"
Nodes (38): Assessment, Assessment.id, Assessment.targetProjectId, Assessment.qualityPlanId, Assessment.qualityPlanRevisionId, Assessment.evaluationSubjectRevisionId, Assessment.status, Assessment.alignment (+more)

### Community 109 - "ExecutionConsent"
Nodes (19): ExecutionConsent, ExecutionConsent.id, ExecutionConsent.targetProjectId, ExecutionConsent.assessmentId, ExecutionConsent.executionManifestHash, ExecutionConsent.mode, ExecutionConsent.status, ExecutionConsent.scopeJson (+more)

### Community 110 - "AssessmentRun"
Nodes (25): AssessmentRun, AssessmentRun.id, AssessmentRun.targetProjectId, AssessmentRun.assessmentId, AssessmentRun.qualityPlanRevisionId, AssessmentRun.evaluationSubjectRevisionId, AssessmentRun.idempotencyScope, AssessmentRun.idempotencyKey (+more)

### Community 111 - "AssessmentExecutionRequest"
Nodes (24): AssessmentExecutionRequest, AssessmentExecutionRequest.id, AssessmentExecutionRequest.targetProjectId, AssessmentExecutionRequest.assessmentId, AssessmentExecutionRequest.qualityPlanId, AssessmentExecutionRequest.qualityPlanRevisionId, AssessmentExecutionRequest.evaluationSubjectRevisionId, AssessmentExecutionRequest.subjectDigest (+more)

### Community 112 - "AssessmentExecutionCredentialBinding"
Nodes (5): AssessmentExecutionCredentialBinding, AssessmentExecutionCredentialBinding.requestId, AssessmentExecutionCredentialBinding.slot, AssessmentExecutionCredentialBinding.reference, AssessmentExecutionCredentialBinding.request

### Community 113 - "CredentialAuthorizationUiSession"
Nodes (10): CredentialAuthorizationUiSession, CredentialAuthorizationUiSession.id, CredentialAuthorizationUiSession.sessionTokenHash, CredentialAuthorizationUiSession.csrfTokenHash, CredentialAuthorizationUiSession.targetProjectId, CredentialAuthorizationUiSession.expiresAt, CredentialAuthorizationUiSession.revokedAt, CredentialAuthorizationUiSession.createdAt (+more)

### Community 114 - "AssessmentExecutionAuthorizationGrant"
Nodes (18): AssessmentExecutionAuthorizationGrant, AssessmentExecutionAuthorizationGrant.id, AssessmentExecutionAuthorizationGrant.requestId, AssessmentExecutionAuthorizationGrant.issuerKind, AssessmentExecutionAuthorizationGrant.localUiSessionId, AssessmentExecutionAuthorizationGrant.hostIssuer, AssessmentExecutionAuthorizationGrant.hostKeyId, AssessmentExecutionAuthorizationGrant.hostAssertionJti (+more)

### Community 115 - "AssessmentRunBinding"
Nodes (26): AssessmentRunBinding, AssessmentRunBinding.id, AssessmentRunBinding.assessmentRunId, AssessmentRunBinding.targetProjectId, AssessmentRunBinding.qualityPlanRevisionId, AssessmentRunBinding.validationVersionId, AssessmentRunBinding.resultMatrixCell, AssessmentRunBinding.testRunId (+more)

### Community 116 - "AssessmentRunPublicationCheckpoint"
Nodes (16): AssessmentRunPublicationCheckpoint, AssessmentRunPublicationCheckpoint.id, AssessmentRunPublicationCheckpoint.assessmentRunId, AssessmentRunPublicationCheckpoint.targetProjectId, AssessmentRunPublicationCheckpoint.qualityPlanRevisionId, AssessmentRunPublicationCheckpoint.validationVersionId, AssessmentRunPublicationCheckpoint.generationId, AssessmentRunPublicationCheckpoint.publicationId (+more)

### Community 117 - "EvidenceReceipt"
Nodes (32): EvidenceReceipt, EvidenceReceipt.id, EvidenceReceipt.targetProjectId, EvidenceReceipt.qualityPlanRevisionId, EvidenceReceipt.assessmentId, EvidenceReceipt.validationVersionId, EvidenceReceipt.evaluationSubjectRevisionId, EvidenceReceipt.resultMatrixCell (+more)

### Community 118 - "AssessmentDecision"
Nodes (9): AssessmentDecision, AssessmentDecision.id, AssessmentDecision.assessmentId, AssessmentDecision.decision, AssessmentDecision.rationale, AssessmentDecision.decidedBy, AssessmentDecision.decidedAt, AssessmentDecision.decisionHash (+more)

### Community 119 - "AssessmentFinding"
Nodes (21): AssessmentFinding, AssessmentFinding.id, AssessmentFinding.assessmentId, AssessmentFinding.targetProjectId, AssessmentFinding.qualityPlanRevisionId, AssessmentFinding.qualityObligationRevisionId, AssessmentFinding.outcome, AssessmentFinding.attribution (+more)

### Community 120 - "AssessmentFindingEvidenceReceipt"
Nodes (6): AssessmentFindingEvidenceReceipt, AssessmentFindingEvidenceReceipt.assessmentFindingId, AssessmentFindingEvidenceReceipt.evidenceReceiptId, AssessmentFindingEvidenceReceipt.createdAt, AssessmentFindingEvidenceReceipt.assessmentFinding, AssessmentFindingEvidenceReceipt.evidenceReceipt

### Community 121 - "RequirementDriftReport"
Nodes (12): RequirementDriftReport, RequirementDriftReport.id, RequirementDriftReport.qualityPlanId, RequirementDriftReport.qualityPlanRevisionId, RequirementDriftReport.successorRevisionId, RequirementDriftReport.status, RequirementDriftReport.impactTraversalJson, RequirementDriftReport.proposedDispositionJson (+more)

### Community 122 - "TagType"
Nodes (3): TagType, TagType.IDENTIFIER, TagType.FILTER

### Community 123 - "TargetProjectKind"
Nodes (3): TargetProjectKind, TargetProjectKind.LOCAL_WORKSPACE, TargetProjectKind.REMOTE_BLACK_BOX

### Community 124 - "ExecutionConsentMode"
Nodes (4): ExecutionConsentMode, ExecutionConsentMode.ALWAYS_ASK, ExecutionConsentMode.RISK_AWARE, ExecutionConsentMode.TRUSTED_AGENT

### Community 125 - "ExecutionConsentStatus"
Nodes (6): ExecutionConsentStatus, ExecutionConsentStatus.REQUESTED, ExecutionConsentStatus.GRANTED, ExecutionConsentStatus.CONSUMED, ExecutionConsentStatus.EXPIRED, ExecutionConsentStatus.REVOKED

### Community 126 - "TestRunIntent"
Nodes (3): TestRunIntent, TestRunIntent.INDEPENDENT, TestRunIntent.ASSESSMENT

### Community 127 - "TestRunStatus"
Nodes (6): TestRunStatus, TestRunStatus.QUEUED, TestRunStatus.RUNNING, TestRunStatus.CANCELLING, TestRunStatus.COMPLETED, TestRunStatus.CANCELLED

### Community 128 - "TestRunTestCaseStatus"
Nodes (5): TestRunTestCaseStatus, TestRunTestCaseStatus.PENDING, TestRunTestCaseStatus.RUNNING, TestRunTestCaseStatus.COMPLETED, TestRunTestCaseStatus.CANCELLED

### Community 129 - "TestRunTestCaseResult"
Nodes (4): TestRunTestCaseResult, TestRunTestCaseResult.PASSED, TestRunTestCaseResult.FAILED, TestRunTestCaseResult.UNTESTED

### Community 130 - "TestRunResult"
Nodes (6): TestRunResult, TestRunResult.PENDING, TestRunResult.PASSED, TestRunResult.FAILED, TestRunResult.BLOCKED, TestRunResult.CANCELLED

### Community 131 - "TestRunEvidenceHealth"
Nodes (9): TestRunEvidenceHealth, TestRunEvidenceHealth.valid, TestRunEvidenceHealth.invalid_empty_run, TestRunEvidenceHealth.invalid_missing_test_cases, TestRunEvidenceHealth.invalid_missing_report, TestRunEvidenceHealth.invalid_placeholder_binary, TestRunEvidenceHealth.invalid_unmatched_scenarios, TestRunEvidenceHealth.invalid_stale_runtime (+more)

### Community 132 - "Role"
Nodes (4): Role, Role.ADMIN, Role.TESTER, Role.REVIEWER

### Community 133 - "ReviewStatus"
Nodes (4): ReviewStatus, ReviewStatus.PENDING, ReviewStatus.APPROVED, ReviewStatus.CHANGES_REQUESTED

### Community 134 - "TestCaseStatus"
Nodes (4): TestCaseStatus, TestCaseStatus.PENDING, TestCaseStatus.IN_PROGRESS, TestCaseStatus.COMPLETED

### Community 135 - "TestCaseResult"
Nodes (7): TestCaseResult, TestCaseResult.PASSED, TestCaseResult.FAILED, TestCaseResult.BLOCKED, TestCaseResult.SKIPPED, TestCaseResult.RETEST, TestCaseResult.UNTESTED

### Community 136 - "StepType"
Nodes (3): StepType, StepType.ACTION, StepType.ASSERTION

### Community 137 - "StepParameterType"
Nodes (6): StepParameterType, StepParameterType.NUMBER, StepParameterType.STRING, StepParameterType.DATE, StepParameterType.BOOLEAN, StepParameterType.LOCATOR

### Community 138 - "StepParameterValueType"
Nodes (4): StepParameterValueType, StepParameterValueType.STRING, StepParameterValueType.NUMBER, StepParameterValueType.LOCATOR

### Community 139 - "StepIcon"
Nodes (13): StepIcon, StepIcon.MOUSE, StepIcon.NAVIGATION, StepIcon.INPUT, StepIcon.DOWNLOAD, StepIcon.API, StepIcon.STORE, StepIcon.FORMAT (+more)

### Community 140 - "BrowserEngine"
Nodes (4): BrowserEngine, BrowserEngine.CHROMIUM, BrowserEngine.FIREFOX, BrowserEngine.WEBKIT

### Community 141 - "StepGroupType"
Nodes (3): StepGroupType, StepGroupType.ACTION, StepGroupType.VALIDATION

### Community 142 - "EntityType"
Nodes (2): EntityType, EntityType.LOCATOR

### Community 143 - "ConflictType"
Nodes (3): ConflictType, ConflictType.DUPLICATE_NAME, ConflictType.DUPLICATE_VALUE

### Community 144 - "StepStatus"
Nodes (6): StepStatus, StepStatus.PASSED, StepStatus.FAILED, StepStatus.SKIPPED, StepStatus.PENDING, StepStatus.UNDEFINED

### Community 145 - "StepKeyword"
Nodes (8): StepKeyword, StepKeyword.GIVEN, StepKeyword.WHEN, StepKeyword.THEN, StepKeyword.AND, StepKeyword.BUT, StepKeyword.BEFORE, StepKeyword.AFTER

### Community 146 - "QualityPlanRevisionStatus"
Nodes (8): QualityPlanRevisionStatus, QualityPlanRevisionStatus.DRAFT, QualityPlanRevisionStatus.REQUIREMENT_REVIEW, QualityPlanRevisionStatus.REQUIREMENTS_APPROVED, QualityPlanRevisionStatus.SCENARIO_REVIEW, QualityPlanRevisionStatus.SCENARIOS_APPROVED, QualityPlanRevisionStatus.REALIZED, QualityPlanRevisionStatus.SUPERSEDED

### Community 147 - "RequirementAnalysisRevisionStatus"
Nodes (5): RequirementAnalysisRevisionStatus, RequirementAnalysisRevisionStatus.DRAFT, RequirementAnalysisRevisionStatus.IN_REVIEW, RequirementAnalysisRevisionStatus.APPROVED, RequirementAnalysisRevisionStatus.SUPERSEDED

### Community 148 - "RequirementAnalysisDecision"
Nodes (5): RequirementAnalysisDecision, RequirementAnalysisDecision.PENDING, RequirementAnalysisDecision.APPROVED, RequirementAnalysisDecision.NEEDS_REVISION, RequirementAnalysisDecision.REJECTED

### Community 149 - "RequirementSnapshotKind"
Nodes (6): RequirementSnapshotKind, RequirementSnapshotKind.FUNCTIONAL, RequirementSnapshotKind.DATA, RequirementSnapshotKind.QUALITY, RequirementSnapshotKind.VALIDATION, RequirementSnapshotKind.CONSTRAINT

### Community 150 - "RequirementQueryStatus"
Nodes (5): RequirementQueryStatus, RequirementQueryStatus.BLOCKING, RequirementQueryStatus.DEFERRED, RequirementQueryStatus.ACCEPTED_ASSUMPTION, RequirementQueryStatus.ANSWERED

### Community 151 - "AssuranceLevel"
Nodes (5): AssuranceLevel, AssuranceLevel.SMOKE, AssuranceLevel.STANDARD, AssuranceLevel.HIGH, AssuranceLevel.EXHAUSTIVE

### Community 152 - "ValidationVersionStatus"
Nodes (6): ValidationVersionStatus, ValidationVersionStatus.DESIGNED, ValidationVersionStatus.SCENARIO_APPROVED, ValidationVersionStatus.REALIZED, ValidationVersionStatus.PUBLISHED, ValidationVersionStatus.BLOCKED

### Community 153 - "ValidationDesignRevisionStatus"
Nodes (5): ValidationDesignRevisionStatus, ValidationDesignRevisionStatus.DRAFT, ValidationDesignRevisionStatus.IN_REVIEW, ValidationDesignRevisionStatus.APPROVED, ValidationDesignRevisionStatus.SUPERSEDED

### Community 154 - "ValidationDesignDecision"
Nodes (5): ValidationDesignDecision, ValidationDesignDecision.PENDING, ValidationDesignDecision.APPROVED, ValidationDesignDecision.NEEDS_REVISION, ValidationDesignDecision.REJECTED

### Community 155 - "ValidationReuseOutcome"
Nodes (6): ValidationReuseOutcome, ValidationReuseOutcome.EXACT_MATCH, ValidationReuseOutcome.COMPATIBLE_REUSE, ValidationReuseOutcome.VERSION_REQUIRED, ValidationReuseOutcome.NO_MATCH, ValidationReuseOutcome.AMBIGUOUS

### Community 156 - "EvaluationSubjectKind"
Nodes (4): EvaluationSubjectKind, EvaluationSubjectKind.ARTIFACT, EvaluationSubjectKind.DEPLOYMENT_SNAPSHOT, EvaluationSubjectKind.REMOTE_EVALUATION_SCOPE

### Community 157 - "AssessmentStatus"
Nodes (8): AssessmentStatus, AssessmentStatus.CREATED, AssessmentStatus.READY, AssessmentStatus.RUNNING, AssessmentStatus.EVIDENCE_REVIEW, AssessmentStatus.DECIDED, AssessmentStatus.STALE, AssessmentStatus.CANCELLED

### Community 158 - "AssessmentRunStatus"
Nodes (6): AssessmentRunStatus, AssessmentRunStatus.PREPARED, AssessmentRunStatus.RUNNING, AssessmentRunStatus.STOP_REQUESTED, AssessmentRunStatus.COMPLETED, AssessmentRunStatus.STOPPED

### Community 159 - "RequirementAlignmentStatus"
Nodes (4): RequirementAlignmentStatus, RequirementAlignmentStatus.CURRENT, RequirementAlignmentStatus.DRIFT_DETECTED, RequirementAlignmentStatus.REVISION_REQUIRED

### Community 160 - "EvidenceOutcome"
Nodes (5): EvidenceOutcome, EvidenceOutcome.PASSED, EvidenceOutcome.FAILED, EvidenceOutcome.BLOCKED, EvidenceOutcome.INCONCLUSIVE

### Community 161 - "ObligationFindingOutcome"
Nodes (4): ObligationFindingOutcome, ObligationFindingOutcome.SATISFIED, ObligationFindingOutcome.VIOLATED, ObligationFindingOutcome.NOT_EVALUATED

### Community 162 - "FindingReviewStatus"
Nodes (5): FindingReviewStatus, FindingReviewStatus.PENDING, FindingReviewStatus.APPROVED, FindingReviewStatus.NEEDS_REVISION, FindingReviewStatus.REJECTED

### Community 163 - "FailureAttribution"
Nodes (10): FailureAttribution, FailureAttribution.NOT_APPLICABLE, FailureAttribution.TARGET_DEFECT, FailureAttribution.REQUIREMENT_AMBIGUITY, FailureAttribution.VALIDATION_DESIGN_DEFECT, FailureAttribution.VALIDATION_REALIZATION_DEFECT, FailureAttribution.APPRAISE_RUNTIME_DEFECT, FailureAttribution.ENVIRONMENT_OR_DATA_DEFECT (+more)

### Community 164 - "AssessmentDecisionOutcome"
Nodes (5): AssessmentDecisionOutcome, AssessmentDecisionOutcome.ACCEPTED, AssessmentDecisionOutcome.REJECTED, AssessmentDecisionOutcome.ACCEPTED_WITH_LIMITATIONS, AssessmentDecisionOutcome.NEEDS_REVISION

### Community 165 - "RequirementDriftStatus"
Nodes (4): RequirementDriftStatus, RequirementDriftStatus.PROPOSED, RequirementDriftStatus.APPROVED, RequirementDriftStatus.SUPERSEDED

### Community 166 - "QualityJourneyStage"
Nodes (12): QualityJourneyStage, QualityJourneyStage.INTAKE, QualityJourneyStage.ANALYSIS, QualityJourneyStage.ANALYSIS_REVIEW, QualityJourneyStage.DISCOVERY, QualityJourneyStage.SCENARIO_DESIGN, QualityJourneyStage.SCENARIO_REVIEW, QualityJourneyStage.AUTOMATION (+more)

### Community 167 - "QualityJourneyRole"
Nodes (7): QualityJourneyRole, QualityJourneyRole.REQUIREMENT_ANALYZER, QualityJourneyRole.SCOUT, QualityJourneyRole.RESOURCE_EXPLORER, QualityJourneyRole.TEST_SCENARIO_DESIGNER, QualityJourneyRole.AUTOMATOR, QualityJourneyRole.TRIAGER

### Community 168 - "QualityJourneyWorkItemStatus"
Nodes (18): QualityJourneyWorkItemStatus, QualityJourneyWorkItemStatus.ELIGIBLE, QualityJourneyWorkItemStatus.WORK_ITEM_ISSUED, QualityJourneyWorkItemStatus.WORKER_REQUESTED, QualityJourneyWorkItemStatus.WORKER_STARTED, QualityJourneyWorkItemStatus.IN_PROGRESS, QualityJourneyWorkItemStatus.QUESTION_RAISED, QualityJourneyWorkItemStatus.WAITING_FOR_INPUT (+more)

### Community 169 - "String"
Nodes (1): String

### Community 170 - "DateTime"
Nodes (1): DateTime

### Community 171 - "Int"
Nodes (1): Int

### Community 172 - "Boolean"
Nodes (1): Boolean

### Community 173 - "Float"
Nodes (1): Float

### Community 174 - "20251026202316_migrate_back_to_sqlite"
Nodes (1): 20251026202316_migrate_back_to_sqlite

### Community 175 - "TemplateStep"
Nodes (1): TemplateStep

### Community 176 - "TemplateStepGroup"
Nodes (1): TemplateStepGroup

### Community 177 - "TemplateStepParameter"
Nodes (1): TemplateStepParameter

### Community 178 - "_TagToTestRun"
Nodes (1): _TagToTestRun

### Community 179 - "_TestSuiteTestCases"
Nodes (1): _TestSuiteTestCases

### Community 180 - "20251104113456_add_type_for_template_step_groups"
Nodes (1): 20251104113456_add_type_for_template_step_groups

### Community 181 - "new_TemplateStepGroup"
Nodes (1): new_TemplateStepGroup

### Community 182 - "20251104170946_add_tags_to_test_suite_and_test_case"
Nodes (1): 20251104170946_add_tags_to_test_suite_and_test_case

### Community 183 - "_TagToTestCase"
Nodes (1): _TagToTestCase

### Community 184 - "_TagToTestSuite"
Nodes (1): _TagToTestSuite

### Community 185 - "20251112190024_add_cascade_delete_to_test_run_test_case"
Nodes (1): 20251112190024_add_cascade_delete_to_test_run_test_case

### Community 186 - "new_TestRunTestCase"
Nodes (1): new_TestRunTestCase

### Community 187 - "20251113181100_add_test_run_log"
Nodes (1): 20251113181100_add_test_run_log

### Community 188 - "20251119191838_add_tag_type"
Nodes (1): 20251119191838_add_tag_type

### Community 189 - "new_Tag"
Nodes (1): new_Tag

### Community 190 - "20251121164059_add_conflict_resolution"
Nodes (1): 20251121164059_add_conflict_resolution

### Community 191 - "20251130190737_add_trace_path_to_test_run_test_case"
Nodes (1): 20251130190737_add_trace_path_to_test_run_test_case

### Community 192 - "20251213074835_add_log_path_to_test_run"
Nodes (1): 20251213074835_add_log_path_to_test_run

### Community 193 - "20251213183952_add_name_property_for_the_test_run_entities"
Nodes (1): 20251213183952_add_name_property_for_the_test_run_entities

### Community 194 - "new_TestRun"
Nodes (1): new_TestRun

### Community 195 - "20251223183400_add_report_model_to_db_schema"
Nodes (1): 20251223183400_add_report_model_to_db_schema

### Community 196 - "20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases"
Nodes (1): 20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases

### Community 197 - "20251224083549_add_comprehensive_report_storage"
Nodes (1): 20251224083549_add_comprehensive_report_storage

### Community 198 - "new_ReportTestCase"
Nodes (1): new_ReportTestCase

### Community 199 - "20251229194422_migrate_duration_to_string"
Nodes (1): 20251229194422_migrate_duration_to_string

### Community 200 - "new_ReportHook"
Nodes (1): new_ReportHook

### Community 201 - "new_ReportStep"
Nodes (1): new_ReportStep

### Community 202 - "20251230124637_add_unique_constraint_to_test_run_name"
Nodes (1): 20251230124637_add_unique_constraint_to_test_run_name

### Community 203 - "20260115094436_add_dashboard_metrics"
Nodes (1): 20260115094436_add_dashboard_metrics

### Community 204 - "20260127172022_add_cascade_delete_to_step_parameters"
Nodes (1): 20260127172022_add_cascade_delete_to_step_parameters

### Community 205 - "new_TemplateTestCaseStepParameter"
Nodes (1): new_TemplateTestCaseStepParameter

### Community 206 - "new_TestCaseStepParameter"
Nodes (1): new_TestCaseStepParameter

### Community 207 - "20260313093000_add_report_step_screenshot_path"
Nodes (1): 20260313093000_add_report_step_screenshot_path

### Community 208 - "20260318120000_add_test_suite_context_to_test_run_test_case"
Nodes (1): 20260318120000_add_test_suite_context_to_test_run_test_case

### Community 209 - "20260318173512_add_support_of_test_suite_level_runs"
Nodes (1): 20260318173512_add_support_of_test_suite_level_runs

### Community 210 - "20260507000000_add_flow_builder_node_grouping"
Nodes (1): 20260507000000_add_flow_builder_node_grouping

### Community 211 - "20260609002500_add_plan_projection_and_sync"
Nodes (1): 20260609002500_add_plan_projection_and_sync

### Community 212 - "PlanProjection"
Nodes (1): PlanProjection

### Community 213 - "PlanRevision"
Nodes (1): PlanRevision

### Community 214 - "PlanSyncIssue"
Nodes (1): PlanSyncIssue

### Community 215 - "PlanTaskProjection"
Nodes (1): PlanTaskProjection

### Community 216 - "20260609090000_add_plan_review_runtime"
Nodes (1): 20260609090000_add_plan_review_runtime

### Community 217 - "PlanEvent"
Nodes (1): PlanEvent

### Community 218 - "PlanPersonalLayout"
Nodes (1): PlanPersonalLayout

### Community 219 - "20260609160000_add_coordinator_events_api_mcp"
Nodes (1): 20260609160000_add_coordinator_events_api_mcp

### Community 220 - "AppraiseProjectIdentity"
Nodes (1): AppraiseProjectIdentity

### Community 221 - "PlanCoordinatorLease"
Nodes (1): PlanCoordinatorLease

### Community 222 - "new_PlanEvent"
Nodes (1): new_PlanEvent

### Community 223 - "20260613015000_add_plan_description"
Nodes (1): 20260613015000_add_plan_description

### Community 224 - "20260628090000_add_target_projects"
Nodes (1): 20260628090000_add_target_projects

### Community 225 - "new_PlanProjection"
Nodes (1): new_PlanProjection

### Community 226 - "20260628103000_add_plan_slug_legacy_identity"
Nodes (1): 20260628103000_add_plan_slug_legacy_identity

### Community 227 - "20260701090000_add_provider_workflow_runs"
Nodes (1): 20260701090000_add_provider_workflow_runs

### Community 228 - "ProviderAdapterRegistration"
Nodes (1): ProviderAdapterRegistration

### Community 229 - "ProviderArtifactSnapshot"
Nodes (1): ProviderArtifactSnapshot

### Community 230 - "ProviderPermissionDecision"
Nodes (1): ProviderPermissionDecision

### Community 231 - "ProviderRunEvent"
Nodes (1): ProviderRunEvent

### Community 232 - "ProviderWorkflowRun"
Nodes (1): ProviderWorkflowRun

### Community 233 - "20260701120000_add_provider_registration_settings"
Nodes (1): 20260701120000_add_provider_registration_settings

### Community 234 - "20260708090000_add_test_run_evidence_health"
Nodes (1): 20260708090000_add_test_run_evidence_health

### Community 235 - "20260709090000_add_step_blocks"
Nodes (1): 20260709090000_add_step_blocks

### Community 236 - "StepBlock"
Nodes (1): StepBlock

### Community 237 - "StepBlockStep"
Nodes (1): StepBlockStep

### Community 238 - "20260711120000_add_baseline_attempt_history"
Nodes (1): 20260711120000_add_baseline_attempt_history

### Community 239 - "BaselineAttempt"
Nodes (1): BaselineAttempt

### Community 240 - "BaselineAttemptEvent"
Nodes (1): BaselineAttemptEvent

### Community 241 - "20260711150000_add_delegated_authorization_nonces"
Nodes (1): 20260711150000_add_delegated_authorization_nonces

### Community 242 - "DelegatedAuthorizationNonce"
Nodes (1): DelegatedAuthorizationNonce

### Community 243 - "20260711170000_add_delegated_ast_submissions"
Nodes (1): 20260711170000_add_delegated_ast_submissions

### Community 244 - "DelegatedValidationAstSubmission"
Nodes (1): DelegatedValidationAstSubmission

### Community 245 - "20260711190000_add_validation_ast_publish_journal"
Nodes (1): 20260711190000_add_validation_ast_publish_journal

### Community 246 - "ValidationAstPublishOperation"
Nodes (1): ValidationAstPublishOperation

### Community 247 - "ValidationExtensionReview"
Nodes (1): ValidationExtensionReview

### Community 248 - "20260711220000_add_runtime_capsules"
Nodes (1): 20260711220000_add_runtime_capsules

### Community 249 - "20260712010000_add_runtime_capsule_execution_attempt"
Nodes (1): 20260712010000_add_runtime_capsule_execution_attempt

### Community 250 - "20260712020000_add_test_run_preparation_key"
Nodes (1): 20260712020000_add_test_run_preparation_key

### Community 251 - "20260712180000_add_repository_exports"
Nodes (1): 20260712180000_add_repository_exports

### Community 252 - "RepositoryExportJob"
Nodes (1): RepositoryExportJob

### Community 253 - "RepositoryExportReceipt"
Nodes (1): RepositoryExportReceipt

### Community 254 - "20260713143000_add_project_resource_ownership"
Nodes (1): 20260713143000_add_project_resource_ownership

### Community 255 - "20260713153000_add_validation_resource_proposals"
Nodes (1): 20260713153000_add_validation_resource_proposals

### Community 256 - "ValidationResourceProposal"
Nodes (1): ValidationResourceProposal

### Community 257 - "20260713163000_normalize_managed_validation_vocabulary"
Nodes (1): 20260713163000_normalize_managed_validation_vocabulary

### Community 258 - "20260713173000_add_named_plan_hashes"
Nodes (1): 20260713173000_add_named_plan_hashes

### Community 259 - "20260713183000_add_delegated_coordinator_receipts"
Nodes (1): 20260713183000_add_delegated_coordinator_receipts

### Community 260 - "DelegatedCoordinatorConsumption"
Nodes (1): DelegatedCoordinatorConsumption

### Community 261 - "DelegatedCoordinatorReceipt"
Nodes (1): DelegatedCoordinatorReceipt

### Community 262 - "20260713200000_stage_complete_project_ownership"
Nodes (1): 20260713200000_stage_complete_project_ownership

### Community 263 - "20260713210000_add_target_project_description"
Nodes (1): 20260713210000_add_target_project_description

### Community 264 - "20260713211000_scope_test_run_preparation_key"
Nodes (1): 20260713211000_scope_test_run_preparation_key

### Community 265 - "20260714000000_make_template_library_shared"
Nodes (1): 20260714000000_make_template_library_shared

### Community 266 - "20260714143000_add_validation_review_state_receipt"
Nodes (1): 20260714143000_add_validation_review_state_receipt

### Community 267 - "20260714160500_scope_environment_names_to_project"
Nodes (1): 20260714160500_scope_environment_names_to_project

### Community 268 - "20260716190000_replace_environment_password_with_reference"
Nodes (1): 20260716190000_replace_environment_password_with_reference

### Community 269 - "new_Environment"
Nodes (1): new_Environment

### Community 270 - "20260716210000_add_measured_test_run_pagination_index"
Nodes (1): 20260716210000_add_measured_test_run_pagination_index

### Community 271 - "20260718110000_add_agent_preflight_receipts"
Nodes (1): 20260718110000_add_agent_preflight_receipts

### Community 272 - "20260718160000_add_plan_observability"
Nodes (1): 20260718160000_add_plan_observability

### Community 273 - "PlanOperationMetric"
Nodes (1): PlanOperationMetric

### Community 274 - "20260718193000_add_environment_identity_expectation"
Nodes (1): 20260718193000_add_environment_identity_expectation

### Community 275 - "20260720010000_add_canonical_operation_mappings"
Nodes (1): 20260720010000_add_canonical_operation_mappings

### Community 276 - "20260722013000_scope_locator_group_names_to_project"
Nodes (1): 20260722013000_scope_locator_group_names_to_project

### Community 277 - "20260722190000_add_step_definition_registry"
Nodes (1): 20260722190000_add_step_definition_registry

### Community 278 - "StepCompatibilityReference"
Nodes (1): StepCompatibilityReference

### Community 279 - "20260722223000_add_step_definition_reviewed_extensions"
Nodes (1): 20260722223000_add_step_definition_reviewed_extensions

### Community 280 - "20260725190000_add_step_block_migration_ledger"
Nodes (1): 20260725190000_add_step_block_migration_ledger

### Community 281 - "StepBlockMigrationLedger"
Nodes (1): StepBlockMigrationLedger

### Community 282 - "_LegacyCompositionDefinition"
Nodes (1): _LegacyCompositionDefinition

### Community 283 - "20260725193000_make_validation_projection_template_step_optional"
Nodes (1): 20260725193000_make_validation_projection_template_step_optional

### Community 284 - "new_TestCaseStep"
Nodes (1): new_TestCaseStep

### Community 285 - "20260725194500_cut_over_authored_steps_to_step_invocations"
Nodes (1): 20260725194500_cut_over_authored_steps_to_step_invocations

### Community 286 - "IF"
Nodes (1): IF

### Community 287 - "20260725200000_remove_legacy_step_authority"
Nodes (1): 20260725200000_remove_legacy_step_authority

### Community 288 - "20260725201000_add_step_definition_telemetry"
Nodes (1): 20260725201000_add_step_definition_telemetry

### Community 289 - "20260725202000_add_step_definition_reuse_justification"
Nodes (1): 20260725202000_add_step_definition_reuse_justification

### Community 290 - "20260725203000_add_step_definition_review_receipts"
Nodes (1): 20260725203000_add_step_definition_review_receipts

### Community 291 - "20260725204000_harden_step_definition_evidence_and_telemetry"
Nodes (1): 20260725204000_harden_step_definition_evidence_and_telemetry

### Community 292 - "20260725205000_add_reviewed_extension_revocation"
Nodes (1): 20260725205000_add_reviewed_extension_revocation

### Community 293 - "20260725206000_add_step_definition_search_receipts"
Nodes (1): 20260725206000_add_step_definition_search_receipts

### Community 294 - "20260803000000_add_quality_design_assessment"
Nodes (1): 20260803000000_add_quality_design_assessment

### Community 295 - "20260805200000_allow_multiple_validation_node_decisions"
Nodes (1): 20260805200000_allow_multiple_validation_node_decisions

### Community 296 - "20260807110000_add_workflow_reliability_receipts"
Nodes (1): 20260807110000_add_workflow_reliability_receipts

### Community 297 - "CoordinatorFailureReceipt"
Nodes (1): CoordinatorFailureReceipt

### Community 298 - "CoordinatorOperationReceipt"
Nodes (1): CoordinatorOperationReceipt

### Community 299 - "ValidationDecisionReceipt"
Nodes (1): ValidationDecisionReceipt

### Community 300 - "ValidationNodePublication"
Nodes (1): ValidationNodePublication

### Community 301 - "__WorkflowReliabilityMigrationGuard"
Nodes (1): __WorkflowReliabilityMigrationGuard

### Community 302 - "20260810000000_add_assessment_execution_cutover"
Nodes (1): 20260810000000_add_assessment_execution_cutover

### Community 303 - "new_RuntimeCapsule"
Nodes (1): new_RuntimeCapsule

### Community 304 - "20260812000000_add_assessment_preparation"
Nodes (1): 20260812000000_add_assessment_preparation

### Community 305 - "20260814090000_add_test_run_blocked_result"
Nodes (1): 20260814090000_add_test_run_blocked_result

### Community 306 - "20260815090000_add_assessment_successor_lineage"
Nodes (1): 20260815090000_add_assessment_successor_lineage

### Community 307 - "new_Assessment"
Nodes (1): new_Assessment

### Community 308 - "20260816093000_add_credential_execution_authorization"
Nodes (1): 20260816093000_add_credential_execution_authorization

### Community 309 - "new_AssessmentRun"
Nodes (1): new_AssessmentRun

### Community 310 - "20260819090000_canonical_capsule_target_cutover"
Nodes (1): 20260819090000_canonical_capsule_target_cutover

### Community 311 - "20260822090000_remote_evaluation_scope_v1"
Nodes (1): 20260822090000_remote_evaluation_scope_v1

### Community 312 - "new_EvaluationSubjectRevision"
Nodes (1): new_EvaluationSubjectRevision

### Community 313 - "20260822100000_unified_assessment_preflight_v2"
Nodes (1): 20260822100000_unified_assessment_preflight_v2

### Community 314 - "_appraise_v2_preflight_guard"
Nodes (1): _appraise_v2_preflight_guard

### Community 315 - "20260824120000_quality_validation_generation_v3"
Nodes (1): 20260824120000_quality_validation_generation_v3

### Community 316 - "_qvg_binding_copy_guard"
Nodes (1): _qvg_binding_copy_guard

### Community 317 - "_qvg_copy_guard"
Nodes (1): _qvg_copy_guard

### Community 318 - "_qvg_evidence_copy_guard"
Nodes (1): _qvg_evidence_copy_guard

### Community 319 - "_qvg_fk_guard"
Nodes (1): _qvg_fk_guard

### Community 320 - "_qvg_guard"
Nodes (1): _qvg_guard

### Community 321 - "_qvg_legacy_binding_snapshot"
Nodes (1): _qvg_legacy_binding_snapshot

### Community 322 - "_qvg_legacy_evidence_snapshot"
Nodes (1): _qvg_legacy_evidence_snapshot

### Community 323 - "_qvg_legacy_publication_snapshot"
Nodes (1): _qvg_legacy_publication_snapshot

### Community 324 - "_qvg_legacy_validation_snapshot"
Nodes (1): _qvg_legacy_validation_snapshot

### Community 325 - "_qvg_validation_copy_guard"
Nodes (1): _qvg_validation_copy_guard

### Community 326 - "new_AssessmentRunBinding"
Nodes (1): new_AssessmentRunBinding

### Community 327 - "new_EvidenceReceipt"
Nodes (1): new_EvidenceReceipt

### Community 328 - "new_QualityValidationExtensionReview"
Nodes (1): new_QualityValidationExtensionReview

### Community 329 - "new_QualityValidationPublication"
Nodes (1): new_QualityValidationPublication

### Community 330 - "new_ValidationVersion"
Nodes (1): new_ValidationVersion

### Community 331 - "20260824130000_remote_scope_audit_rows_insert_only"
Nodes (1): 20260824130000_remote_scope_audit_rows_insert_only

### Community 332 - "20260824140000_assessment_binding_integrity_rejection"
Nodes (1): 20260824140000_assessment_binding_integrity_rejection

### Community 333 - "20260825090000_add_remote_scope_partition_manifest"
Nodes (1): 20260825090000_add_remote_scope_partition_manifest

### Community 334 - "20260826000000_add_quality_operating_system_foundation"
Nodes (1): 20260826000000_add_quality_operating_system_foundation

### Community 335 - "_quality_os_fk_guard"
Nodes (1): _quality_os_fk_guard

### Community 336 - "20260828140000_add_quality_journey_phase_1"
Nodes (1): 20260828140000_add_quality_journey_phase_1

### Community 337 - "20260828150000_add_quality_journey_factory_lineage"
Nodes (1): 20260828150000_add_quality_journey_factory_lineage

### Community 338 - "20260828160000_complete_quality_journey_factory_phase_2"
Nodes (1): 20260828160000_complete_quality_journey_factory_phase_2

### Community 339 - "20260901090000_add_quality_journey_analysis_control_plane"
Nodes (1): 20260901090000_add_quality_journey_analysis_control_plane

### Community 340 - "20260901110000_enforce_quality_journey_analysis_answer_heads"
Nodes (1): 20260901110000_enforce_quality_journey_analysis_answer_heads

### Community 341 - "20260903120000_add_quality_journey_discovery_control_plane"
Nodes (1): 20260903120000_add_quality_journey_discovery_control_plane

### Community 342 - "20260904090000_add_quality_journey_scenario_review"
Nodes (1): 20260904090000_add_quality_journey_scenario_review

### Community 343 - "20260904100000_add_scenario_comment_disposition_receipts"
Nodes (1): 20260904100000_add_scenario_comment_disposition_receipts

### Community 344 - "20260904110000_harden_scenario_portfolio_authority"
Nodes (1): 20260904110000_harden_scenario_portfolio_authority

### Community 345 - "20260904120000_scenario_receipt_and_immutability"
Nodes (1): 20260904120000_scenario_receipt_and_immutability

### Community 346 - "20260905110000_add_quality_journey_phase_6_automation"
Nodes (1): 20260905110000_add_quality_journey_phase_6_automation

### Community 347 - "20260905130000_reuse_quality_journey_automation_target_bindings"
Nodes (1): 20260905130000_reuse_quality_journey_automation_target_bindings

### Community 348 - "new_QualityJourneyAutomationTargetBinding"
Nodes (1): new_QualityJourneyAutomationTargetBinding

### Community 349 - "old_QualityJourneyAutomationTargetBinding_map"
Nodes (1): old_QualityJourneyAutomationTargetBinding_map

### Community 350 - "20260905140000_harden_quality_journey_automation_receipts"
Nodes (1): 20260905140000_harden_quality_journey_automation_receipts

### Community 351 - "new_QualityJourneyAutomationMaterializationBinding"
Nodes (1): new_QualityJourneyAutomationMaterializationBinding

### Community 352 - "20260905150000_harden_quality_journey_automation_request_receipts"
Nodes (1): 20260905150000_harden_quality_journey_automation_request_receipts

### Community 353 - "new_QualityJourneyAutomationRequestReceipt"
Nodes (1): new_QualityJourneyAutomationRequestReceipt

### Community 354 - "20260905160000_bind_quality_journey_automation_materialization_lineage"
Nodes (1): 20260905160000_bind_quality_journey_automation_materialization_lineage

### Community 355 - "new_QualityJourneyAutomationMaterialization"
Nodes (1): new_QualityJourneyAutomationMaterialization

## Suggested Questions
- Which models connect Quality Plans to Assessments?
- Which migrations introduced quality validation publications and evidence receipts?
- Which models depend on Locator or TestRun?
- Which enums are used by execution report models?
