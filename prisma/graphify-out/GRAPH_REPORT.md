# Graph Report - prisma

## Corpus Check
- 73 files from prisma/schema.prisma and migrations
- Verdict: schema-aware graph generated because Graphify AST extraction does not currently produce Prisma/SQL nodes.

## Summary
- 1728 nodes · 3993 edges · 268 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `String` - 731 edges
2. `schema.prisma` - 198 edges
3. `QualityJourney` - 196 edges
4. `DateTime` - 155 edges
5. `TargetProject` - 141 edges
6. `20260906090000_quality_journey_authority` - 98 edges
7. `QualityJourneyScenarioPortfolioRevision` - 89 edges
8. `TestRun` - 83 edges
9. `QualityJourneyDiscoveryRevision` - 83 edges
10. `QualityJourneyWorkAttempt` - 71 edges

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

## Communities (268 total)
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
Nodes (8): StepDefinitionSearchReceipt, StepDefinitionSearchReceipt.id, StepDefinitionSearchReceipt.indexHash, StepDefinitionSearchReceipt.candidateReferencesJson, StepDefinitionSearchReceipt.journeyId, StepDefinitionSearchReceipt.correlationId, StepDefinitionSearchReceipt.searchedAt, StepDefinitionSearchReceipt.expiresAt

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
Nodes (10): StepDefinitionTelemetryEvent, StepDefinitionTelemetryEvent.id, StepDefinitionTelemetryEvent.surface, StepDefinitionTelemetryEvent.outcome, StepDefinitionTelemetryEvent.stepId, StepDefinitionTelemetryEvent.stepVersion, StepDefinitionTelemetryEvent.correlationId, StepDefinitionTelemetryEvent.journeyId (+more)

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
Nodes (31): TestRun, TestRun.id, TestRun.name, TestRun.preparationKey, TestRun.runId, TestRun.startedAt, TestRun.completedAt, TestRun.status (+more)

### Community 31 - "TargetProject"
Nodes (39): TargetProject, TargetProject.id, TargetProject.kind, TargetProject.canonicalIdentity, TargetProject.canonicalPath, TargetProject.normalizedRemoteOrigin, TargetProject.displayName, TargetProject.description (+more)

### Community 32 - "QualityJourney"
Nodes (55): QualityJourney, QualityJourney.closure, QualityJourney.activeTriageReportId, QualityJourney.activeTriageReport, QualityJourney.triageAssignments, QualityJourney.triageReports, QualityJourney.reportReviews, QualityJourney.id (+more)

### Community 33 - "QualityJourneyDraftStatus"
Nodes (4): QualityJourneyDraftStatus, QualityJourneyDraftStatus.ACTIVE, QualityJourneyDraftStatus.ARCHIVED, QualityJourneyDraftStatus.CONFIRMED

### Community 34 - "QualityJourneyDraft"
Nodes (22): QualityJourneyDraft, QualityJourneyDraft.id, QualityJourneyDraft.targetProjectId, QualityJourneyDraft.createIdempotencyKey, QualityJourneyDraft.createRequestHash, QualityJourneyDraft.status, QualityJourneyDraft.requirementJson, QualityJourneyDraft.currentStep (+more)

### Community 35 - "QualityJourneyCoordinatorHandoff"
Nodes (17): QualityJourneyCoordinatorHandoff, QualityJourneyCoordinatorHandoff.id, QualityJourneyCoordinatorHandoff.journeyId, QualityJourneyCoordinatorHandoff.targetProjectId, QualityJourneyCoordinatorHandoff.providerId, QualityJourneyCoordinatorHandoff.status, QualityJourneyCoordinatorHandoff.ticketHash, QualityJourneyCoordinatorHandoff.promptHash (+more)

### Community 36 - "QualityJourneyArtifact"
Nodes (19): QualityJourneyArtifact, QualityJourneyArtifact.id, QualityJourneyArtifact.identityKey, QualityJourneyArtifact.journeyId, QualityJourneyArtifact.targetProjectId, QualityJourneyArtifact.cycleId, QualityJourneyArtifact.kind, QualityJourneyArtifact.artifactId (+more)

### Community 37 - "QualityJourneyAnalysisRevision"
Nodes (27): QualityJourneyAnalysisRevision, QualityJourneyAnalysisRevision.id, QualityJourneyAnalysisRevision.journeyId, QualityJourneyAnalysisRevision.targetProjectId, QualityJourneyAnalysisRevision.cycleId, QualityJourneyAnalysisRevision.artifactRecordId, QualityJourneyAnalysisRevision.artifactId, QualityJourneyAnalysisRevision.artifactRevisionId (+more)

### Community 38 - "QualityJourneyAnalysisQuestion"
Nodes (13): QualityJourneyAnalysisQuestion, QualityJourneyAnalysisQuestion.id, QualityJourneyAnalysisQuestion.journeyId, QualityJourneyAnalysisQuestion.analysisRevisionId, QualityJourneyAnalysisQuestion.artifactRecordId, QualityJourneyAnalysisQuestion.questionId, QualityJourneyAnalysisQuestion.contentHash, QualityJourneyAnalysisQuestion.required (+more)

### Community 39 - "QualityJourneyAnalysisAnswer"
Nodes (17): QualityJourneyAnalysisAnswer, QualityJourneyAnalysisAnswer.id, QualityJourneyAnalysisAnswer.journeyId, QualityJourneyAnalysisAnswer.questionRecordId, QualityJourneyAnalysisAnswer.artifactRecordId, QualityJourneyAnalysisAnswer.answerId, QualityJourneyAnalysisAnswer.contentHash, QualityJourneyAnalysisAnswer.actor (+more)

### Community 40 - "QualityJourneyAnalysisPublication"
Nodes (10): QualityJourneyAnalysisPublication, QualityJourneyAnalysisPublication.id, QualityJourneyAnalysisPublication.journeyId, QualityJourneyAnalysisPublication.analysisRevisionId, QualityJourneyAnalysisPublication.commandId, QualityJourneyAnalysisPublication.artifactHash, QualityJourneyAnalysisPublication.reviewHash, QualityJourneyAnalysisPublication.publishedAt (+more)

### Community 41 - "QualityJourneyAnalysisDecision"
Nodes (15): QualityJourneyAnalysisDecision, QualityJourneyAnalysisDecision.id, QualityJourneyAnalysisDecision.journeyId, QualityJourneyAnalysisDecision.analysisRevisionId, QualityJourneyAnalysisDecision.artifactRecordId, QualityJourneyAnalysisDecision.commandId, QualityJourneyAnalysisDecision.contentHash, QualityJourneyAnalysisDecision.reviewHash (+more)

