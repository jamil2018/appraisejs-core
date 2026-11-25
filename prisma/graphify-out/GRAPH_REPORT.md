# Graph Report - prisma

## Corpus Check
- 104 files from prisma/schema.prisma and migrations
- Verdict: schema-aware graph generated because Graphify AST extraction does not currently produce Prisma/SQL nodes.

## Summary
- 2773 nodes · 6498 edges · 363 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `String` - 1179 edges
2. `schema.prisma` - 288 edges
3. `QualityJourney` - 279 edges
4. `DateTime` - 274 edges
5. `Int` - 170 edges
6. `TargetProject` - 151 edges
7. `QualityJourneyWorkAttempt` - 109 edges
8. `QualityJourneyCoordinatorSession` - 100 edges
9. `QualityJourneyProviderRun` - 98 edges
10. `20260906090000_quality_journey_authority` - 98 edges

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

## Communities (363 total)
### Community 0 - "schema.prisma"
Nodes (3): schema.prisma, datasource db (sqlite), Prisma client generator

### Community 1 - "TestSuite"
Nodes (17): TestSuite, TestSuite.id, TestSuite.name, TestSuite.description, TestSuite.createdAt, TestSuite.updatedAt, TestSuite.moduleId, TestSuite.module (+more)

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
Nodes (19): TestCase, TestCase.id, TestCase.title, TestCase.description, TestCase.createdAt, TestCase.updatedAt, TestCase.linkedJiraTickets, TestCase.reviews (+more)

### Community 17 - "TestCaseStep"
Nodes (12): TestCaseStep, TestCaseStep.id, TestCaseStep.flowNodeId, TestCaseStep.testCaseId, TestCaseStep.order, TestCaseStep.gherkinStep, TestCaseStep.icon, TestCaseStep.label (+more)

### Community 18 - "TestCaseFlowBlock"
Nodes (8): TestCaseFlowBlock, TestCaseFlowBlock.id, TestCaseFlowBlock.name, TestCaseFlowBlock.testCaseId, TestCaseFlowBlock.order, TestCaseFlowBlock.testCase, TestCaseFlowBlock.nodes, TestCaseFlowBlock.collaborationPortableId

### Community 19 - "TestCaseFlowBlockNode"
Nodes (5): TestCaseFlowBlockNode, TestCaseFlowBlockNode.id, TestCaseFlowBlockNode.flowNodeId, TestCaseFlowBlockNode.flowBlockId, TestCaseFlowBlockNode.flowBlock

### Community 20 - "TemplateTestCase"
Nodes (13): TemplateTestCase, TemplateTestCase.id, TemplateTestCase.name, TemplateTestCase.description, TemplateTestCase.createdAt, TemplateTestCase.updatedAt, TemplateTestCase.steps, TemplateTestCase.flowBlocks (+more)

### Community 21 - "TemplateTestCaseStep"
Nodes (12): TemplateTestCaseStep, TemplateTestCaseStep.id, TemplateTestCaseStep.flowNodeId, TemplateTestCaseStep.order, TemplateTestCaseStep.gherkinStep, TemplateTestCaseStep.icon, TemplateTestCaseStep.label, TemplateTestCaseStep.templateTestCaseId (+more)

### Community 22 - "TemplateTestCaseFlowBlock"
Nodes (8): TemplateTestCaseFlowBlock, TemplateTestCaseFlowBlock.id, TemplateTestCaseFlowBlock.name, TemplateTestCaseFlowBlock.templateTestCaseId, TemplateTestCaseFlowBlock.order, TemplateTestCaseFlowBlock.templateTestCase, TemplateTestCaseFlowBlock.nodes, TemplateTestCaseFlowBlock.collaborationPortableId

### Community 23 - "TemplateTestCaseFlowBlockNode"
Nodes (5): TemplateTestCaseFlowBlockNode, TemplateTestCaseFlowBlockNode.id, TemplateTestCaseFlowBlockNode.flowNodeId, TemplateTestCaseFlowBlockNode.flowBlockId, TemplateTestCaseFlowBlockNode.flowBlock

### Community 24 - "TemplateTestCaseStepParameter"
Nodes (11): TemplateTestCaseStepParameter, TemplateTestCaseStepParameter.id, TemplateTestCaseStepParameter.name, TemplateTestCaseStepParameter.defaultValue, TemplateTestCaseStepParameter.order, TemplateTestCaseStepParameter.testCaseStepId, TemplateTestCaseStepParameter.locatorId, TemplateTestCaseStepParameter.type (+more)

### Community 25 - "TestCaseStepParameter"
Nodes (10): TestCaseStepParameter, TestCaseStepParameter.id, TestCaseStepParameter.name, TestCaseStepParameter.value, TestCaseStepParameter.order, TestCaseStepParameter.testCaseStepId, TestCaseStepParameter.locatorId, TestCaseStepParameter.type (+more)

### Community 26 - "Locator"
Nodes (16): Locator, Locator.id, Locator.name, Locator.value, Locator.createdAt, Locator.updatedAt, Locator.locatorGroupId, Locator.locatorGroup (+more)

### Community 27 - "LocatorGroup"
Nodes (14): LocatorGroup, LocatorGroup.id, LocatorGroup.name, LocatorGroup.route, LocatorGroup.createdAt, LocatorGroup.updatedAt, LocatorGroup.moduleId, LocatorGroup.locators (+more)

### Community 28 - "Module"
Nodes (15): Module, Module.id, Module.name, Module.parentId, Module.createdAt, Module.updatedAt, Module.locatorGroups, Module.parent (+more)

### Community 29 - "TestRunTestCase"
Nodes (12): TestRunTestCase, TestRunTestCase.id, TestRunTestCase.testRunId, TestRunTestCase.testCaseId, TestRunTestCase.testSuiteId, TestRunTestCase.status, TestRunTestCase.result, TestRunTestCase.tracePath (+more)

### Community 30 - "TestRun"
Nodes (31): TestRun, TestRun.id, TestRun.name, TestRun.preparationKey, TestRun.runId, TestRun.startedAt, TestRun.completedAt, TestRun.status (+more)

### Community 31 - "TargetProject"
Nodes (41): TargetProject, TargetProject.id, TargetProject.kind, TargetProject.canonicalIdentity, TargetProject.canonicalPath, TargetProject.normalizedRemoteOrigin, TargetProject.displayName, TargetProject.description (+more)

### Community 32 - "ProjectConversationRole"
Nodes (3): ProjectConversationRole, ProjectConversationRole.USER, ProjectConversationRole.APPRAISE

### Community 33 - "ProjectConversationReadProvider"
Nodes (5): ProjectConversationReadProvider, ProjectConversationReadProvider.LOCAL, ProjectConversationReadProvider.CHATGPT, ProjectConversationReadProvider.CLAUDE, ProjectConversationReadProvider.CURSOR

### Community 34 - "ProjectConversationChatGptEngine"
Nodes (3): ProjectConversationChatGptEngine, ProjectConversationChatGptEngine.RESPONSES, ProjectConversationChatGptEngine.CODEX

### Community 35 - "ProjectConversationReadEngine"
Nodes (5): ProjectConversationReadEngine, ProjectConversationReadEngine.RESPONSES, ProjectConversationReadEngine.CODEX, ProjectConversationReadEngine.CLAUDE_CODE, ProjectConversationReadEngine.CURSOR_CLI

### Community 36 - "ProjectConversationReadState"
Nodes (5): ProjectConversationReadState, ProjectConversationReadState.RUNNING, ProjectConversationReadState.COMPLETED, ProjectConversationReadState.FAILED, ProjectConversationReadState.UNKNOWN

### Community 37 - "ProjectConversation"
Nodes (12): ProjectConversation, ProjectConversation.id, ProjectConversation.targetProjectId, ProjectConversation.targetProject, ProjectConversation.title, ProjectConversation.initialIdempotencyKey, ProjectConversation.nextOrdinal, ProjectConversation.createdAt (+more)

### Community 38 - "ProjectConversationMessage"
Nodes (14): ProjectConversationMessage, ProjectConversationMessage.id, ProjectConversationMessage.conversationId, ProjectConversationMessage.conversation, ProjectConversationMessage.ordinal, ProjectConversationMessage.role, ProjectConversationMessage.content, ProjectConversationMessage.contextJson (+more)

### Community 39 - "ProjectConversationRead"
Nodes (14): ProjectConversationRead, ProjectConversationRead.id, ProjectConversationRead.conversationId, ProjectConversationRead.messageId, ProjectConversationRead.message, ProjectConversationRead.provider, ProjectConversationRead.engine, ProjectConversationRead.state (+more)

### Community 40 - "QualityJourney"
Nodes (76): QualityJourney, QualityJourney.closure, QualityJourney.activeTriageReportId, QualityJourney.activeTriageReport, QualityJourney.triageAssignments, QualityJourney.triageReports, QualityJourney.reportReviews, QualityJourney.id (+more)

### Community 41 - "QualityJourneyOwnedBrowser"
Nodes (15): QualityJourneyOwnedBrowser, QualityJourneyOwnedBrowser.id, QualityJourneyOwnedBrowser.journeyId, QualityJourneyOwnedBrowser.targetProjectId, QualityJourneyOwnedBrowser.processInstanceId, QualityJourneyOwnedBrowser.sessionId, QualityJourneyOwnedBrowser.generation, QualityJourneyOwnedBrowser.status (+more)

### Community 42 - "QualityJourneyDraftStatus"
Nodes (4): QualityJourneyDraftStatus, QualityJourneyDraftStatus.ACTIVE, QualityJourneyDraftStatus.ARCHIVED, QualityJourneyDraftStatus.CONFIRMED

### Community 43 - "QualityJourneyDraft"
Nodes (24): QualityJourneyDraft, QualityJourneyDraft.id, QualityJourneyDraft.targetProjectId, QualityJourneyDraft.createIdempotencyKey, QualityJourneyDraft.createRequestHash, QualityJourneyDraft.status, QualityJourneyDraft.requirementJson, QualityJourneyDraft.currentStep (+more)

### Community 44 - "QualityJourneyDraftReuseAnnotation"
Nodes (11): QualityJourneyDraftReuseAnnotation, QualityJourneyDraftReuseAnnotation.id, QualityJourneyDraftReuseAnnotation.draftId, QualityJourneyDraftReuseAnnotation.bindingId, QualityJourneyDraftReuseAnnotation.assetPortableId, QualityJourneyDraftReuseAnnotation.sourceVersion, QualityJourneyDraftReuseAnnotation.payloadHash, QualityJourneyDraftReuseAnnotation.sourceRevision (+more)

### Community 45 - "QualityJourneyReuseSeedKind"
Nodes (3): QualityJourneyReuseSeedKind, QualityJourneyReuseSeedKind.ANALYSIS, QualityJourneyReuseSeedKind.SCENARIO