### Community 42 - "QualityJourneyDiscoveryRevision"
Nodes (52): QualityJourneyDiscoveryRevision, QualityJourneyDiscoveryRevision.id, QualityJourneyDiscoveryRevision.journeyId, QualityJourneyDiscoveryRevision.targetProjectId, QualityJourneyDiscoveryRevision.cycleId, QualityJourneyDiscoveryRevision.analysisRevisionId, QualityJourneyDiscoveryRevision.analysisDecisionId, QualityJourneyDiscoveryRevision.analysisArtifactId (+more)

### Community 43 - "QualityJourneyScenarioPortfolioRevision"
Nodes (43): QualityJourneyScenarioPortfolioRevision, QualityJourneyScenarioPortfolioRevision.id, QualityJourneyScenarioPortfolioRevision.journeyId, QualityJourneyScenarioPortfolioRevision.targetProjectId, QualityJourneyScenarioPortfolioRevision.cycleId, QualityJourneyScenarioPortfolioRevision.discoveryRevisionId, QualityJourneyScenarioPortfolioRevision.discoveryCompletionHash, QualityJourneyScenarioPortfolioRevision.predecessorPortfolioRevisionId (+more)

### Community 44 - "QualityJourneyScenarioRevision"
Nodes (17): QualityJourneyScenarioRevision, QualityJourneyScenarioRevision.id, QualityJourneyScenarioRevision.portfolioRevisionId, QualityJourneyScenarioRevision.stableScenarioId, QualityJourneyScenarioRevision.scenarioRevisionId, QualityJourneyScenarioRevision.behavioralIntentJson, QualityJourneyScenarioRevision.behavioralIntentHash, QualityJourneyScenarioRevision.enrichmentJson (+more)

### Community 45 - "QualityJourneyPreparedRuntimeCapsule"
Nodes (14): QualityJourneyPreparedRuntimeCapsule, QualityJourneyPreparedRuntimeCapsule.id, QualityJourneyPreparedRuntimeCapsule.journeyId, QualityJourneyPreparedRuntimeCapsule.targetProjectId, QualityJourneyPreparedRuntimeCapsule.cycleId, QualityJourneyPreparedRuntimeCapsule.materializationId, QualityJourneyPreparedRuntimeCapsule.inputHash, QualityJourneyPreparedRuntimeCapsule.capsuleHash (+more)

### Community 46 - "QualityJourneyAutomationMaterialization"
Nodes (37): QualityJourneyAutomationMaterialization, QualityJourneyAutomationMaterialization.id, QualityJourneyAutomationMaterialization.journeyId, QualityJourneyAutomationMaterialization.targetProjectId, QualityJourneyAutomationMaterialization.cycleId, QualityJourneyAutomationMaterialization.scenarioRevisionId, QualityJourneyAutomationMaterialization.scenarioContentHash, QualityJourneyAutomationMaterialization.portfolioRevisionId (+more)

### Community 47 - "QualityJourneyAutomationTargetBinding"
Nodes (16): QualityJourneyAutomationTargetBinding, QualityJourneyAutomationTargetBinding.id, QualityJourneyAutomationTargetBinding.journeyId, QualityJourneyAutomationTargetBinding.targetProjectId, QualityJourneyAutomationTargetBinding.semanticHash, QualityJourneyAutomationTargetBinding.suiteId, QualityJourneyAutomationTargetBinding.testCaseId, QualityJourneyAutomationTargetBinding.suiteHash (+more)

### Community 48 - "QualityJourneyAutomationMaterializationBinding"
Nodes (6): QualityJourneyAutomationMaterializationBinding, QualityJourneyAutomationMaterializationBinding.materializationId, QualityJourneyAutomationMaterializationBinding.bindingId, QualityJourneyAutomationMaterializationBinding.createdAt, QualityJourneyAutomationMaterializationBinding.materialization, QualityJourneyAutomationMaterializationBinding.targetBinding

### Community 49 - "QualityJourneyAutomationRequestReceipt"
Nodes (14): QualityJourneyAutomationRequestReceipt, QualityJourneyAutomationRequestReceipt.id, QualityJourneyAutomationRequestReceipt.journeyId, QualityJourneyAutomationRequestReceipt.workItemId, QualityJourneyAutomationRequestReceipt.attemptId, QualityJourneyAutomationRequestReceipt.ownerTokenHash, QualityJourneyAutomationRequestReceipt.idempotencyKey, QualityJourneyAutomationRequestReceipt.requestHash (+more)

### Community 50 - "QualityJourneyScenarioDecision"
Nodes (17): QualityJourneyScenarioDecision, QualityJourneyScenarioDecision.id, QualityJourneyScenarioDecision.portfolioRevisionId, QualityJourneyScenarioDecision.scenarioRevisionId, QualityJourneyScenarioDecision.decision, QualityJourneyScenarioDecision.feedback, QualityJourneyScenarioDecision.actor, QualityJourneyScenarioDecision.idempotencyKey (+more)

### Community 51 - "QualityJourneyScenarioReviewComment"
Nodes (19): QualityJourneyScenarioReviewComment, QualityJourneyScenarioReviewComment.id, QualityJourneyScenarioReviewComment.portfolioRevisionId, QualityJourneyScenarioReviewComment.scenarioRevisionId, QualityJourneyScenarioReviewComment.comment, QualityJourneyScenarioReviewComment.blocking, QualityJourneyScenarioReviewComment.disposition, QualityJourneyScenarioReviewComment.disposedAt (+more)

### Community 52 - "QualityJourneyScenarioDecisionReceipt"
Nodes (10): QualityJourneyScenarioDecisionReceipt, QualityJourneyScenarioDecisionReceipt.id, QualityJourneyScenarioDecisionReceipt.journeyId, QualityJourneyScenarioDecisionReceipt.portfolioRevisionId, QualityJourneyScenarioDecisionReceipt.idempotencyKey, QualityJourneyScenarioDecisionReceipt.requestHash, QualityJourneyScenarioDecisionReceipt.resultJson, QualityJourneyScenarioDecisionReceipt.createdAt (+more)

### Community 53 - "QualityJourneyRevision"
Nodes (8): QualityJourneyRevision, QualityJourneyRevision.id, QualityJourneyRevision.journeyId, QualityJourneyRevision.revision, QualityJourneyRevision.contentJson, QualityJourneyRevision.contentHash, QualityJourneyRevision.createdAt, QualityJourneyRevision.journey

### Community 54 - "QualityJourneyCycle"
Nodes (9): QualityJourneyCycle, QualityJourneyCycle.remediationReview, QualityJourneyCycle.id, QualityJourneyCycle.journeyId, QualityJourneyCycle.sequence, QualityJourneyCycle.predecessorCycleId, QualityJourneyCycle.scopeJson, QualityJourneyCycle.createdAt (+more)