### Community 46 - "QualityJourneyReuseSeed"
Nodes (14): QualityJourneyReuseSeed, QualityJourneyReuseSeed.id, QualityJourneyReuseSeed.draftId, QualityJourneyReuseSeed.bindingId, QualityJourneyReuseSeed.kind, QualityJourneyReuseSeed.assetPortableId, QualityJourneyReuseSeed.sourceVersion, QualityJourneyReuseSeed.sourcePayloadHash (+more)

### Community 47 - "QualityJourneyCoordinatorSession"
Nodes (36): QualityJourneyCoordinatorSession, QualityJourneyCoordinatorSession.id, QualityJourneyCoordinatorSession.journeyId, QualityJourneyCoordinatorSession.targetProjectId, QualityJourneyCoordinatorSession.ownerPrincipalId, QualityJourneyCoordinatorSession.hostKind, QualityJourneyCoordinatorSession.status, QualityJourneyCoordinatorSession.generation (+more)

### Community 48 - "QualityJourneyWorkAttemptSessionBinding"
Nodes (17): QualityJourneyWorkAttemptSessionBinding, QualityJourneyWorkAttemptSessionBinding.attemptId, QualityJourneyWorkAttemptSessionBinding.journeyId, QualityJourneyWorkAttemptSessionBinding.targetProjectId, QualityJourneyWorkAttemptSessionBinding.sessionId, QualityJourneyWorkAttemptSessionBinding.coordinatorGeneration, QualityJourneyWorkAttemptSessionBinding.assignmentGeneration, QualityJourneyWorkAttemptSessionBinding.workItemId (+more)

### Community 49 - "QualityJourneyCoordinatorHandoff"
Nodes (34): QualityJourneyCoordinatorHandoff, QualityJourneyCoordinatorHandoff.id, QualityJourneyCoordinatorHandoff.journeyId, QualityJourneyCoordinatorHandoff.targetProjectId, QualityJourneyCoordinatorHandoff.providerId, QualityJourneyCoordinatorHandoff.status, QualityJourneyCoordinatorHandoff.generation, QualityJourneyCoordinatorHandoff.journeyStateHash (+more)

### Community 50 - "QualityJourneyArtifact"
Nodes (19): QualityJourneyArtifact, QualityJourneyArtifact.id, QualityJourneyArtifact.identityKey, QualityJourneyArtifact.journeyId, QualityJourneyArtifact.targetProjectId, QualityJourneyArtifact.cycleId, QualityJourneyArtifact.kind, QualityJourneyArtifact.artifactId (+more)

### Community 51 - "QualityJourneyAnalysisRevision"
Nodes (27): QualityJourneyAnalysisRevision, QualityJourneyAnalysisRevision.id, QualityJourneyAnalysisRevision.journeyId, QualityJourneyAnalysisRevision.targetProjectId, QualityJourneyAnalysisRevision.cycleId, QualityJourneyAnalysisRevision.artifactRecordId, QualityJourneyAnalysisRevision.artifactId, QualityJourneyAnalysisRevision.artifactRevisionId (+more)

### Community 52 - "QualityJourneyAnalysisQuestion"
Nodes (13): QualityJourneyAnalysisQuestion, QualityJourneyAnalysisQuestion.id, QualityJourneyAnalysisQuestion.journeyId, QualityJourneyAnalysisQuestion.analysisRevisionId, QualityJourneyAnalysisQuestion.artifactRecordId, QualityJourneyAnalysisQuestion.questionId, QualityJourneyAnalysisQuestion.contentHash, QualityJourneyAnalysisQuestion.required (+more)

### Community 53 - "QualityJourneyAnalysisAnswer"
Nodes (17): QualityJourneyAnalysisAnswer, QualityJourneyAnalysisAnswer.id, QualityJourneyAnalysisAnswer.journeyId, QualityJourneyAnalysisAnswer.questionRecordId, QualityJourneyAnalysisAnswer.artifactRecordId, QualityJourneyAnalysisAnswer.answerId, QualityJourneyAnalysisAnswer.contentHash, QualityJourneyAnalysisAnswer.actor (+more)

### Community 54 - "QualityJourneyAnalysisPublication"
Nodes (10): QualityJourneyAnalysisPublication, QualityJourneyAnalysisPublication.id, QualityJourneyAnalysisPublication.journeyId, QualityJourneyAnalysisPublication.analysisRevisionId, QualityJourneyAnalysisPublication.commandId, QualityJourneyAnalysisPublication.artifactHash, QualityJourneyAnalysisPublication.reviewHash, QualityJourneyAnalysisPublication.publishedAt (+more)

### Community 55 - "QualityJourneyAnalysisDecision"
Nodes (15): QualityJourneyAnalysisDecision, QualityJourneyAnalysisDecision.id, QualityJourneyAnalysisDecision.journeyId, QualityJourneyAnalysisDecision.analysisRevisionId, QualityJourneyAnalysisDecision.artifactRecordId, QualityJourneyAnalysisDecision.commandId, QualityJourneyAnalysisDecision.contentHash, QualityJourneyAnalysisDecision.reviewHash (+more)

### Community 56 - "QualityJourneyDiscoveryRevision"
Nodes (52): QualityJourneyDiscoveryRevision, QualityJourneyDiscoveryRevision.id, QualityJourneyDiscoveryRevision.journeyId, QualityJourneyDiscoveryRevision.targetProjectId, QualityJourneyDiscoveryRevision.cycleId, QualityJourneyDiscoveryRevision.analysisRevisionId, QualityJourneyDiscoveryRevision.analysisDecisionId, QualityJourneyDiscoveryRevision.analysisArtifactId (+more)

### Community 57 - "QualityJourneyScenarioPortfolioRevision"
Nodes (43): QualityJourneyScenarioPortfolioRevision, QualityJourneyScenarioPortfolioRevision.id, QualityJourneyScenarioPortfolioRevision.journeyId, QualityJourneyScenarioPortfolioRevision.targetProjectId, QualityJourneyScenarioPortfolioRevision.cycleId, QualityJourneyScenarioPortfolioRevision.discoveryRevisionId, QualityJourneyScenarioPortfolioRevision.discoveryCompletionHash, QualityJourneyScenarioPortfolioRevision.predecessorPortfolioRevisionId (+more)

### Community 58 - "QualityJourneyScenarioRevision"
Nodes (17): QualityJourneyScenarioRevision, QualityJourneyScenarioRevision.id, QualityJourneyScenarioRevision.portfolioRevisionId, QualityJourneyScenarioRevision.stableScenarioId, QualityJourneyScenarioRevision.scenarioRevisionId, QualityJourneyScenarioRevision.behavioralIntentJson, QualityJourneyScenarioRevision.behavioralIntentHash, QualityJourneyScenarioRevision.enrichmentJson (+more)

### Community 59 - "QualityJourneyPreparedRuntimeCapsule"
Nodes (14): QualityJourneyPreparedRuntimeCapsule, QualityJourneyPreparedRuntimeCapsule.id, QualityJourneyPreparedRuntimeCapsule.journeyId, QualityJourneyPreparedRuntimeCapsule.targetProjectId, QualityJourneyPreparedRuntimeCapsule.cycleId, QualityJourneyPreparedRuntimeCapsule.materializationId, QualityJourneyPreparedRuntimeCapsule.inputHash, QualityJourneyPreparedRuntimeCapsule.capsuleHash (+more)

### Community 60 - "QualityJourneyAutomationMaterialization"
Nodes (39): QualityJourneyAutomationMaterialization, QualityJourneyAutomationMaterialization.id, QualityJourneyAutomationMaterialization.journeyId, QualityJourneyAutomationMaterialization.targetProjectId, QualityJourneyAutomationMaterialization.cycleId, QualityJourneyAutomationMaterialization.scenarioRevisionId, QualityJourneyAutomationMaterialization.scenarioContentHash, QualityJourneyAutomationMaterialization.portfolioRevisionId (+more)

### Community 61 - "QualityJourneyAutomationMaterializationSourceProof"
Nodes (6): QualityJourneyAutomationMaterializationSourceProof, QualityJourneyAutomationMaterializationSourceProof.materializationId, QualityJourneyAutomationMaterializationSourceProof.expectedScopeHash, QualityJourneyAutomationMaterializationSourceProof.reconstructionVersion, QualityJourneyAutomationMaterializationSourceProof.createdAt, QualityJourneyAutomationMaterializationSourceProof.materialization

### Community 62 - "QualityJourneyAutomationTargetBinding"
Nodes (16): QualityJourneyAutomationTargetBinding, QualityJourneyAutomationTargetBinding.id, QualityJourneyAutomationTargetBinding.journeyId, QualityJourneyAutomationTargetBinding.targetProjectId, QualityJourneyAutomationTargetBinding.semanticHash, QualityJourneyAutomationTargetBinding.suiteId, QualityJourneyAutomationTargetBinding.testCaseId, QualityJourneyAutomationTargetBinding.suiteHash (+more)

### Community 63 - "QualityJourneyAutomationMaterializationBinding"
Nodes (6): QualityJourneyAutomationMaterializationBinding, QualityJourneyAutomationMaterializationBinding.materializationId, QualityJourneyAutomationMaterializationBinding.bindingId, QualityJourneyAutomationMaterializationBinding.createdAt, QualityJourneyAutomationMaterializationBinding.materialization, QualityJourneyAutomationMaterializationBinding.targetBinding

### Community 64 - "QualityJourneyAutomationRequestReceipt"
Nodes (14): QualityJourneyAutomationRequestReceipt, QualityJourneyAutomationRequestReceipt.id, QualityJourneyAutomationRequestReceipt.journeyId, QualityJourneyAutomationRequestReceipt.workItemId, QualityJourneyAutomationRequestReceipt.attemptId, QualityJourneyAutomationRequestReceipt.ownerTokenHash, QualityJourneyAutomationRequestReceipt.idempotencyKey, QualityJourneyAutomationRequestReceipt.requestHash (+more)

### Community 65 - "QualityJourneyScenarioDecision"
Nodes (17): QualityJourneyScenarioDecision, QualityJourneyScenarioDecision.id, QualityJourneyScenarioDecision.portfolioRevisionId, QualityJourneyScenarioDecision.scenarioRevisionId, QualityJourneyScenarioDecision.decision, QualityJourneyScenarioDecision.feedback, QualityJourneyScenarioDecision.actor, QualityJourneyScenarioDecision.idempotencyKey (+more)

### Community 66 - "QualityJourneyScenarioReviewComment"
Nodes (19): QualityJourneyScenarioReviewComment, QualityJourneyScenarioReviewComment.id, QualityJourneyScenarioReviewComment.portfolioRevisionId, QualityJourneyScenarioReviewComment.scenarioRevisionId, QualityJourneyScenarioReviewComment.comment, QualityJourneyScenarioReviewComment.blocking, QualityJourneyScenarioReviewComment.disposition, QualityJourneyScenarioReviewComment.disposedAt (+more)