### Community 55 - "QualityJourneyExecutionCycle"
Nodes (30): QualityJourneyExecutionCycle, QualityJourneyExecutionCycle.triageAssignments, QualityJourneyExecutionCycle.id, QualityJourneyExecutionCycle.journeyId, QualityJourneyExecutionCycle.targetProjectId, QualityJourneyExecutionCycle.cycleId, QualityJourneyExecutionCycle.predecessorExecutionCycleId, QualityJourneyExecutionCycle.preparedCapsulesJson (+more)

### Community 56 - "QualityJourneyExecutionTestRun"
Nodes (10): QualityJourneyExecutionTestRun, QualityJourneyExecutionTestRun.id, QualityJourneyExecutionTestRun.executionCycleId, QualityJourneyExecutionTestRun.preparedCapsuleId, QualityJourneyExecutionTestRun.testRunId, QualityJourneyExecutionTestRun.runId, QualityJourneyExecutionTestRun.status, QualityJourneyExecutionTestRun.createdAt (+more)

### Community 57 - "QualityJourneyExecutionConsent"
Nodes (17): QualityJourneyExecutionConsent, QualityJourneyExecutionConsent.id, QualityJourneyExecutionConsent.journeyId, QualityJourneyExecutionConsent.targetProjectId, QualityJourneyExecutionConsent.executionCycleId, QualityJourneyExecutionConsent.scopeJson, QualityJourneyExecutionConsent.scopeHash, QualityJourneyExecutionConsent.grantSource (+more)

### Community 58 - "QualityJourneyExecutionCancellationReceipt"
Nodes (9): QualityJourneyExecutionCancellationReceipt, QualityJourneyExecutionCancellationReceipt.id, QualityJourneyExecutionCancellationReceipt.journeyId, QualityJourneyExecutionCancellationReceipt.executionCycleId, QualityJourneyExecutionCancellationReceipt.idempotencyKey, QualityJourneyExecutionCancellationReceipt.requestHash, QualityJourneyExecutionCancellationReceipt.createdAt, QualityJourneyExecutionCancellationReceipt.journey (+more)

### Community 59 - "QualityJourneyExecutionEvidenceReceipt"
Nodes (10): QualityJourneyExecutionEvidenceReceipt, QualityJourneyExecutionEvidenceReceipt.id, QualityJourneyExecutionEvidenceReceipt.executionCycleId, QualityJourneyExecutionEvidenceReceipt.testRunId, QualityJourneyExecutionEvidenceReceipt.runtimeBytesHash, QualityJourneyExecutionEvidenceReceipt.receiptHash, QualityJourneyExecutionEvidenceReceipt.evidenceJson, QualityJourneyExecutionEvidenceReceipt.createdAt (+more)

### Community 60 - "QualityJourneyExecutionRerunProposal"
Nodes (20): QualityJourneyExecutionRerunProposal, QualityJourneyExecutionRerunProposal.reportRevisionId, QualityJourneyExecutionRerunProposal.reportHash, QualityJourneyExecutionRerunProposal.id, QualityJourneyExecutionRerunProposal.journeyId, QualityJourneyExecutionRerunProposal.targetProjectId, QualityJourneyExecutionRerunProposal.sourceExecutionCycleId, QualityJourneyExecutionRerunProposal.successorExecutionCycleId (+more)

### Community 61 - "QualityJourneyCommand"
Nodes (11): QualityJourneyCommand, QualityJourneyCommand.id, QualityJourneyCommand.journeyId, QualityJourneyCommand.targetProjectId, QualityJourneyCommand.idempotencyKey, QualityJourneyCommand.requestHash, QualityJourneyCommand.requestJson, QualityJourneyCommand.resultJson (+more)

### Community 62 - "QualityJourneyEvent"
Nodes (12): QualityJourneyEvent, QualityJourneyEvent.id, QualityJourneyEvent.journeyId, QualityJourneyEvent.targetProjectId, QualityJourneyEvent.sequence, QualityJourneyEvent.eventType, QualityJourneyEvent.commandId, QualityJourneyEvent.predecessorStateHash (+more)

### Community 63 - "QualityJourneyWorkItem"
Nodes (27): QualityJourneyWorkItem, QualityJourneyWorkItem.triageAssignment, QualityJourneyWorkItem.id, QualityJourneyWorkItem.journeyId, QualityJourneyWorkItem.targetProjectId, QualityJourneyWorkItem.cycleId, QualityJourneyWorkItem.role, QualityJourneyWorkItem.status (+more)

### Community 64 - "QualityJourneyWorkAuthorization"
Nodes (25): QualityJourneyWorkAuthorization, QualityJourneyWorkAuthorization.id, QualityJourneyWorkAuthorization.journeyId, QualityJourneyWorkAuthorization.targetProjectId, QualityJourneyWorkAuthorization.workItemId, QualityJourneyWorkAuthorization.supersedesAuthorizationId, QualityJourneyWorkAuthorization.role, QualityJourneyWorkAuthorization.roleContractDigest (+more)

### Community 65 - "QualityJourneyWorkAttempt"
Nodes (42): QualityJourneyWorkAttempt, QualityJourneyWorkAttempt.id, QualityJourneyWorkAttempt.workItemId, QualityJourneyWorkAttempt.attempt, QualityJourneyWorkAttempt.status, QualityJourneyWorkAttempt.leaseId, QualityJourneyWorkAttempt.ownerTokenHash, QualityJourneyWorkAttempt.leaseExpiresAt (+more)

### Community 66 - "QualityJourneyBlocker"
Nodes (16): QualityJourneyBlocker, QualityJourneyBlocker.id, QualityJourneyBlocker.journeyId, QualityJourneyBlocker.targetProjectId, QualityJourneyBlocker.reasonCode, QualityJourneyBlocker.summary, QualityJourneyBlocker.evidenceJson, QualityJourneyBlocker.responsibleActor (+more)

### Community 67 - "QualityJourneyArtifactLink"
Nodes (11): QualityJourneyArtifactLink, QualityJourneyArtifactLink.id, QualityJourneyArtifactLink.journeyId, QualityJourneyArtifactLink.targetProjectId, QualityJourneyArtifactLink.cycleId, QualityJourneyArtifactLink.relation, QualityJourneyArtifactLink.sourceJson, QualityJourneyArtifactLink.targetJson (+more)

### Community 68 - "AgentPreflightReceipt"
Nodes (15): AgentPreflightReceipt, AgentPreflightReceipt.id, AgentPreflightReceipt.coordinatorId, AgentPreflightReceipt.schemaVersion, AgentPreflightReceipt.status, AgentPreflightReceipt.ready, AgentPreflightReceipt.snapshotHash, AgentPreflightReceipt.snapshotJson (+more)

### Community 69 - "ProjectResourceOwnership"
Nodes (13): ProjectResourceOwnership, ProjectResourceOwnership.id, ProjectResourceOwnership.entityType, ProjectResourceOwnership.entityId, ProjectResourceOwnership.scope, ProjectResourceOwnership.targetProjectId, ProjectResourceOwnership.origin, ProjectResourceOwnership.provenanceJson (+more)

### Community 70 - "ProjectResourceImport"
Nodes (11): ProjectResourceImport, ProjectResourceImport.id, ProjectResourceImport.sourceOwnershipId, ProjectResourceImport.destinationProjectId, ProjectResourceImport.sharingMode, ProjectResourceImport.sourceContentHash, ProjectResourceImport.actor, ProjectResourceImport.propagationPolicy (+more)

### Community 71 - "ResourceScope"
Nodes (7): ResourceScope, ResourceScope.system, ResourceScope.global_library, ResourceScope.project, ResourceScope.publication, ResourceScope.runtime, ResourceScope.quarantined

### Community 72 - "ResourceSharingMode"
Nodes (3): ResourceSharingMode, ResourceSharingMode.immutable_reference, ResourceSharingMode.copy

### Community 73 - "RuntimeCapsule"
Nodes (17): RuntimeCapsule, RuntimeCapsule.id, RuntimeCapsule.targetProjectId, RuntimeCapsule.testRunId, RuntimeCapsule.validationHash, RuntimeCapsule.capsuleHash, RuntimeCapsule.manifestHash, RuntimeCapsule.manifestJson (+more)

### Community 74 - "RuntimeCapsuleExecutionAttempt"
Nodes (18): RuntimeCapsuleExecutionAttempt, RuntimeCapsuleExecutionAttempt.id, RuntimeCapsuleExecutionAttempt.testRunId, RuntimeCapsuleExecutionAttempt.capsuleId, RuntimeCapsuleExecutionAttempt.receiptHash, RuntimeCapsuleExecutionAttempt.preflightResultJson, RuntimeCapsuleExecutionAttempt.preflightResultHash, RuntimeCapsuleExecutionAttempt.preflightCheckedAt (+more)

### Community 75 - "RuntimeCapsuleExecutionAttemptState"
Nodes (8): RuntimeCapsuleExecutionAttemptState, RuntimeCapsuleExecutionAttemptState.PREPARED, RuntimeCapsuleExecutionAttemptState.STARTING, RuntimeCapsuleExecutionAttemptState.RUNNING, RuntimeCapsuleExecutionAttemptState.COMPLETED, RuntimeCapsuleExecutionAttemptState.FAILED, RuntimeCapsuleExecutionAttemptState.CANCELLED, RuntimeCapsuleExecutionAttemptState.INTERRUPTED

### Community 76 - "RuntimeCapsuleBlob"
Nodes (12): RuntimeCapsuleBlob, RuntimeCapsuleBlob.id, RuntimeCapsuleBlob.targetProjectId, RuntimeCapsuleBlob.contentHash, RuntimeCapsuleBlob.size, RuntimeCapsuleBlob.storagePath, RuntimeCapsuleBlob.integrityState, RuntimeCapsuleBlob.version (+more)

### Community 77 - "RuntimeCapsuleBlobReference"
Nodes (7): RuntimeCapsuleBlobReference, RuntimeCapsuleBlobReference.id, RuntimeCapsuleBlobReference.capsuleId, RuntimeCapsuleBlobReference.blobId, RuntimeCapsuleBlobReference.filePath, RuntimeCapsuleBlobReference.capsule, RuntimeCapsuleBlobReference.blob

### Community 78 - "RuntimeCapsuleIntegrityState"
Nodes (5): RuntimeCapsuleIntegrityState, RuntimeCapsuleIntegrityState.staging, RuntimeCapsuleIntegrityState.ready, RuntimeCapsuleIntegrityState.missing, RuntimeCapsuleIntegrityState.corrupt

### Community 79 - "RuntimeCapsuleLease"
Nodes (11): RuntimeCapsuleLease, RuntimeCapsuleLease.id, RuntimeCapsuleLease.targetProjectId, RuntimeCapsuleLease.validationHash, RuntimeCapsuleLease.runId, RuntimeCapsuleLease.ownerToken, RuntimeCapsuleLease.leaseExpiresAt, RuntimeCapsuleLease.version (+more)

### Community 80 - "TestRunLog"
Nodes (7): TestRunLog, TestRunLog.id, TestRunLog.testRunId, TestRunLog.logs, TestRunLog.createdAt, TestRunLog.updatedAt, TestRunLog.testRun

### Community 81 - "EnvironmentCredentialState"
Nodes (3): EnvironmentCredentialState, EnvironmentCredentialState.NONE, EnvironmentCredentialState.REFERENCE_CONFIGURED

### Community 82 - "Environment"
Nodes (15): Environment, Environment.id, Environment.name, Environment.baseUrl, Environment.expectedPageTitle, Environment.apiBaseUrl, Environment.username, Environment.passwordEnvironmentVariable (+more)

### Community 83 - "Tag"
Nodes (12): Tag, Tag.id, Tag.name, Tag.tagExpression, Tag.type, Tag.createdAt, Tag.updatedAt, Tag.testRuns (+more)

### Community 84 - "ConflictResolution"
Nodes (10): ConflictResolution, ConflictResolution.id, ConflictResolution.entityType, ConflictResolution.entityId, ConflictResolution.conflictType, ConflictResolution.conflictingEntityId, ConflictResolution.resolved, ConflictResolution.createdAt (+more)

### Community 85 - "ReportTestCase"
Nodes (10): ReportTestCase, ReportTestCase.id, ReportTestCase.reportId, ReportTestCase.testCaseId, ReportTestCase.testRunTestCaseId, ReportTestCase.reportScenarioId, ReportTestCase.testRunTestCase, ReportTestCase.report (+more)

### Community 86 - "Report"
Nodes (13): Report, Report.id, Report.name, Report.description, Report.reportPath, Report.createdAt, Report.updatedAt, Report.testRunId (+more)

### Community 87 - "ReportFeature"
Nodes (13): ReportFeature, ReportFeature.id, ReportFeature.reportId, ReportFeature.name, ReportFeature.description, ReportFeature.uri, ReportFeature.line, ReportFeature.keyword (+more)

### Community 88 - "ReportFeatureTag"
Nodes (7): ReportFeatureTag, ReportFeatureTag.id, ReportFeatureTag.reportFeatureId, ReportFeatureTag.tagName, ReportFeatureTag.line, ReportFeatureTag.createdAt, ReportFeatureTag.reportFeature