### Community 67 - "QualityJourneyScenarioDecisionReceipt"
Nodes (10): QualityJourneyScenarioDecisionReceipt, QualityJourneyScenarioDecisionReceipt.id, QualityJourneyScenarioDecisionReceipt.journeyId, QualityJourneyScenarioDecisionReceipt.portfolioRevisionId, QualityJourneyScenarioDecisionReceipt.idempotencyKey, QualityJourneyScenarioDecisionReceipt.requestHash, QualityJourneyScenarioDecisionReceipt.resultJson, QualityJourneyScenarioDecisionReceipt.createdAt (+more)

### Community 68 - "QualityJourneyRevision"
Nodes (8): QualityJourneyRevision, QualityJourneyRevision.id, QualityJourneyRevision.journeyId, QualityJourneyRevision.revision, QualityJourneyRevision.contentJson, QualityJourneyRevision.contentHash, QualityJourneyRevision.createdAt, QualityJourneyRevision.journey

### Community 69 - "QualityJourneyCycle"
Nodes (9): QualityJourneyCycle, QualityJourneyCycle.remediationReview, QualityJourneyCycle.id, QualityJourneyCycle.journeyId, QualityJourneyCycle.sequence, QualityJourneyCycle.predecessorCycleId, QualityJourneyCycle.scopeJson, QualityJourneyCycle.createdAt (+more)

### Community 70 - "QualityJourneyExecutionCycle"
Nodes (30): QualityJourneyExecutionCycle, QualityJourneyExecutionCycle.triageAssignments, QualityJourneyExecutionCycle.id, QualityJourneyExecutionCycle.journeyId, QualityJourneyExecutionCycle.targetProjectId, QualityJourneyExecutionCycle.cycleId, QualityJourneyExecutionCycle.predecessorExecutionCycleId, QualityJourneyExecutionCycle.preparedCapsulesJson (+more)

### Community 71 - "QualityJourneyExecutionTestRun"
Nodes (10): QualityJourneyExecutionTestRun, QualityJourneyExecutionTestRun.id, QualityJourneyExecutionTestRun.executionCycleId, QualityJourneyExecutionTestRun.preparedCapsuleId, QualityJourneyExecutionTestRun.testRunId, QualityJourneyExecutionTestRun.runId, QualityJourneyExecutionTestRun.status, QualityJourneyExecutionTestRun.createdAt (+more)

### Community 72 - "QualityJourneyExecutionConsent"
Nodes (17): QualityJourneyExecutionConsent, QualityJourneyExecutionConsent.id, QualityJourneyExecutionConsent.journeyId, QualityJourneyExecutionConsent.targetProjectId, QualityJourneyExecutionConsent.executionCycleId, QualityJourneyExecutionConsent.scopeJson, QualityJourneyExecutionConsent.scopeHash, QualityJourneyExecutionConsent.grantSource (+more)

### Community 73 - "QualityJourneyExecutionCancellationReceipt"
Nodes (9): QualityJourneyExecutionCancellationReceipt, QualityJourneyExecutionCancellationReceipt.id, QualityJourneyExecutionCancellationReceipt.journeyId, QualityJourneyExecutionCancellationReceipt.executionCycleId, QualityJourneyExecutionCancellationReceipt.idempotencyKey, QualityJourneyExecutionCancellationReceipt.requestHash, QualityJourneyExecutionCancellationReceipt.createdAt, QualityJourneyExecutionCancellationReceipt.journey (+more)

### Community 74 - "QualityJourneyExecutionEvidenceReceipt"
Nodes (10): QualityJourneyExecutionEvidenceReceipt, QualityJourneyExecutionEvidenceReceipt.id, QualityJourneyExecutionEvidenceReceipt.executionCycleId, QualityJourneyExecutionEvidenceReceipt.testRunId, QualityJourneyExecutionEvidenceReceipt.runtimeBytesHash, QualityJourneyExecutionEvidenceReceipt.receiptHash, QualityJourneyExecutionEvidenceReceipt.evidenceJson, QualityJourneyExecutionEvidenceReceipt.createdAt (+more)

### Community 75 - "QualityJourneyExecutionRerunProposal"
Nodes (20): QualityJourneyExecutionRerunProposal, QualityJourneyExecutionRerunProposal.reportRevisionId, QualityJourneyExecutionRerunProposal.reportHash, QualityJourneyExecutionRerunProposal.id, QualityJourneyExecutionRerunProposal.journeyId, QualityJourneyExecutionRerunProposal.targetProjectId, QualityJourneyExecutionRerunProposal.sourceExecutionCycleId, QualityJourneyExecutionRerunProposal.successorExecutionCycleId (+more)

### Community 76 - "QualityJourneyCommand"
Nodes (11): QualityJourneyCommand, QualityJourneyCommand.id, QualityJourneyCommand.journeyId, QualityJourneyCommand.targetProjectId, QualityJourneyCommand.idempotencyKey, QualityJourneyCommand.requestHash, QualityJourneyCommand.requestJson, QualityJourneyCommand.resultJson (+more)

### Community 77 - "QualityJourneyEvent"
Nodes (12): QualityJourneyEvent, QualityJourneyEvent.id, QualityJourneyEvent.journeyId, QualityJourneyEvent.targetProjectId, QualityJourneyEvent.sequence, QualityJourneyEvent.eventType, QualityJourneyEvent.commandId, QualityJourneyEvent.predecessorStateHash (+more)

### Community 78 - "QualityJourneyWorkItem"
Nodes (29): QualityJourneyWorkItem, QualityJourneyWorkItem.triageAssignment, QualityJourneyWorkItem.id, QualityJourneyWorkItem.journeyId, QualityJourneyWorkItem.targetProjectId, QualityJourneyWorkItem.cycleId, QualityJourneyWorkItem.role, QualityJourneyWorkItem.status (+more)

### Community 79 - "QualityJourneyWorkAuthorization"
Nodes (33): QualityJourneyWorkAuthorization, QualityJourneyWorkAuthorization.id, QualityJourneyWorkAuthorization.journeyId, QualityJourneyWorkAuthorization.targetProjectId, QualityJourneyWorkAuthorization.workItemId, QualityJourneyWorkAuthorization.supersedesAuthorizationId, QualityJourneyWorkAuthorization.role, QualityJourneyWorkAuthorization.roleContractDigest (+more)

### Community 80 - "QualityJourneyWorkAttempt"
Nodes (57): QualityJourneyWorkAttempt, QualityJourneyWorkAttempt.id, QualityJourneyWorkAttempt.workItemId, QualityJourneyWorkAttempt.attempt, QualityJourneyWorkAttempt.status, QualityJourneyWorkAttempt.leaseId, QualityJourneyWorkAttempt.ownerTokenHash, QualityJourneyWorkAttempt.executionMode (+more)

### Community 81 - "QualityJourneyExternalWorkClaimReceipt"
Nodes (25): QualityJourneyExternalWorkClaimReceipt, QualityJourneyExternalWorkClaimReceipt.id, QualityJourneyExternalWorkClaimReceipt.journeyId, QualityJourneyExternalWorkClaimReceipt.targetProjectId, QualityJourneyExternalWorkClaimReceipt.workItemId, QualityJourneyExternalWorkClaimReceipt.attemptId, QualityJourneyExternalWorkClaimReceipt.authorizationId, QualityJourneyExternalWorkClaimReceipt.protocol (+more)

### Community 82 - "QualityJourneyExternalSubmissionAcceptance"
Nodes (19): QualityJourneyExternalSubmissionAcceptance, QualityJourneyExternalSubmissionAcceptance.id, QualityJourneyExternalSubmissionAcceptance.journeyId, QualityJourneyExternalSubmissionAcceptance.targetProjectId, QualityJourneyExternalSubmissionAcceptance.workItemId, QualityJourneyExternalSubmissionAcceptance.attemptId, QualityJourneyExternalSubmissionAcceptance.assignmentId, QualityJourneyExternalSubmissionAcceptance.assignmentGeneration (+more)

### Community 83 - "QualityJourneyBlocker"
Nodes (16): QualityJourneyBlocker, QualityJourneyBlocker.id, QualityJourneyBlocker.journeyId, QualityJourneyBlocker.targetProjectId, QualityJourneyBlocker.reasonCode, QualityJourneyBlocker.summary, QualityJourneyBlocker.evidenceJson, QualityJourneyBlocker.responsibleActor (+more)

### Community 84 - "QualityJourneyArtifactLink"
Nodes (11): QualityJourneyArtifactLink, QualityJourneyArtifactLink.id, QualityJourneyArtifactLink.journeyId, QualityJourneyArtifactLink.targetProjectId, QualityJourneyArtifactLink.cycleId, QualityJourneyArtifactLink.relation, QualityJourneyArtifactLink.sourceJson, QualityJourneyArtifactLink.targetJson (+more)

### Community 85 - "AgentPreflightReceipt"
Nodes (15): AgentPreflightReceipt, AgentPreflightReceipt.id, AgentPreflightReceipt.coordinatorId, AgentPreflightReceipt.schemaVersion, AgentPreflightReceipt.status, AgentPreflightReceipt.ready, AgentPreflightReceipt.snapshotHash, AgentPreflightReceipt.snapshotJson (+more)

### Community 86 - "ProjectResourceOwnership"
Nodes (13): ProjectResourceOwnership, ProjectResourceOwnership.id, ProjectResourceOwnership.entityType, ProjectResourceOwnership.entityId, ProjectResourceOwnership.scope, ProjectResourceOwnership.targetProjectId, ProjectResourceOwnership.origin, ProjectResourceOwnership.provenanceJson (+more)

### Community 87 - "ProjectResourceImport"
Nodes (11): ProjectResourceImport, ProjectResourceImport.id, ProjectResourceImport.sourceOwnershipId, ProjectResourceImport.destinationProjectId, ProjectResourceImport.sharingMode, ProjectResourceImport.sourceContentHash, ProjectResourceImport.actor, ProjectResourceImport.propagationPolicy (+more)

### Community 88 - "ResourceScope"
Nodes (7): ResourceScope, ResourceScope.system, ResourceScope.global_library, ResourceScope.project, ResourceScope.publication, ResourceScope.runtime, ResourceScope.quarantined

### Community 89 - "ResourceSharingMode"
Nodes (3): ResourceSharingMode, ResourceSharingMode.immutable_reference, ResourceSharingMode.copy

### Community 90 - "RuntimeCapsule"
Nodes (17): RuntimeCapsule, RuntimeCapsule.id, RuntimeCapsule.targetProjectId, RuntimeCapsule.testRunId, RuntimeCapsule.validationHash, RuntimeCapsule.capsuleHash, RuntimeCapsule.manifestHash, RuntimeCapsule.manifestJson (+more)