### Community 89 - "ReportScenario"
Nodes (16): ReportScenario, ReportScenario.id, ReportScenario.reportFeatureId, ReportScenario.name, ReportScenario.description, ReportScenario.line, ReportScenario.keyword, ReportScenario.type (+more)

### Community 90 - "ReportScenarioTag"
Nodes (7): ReportScenarioTag, ReportScenarioTag.id, ReportScenarioTag.reportScenarioId, ReportScenarioTag.tagName, ReportScenarioTag.line, ReportScenarioTag.createdAt, ReportScenarioTag.reportScenario

### Community 91 - "ReportStep"
Nodes (17): ReportStep, ReportStep.id, ReportStep.reportScenarioId, ReportStep.keyword, ReportStep.line, ReportStep.name, ReportStep.matchLocation, ReportStep.status (+more)

### Community 92 - "ReportHook"
Nodes (12): ReportHook, ReportHook.id, ReportHook.reportScenarioId, ReportHook.keyword, ReportHook.status, ReportHook.duration, ReportHook.errorMessage, ReportHook.errorTrace (+more)

### Community 93 - "TestCaseMetrics"
Nodes (17): TestCaseMetrics, TestCaseMetrics.id, TestCaseMetrics.testCaseId, TestCaseMetrics.isRepeatedlyFailing, TestCaseMetrics.isFlaky, TestCaseMetrics.consecutiveFailures, TestCaseMetrics.failureRate, TestCaseMetrics.totalRecentRuns (+more)

### Community 94 - "TestSuiteMetrics"
Nodes (9): TestSuiteMetrics, TestSuiteMetrics.id, TestSuiteMetrics.testSuiteId, TestSuiteMetrics.lastExecutedAt, TestSuiteMetrics.createdAt, TestSuiteMetrics.updatedAt, TestSuiteMetrics.testSuite, TestSuiteMetrics.targetProjectId (+more)

### Community 95 - "DashboardMetrics"
Nodes (10): DashboardMetrics, DashboardMetrics.id, DashboardMetrics.failedRecentRunsCount, DashboardMetrics.repeatedlyFailingTestsCount, DashboardMetrics.flakyTestsCount, DashboardMetrics.suitesNotExecutedRecentlyCount, DashboardMetrics.lastUpdatedAt, DashboardMetrics.createdAt (+more)

### Community 96 - "TagType"
Nodes (3): TagType, TagType.IDENTIFIER, TagType.FILTER

### Community 97 - "TargetProjectKind"
Nodes (3): TargetProjectKind, TargetProjectKind.LOCAL_WORKSPACE, TargetProjectKind.REMOTE_BLACK_BOX

### Community 98 - "TestRunIntent"
Nodes (3): TestRunIntent, TestRunIntent.INDEPENDENT, TestRunIntent.QUALITY_JOURNEY

### Community 99 - "TestRunStatus"
Nodes (6): TestRunStatus, TestRunStatus.QUEUED, TestRunStatus.RUNNING, TestRunStatus.CANCELLING, TestRunStatus.COMPLETED, TestRunStatus.CANCELLED

### Community 100 - "TestRunTestCaseStatus"
Nodes (5): TestRunTestCaseStatus, TestRunTestCaseStatus.PENDING, TestRunTestCaseStatus.RUNNING, TestRunTestCaseStatus.COMPLETED, TestRunTestCaseStatus.CANCELLED

### Community 101 - "TestRunTestCaseResult"
Nodes (4): TestRunTestCaseResult, TestRunTestCaseResult.PASSED, TestRunTestCaseResult.FAILED, TestRunTestCaseResult.UNTESTED

### Community 102 - "TestRunResult"
Nodes (6): TestRunResult, TestRunResult.PENDING, TestRunResult.PASSED, TestRunResult.FAILED, TestRunResult.BLOCKED, TestRunResult.CANCELLED

### Community 103 - "TestRunEvidenceHealth"
Nodes (9): TestRunEvidenceHealth, TestRunEvidenceHealth.valid, TestRunEvidenceHealth.invalid_empty_run, TestRunEvidenceHealth.invalid_missing_test_cases, TestRunEvidenceHealth.invalid_missing_report, TestRunEvidenceHealth.invalid_placeholder_binary, TestRunEvidenceHealth.invalid_unmatched_scenarios, TestRunEvidenceHealth.invalid_stale_runtime (+more)

### Community 104 - "Role"
Nodes (4): Role, Role.ADMIN, Role.TESTER, Role.REVIEWER

### Community 105 - "ReviewStatus"
Nodes (4): ReviewStatus, ReviewStatus.PENDING, ReviewStatus.APPROVED, ReviewStatus.CHANGES_REQUESTED

### Community 106 - "TestCaseStatus"
Nodes (4): TestCaseStatus, TestCaseStatus.PENDING, TestCaseStatus.IN_PROGRESS, TestCaseStatus.COMPLETED

### Community 107 - "TestCaseResult"
Nodes (7): TestCaseResult, TestCaseResult.PASSED, TestCaseResult.FAILED, TestCaseResult.BLOCKED, TestCaseResult.SKIPPED, TestCaseResult.RETEST, TestCaseResult.UNTESTED

### Community 108 - "StepType"
Nodes (3): StepType, StepType.ACTION, StepType.ASSERTION

### Community 109 - "StepParameterType"
Nodes (6): StepParameterType, StepParameterType.NUMBER, StepParameterType.STRING, StepParameterType.DATE, StepParameterType.BOOLEAN, StepParameterType.LOCATOR

### Community 110 - "StepParameterValueType"
Nodes (4): StepParameterValueType, StepParameterValueType.STRING, StepParameterValueType.NUMBER, StepParameterValueType.LOCATOR

### Community 111 - "StepIcon"
Nodes (13): StepIcon, StepIcon.MOUSE, StepIcon.NAVIGATION, StepIcon.INPUT, StepIcon.DOWNLOAD, StepIcon.API, StepIcon.STORE, StepIcon.FORMAT (+more)

### Community 112 - "BrowserEngine"
Nodes (4): BrowserEngine, BrowserEngine.CHROMIUM, BrowserEngine.FIREFOX, BrowserEngine.WEBKIT

### Community 113 - "StepGroupType"
Nodes (3): StepGroupType, StepGroupType.ACTION, StepGroupType.VALIDATION

### Community 114 - "EntityType"
Nodes (2): EntityType, EntityType.LOCATOR

### Community 115 - "ConflictType"
Nodes (3): ConflictType, ConflictType.DUPLICATE_NAME, ConflictType.DUPLICATE_VALUE

### Community 116 - "StepStatus"
Nodes (6): StepStatus, StepStatus.PASSED, StepStatus.FAILED, StepStatus.SKIPPED, StepStatus.PENDING, StepStatus.UNDEFINED

### Community 117 - "StepKeyword"
Nodes (8): StepKeyword, StepKeyword.GIVEN, StepKeyword.WHEN, StepKeyword.THEN, StepKeyword.AND, StepKeyword.BUT, StepKeyword.BEFORE, StepKeyword.AFTER

### Community 118 - "QualityJourneyStage"
Nodes (12): QualityJourneyStage, QualityJourneyStage.INTAKE, QualityJourneyStage.ANALYSIS, QualityJourneyStage.ANALYSIS_REVIEW, QualityJourneyStage.DISCOVERY, QualityJourneyStage.SCENARIO_DESIGN, QualityJourneyStage.SCENARIO_REVIEW, QualityJourneyStage.AUTOMATION (+more)

### Community 119 - "QualityJourneyRole"
Nodes (7): QualityJourneyRole, QualityJourneyRole.REQUIREMENT_ANALYZER, QualityJourneyRole.SCOUT, QualityJourneyRole.RESOURCE_EXPLORER, QualityJourneyRole.TEST_SCENARIO_DESIGNER, QualityJourneyRole.AUTOMATOR, QualityJourneyRole.TRIAGER

### Community 120 - "QualityJourneyWorkItemStatus"
Nodes (18): QualityJourneyWorkItemStatus, QualityJourneyWorkItemStatus.ELIGIBLE, QualityJourneyWorkItemStatus.WORK_ITEM_ISSUED, QualityJourneyWorkItemStatus.WORKER_REQUESTED, QualityJourneyWorkItemStatus.WORKER_STARTED, QualityJourneyWorkItemStatus.IN_PROGRESS, QualityJourneyWorkItemStatus.QUESTION_RAISED, QualityJourneyWorkItemStatus.WAITING_FOR_INPUT (+more)

### Community 121 - "QualityJourneyTriageAssignment"
Nodes (14): QualityJourneyTriageAssignment, QualityJourneyTriageAssignment.id, QualityJourneyTriageAssignment.journeyId, QualityJourneyTriageAssignment.executionCycleId, QualityJourneyTriageAssignment.workItemId, QualityJourneyTriageAssignment.predecessorReportRevisionId, QualityJourneyTriageAssignment.inputHash, QualityJourneyTriageAssignment.inputJson (+more)

### Community 122 - "QualityJourneyTriageReport"
Nodes (15): QualityJourneyTriageReport, QualityJourneyTriageReport.closure, QualityJourneyTriageReport.activeForJourney, QualityJourneyTriageReport.id, QualityJourneyTriageReport.journeyId, QualityJourneyTriageReport.assignmentId, QualityJourneyTriageReport.contentHash, QualityJourneyTriageReport.reportJson (+more)

### Community 123 - "QualityJourneyReportReview"
Nodes (13): QualityJourneyReportReview, QualityJourneyReportReview.id, QualityJourneyReportReview.journeyId, QualityJourneyReportReview.reportRevisionId, QualityJourneyReportReview.kind, QualityJourneyReportReview.feedback, QualityJourneyReportReview.idempotencyKey, QualityJourneyReportReview.requestHash (+more)

### Community 124 - "QualityJourneyClosure"
Nodes (13): QualityJourneyClosure, QualityJourneyClosure.id, QualityJourneyClosure.journeyId, QualityJourneyClosure.reportRevisionId, QualityJourneyClosure.cycleId, QualityJourneyClosure.reportHash, QualityJourneyClosure.contentHash, QualityJourneyClosure.closureJson (+more)

### Community 125 - "String"
Nodes (1): String

### Community 126 - "DateTime"
Nodes (1): DateTime

### Community 127 - "Int"
Nodes (1): Int

### Community 128 - "Boolean"
Nodes (1): Boolean

### Community 129 - "Float"
Nodes (1): Float

### Community 130 - "20251026202316_migrate_back_to_sqlite"
Nodes (1): 20251026202316_migrate_back_to_sqlite

### Community 131 - "TemplateStep"
Nodes (1): TemplateStep

### Community 132 - "TemplateStepGroup"
Nodes (1): TemplateStepGroup

### Community 133 - "TemplateStepParameter"
Nodes (1): TemplateStepParameter

### Community 134 - "_TagToTestRun"
Nodes (1): _TagToTestRun

### Community 135 - "_TestSuiteTestCases"
Nodes (1): _TestSuiteTestCases

### Community 136 - "20251104113456_add_type_for_template_step_groups"
Nodes (1): 20251104113456_add_type_for_template_step_groups

### Community 137 - "new_TemplateStepGroup"
Nodes (1): new_TemplateStepGroup

### Community 138 - "20251104170946_add_tags_to_test_suite_and_test_case"
Nodes (1): 20251104170946_add_tags_to_test_suite_and_test_case

### Community 139 - "_TagToTestCase"
Nodes (1): _TagToTestCase

### Community 140 - "_TagToTestSuite"
Nodes (1): _TagToTestSuite

### Community 141 - "20251112190024_add_cascade_delete_to_test_run_test_case"
Nodes (1): 20251112190024_add_cascade_delete_to_test_run_test_case

### Community 142 - "new_TestRunTestCase"
Nodes (1): new_TestRunTestCase

### Community 143 - "20251113181100_add_test_run_log"
Nodes (1): 20251113181100_add_test_run_log

### Community 144 - "20251119191838_add_tag_type"
Nodes (1): 20251119191838_add_tag_type

### Community 145 - "new_Tag"
Nodes (1): new_Tag

### Community 146 - "20251121164059_add_conflict_resolution"
Nodes (1): 20251121164059_add_conflict_resolution

### Community 147 - "20251130190737_add_trace_path_to_test_run_test_case"
Nodes (1): 20251130190737_add_trace_path_to_test_run_test_case

### Community 148 - "20251213074835_add_log_path_to_test_run"
Nodes (1): 20251213074835_add_log_path_to_test_run

### Community 149 - "20251213183952_add_name_property_for_the_test_run_entities"
Nodes (1): 20251213183952_add_name_property_for_the_test_run_entities

### Community 150 - "new_TestRun"
Nodes (1): new_TestRun

### Community 151 - "20251223183400_add_report_model_to_db_schema"
Nodes (1): 20251223183400_add_report_model_to_db_schema

### Community 152 - "20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases"
Nodes (1): 20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases

### Community 153 - "20251224083549_add_comprehensive_report_storage"
Nodes (1): 20251224083549_add_comprehensive_report_storage

### Community 154 - "new_ReportTestCase"
Nodes (1): new_ReportTestCase