### Community 91 - "RuntimeCapsuleExecutionAttempt"
Nodes (21): RuntimeCapsuleExecutionAttempt, RuntimeCapsuleExecutionAttempt.id, RuntimeCapsuleExecutionAttempt.testRunId, RuntimeCapsuleExecutionAttempt.capsuleId, RuntimeCapsuleExecutionAttempt.receiptHash, RuntimeCapsuleExecutionAttempt.preflightResultJson, RuntimeCapsuleExecutionAttempt.preflightResultHash, RuntimeCapsuleExecutionAttempt.preflightCheckedAt (+more)

### Community 92 - "RuntimeCapsuleExecutionAttemptState"
Nodes (8): RuntimeCapsuleExecutionAttemptState, RuntimeCapsuleExecutionAttemptState.PREPARED, RuntimeCapsuleExecutionAttemptState.STARTING, RuntimeCapsuleExecutionAttemptState.RUNNING, RuntimeCapsuleExecutionAttemptState.COMPLETED, RuntimeCapsuleExecutionAttemptState.FAILED, RuntimeCapsuleExecutionAttemptState.CANCELLED, RuntimeCapsuleExecutionAttemptState.INTERRUPTED

### Community 93 - "RuntimeCapsuleBlob"
Nodes (12): RuntimeCapsuleBlob, RuntimeCapsuleBlob.id, RuntimeCapsuleBlob.targetProjectId, RuntimeCapsuleBlob.contentHash, RuntimeCapsuleBlob.size, RuntimeCapsuleBlob.storagePath, RuntimeCapsuleBlob.integrityState, RuntimeCapsuleBlob.version (+more)

### Community 94 - "RuntimeCapsuleBlobReference"
Nodes (7): RuntimeCapsuleBlobReference, RuntimeCapsuleBlobReference.id, RuntimeCapsuleBlobReference.capsuleId, RuntimeCapsuleBlobReference.blobId, RuntimeCapsuleBlobReference.filePath, RuntimeCapsuleBlobReference.capsule, RuntimeCapsuleBlobReference.blob

### Community 95 - "RuntimeCapsuleIntegrityState"
Nodes (5): RuntimeCapsuleIntegrityState, RuntimeCapsuleIntegrityState.staging, RuntimeCapsuleIntegrityState.ready, RuntimeCapsuleIntegrityState.missing, RuntimeCapsuleIntegrityState.corrupt

### Community 96 - "RuntimeCapsuleLease"
Nodes (11): RuntimeCapsuleLease, RuntimeCapsuleLease.id, RuntimeCapsuleLease.targetProjectId, RuntimeCapsuleLease.validationHash, RuntimeCapsuleLease.runId, RuntimeCapsuleLease.ownerToken, RuntimeCapsuleLease.leaseExpiresAt, RuntimeCapsuleLease.version (+more)

### Community 97 - "TestRunLog"
Nodes (7): TestRunLog, TestRunLog.id, TestRunLog.testRunId, TestRunLog.logs, TestRunLog.createdAt, TestRunLog.updatedAt, TestRunLog.testRun

### Community 98 - "EnvironmentCredentialState"
Nodes (3): EnvironmentCredentialState, EnvironmentCredentialState.NONE, EnvironmentCredentialState.REFERENCE_CONFIGURED

### Community 99 - "CollaborationEntityKind"
Nodes (10): CollaborationEntityKind, CollaborationEntityKind.MODULE, CollaborationEntityKind.TEST_SUITE, CollaborationEntityKind.TEST_CASE, CollaborationEntityKind.TEMPLATE, CollaborationEntityKind.LOCATOR_GROUP, CollaborationEntityKind.LOCATOR, CollaborationEntityKind.TAG (+more)

### Community 100 - "CollaborationOperationIntent"
Nodes (5): CollaborationOperationIntent, CollaborationOperationIntent.RECEIVE, CollaborationOperationIntent.PUBLISH, CollaborationOperationIntent.RECONCILE, CollaborationOperationIntent.UNDO

### Community 101 - "CollaborationOperationState"
Nodes (12): CollaborationOperationState, CollaborationOperationState.QUEUED, CollaborationOperationState.PREPARING, CollaborationOperationState.WAITING_FOR_AGENT, CollaborationOperationState.WAITING_FOR_DECISION, CollaborationOperationState.READY, CollaborationOperationState.APPLYING, CollaborationOperationState.COMPLETED (+more)

### Community 102 - "CollaborationAttemptState"
Nodes (8): CollaborationAttemptState, CollaborationAttemptState.CLAIMED, CollaborationAttemptState.RUNNING, CollaborationAttemptState.PROPOSAL_SUBMITTED, CollaborationAttemptState.COMPLETED, CollaborationAttemptState.FAILED, CollaborationAttemptState.CANCELLED, CollaborationAttemptState.EXPIRED

### Community 103 - "CollaborationConnectionState"
Nodes (4): CollaborationConnectionState, CollaborationConnectionState.OFFLINE, CollaborationConnectionState.CONNECTED, CollaborationConnectionState.STALE

### Community 104 - "CollaborationPermission"
Nodes (8): CollaborationPermission, CollaborationPermission.OBSERVE, CollaborationPermission.PREPARE, CollaborationPermission.INTEGRATE, CollaborationPermission.COMMIT, CollaborationPermission.PUSH, CollaborationPermission.RESOLVE, CollaborationPermission.ARCHIVE

### Community 105 - "CollaborationDecisionKind"
Nodes (6): CollaborationDecisionKind, CollaborationDecisionKind.KEEP_LOCAL, CollaborationDecisionKind.USE_INCOMING, CollaborationDecisionKind.EDIT, CollaborationDecisionKind.ACCEPT, CollaborationDecisionKind.REJECT

### Community 106 - "CollaborationAuthorityAction"
Nodes (3): CollaborationAuthorityAction, CollaborationAuthorityAction.POLICY_UPDATE, CollaborationAuthorityAction.DECIDE

### Community 107 - "CollaborationBinding"
Nodes (31): CollaborationBinding, CollaborationBinding.id, CollaborationBinding.targetProjectId, CollaborationBinding.portableProjectId, CollaborationBinding.repositoryRoot, CollaborationBinding.remoteName, CollaborationBinding.trackedBranch, CollaborationBinding.enabled (+more)

### Community 108 - "CollaborationEntityMap"
Nodes (12): CollaborationEntityMap, CollaborationEntityMap.id, CollaborationEntityMap.bindingId, CollaborationEntityMap.kind, CollaborationEntityMap.portableId, CollaborationEntityMap.localEntityId, CollaborationEntityMap.currentHash, CollaborationEntityMap.archivedAt (+more)

### Community 109 - "CollaborationBaseline"
Nodes (8): CollaborationBaseline, CollaborationBaseline.id, CollaborationBaseline.entityMapId, CollaborationBaseline.payloadJson, CollaborationBaseline.payloadHash, CollaborationBaseline.repositoryRevision, CollaborationBaseline.acknowledgedAt, CollaborationBaseline.entityMap

### Community 110 - "CollaborationEnvironmentMapping"
Nodes (10): CollaborationEnvironmentMapping, CollaborationEnvironmentMapping.id, CollaborationEnvironmentMapping.bindingId, CollaborationEnvironmentMapping.portableId, CollaborationEnvironmentMapping.localEnvironmentId, CollaborationEnvironmentMapping.localScopeVersion, CollaborationEnvironmentMapping.mappingHash, CollaborationEnvironmentMapping.createdAt (+more)

### Community 111 - "CollaborationOperation"
Nodes (42): CollaborationOperation, CollaborationOperation.id, CollaborationOperation.bindingId, CollaborationOperation.intent, CollaborationOperation.trigger, CollaborationOperation.state, CollaborationOperation.version, CollaborationOperation.idempotencyKey (+more)

### Community 112 - "CollaborationOperationStep"
Nodes (20): CollaborationOperationStep, CollaborationOperationStep.id, CollaborationOperationStep.operationId, CollaborationOperationStep.ordinal, CollaborationOperationStep.kind, CollaborationOperationStep.state, CollaborationOperationStep.requiredPermission, CollaborationOperationStep.prerequisiteDigest (+more)

### Community 113 - "CollaborationOperationArtifact"
Nodes (9): CollaborationOperationArtifact, CollaborationOperationArtifact.id, CollaborationOperationArtifact.operationId, CollaborationOperationArtifact.kind, CollaborationOperationArtifact.revision, CollaborationOperationArtifact.payloadJson, CollaborationOperationArtifact.payloadHash, CollaborationOperationArtifact.createdAt (+more)

### Community 114 - "CollaborationAttempt"
Nodes (18): CollaborationAttempt, CollaborationAttempt.id, CollaborationAttempt.operationId, CollaborationAttempt.attemptNumber, CollaborationAttempt.fencingToken, CollaborationAttempt.workerId, CollaborationAttempt.state, CollaborationAttempt.claimTokenHash (+more)

### Community 115 - "CollaborationPolicyGrant"
Nodes (12): CollaborationPolicyGrant, CollaborationPolicyGrant.id, CollaborationPolicyGrant.bindingId, CollaborationPolicyGrant.permission, CollaborationPolicyGrant.enabled, CollaborationPolicyGrant.policyVersion, CollaborationPolicyGrant.scopeJson, CollaborationPolicyGrant.trustedPrincipalId (+more)

### Community 116 - "CollaborationAuthorityReceipt"
Nodes (16): CollaborationAuthorityReceipt, CollaborationAuthorityReceipt.id, CollaborationAuthorityReceipt.bindingId, CollaborationAuthorityReceipt.action, CollaborationAuthorityReceipt.operationId, CollaborationAuthorityReceipt.policyVersion, CollaborationAuthorityReceipt.requestDigest, CollaborationAuthorityReceipt.tokenHash (+more)

### Community 117 - "CollaborationDecision"
Nodes (11): CollaborationDecision, CollaborationDecision.id, CollaborationDecision.operationId, CollaborationDecision.recordKey, CollaborationDecision.kind, CollaborationDecision.resolutionJson, CollaborationDecision.resolutionDigest, CollaborationDecision.trustedPrincipalId (+more)

### Community 118 - "CollaborationJournalEntry"
Nodes (9): CollaborationJournalEntry, CollaborationJournalEntry.id, CollaborationJournalEntry.operationId, CollaborationJournalEntry.sequence, CollaborationJournalEntry.boundary, CollaborationJournalEntry.status, CollaborationJournalEntry.detailsJson, CollaborationJournalEntry.createdAt (+more)

### Community 119 - "CollaborationWorker"
Nodes (15): CollaborationWorker, CollaborationWorker.id, CollaborationWorker.bindingId, CollaborationWorker.workerIdentity, CollaborationWorker.capabilitiesJson, CollaborationWorker.capabilitiesHash, CollaborationWorker.trustedPrincipalId, CollaborationWorker.provenance (+more)

### Community 120 - "CollaborationHandoffTicket"
Nodes (14): CollaborationHandoffTicket, CollaborationHandoffTicket.id, CollaborationHandoffTicket.bindingId, CollaborationHandoffTicket.operationId, CollaborationHandoffTicket.tokenHash, CollaborationHandoffTicket.scopeJson, CollaborationHandoffTicket.expiresAt, CollaborationHandoffTicket.redeemedAt (+more)

### Community 121 - "CollaborationReuseAsset"
Nodes (11): CollaborationReuseAsset, CollaborationReuseAsset.id, CollaborationReuseAsset.bindingId, CollaborationReuseAsset.portableId, CollaborationReuseAsset.sourceVersion, CollaborationReuseAsset.kind, CollaborationReuseAsset.payloadJson, CollaborationReuseAsset.payloadHash (+more)

### Community 122 - "CollaborationNotification"
Nodes (12): CollaborationNotification, CollaborationNotification.id, CollaborationNotification.bindingId, CollaborationNotification.operationId, CollaborationNotification.dedupeKey, CollaborationNotification.kind, CollaborationNotification.message, CollaborationNotification.actionable (+more)

### Community 123 - "CollaborationMutationLock"
Nodes (6): CollaborationMutationLock, CollaborationMutationLock.lockKey, CollaborationMutationLock.ownerId, CollaborationMutationLock.fencingToken, CollaborationMutationLock.leaseExpiresAt, CollaborationMutationLock.updatedAt

### Community 124 - "Environment"
Nodes (19): Environment, Environment.id, Environment.name, Environment.baseUrl, Environment.expectedPageTitle, Environment.apiBaseUrl, Environment.username, Environment.passwordEnvironmentVariable (+more)

### Community 125 - "Tag"
Nodes (15): Tag, Tag.id, Tag.name, Tag.tagExpression, Tag.type, Tag.createdAt, Tag.updatedAt, Tag.testRuns (+more)

### Community 126 - "ConflictResolution"
Nodes (10): ConflictResolution, ConflictResolution.id, ConflictResolution.entityType, ConflictResolution.entityId, ConflictResolution.conflictType, ConflictResolution.conflictingEntityId, ConflictResolution.resolved, ConflictResolution.createdAt (+more)

### Community 127 - "ReportTestCase"
Nodes (10): ReportTestCase, ReportTestCase.id, ReportTestCase.reportId, ReportTestCase.testCaseId, ReportTestCase.testRunTestCaseId, ReportTestCase.reportScenarioId, ReportTestCase.testRunTestCase, ReportTestCase.report (+more)

### Community 128 - "Report"
Nodes (13): Report, Report.id, Report.name, Report.description, Report.reportPath, Report.createdAt, Report.updatedAt, Report.testRunId (+more)

### Community 129 - "ReportFeature"
Nodes (13): ReportFeature, ReportFeature.id, ReportFeature.reportId, ReportFeature.name, ReportFeature.description, ReportFeature.uri, ReportFeature.line, ReportFeature.keyword (+more)

### Community 130 - "ReportFeatureTag"
Nodes (7): ReportFeatureTag, ReportFeatureTag.id, ReportFeatureTag.reportFeatureId, ReportFeatureTag.tagName, ReportFeatureTag.line, ReportFeatureTag.createdAt, ReportFeatureTag.reportFeature

### Community 131 - "ReportScenario"
Nodes (16): ReportScenario, ReportScenario.id, ReportScenario.reportFeatureId, ReportScenario.name, ReportScenario.description, ReportScenario.line, ReportScenario.keyword, ReportScenario.type (+more)

### Community 132 - "ReportScenarioTag"
Nodes (7): ReportScenarioTag, ReportScenarioTag.id, ReportScenarioTag.reportScenarioId, ReportScenarioTag.tagName, ReportScenarioTag.line, ReportScenarioTag.createdAt, ReportScenarioTag.reportScenario

### Community 133 - "ReportStep"
Nodes (17): ReportStep, ReportStep.id, ReportStep.reportScenarioId, ReportStep.keyword, ReportStep.line, ReportStep.name, ReportStep.matchLocation, ReportStep.status (+more)

### Community 134 - "ReportHook"
Nodes (12): ReportHook, ReportHook.id, ReportHook.reportScenarioId, ReportHook.keyword, ReportHook.status, ReportHook.duration, ReportHook.errorMessage, ReportHook.errorTrace (+more)

### Community 135 - "TestCaseMetrics"
Nodes (17): TestCaseMetrics, TestCaseMetrics.id, TestCaseMetrics.testCaseId, TestCaseMetrics.isRepeatedlyFailing, TestCaseMetrics.isFlaky, TestCaseMetrics.consecutiveFailures, TestCaseMetrics.failureRate, TestCaseMetrics.totalRecentRuns (+more)

### Community 136 - "TestSuiteMetrics"
Nodes (9): TestSuiteMetrics, TestSuiteMetrics.id, TestSuiteMetrics.testSuiteId, TestSuiteMetrics.lastExecutedAt, TestSuiteMetrics.createdAt, TestSuiteMetrics.updatedAt, TestSuiteMetrics.testSuite, TestSuiteMetrics.targetProjectId (+more)

### Community 137 - "DashboardMetrics"
Nodes (10): DashboardMetrics, DashboardMetrics.id, DashboardMetrics.failedRecentRunsCount, DashboardMetrics.repeatedlyFailingTestsCount, DashboardMetrics.flakyTestsCount, DashboardMetrics.suitesNotExecutedRecentlyCount, DashboardMetrics.lastUpdatedAt, DashboardMetrics.createdAt (+more)

### Community 138 - "TagType"
Nodes (3): TagType, TagType.IDENTIFIER, TagType.FILTER

### Community 139 - "TargetProjectKind"
Nodes (3): TargetProjectKind, TargetProjectKind.LOCAL_WORKSPACE, TargetProjectKind.REMOTE_BLACK_BOX

### Community 140 - "TestRunIntent"
Nodes (3): TestRunIntent, TestRunIntent.INDEPENDENT, TestRunIntent.QUALITY_JOURNEY

### Community 141 - "TestRunStatus"
Nodes (6): TestRunStatus, TestRunStatus.QUEUED, TestRunStatus.RUNNING, TestRunStatus.CANCELLING, TestRunStatus.COMPLETED, TestRunStatus.CANCELLED

### Community 142 - "TestRunTestCaseStatus"
Nodes (5): TestRunTestCaseStatus, TestRunTestCaseStatus.PENDING, TestRunTestCaseStatus.RUNNING, TestRunTestCaseStatus.COMPLETED, TestRunTestCaseStatus.CANCELLED

### Community 143 - "TestRunTestCaseResult"
Nodes (4): TestRunTestCaseResult, TestRunTestCaseResult.PASSED, TestRunTestCaseResult.FAILED, TestRunTestCaseResult.UNTESTED

### Community 144 - "TestRunResult"
Nodes (6): TestRunResult, TestRunResult.PENDING, TestRunResult.PASSED, TestRunResult.FAILED, TestRunResult.BLOCKED, TestRunResult.CANCELLED

### Community 145 - "TestRunEvidenceHealth"
Nodes (9): TestRunEvidenceHealth, TestRunEvidenceHealth.valid, TestRunEvidenceHealth.invalid_empty_run, TestRunEvidenceHealth.invalid_missing_test_cases, TestRunEvidenceHealth.invalid_missing_report, TestRunEvidenceHealth.invalid_placeholder_binary, TestRunEvidenceHealth.invalid_unmatched_scenarios, TestRunEvidenceHealth.invalid_stale_runtime (+more)

### Community 146 - "Role"
Nodes (4): Role, Role.ADMIN, Role.TESTER, Role.REVIEWER

### Community 147 - "ReviewStatus"
Nodes (4): ReviewStatus, ReviewStatus.PENDING, ReviewStatus.APPROVED, ReviewStatus.CHANGES_REQUESTED

### Community 148 - "TestCaseStatus"
Nodes (4): TestCaseStatus, TestCaseStatus.PENDING, TestCaseStatus.IN_PROGRESS, TestCaseStatus.COMPLETED

### Community 149 - "TestCaseResult"
Nodes (7): TestCaseResult, TestCaseResult.PASSED, TestCaseResult.FAILED, TestCaseResult.BLOCKED, TestCaseResult.SKIPPED, TestCaseResult.RETEST, TestCaseResult.UNTESTED

### Community 150 - "StepType"
Nodes (3): StepType, StepType.ACTION, StepType.ASSERTION

### Community 151 - "StepParameterType"
Nodes (6): StepParameterType, StepParameterType.NUMBER, StepParameterType.STRING, StepParameterType.DATE, StepParameterType.BOOLEAN, StepParameterType.LOCATOR

### Community 152 - "StepParameterValueType"
Nodes (4): StepParameterValueType, StepParameterValueType.STRING, StepParameterValueType.NUMBER, StepParameterValueType.LOCATOR

### Community 153 - "StepIcon"
Nodes (13): StepIcon, StepIcon.MOUSE, StepIcon.NAVIGATION, StepIcon.INPUT, StepIcon.DOWNLOAD, StepIcon.API, StepIcon.STORE, StepIcon.FORMAT (+more)

### Community 154 - "BrowserEngine"
Nodes (4): BrowserEngine, BrowserEngine.CHROMIUM, BrowserEngine.FIREFOX, BrowserEngine.WEBKIT

### Community 155 - "StepGroupType"
Nodes (3): StepGroupType, StepGroupType.ACTION, StepGroupType.VALIDATION

### Community 156 - "EntityType"
Nodes (2): EntityType, EntityType.LOCATOR

### Community 157 - "ConflictType"
Nodes (3): ConflictType, ConflictType.DUPLICATE_NAME, ConflictType.DUPLICATE_VALUE

### Community 158 - "StepStatus"
Nodes (6): StepStatus, StepStatus.PASSED, StepStatus.FAILED, StepStatus.SKIPPED, StepStatus.PENDING, StepStatus.UNDEFINED

### Community 159 - "StepKeyword"
Nodes (8): StepKeyword, StepKeyword.GIVEN, StepKeyword.WHEN, StepKeyword.THEN, StepKeyword.AND, StepKeyword.BUT, StepKeyword.BEFORE, StepKeyword.AFTER

### Community 160 - "QualityJourneyStage"
Nodes (12): QualityJourneyStage, QualityJourneyStage.INTAKE, QualityJourneyStage.ANALYSIS, QualityJourneyStage.ANALYSIS_REVIEW, QualityJourneyStage.DISCOVERY, QualityJourneyStage.SCENARIO_DESIGN, QualityJourneyStage.SCENARIO_REVIEW, QualityJourneyStage.AUTOMATION (+more)