### Community 155 - "20251229194422_migrate_duration_to_string"
Nodes (1): 20251229194422_migrate_duration_to_string

### Community 156 - "new_ReportHook"
Nodes (1): new_ReportHook

### Community 157 - "new_ReportStep"
Nodes (1): new_ReportStep

### Community 158 - "20251230124637_add_unique_constraint_to_test_run_name"
Nodes (1): 20251230124637_add_unique_constraint_to_test_run_name

### Community 159 - "20260115094436_add_dashboard_metrics"
Nodes (1): 20260115094436_add_dashboard_metrics

### Community 160 - "20260127172022_add_cascade_delete_to_step_parameters"
Nodes (1): 20260127172022_add_cascade_delete_to_step_parameters

### Community 161 - "new_TemplateTestCaseStepParameter"
Nodes (1): new_TemplateTestCaseStepParameter

### Community 162 - "new_TestCaseStepParameter"
Nodes (1): new_TestCaseStepParameter

### Community 163 - "20260313093000_add_report_step_screenshot_path"
Nodes (1): 20260313093000_add_report_step_screenshot_path

### Community 164 - "20260318120000_add_test_suite_context_to_test_run_test_case"
Nodes (1): 20260318120000_add_test_suite_context_to_test_run_test_case

### Community 165 - "20260318173512_add_support_of_test_suite_level_runs"
Nodes (1): 20260318173512_add_support_of_test_suite_level_runs

### Community 166 - "20260507000000_add_flow_builder_node_grouping"
Nodes (1): 20260507000000_add_flow_builder_node_grouping

### Community 167 - "20260609002500_add_plan_projection_and_sync"
Nodes (1): 20260609002500_add_plan_projection_and_sync

### Community 168 - "PlanProjection"
Nodes (1): PlanProjection

### Community 169 - "PlanRevision"
Nodes (1): PlanRevision

### Community 170 - "PlanSyncIssue"
Nodes (1): PlanSyncIssue

### Community 171 - "PlanTaskProjection"
Nodes (1): PlanTaskProjection

### Community 172 - "20260609090000_add_plan_review_runtime"
Nodes (1): 20260609090000_add_plan_review_runtime

### Community 173 - "PlanEvent"
Nodes (1): PlanEvent

### Community 174 - "PlanPersonalLayout"
Nodes (1): PlanPersonalLayout

### Community 175 - "20260609160000_add_coordinator_events_api_mcp"
Nodes (1): 20260609160000_add_coordinator_events_api_mcp

### Community 176 - "AppraiseProjectIdentity"
Nodes (1): AppraiseProjectIdentity

### Community 177 - "PlanCoordinatorLease"
Nodes (1): PlanCoordinatorLease

### Community 178 - "new_PlanEvent"
Nodes (1): new_PlanEvent

### Community 179 - "20260613015000_add_plan_description"
Nodes (1): 20260613015000_add_plan_description

### Community 180 - "20260628090000_add_target_projects"
Nodes (1): 20260628090000_add_target_projects

### Community 181 - "new_PlanProjection"
Nodes (1): new_PlanProjection

### Community 182 - "20260628103000_add_plan_slug_legacy_identity"
Nodes (1): 20260628103000_add_plan_slug_legacy_identity

### Community 183 - "20260701090000_add_provider_workflow_runs"
Nodes (1): 20260701090000_add_provider_workflow_runs

### Community 184 - "ProviderAdapterRegistration"
Nodes (1): ProviderAdapterRegistration

### Community 185 - "ProviderArtifactSnapshot"
Nodes (1): ProviderArtifactSnapshot

### Community 186 - "ProviderPermissionDecision"
Nodes (1): ProviderPermissionDecision

### Community 187 - "ProviderRunEvent"
Nodes (1): ProviderRunEvent

### Community 188 - "ProviderWorkflowRun"
Nodes (1): ProviderWorkflowRun

### Community 189 - "20260701120000_add_provider_registration_settings"
Nodes (1): 20260701120000_add_provider_registration_settings

### Community 190 - "20260708090000_add_test_run_evidence_health"
Nodes (1): 20260708090000_add_test_run_evidence_health

### Community 191 - "20260709090000_add_step_blocks"
Nodes (1): 20260709090000_add_step_blocks

### Community 192 - "StepBlock"
Nodes (1): StepBlock

### Community 193 - "StepBlockStep"
Nodes (1): StepBlockStep

### Community 194 - "20260711120000_add_baseline_attempt_history"
Nodes (1): 20260711120000_add_baseline_attempt_history

### Community 195 - "BaselineAttempt"
Nodes (1): BaselineAttempt

### Community 196 - "BaselineAttemptEvent"
Nodes (1): BaselineAttemptEvent

### Community 197 - "20260711150000_add_delegated_authorization_nonces"
Nodes (1): 20260711150000_add_delegated_authorization_nonces

### Community 198 - "DelegatedAuthorizationNonce"
Nodes (1): DelegatedAuthorizationNonce

### Community 199 - "20260711170000_add_delegated_ast_submissions"
Nodes (1): 20260711170000_add_delegated_ast_submissions

### Community 200 - "DelegatedValidationAstSubmission"
Nodes (1): DelegatedValidationAstSubmission

### Community 201 - "20260711190000_add_validation_ast_publish_journal"
Nodes (1): 20260711190000_add_validation_ast_publish_journal

### Community 202 - "ValidationAstPublishOperation"
Nodes (1): ValidationAstPublishOperation

### Community 203 - "ValidationExtensionReview"
Nodes (1): ValidationExtensionReview

### Community 204 - "20260711220000_add_runtime_capsules"
Nodes (1): 20260711220000_add_runtime_capsules

### Community 205 - "20260712010000_add_runtime_capsule_execution_attempt"
Nodes (1): 20260712010000_add_runtime_capsule_execution_attempt

### Community 206 - "20260712020000_add_test_run_preparation_key"
Nodes (1): 20260712020000_add_test_run_preparation_key

### Community 207 - "20260712180000_add_repository_exports"
Nodes (1): 20260712180000_add_repository_exports

### Community 208 - "RepositoryExportJob"
Nodes (1): RepositoryExportJob

### Community 209 - "RepositoryExportReceipt"
Nodes (1): RepositoryExportReceipt

### Community 210 - "20260713143000_add_project_resource_ownership"
Nodes (1): 20260713143000_add_project_resource_ownership

### Community 211 - "20260713153000_add_validation_resource_proposals"
Nodes (1): 20260713153000_add_validation_resource_proposals

### Community 212 - "ValidationResourceProposal"
Nodes (1): ValidationResourceProposal