### Community 161 - "QualityJourneyRole"
Nodes (7): QualityJourneyRole, QualityJourneyRole.REQUIREMENT_ANALYZER, QualityJourneyRole.SCOUT, QualityJourneyRole.RESOURCE_EXPLORER, QualityJourneyRole.TEST_SCENARIO_DESIGNER, QualityJourneyRole.AUTOMATOR, QualityJourneyRole.TRIAGER

### Community 162 - "QualityJourneyWorkItemStatus"
Nodes (18): QualityJourneyWorkItemStatus, QualityJourneyWorkItemStatus.ELIGIBLE, QualityJourneyWorkItemStatus.WORK_ITEM_ISSUED, QualityJourneyWorkItemStatus.WORKER_REQUESTED, QualityJourneyWorkItemStatus.WORKER_STARTED, QualityJourneyWorkItemStatus.IN_PROGRESS, QualityJourneyWorkItemStatus.QUESTION_RAISED, QualityJourneyWorkItemStatus.WAITING_FOR_INPUT (+more)

### Community 163 - "QualityJourneyTriageAssignment"
Nodes (14): QualityJourneyTriageAssignment, QualityJourneyTriageAssignment.id, QualityJourneyTriageAssignment.journeyId, QualityJourneyTriageAssignment.executionCycleId, QualityJourneyTriageAssignment.workItemId, QualityJourneyTriageAssignment.predecessorReportRevisionId, QualityJourneyTriageAssignment.inputHash, QualityJourneyTriageAssignment.inputJson (+more)

### Community 164 - "QualityJourneyTriageReport"
Nodes (15): QualityJourneyTriageReport, QualityJourneyTriageReport.closure, QualityJourneyTriageReport.activeForJourney, QualityJourneyTriageReport.id, QualityJourneyTriageReport.journeyId, QualityJourneyTriageReport.assignmentId, QualityJourneyTriageReport.contentHash, QualityJourneyTriageReport.reportJson (+more)

### Community 165 - "QualityJourneyReportReview"
Nodes (13): QualityJourneyReportReview, QualityJourneyReportReview.id, QualityJourneyReportReview.journeyId, QualityJourneyReportReview.reportRevisionId, QualityJourneyReportReview.kind, QualityJourneyReportReview.feedback, QualityJourneyReportReview.idempotencyKey, QualityJourneyReportReview.requestHash (+more)

### Community 166 - "QualityJourneyClosure"
Nodes (13): QualityJourneyClosure, QualityJourneyClosure.id, QualityJourneyClosure.journeyId, QualityJourneyClosure.reportRevisionId, QualityJourneyClosure.cycleId, QualityJourneyClosure.reportHash, QualityJourneyClosure.contentHash, QualityJourneyClosure.closureJson (+more)

### Community 167 - "QualityJourneyProviderRun"
Nodes (44): QualityJourneyProviderRun, QualityJourneyProviderRun.id, QualityJourneyProviderRun.attemptId, QualityJourneyProviderRun.journeyId, QualityJourneyProviderRun.targetProjectId, QualityJourneyProviderRun.workItemId, QualityJourneyProviderRun.role, QualityJourneyProviderRun.sessionId (+more)

### Community 168 - "QualityJourneyProviderDispatchIntent"
Nodes (29): QualityJourneyProviderDispatchIntent, QualityJourneyProviderDispatchIntent.id, QualityJourneyProviderDispatchIntent.providerRunId, QualityJourneyProviderDispatchIntent.turnOrdinal, QualityJourneyProviderDispatchIntent.operationKey, QualityJourneyProviderDispatchIntent.requestHash, QualityJourneyProviderDispatchIntent.envelopeDigest, QualityJourneyProviderDispatchIntent.status (+more)

### Community 169 - "QualityJourneySharedResourceCoverage"
Nodes (13): QualityJourneySharedResourceCoverage, QualityJourneySharedResourceCoverage.targetProjectId, QualityJourneySharedResourceCoverage.kind, QualityJourneySharedResourceCoverage.protocolVersion, QualityJourneySharedResourceCoverage.state, QualityJourneySharedResourceCoverage.epoch, QualityJourneySharedResourceCoverage.writerClosureDigest, QualityJourneySharedResourceCoverage.readerClosureDigest (+more)

### Community 170 - "QualityJourneySharedResourceGuard"
Nodes (11): QualityJourneySharedResourceGuard, QualityJourneySharedResourceGuard.targetProjectId, QualityJourneySharedResourceGuard.kind, QualityJourneySharedResourceGuard.resourceId, QualityJourneySharedResourceGuard.epoch, QualityJourneySharedResourceGuard.coverageState, QualityJourneySharedResourceGuard.coverageDigest, QualityJourneySharedResourceGuard.resourceState (+more)

### Community 171 - "QualityJourneySharedResourceUse"
Nodes (21): QualityJourneySharedResourceUse, QualityJourneySharedResourceUse.id, QualityJourneySharedResourceUse.journeyId, QualityJourneySharedResourceUse.targetProjectId, QualityJourneySharedResourceUse.sourceKind, QualityJourneySharedResourceUse.sourceOwnerId, QualityJourneySharedResourceUse.sourceDigest, QualityJourneySharedResourceUse.dependencyDigest (+more)

### Community 172 - "QualityJourneySharedResourceClaim"
Nodes (17): QualityJourneySharedResourceClaim, QualityJourneySharedResourceClaim.id, QualityJourneySharedResourceClaim.useId, QualityJourneySharedResourceClaim.journeyId, QualityJourneySharedResourceClaim.targetProjectId, QualityJourneySharedResourceClaim.kind, QualityJourneySharedResourceClaim.resourceId, QualityJourneySharedResourceClaim.dependencyDigest (+more)

### Community 173 - "QualityJourneyLocatorEnsureReceipt"
Nodes (14): QualityJourneyLocatorEnsureReceipt, QualityJourneyLocatorEnsureReceipt.id, QualityJourneyLocatorEnsureReceipt.journeyId, QualityJourneyLocatorEnsureReceipt.targetProjectId, QualityJourneyLocatorEnsureReceipt.coordinatorSessionId, QualityJourneyLocatorEnsureReceipt.generation, QualityJourneyLocatorEnsureReceipt.requestHash, QualityJourneyLocatorEnsureReceipt.resultHash (+more)

### Community 174 - "QualityJourneyE2CampaignPolicy"
Nodes (42): QualityJourneyE2CampaignPolicy, QualityJourneyE2CampaignPolicy.id, QualityJourneyE2CampaignPolicy.allocationDigest, QualityJourneyE2CampaignPolicy.journeyId, QualityJourneyE2CampaignPolicy.targetProjectId, QualityJourneyE2CampaignPolicy.sourceTupleDigest, QualityJourneyE2CampaignPolicy.policyVersion, QualityJourneyE2CampaignPolicy.policyDigest (+more)

### Community 175 - "QualityJourneyE2OperationPreparation"
Nodes (26): QualityJourneyE2OperationPreparation, QualityJourneyE2OperationPreparation.id, QualityJourneyE2OperationPreparation.journeyId, QualityJourneyE2OperationPreparation.targetProjectId, QualityJourneyE2OperationPreparation.coordinatorSessionId, QualityJourneyE2OperationPreparation.generation, QualityJourneyE2OperationPreparation.providerRunId, QualityJourneyE2OperationPreparation.intentId (+more)

### Community 176 - "QualityJourneyE2Retirement"
Nodes (18): QualityJourneyE2Retirement, QualityJourneyE2Retirement.id, QualityJourneyE2Retirement.journeyId, QualityJourneyE2Retirement.targetProjectId, QualityJourneyE2Retirement.coordinatorSessionId, QualityJourneyE2Retirement.generation, QualityJourneyE2Retirement.state, QualityJourneyE2Retirement.requestId (+more)

### Community 177 - "QualityJourneyE2ActorCustody"
Nodes (29): QualityJourneyE2ActorCustody, QualityJourneyE2ActorCustody.id, QualityJourneyE2ActorCustody.providerRunId, QualityJourneyE2ActorCustody.journeyId, QualityJourneyE2ActorCustody.targetProjectId, QualityJourneyE2ActorCustody.coordinatorSessionId, QualityJourneyE2ActorCustody.generation, QualityJourneyE2ActorCustody.intentId (+more)

### Community 178 - "QualityJourneyE2Grant"
Nodes (48): QualityJourneyE2Grant, QualityJourneyE2Grant.id, QualityJourneyE2Grant.providerRunId, QualityJourneyE2Grant.actorCustodyId, QualityJourneyE2Grant.intentId, QualityJourneyE2Grant.journeyId, QualityJourneyE2Grant.targetProjectId, QualityJourneyE2Grant.coordinatorSessionId (+more)

### Community 179 - "QualityJourneyProviderSlot"
Nodes (9): QualityJourneyProviderSlot, QualityJourneyProviderSlot.id, QualityJourneyProviderSlot.providerRunId, QualityJourneyProviderSlot.intentId, QualityJourneyProviderSlot.sendBoundaryId, QualityJourneyProviderSlot.version, QualityJourneyProviderSlot.reservedAt, QualityJourneyProviderSlot.run (+more)

### Community 180 - "QualityJourneyProviderObservation"
Nodes (15): QualityJourneyProviderObservation, QualityJourneyProviderObservation.id, QualityJourneyProviderObservation.intentId, QualityJourneyProviderObservation.observationKey, QualityJourneyProviderObservation.kind, QualityJourneyProviderObservation.requestHash, QualityJourneyProviderObservation.sendBoundaryId, QualityJourneyProviderObservation.providerNamespace (+more)

### Community 181 - "QualityJourneyWakeIntent"
Nodes (15): QualityJourneyWakeIntent, QualityJourneyWakeIntent.id, QualityJourneyWakeIntent.journeyId, QualityJourneyWakeIntent.targetProjectId, QualityJourneyWakeIntent.causeKey, QualityJourneyWakeIntent.reason, QualityJourneyWakeIntent.highWaterSequence, QualityJourneyWakeIntent.status (+more)

### Community 182 - "QualityJourneyProviderSourceState"
Nodes (29): QualityJourneyProviderSourceState, QualityJourneyProviderSourceState.sourceId, QualityJourneyProviderSourceState.sourceIncarnation, QualityJourneyProviderSourceState.providerRunId, QualityJourneyProviderSourceState.intentId, QualityJourneyProviderSourceState.providerNamespace, QualityJourneyProviderSourceState.identityJson, QualityJourneyProviderSourceState.protocolDigest (+more)

### Community 183 - "QualityJourneyProviderSourceLedgerRecord"
Nodes (9): QualityJourneyProviderSourceLedgerRecord, QualityJourneyProviderSourceLedgerRecord.sourceId, QualityJourneyProviderSourceLedgerRecord.sequence, QualityJourneyProviderSourceLedgerRecord.previousHead, QualityJourneyProviderSourceLedgerRecord.head, QualityJourneyProviderSourceLedgerRecord.kind, QualityJourneyProviderSourceLedgerRecord.dataJson, QualityJourneyProviderSourceLedgerRecord.byteCount (+more)

### Community 184 - "String"
Nodes (1): String

### Community 185 - "DateTime"
Nodes (1): DateTime

### Community 186 - "Boolean"
Nodes (1): Boolean

### Community 187 - "Int"
Nodes (1): Int

### Community 188 - "Float"
Nodes (1): Float

### Community 189 - "BigInt"
Nodes (1): BigInt

### Community 190 - "20251026202316_migrate_back_to_sqlite"
Nodes (1): 20251026202316_migrate_back_to_sqlite

### Community 191 - "TemplateStep"
Nodes (1): TemplateStep

### Community 192 - "TemplateStepGroup"
Nodes (1): TemplateStepGroup

### Community 193 - "TemplateStepParameter"
Nodes (1): TemplateStepParameter

### Community 194 - "_TagToTestRun"
Nodes (1): _TagToTestRun

### Community 195 - "_TestSuiteTestCases"
Nodes (1): _TestSuiteTestCases

### Community 196 - "20251104113456_add_type_for_template_step_groups"
Nodes (1): 20251104113456_add_type_for_template_step_groups

### Community 197 - "new_TemplateStepGroup"
Nodes (1): new_TemplateStepGroup

### Community 198 - "20251104170946_add_tags_to_test_suite_and_test_case"
Nodes (1): 20251104170946_add_tags_to_test_suite_and_test_case

### Community 199 - "_TagToTestCase"
Nodes (1): _TagToTestCase

### Community 200 - "_TagToTestSuite"
Nodes (1): _TagToTestSuite

### Community 201 - "20251112190024_add_cascade_delete_to_test_run_test_case"
Nodes (1): 20251112190024_add_cascade_delete_to_test_run_test_case

### Community 202 - "new_TestRunTestCase"
Nodes (1): new_TestRunTestCase

### Community 203 - "20251113181100_add_test_run_log"
Nodes (1): 20251113181100_add_test_run_log

### Community 204 - "20251119191838_add_tag_type"
Nodes (1): 20251119191838_add_tag_type

### Community 205 - "new_Tag"
Nodes (1): new_Tag

### Community 206 - "20251121164059_add_conflict_resolution"
Nodes (1): 20251121164059_add_conflict_resolution

### Community 207 - "20251130190737_add_trace_path_to_test_run_test_case"
Nodes (1): 20251130190737_add_trace_path_to_test_run_test_case

### Community 208 - "20251213074835_add_log_path_to_test_run"
Nodes (1): 20251213074835_add_log_path_to_test_run

### Community 209 - "20251213183952_add_name_property_for_the_test_run_entities"
Nodes (1): 20251213183952_add_name_property_for_the_test_run_entities

### Community 210 - "new_TestRun"
Nodes (1): new_TestRun

### Community 211 - "20251223183400_add_report_model_to_db_schema"
Nodes (1): 20251223183400_add_report_model_to_db_schema

### Community 212 - "20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases"
Nodes (1): 20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases

### Community 213 - "20251224083549_add_comprehensive_report_storage"
Nodes (1): 20251224083549_add_comprehensive_report_storage

### Community 214 - "new_ReportTestCase"
Nodes (1): new_ReportTestCase

### Community 215 - "20251229194422_migrate_duration_to_string"
Nodes (1): 20251229194422_migrate_duration_to_string

### Community 216 - "new_ReportHook"
Nodes (1): new_ReportHook

### Community 217 - "new_ReportStep"
Nodes (1): new_ReportStep

### Community 218 - "20251230124637_add_unique_constraint_to_test_run_name"
Nodes (1): 20251230124637_add_unique_constraint_to_test_run_name

### Community 219 - "20260115094436_add_dashboard_metrics"
Nodes (1): 20260115094436_add_dashboard_metrics

### Community 220 - "20260127172022_add_cascade_delete_to_step_parameters"
Nodes (1): 20260127172022_add_cascade_delete_to_step_parameters

### Community 221 - "new_TemplateTestCaseStepParameter"
Nodes (1): new_TemplateTestCaseStepParameter

### Community 222 - "new_TestCaseStepParameter"
Nodes (1): new_TestCaseStepParameter

### Community 223 - "20260313093000_add_report_step_screenshot_path"
Nodes (1): 20260313093000_add_report_step_screenshot_path

### Community 224 - "20260318120000_add_test_suite_context_to_test_run_test_case"
Nodes (1): 20260318120000_add_test_suite_context_to_test_run_test_case

### Community 225 - "20260318173512_add_support_of_test_suite_level_runs"
Nodes (1): 20260318173512_add_support_of_test_suite_level_runs

### Community 226 - "20260507000000_add_flow_builder_node_grouping"
Nodes (1): 20260507000000_add_flow_builder_node_grouping

### Community 227 - "20260609002500_add_plan_projection_and_sync"
Nodes (1): 20260609002500_add_plan_projection_and_sync

### Community 228 - "PlanProjection"
Nodes (1): PlanProjection

### Community 229 - "PlanRevision"
Nodes (1): PlanRevision

### Community 230 - "PlanSyncIssue"
Nodes (1): PlanSyncIssue

### Community 231 - "PlanTaskProjection"
Nodes (1): PlanTaskProjection

### Community 232 - "20260609090000_add_plan_review_runtime"
Nodes (1): 20260609090000_add_plan_review_runtime

### Community 233 - "PlanEvent"
Nodes (1): PlanEvent

### Community 234 - "PlanPersonalLayout"
Nodes (1): PlanPersonalLayout

### Community 235 - "20260609160000_add_coordinator_events_api_mcp"
Nodes (1): 20260609160000_add_coordinator_events_api_mcp

### Community 236 - "AppraiseProjectIdentity"
Nodes (1): AppraiseProjectIdentity

### Community 237 - "PlanCoordinatorLease"
Nodes (1): PlanCoordinatorLease

### Community 238 - "new_PlanEvent"
Nodes (1): new_PlanEvent

### Community 239 - "20260613015000_add_plan_description"
Nodes (1): 20260613015000_add_plan_description

### Community 240 - "20260628090000_add_target_projects"
Nodes (1): 20260628090000_add_target_projects

### Community 241 - "new_PlanProjection"
Nodes (1): new_PlanProjection

### Community 242 - "20260628103000_add_plan_slug_legacy_identity"
Nodes (1): 20260628103000_add_plan_slug_legacy_identity

### Community 243 - "20260701090000_add_provider_workflow_runs"
Nodes (1): 20260701090000_add_provider_workflow_runs

### Community 244 - "ProviderAdapterRegistration"
Nodes (1): ProviderAdapterRegistration

### Community 245 - "ProviderArtifactSnapshot"
Nodes (1): ProviderArtifactSnapshot

### Community 246 - "ProviderPermissionDecision"
Nodes (1): ProviderPermissionDecision

### Community 247 - "ProviderRunEvent"
Nodes (1): ProviderRunEvent

### Community 248 - "ProviderWorkflowRun"
Nodes (1): ProviderWorkflowRun

### Community 249 - "20260701120000_add_provider_registration_settings"
Nodes (1): 20260701120000_add_provider_registration_settings

### Community 250 - "20260708090000_add_test_run_evidence_health"
Nodes (1): 20260708090000_add_test_run_evidence_health

### Community 251 - "20260709090000_add_step_blocks"
Nodes (1): 20260709090000_add_step_blocks

### Community 252 - "StepBlock"
Nodes (1): StepBlock

### Community 253 - "StepBlockStep"
Nodes (1): StepBlockStep

### Community 254 - "20260711120000_add_baseline_attempt_history"
Nodes (1): 20260711120000_add_baseline_attempt_history

### Community 255 - "BaselineAttempt"
Nodes (1): BaselineAttempt

### Community 256 - "BaselineAttemptEvent"
Nodes (1): BaselineAttemptEvent

### Community 257 - "20260711150000_add_delegated_authorization_nonces"
Nodes (1): 20260711150000_add_delegated_authorization_nonces

### Community 258 - "DelegatedAuthorizationNonce"
Nodes (1): DelegatedAuthorizationNonce

### Community 259 - "20260711170000_add_delegated_ast_submissions"
Nodes (1): 20260711170000_add_delegated_ast_submissions

### Community 260 - "DelegatedValidationAstSubmission"
Nodes (1): DelegatedValidationAstSubmission

### Community 261 - "20260711190000_add_validation_ast_publish_journal"
Nodes (1): 20260711190000_add_validation_ast_publish_journal

### Community 262 - "ValidationAstPublishOperation"
Nodes (1): ValidationAstPublishOperation

### Community 263 - "ValidationExtensionReview"
Nodes (1): ValidationExtensionReview

### Community 264 - "20260711220000_add_runtime_capsules"
Nodes (1): 20260711220000_add_runtime_capsules

### Community 265 - "20260712010000_add_runtime_capsule_execution_attempt"
Nodes (1): 20260712010000_add_runtime_capsule_execution_attempt

### Community 266 - "20260712020000_add_test_run_preparation_key"
Nodes (1): 20260712020000_add_test_run_preparation_key

### Community 267 - "20260712180000_add_repository_exports"
Nodes (1): 20260712180000_add_repository_exports

### Community 268 - "RepositoryExportJob"
Nodes (1): RepositoryExportJob

### Community 269 - "RepositoryExportReceipt"
Nodes (1): RepositoryExportReceipt

### Community 270 - "20260713143000_add_project_resource_ownership"
Nodes (1): 20260713143000_add_project_resource_ownership

### Community 271 - "20260713153000_add_validation_resource_proposals"
Nodes (1): 20260713153000_add_validation_resource_proposals

### Community 272 - "ValidationResourceProposal"
Nodes (1): ValidationResourceProposal

### Community 273 - "20260713163000_normalize_managed_validation_vocabulary"
Nodes (1): 20260713163000_normalize_managed_validation_vocabulary

### Community 274 - "20260713173000_add_named_plan_hashes"
Nodes (1): 20260713173000_add_named_plan_hashes

### Community 275 - "20260713183000_add_delegated_coordinator_receipts"
Nodes (1): 20260713183000_add_delegated_coordinator_receipts

### Community 276 - "DelegatedCoordinatorConsumption"
Nodes (1): DelegatedCoordinatorConsumption