### Community 213 - "20260713163000_normalize_managed_validation_vocabulary"
Nodes (1): 20260713163000_normalize_managed_validation_vocabulary

### Community 214 - "20260713173000_add_named_plan_hashes"
Nodes (1): 20260713173000_add_named_plan_hashes

### Community 215 - "20260713183000_add_delegated_coordinator_receipts"
Nodes (1): 20260713183000_add_delegated_coordinator_receipts

### Community 216 - "DelegatedCoordinatorConsumption"
Nodes (1): DelegatedCoordinatorConsumption

### Community 217 - "DelegatedCoordinatorReceipt"
Nodes (1): DelegatedCoordinatorReceipt

### Community 218 - "20260713200000_stage_complete_project_ownership"
Nodes (1): 20260713200000_stage_complete_project_ownership

### Community 219 - "20260713210000_add_target_project_description"
Nodes (1): 20260713210000_add_target_project_description

### Community 220 - "20260713211000_scope_test_run_preparation_key"
Nodes (1): 20260713211000_scope_test_run_preparation_key

### Community 221 - "20260714000000_make_template_library_shared"
Nodes (1): 20260714000000_make_template_library_shared

### Community 222 - "20260714143000_add_validation_review_state_receipt"
Nodes (1): 20260714143000_add_validation_review_state_receipt

### Community 223 - "20260714160500_scope_environment_names_to_project"
Nodes (1): 20260714160500_scope_environment_names_to_project

### Community 224 - "20260716190000_replace_environment_password_with_reference"
Nodes (1): 20260716190000_replace_environment_password_with_reference

### Community 225 - "new_Environment"
Nodes (1): new_Environment

### Community 226 - "20260716210000_add_measured_test_run_pagination_index"
Nodes (1): 20260716210000_add_measured_test_run_pagination_index

### Community 227 - "20260718110000_add_agent_preflight_receipts"
Nodes (1): 20260718110000_add_agent_preflight_receipts

### Community 228 - "20260718160000_add_plan_observability"
Nodes (1): 20260718160000_add_plan_observability

### Community 229 - "LifecycleCertificationReceipt"
Nodes (1): LifecycleCertificationReceipt

### Community 230 - "PlanOperationMetric"
Nodes (1): PlanOperationMetric

### Community 231 - "20260718193000_add_environment_identity_expectation"
Nodes (1): 20260718193000_add_environment_identity_expectation

### Community 232 - "20260720010000_add_canonical_operation_mappings"
Nodes (1): 20260720010000_add_canonical_operation_mappings

### Community 233 - "20260722013000_scope_locator_group_names_to_project"
Nodes (1): 20260722013000_scope_locator_group_names_to_project

### Community 234 - "20260722190000_add_step_definition_registry"
Nodes (1): 20260722190000_add_step_definition_registry

### Community 235 - "StepCompatibilityReference"
Nodes (1): StepCompatibilityReference

### Community 236 - "20260722223000_add_step_definition_reviewed_extensions"
Nodes (1): 20260722223000_add_step_definition_reviewed_extensions

### Community 237 - "20260725190000_add_step_block_migration_ledger"
Nodes (1): 20260725190000_add_step_block_migration_ledger

### Community 238 - "StepBlockMigrationLedger"
Nodes (1): StepBlockMigrationLedger

### Community 239 - "_LegacyCompositionDefinition"
Nodes (1): _LegacyCompositionDefinition

### Community 240 - "20260725193000_make_validation_projection_template_step_optional"
Nodes (1): 20260725193000_make_validation_projection_template_step_optional

### Community 241 - "new_TestCaseStep"
Nodes (1): new_TestCaseStep

### Community 242 - "20260725194500_cut_over_authored_steps_to_step_invocations"
Nodes (1): 20260725194500_cut_over_authored_steps_to_step_invocations

### Community 243 - "IF"
Nodes (1): IF

### Community 244 - "20260725200000_remove_legacy_step_authority"
Nodes (1): 20260725200000_remove_legacy_step_authority

### Community 245 - "20260725201000_add_step_definition_telemetry"
Nodes (1): 20260725201000_add_step_definition_telemetry

### Community 246 - "20260725202000_add_step_definition_reuse_justification"
Nodes (1): 20260725202000_add_step_definition_reuse_justification

### Community 247 - "20260725203000_add_step_definition_review_receipts"
Nodes (1): 20260725203000_add_step_definition_review_receipts

### Community 248 - "20260725204000_harden_step_definition_evidence_and_telemetry"
Nodes (1): 20260725204000_harden_step_definition_evidence_and_telemetry

### Community 249 - "20260725205000_add_reviewed_extension_revocation"
Nodes (1): 20260725205000_add_reviewed_extension_revocation

### Community 250 - "20260725206000_add_step_definition_search_receipts"
Nodes (1): 20260725206000_add_step_definition_search_receipts

### Community 251 - "20260906090000_quality_journey_authority"
Nodes (1): 20260906090000_quality_journey_authority

### Community 252 - "new_DashboardMetrics"
Nodes (1): new_DashboardMetrics

### Community 253 - "new_Locator"
Nodes (1): new_Locator

### Community 254 - "new_LocatorGroup"
Nodes (1): new_LocatorGroup

### Community 255 - "new_Module"
Nodes (1): new_Module

### Community 256 - "new_ProjectResourceOwnership"
Nodes (1): new_ProjectResourceOwnership

### Community 257 - "new_Report"
Nodes (1): new_Report

### Community 258 - "new_StepDefinitionSearchReceipt"
Nodes (1): new_StepDefinitionSearchReceipt

### Community 259 - "new_StepDefinitionTelemetryEvent"
Nodes (1): new_StepDefinitionTelemetryEvent

### Community 260 - "new_TargetProject"
Nodes (1): new_TargetProject

### Community 261 - "new_TemplateTestCase"
Nodes (1): new_TemplateTestCase

### Community 262 - "new_TestCase"
Nodes (1): new_TestCase

### Community 263 - "new_TestCaseMetrics"
Nodes (1): new_TestCaseMetrics

### Community 264 - "new_TestSuite"
Nodes (1): new_TestSuite

### Community 265 - "new_TestSuiteMetrics"
Nodes (1): new_TestSuiteMetrics

### Community 266 - "20260906180000_add_quality_journey_coordinator_handoffs"
Nodes (1): 20260906180000_add_quality_journey_coordinator_handoffs

### Community 267 - "20260907090000_add_quality_journey_drafts"
Nodes (1): 20260907090000_add_quality_journey_drafts

## Suggested Questions
- Which models connect a Quality Journey to its execution and evidence records?
- Which models enforce Journey artifact lineage?
- Which models depend on Locator or TestRun?
- Which enums are used by execution report models?