### Community 277 - "DelegatedCoordinatorReceipt"
Nodes (1): DelegatedCoordinatorReceipt

### Community 278 - "20260713200000_stage_complete_project_ownership"
Nodes (1): 20260713200000_stage_complete_project_ownership

### Community 279 - "20260713210000_add_target_project_description"
Nodes (1): 20260713210000_add_target_project_description

### Community 280 - "20260713211000_scope_test_run_preparation_key"
Nodes (1): 20260713211000_scope_test_run_preparation_key

### Community 281 - "20260714000000_make_template_library_shared"
Nodes (1): 20260714000000_make_template_library_shared

### Community 282 - "20260714143000_add_validation_review_state_receipt"
Nodes (1): 20260714143000_add_validation_review_state_receipt

### Community 283 - "20260714160500_scope_environment_names_to_project"
Nodes (1): 20260714160500_scope_environment_names_to_project

### Community 284 - "20260716190000_replace_environment_password_with_reference"
Nodes (1): 20260716190000_replace_environment_password_with_reference

### Community 285 - "new_Environment"
Nodes (1): new_Environment

### Community 286 - "20260716210000_add_measured_test_run_pagination_index"
Nodes (1): 20260716210000_add_measured_test_run_pagination_index

### Community 287 - "20260718110000_add_agent_preflight_receipts"
Nodes (1): 20260718110000_add_agent_preflight_receipts

### Community 288 - "20260718160000_add_plan_observability"
Nodes (1): 20260718160000_add_plan_observability

### Community 289 - "LifecycleCertificationReceipt"
Nodes (1): LifecycleCertificationReceipt

### Community 290 - "PlanOperationMetric"
Nodes (1): PlanOperationMetric

### Community 291 - "20260718193000_add_environment_identity_expectation"
Nodes (1): 20260718193000_add_environment_identity_expectation

### Community 292 - "20260720010000_add_canonical_operation_mappings"
Nodes (1): 20260720010000_add_canonical_operation_mappings

### Community 293 - "20260722013000_scope_locator_group_names_to_project"
Nodes (1): 20260722013000_scope_locator_group_names_to_project

### Community 294 - "20260722190000_add_step_definition_registry"
Nodes (1): 20260722190000_add_step_definition_registry

### Community 295 - "StepCompatibilityReference"
Nodes (1): StepCompatibilityReference

### Community 296 - "20260722223000_add_step_definition_reviewed_extensions"
Nodes (1): 20260722223000_add_step_definition_reviewed_extensions

### Community 297 - "20260725190000_add_step_block_migration_ledger"
Nodes (1): 20260725190000_add_step_block_migration_ledger

### Community 298 - "StepBlockMigrationLedger"
Nodes (1): StepBlockMigrationLedger

### Community 299 - "_LegacyCompositionDefinition"
Nodes (1): _LegacyCompositionDefinition

### Community 300 - "20260725193000_make_validation_projection_template_step_optional"
Nodes (1): 20260725193000_make_validation_projection_template_step_optional

### Community 301 - "new_TestCaseStep"
Nodes (1): new_TestCaseStep

### Community 302 - "20260725194500_cut_over_authored_steps_to_step_invocations"
Nodes (1): 20260725194500_cut_over_authored_steps_to_step_invocations

### Community 303 - "IF"
Nodes (1): IF

### Community 304 - "20260725200000_remove_legacy_step_authority"
Nodes (1): 20260725200000_remove_legacy_step_authority

### Community 305 - "20260725201000_add_step_definition_telemetry"
Nodes (1): 20260725201000_add_step_definition_telemetry

### Community 306 - "20260725202000_add_step_definition_reuse_justification"
Nodes (1): 20260725202000_add_step_definition_reuse_justification

### Community 307 - "20260725203000_add_step_definition_review_receipts"
Nodes (1): 20260725203000_add_step_definition_review_receipts

### Community 308 - "20260725204000_harden_step_definition_evidence_and_telemetry"
Nodes (1): 20260725204000_harden_step_definition_evidence_and_telemetry

### Community 309 - "20260725205000_add_reviewed_extension_revocation"
Nodes (1): 20260725205000_add_reviewed_extension_revocation

### Community 310 - "20260725206000_add_step_definition_search_receipts"
Nodes (1): 20260725206000_add_step_definition_search_receipts

### Community 311 - "20260906090000_quality_journey_authority"
Nodes (1): 20260906090000_quality_journey_authority

### Community 312 - "new_DashboardMetrics"
Nodes (1): new_DashboardMetrics

### Community 313 - "new_Locator"
Nodes (1): new_Locator

### Community 314 - "new_LocatorGroup"
Nodes (1): new_LocatorGroup

### Community 315 - "new_Module"
Nodes (1): new_Module

### Community 316 - "new_ProjectResourceOwnership"
Nodes (1): new_ProjectResourceOwnership

### Community 317 - "new_Report"
Nodes (1): new_Report

### Community 318 - "new_StepDefinitionSearchReceipt"
Nodes (1): new_StepDefinitionSearchReceipt

### Community 319 - "new_StepDefinitionTelemetryEvent"
Nodes (1): new_StepDefinitionTelemetryEvent

### Community 320 - "new_TargetProject"
Nodes (1): new_TargetProject

### Community 321 - "new_TemplateTestCase"
Nodes (1): new_TemplateTestCase

### Community 322 - "new_TestCase"
Nodes (1): new_TestCase

### Community 323 - "new_TestCaseMetrics"
Nodes (1): new_TestCaseMetrics

### Community 324 - "new_TestSuite"
Nodes (1): new_TestSuite

### Community 325 - "new_TestSuiteMetrics"
Nodes (1): new_TestSuiteMetrics

### Community 326 - "20260906180000_add_quality_journey_coordinator_handoffs"
Nodes (1): 20260906180000_add_quality_journey_coordinator_handoffs

### Community 327 - "20260907090000_add_quality_journey_drafts"
Nodes (1): 20260907090000_add_quality_journey_drafts

### Community 328 - "20260908170000_add_repository_collaboration"
Nodes (1): 20260908170000_add_repository_collaboration

### Community 329 - "20260908190000_add_journey_reuse_annotation"
Nodes (1): 20260908190000_add_journey_reuse_annotation

### Community 330 - "20260909090000_add_repository_collaboration_queue_worker"
Nodes (1): 20260909090000_add_repository_collaboration_queue_worker

### Community 331 - "20260909101500_collaboration_decision_single_resolution"
Nodes (1): 20260909101500_collaboration_decision_single_resolution

### Community 332 - "20260909113000_add_collaboration_operation_execution_state"
Nodes (1): 20260909113000_add_collaboration_operation_execution_state

### Community 333 - "20260909130000_add_collaboration_step_execution_identity"
Nodes (1): 20260909130000_add_collaboration_step_execution_identity

### Community 334 - "20260909143000_add_collaboration_authority_receipts"
Nodes (1): 20260909143000_add_collaboration_authority_receipts

### Community 335 - "20260909150000_add_collaboration_remote_auth_repair"
Nodes (1): 20260909150000_add_collaboration_remote_auth_repair

### Community 336 - "20260912120000_add_external_analyzer_admission"
Nodes (1): 20260912120000_add_external_analyzer_admission

### Community 337 - "20260913090000_add_coordinator_handoff_reconnect_takeover"
Nodes (1): 20260913090000_add_coordinator_handoff_reconnect_takeover

### Community 338 - "20260913100000_add_external_work_claim_receipts"
Nodes (1): 20260913100000_add_external_work_claim_receipts

### Community 339 - "20260913110000_add_external_submission_acceptances"
Nodes (1): 20260913110000_add_external_submission_acceptances

### Community 340 - "20260914090000_add_discovery_auth_transit_policy"
Nodes (1): 20260914090000_add_discovery_auth_transit_policy

### Community 341 - "20261002010000_add_capsule_stop_receipt"
Nodes (1): 20261002010000_add_capsule_stop_receipt

### Community 342 - "20261002020000_add_capsule_output_completion"
Nodes (1): 20261002020000_add_capsule_output_completion

### Community 343 - "20261002020000_add_quality_journey_owned_browser"
Nodes (1): 20261002020000_add_quality_journey_owned_browser

### Community 344 - "20261019010000_add_host_neutral_journey_sessions"
Nodes (1): 20261019010000_add_host_neutral_journey_sessions

### Community 345 - "20261019020000_add_provider_dispatch_wake_intents"
Nodes (1): 20261019020000_add_provider_dispatch_wake_intents

### Community 346 - "20261019030000_add_journey_wake_producers"
Nodes (1): 20261019030000_add_journey_wake_producers

### Community 347 - "20261021000000_add_provider_source_custody"
Nodes (1): 20261021000000_add_provider_source_custody

### Community 348 - "20261021010000_add_provider_reconciliation_receipt"
Nodes (1): 20261021010000_add_provider_reconciliation_receipt

### Community 349 - "20261024010000_add_journey_e2_effect_admission"
Nodes (1): 20261024010000_add_journey_e2_effect_admission

### Community 350 - "20261024020000_add_journey_shared_resource_claims"
Nodes (1): 20261024020000_add_journey_shared_resource_claims

### Community 351 - "20261024030000_add_journey_e2_operation_preparation"
Nodes (1): 20261024030000_add_journey_e2_operation_preparation

### Community 352 - "new_QualityJourneyE2Grant"
Nodes (1): new_QualityJourneyE2Grant

### Community 353 - "new_QualityJourneyE2Retirement"
Nodes (1): new_QualityJourneyE2Retirement

### Community 354 - "20261024040000_add_automation_materialization_source_proof"
Nodes (1): 20261024040000_add_automation_materialization_source_proof

### Community 355 - "20261112010000_add_journey_hosting_contract_version"
Nodes (1): 20261112010000_add_journey_hosting_contract_version

### Community 356 - "20261124010000_add_project_conversations"
Nodes (1): 20261124010000_add_project_conversations

### Community 357 - "20261124020000_add_conversation_read_attempts"
Nodes (1): 20261124020000_add_conversation_read_attempts

### Community 358 - "20261124030000_add_conversation_read_engines"
Nodes (1): 20261124030000_add_conversation_read_engines

### Community 359 - "20261125010000_add_claude_conversation_reads"
Nodes (1): 20261125010000_add_claude_conversation_reads

### Community 360 - "new_ProjectConversation"
Nodes (1): new_ProjectConversation

### Community 361 - "new_ProjectConversationRead"
Nodes (1): new_ProjectConversationRead

### Community 362 - "20261125020000_add_cursor_conversation_reads"
Nodes (1): 20261125020000_add_cursor_conversation_reads

## Suggested Questions
- Which models connect a Quality Journey to its execution and evidence records?
- Which models enforce Journey artifact lineage?
- Which models depend on Locator or TestRun?
- Which enums are used by execution report models?
