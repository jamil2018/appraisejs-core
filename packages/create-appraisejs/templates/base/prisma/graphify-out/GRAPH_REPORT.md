# Graph Report - prisma

## Corpus Check
- 36 files from prisma/schema.prisma and migrations
- Verdict: schema-aware graph generated because Graphify AST extraction does not currently produce Prisma/SQL nodes.

## Summary
- 839 nodes · 1854 edges · 134 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `String` - 329 edges
2. `schema.prisma` - 115 edges
3. `DateTime` - 98 edges
4. `PlanProjection` - 82 edges
5. `TestRun` - 60 edges
6. `ProviderWorkflowRun` - 56 edges
7. `ValidationAstPublishOperation` - 51 edges
8. `TestCase` - 46 edges
9. `TemplateStep` - 37 edges
10. `ReportScenario` - 37 edges

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
- `Review` --relates_to--> `TestCase`  [EXTRACTED]
  schema.prisma L32
- `Review.testCaseId` --foreign_key_to--> `TestCase`  [EXTRACTED]
  schema.prisma L32

## Import Cycles
- None detected.

## Communities (134 total)
### Community 0 - "schema.prisma"
Nodes (3): schema.prisma, datasource db (sqlite), Prisma client generator

### Community 1 - "TestSuite"
Nodes (12): TestSuite, TestSuite.id, TestSuite.name, TestSuite.description, TestSuite.createdAt, TestSuite.updatedAt, TestSuite.moduleId, TestSuite.module (+more)

### Community 2 - "Review"
Nodes (9): Review, Review.id, Review.testCaseId, Review.reviewerId, Review.status, Review.comments, Review.createdAt, Review.updatedAt (+more)

### Community 3 - "LinkedJiraTicket"
Nodes (9): LinkedJiraTicket, LinkedJiraTicket.id, LinkedJiraTicket.testCaseId, LinkedJiraTicket.jiraTicketId, LinkedJiraTicket.jiraTicketUrl, LinkedJiraTicket.jiraStatus, LinkedJiraTicket.createdAt, LinkedJiraTicket.updatedAt (+more)

### Community 4 - "TemplateStep"
Nodes (16): TemplateStep, TemplateStep.id, TemplateStep.name, TemplateStep.description, TemplateStep.createdAt, TemplateStep.updatedAt, TemplateStep.signature, TemplateStep.functionDefinition (+more)

### Community 5 - "TemplateStepParameter"
Nodes (9): TemplateStepParameter, TemplateStepParameter.id, TemplateStepParameter.name, TemplateStepParameter.createdAt, TemplateStepParameter.updatedAt, TemplateStepParameter.templateStepId, TemplateStepParameter.order, TemplateStepParameter.type (+more)

### Community 6 - "TemplateStepGroup"
Nodes (8): TemplateStepGroup, TemplateStepGroup.id, TemplateStepGroup.name, TemplateStepGroup.description, TemplateStepGroup.type, TemplateStepGroup.createdAt, TemplateStepGroup.updatedAt, TemplateStepGroup.templateSteps

### Community 7 - "StepBlock"
Nodes (8): StepBlock, StepBlock.id, StepBlock.name, StepBlock.description, StepBlock.intent, StepBlock.createdAt, StepBlock.updatedAt, StepBlock.steps

### Community 8 - "StepBlockStep"
Nodes (8): StepBlockStep, StepBlockStep.id, StepBlockStep.stepBlockId, StepBlockStep.templateStepId, StepBlockStep.order, StepBlockStep.parameterMap, StepBlockStep.stepBlock, StepBlockStep.templateStep

### Community 9 - "TestCase"
Nodes (14): TestCase, TestCase.id, TestCase.title, TestCase.description, TestCase.createdAt, TestCase.updatedAt, TestCase.linkedJiraTickets, TestCase.reviews (+more)

### Community 10 - "TestCaseStep"
Nodes (12): TestCaseStep, TestCaseStep.id, TestCaseStep.flowNodeId, TestCaseStep.testCaseId, TestCaseStep.order, TestCaseStep.gherkinStep, TestCaseStep.icon, TestCaseStep.label (+more)

### Community 11 - "TestCaseFlowBlock"
Nodes (7): TestCaseFlowBlock, TestCaseFlowBlock.id, TestCaseFlowBlock.name, TestCaseFlowBlock.testCaseId, TestCaseFlowBlock.order, TestCaseFlowBlock.testCase, TestCaseFlowBlock.nodes

### Community 12 - "TestCaseFlowBlockNode"
Nodes (5): TestCaseFlowBlockNode, TestCaseFlowBlockNode.id, TestCaseFlowBlockNode.flowNodeId, TestCaseFlowBlockNode.flowBlockId, TestCaseFlowBlockNode.flowBlock

### Community 13 - "TemplateTestCase"
Nodes (8): TemplateTestCase, TemplateTestCase.id, TemplateTestCase.name, TemplateTestCase.description, TemplateTestCase.createdAt, TemplateTestCase.updatedAt, TemplateTestCase.steps, TemplateTestCase.flowBlocks

### Community 14 - "TemplateTestCaseStep"
Nodes (12): TemplateTestCaseStep, TemplateTestCaseStep.id, TemplateTestCaseStep.flowNodeId, TemplateTestCaseStep.order, TemplateTestCaseStep.gherkinStep, TemplateTestCaseStep.icon, TemplateTestCaseStep.label, TemplateTestCaseStep.templateTestCaseId (+more)

### Community 15 - "TemplateTestCaseFlowBlock"
Nodes (7): TemplateTestCaseFlowBlock, TemplateTestCaseFlowBlock.id, TemplateTestCaseFlowBlock.name, TemplateTestCaseFlowBlock.templateTestCaseId, TemplateTestCaseFlowBlock.order, TemplateTestCaseFlowBlock.templateTestCase, TemplateTestCaseFlowBlock.nodes

### Community 16 - "TemplateTestCaseFlowBlockNode"
Nodes (5): TemplateTestCaseFlowBlockNode, TemplateTestCaseFlowBlockNode.id, TemplateTestCaseFlowBlockNode.flowNodeId, TemplateTestCaseFlowBlockNode.flowBlockId, TemplateTestCaseFlowBlockNode.flowBlock

### Community 17 - "TemplateTestCaseStepParameter"
Nodes (11): TemplateTestCaseStepParameter, TemplateTestCaseStepParameter.id, TemplateTestCaseStepParameter.name, TemplateTestCaseStepParameter.defaultValue, TemplateTestCaseStepParameter.order, TemplateTestCaseStepParameter.testCaseStepId, TemplateTestCaseStepParameter.locatorId, TemplateTestCaseStepParameter.type (+more)

### Community 18 - "TestCaseStepParameter"
Nodes (10): TestCaseStepParameter, TestCaseStepParameter.id, TestCaseStepParameter.name, TestCaseStepParameter.value, TestCaseStepParameter.order, TestCaseStepParameter.testCaseStepId, TestCaseStepParameter.locatorId, TestCaseStepParameter.type (+more)

### Community 19 - "Locator"
Nodes (11): Locator, Locator.id, Locator.name, Locator.value, Locator.createdAt, Locator.updatedAt, Locator.locatorGroupId, Locator.locatorGroup (+more)

### Community 20 - "LocatorGroup"
Nodes (9): LocatorGroup, LocatorGroup.id, LocatorGroup.name, LocatorGroup.route, LocatorGroup.createdAt, LocatorGroup.updatedAt, LocatorGroup.moduleId, LocatorGroup.locators (+more)

### Community 21 - "Module"
Nodes (10): Module, Module.id, Module.name, Module.parentId, Module.createdAt, Module.updatedAt, Module.locatorGroups, Module.parent (+more)

### Community 22 - "TestRunTestCase"
Nodes (12): TestRunTestCase, TestRunTestCase.id, TestRunTestCase.testRunId, TestRunTestCase.testCaseId, TestRunTestCase.testSuiteId, TestRunTestCase.status, TestRunTestCase.result, TestRunTestCase.tracePath (+more)

### Community 23 - "TestRun"
Nodes (24): TestRun, TestRun.id, TestRun.name, TestRun.runId, TestRun.startedAt, TestRun.completedAt, TestRun.status, TestRun.result (+more)

### Community 24 - "PlanProjection"
Nodes (33): PlanProjection, PlanProjection.id, PlanProjection.planId, PlanProjection.slug, PlanProjection.legacyPlanId, PlanProjection.revision, PlanProjection.lifecycle, PlanProjection.goal (+more)

### Community 25 - "BaselineAttempt"
Nodes (14): BaselineAttempt, BaselineAttempt.id, BaselineAttempt.planProjectionId, BaselineAttempt.validationId, BaselineAttempt.validationRevision, BaselineAttempt.validationHash, BaselineAttempt.browser, BaselineAttempt.environment (+more)

### Community 26 - "BaselineAttemptEvent"
Nodes (9): BaselineAttemptEvent, BaselineAttemptEvent.id, BaselineAttemptEvent.attemptId, BaselineAttemptEvent.kind, BaselineAttemptEvent.payloadJson, BaselineAttemptEvent.idempotencyKey, BaselineAttemptEvent.sequence, BaselineAttemptEvent.createdAt (+more)

### Community 27 - "TargetProject"
Nodes (15): TargetProject, TargetProject.id, TargetProject.canonicalPath, TargetProject.displayName, TargetProject.packageName, TargetProject.packageManager, TargetProject.packageJson, TargetProject.fingerprint (+more)

### Community 28 - "ProviderAdapterRegistration"
Nodes (20): ProviderAdapterRegistration, ProviderAdapterRegistration.id, ProviderAdapterRegistration.key, ProviderAdapterRegistration.displayName, ProviderAdapterRegistration.providerKind, ProviderAdapterRegistration.adapterVersion, ProviderAdapterRegistration.capabilitiesJson, ProviderAdapterRegistration.enabled (+more)

### Community 29 - "ProviderWorkflowRun"
Nodes (33): ProviderWorkflowRun, ProviderWorkflowRun.id, ProviderWorkflowRun.planProjectionId, ProviderWorkflowRun.targetProjectId, ProviderWorkflowRun.providerAdapterId, ProviderWorkflowRun.providerKind, ProviderWorkflowRun.providerProfile, ProviderWorkflowRun.adapterVersion (+more)

### Community 30 - "ProviderRunEvent"
Nodes (9): ProviderRunEvent, ProviderRunEvent.id, ProviderRunEvent.runId, ProviderRunEvent.sequence, ProviderRunEvent.type, ProviderRunEvent.payloadJson, ProviderRunEvent.stream, ProviderRunEvent.createdAt (+more)

### Community 31 - "ProviderPermissionDecision"
Nodes (12): ProviderPermissionDecision, ProviderPermissionDecision.id, ProviderPermissionDecision.runId, ProviderPermissionDecision.requestId, ProviderPermissionDecision.decision, ProviderPermissionDecision.riskTier, ProviderPermissionDecision.requestedScope, ProviderPermissionDecision.payloadJson (+more)

### Community 32 - "ProviderArtifactSnapshot"
Nodes (9): ProviderArtifactSnapshot, ProviderArtifactSnapshot.id, ProviderArtifactSnapshot.runId, ProviderArtifactSnapshot.path, ProviderArtifactSnapshot.kind, ProviderArtifactSnapshot.hash, ProviderArtifactSnapshot.metadataJson, ProviderArtifactSnapshot.capturedAt (+more)

### Community 33 - "PlanTaskProjection"
Nodes (10): PlanTaskProjection, PlanTaskProjection.id, PlanTaskProjection.planProjectionId, PlanTaskProjection.taskId, PlanTaskProjection.title, PlanTaskProjection.description, PlanTaskProjection.acceptanceJson, PlanTaskProjection.validationIntent (+more)

### Community 34 - "PlanSyncIssue"
Nodes (10): PlanSyncIssue, PlanSyncIssue.id, PlanSyncIssue.planProjectionId, PlanSyncIssue.code, PlanSyncIssue.artifactPath, PlanSyncIssue.message, PlanSyncIssue.blocking, PlanSyncIssue.createdAt (+more)

### Community 35 - "PlanRevision"
Nodes (10): PlanRevision, PlanRevision.id, PlanRevision.planProjectionId, PlanRevision.sourceHash, PlanRevision.gitCommit, PlanRevision.dirtyHashesJson, PlanRevision.snapshotJson, PlanRevision.reducedAssurance (+more)

### Community 36 - "PlanEvent"
Nodes (14): PlanEvent, PlanEvent.id, PlanEvent.planProjectionId, PlanEvent.publishOperationId, PlanEvent.validationId, PlanEvent.sequence, PlanEvent.type, PlanEvent.payloadJson (+more)

### Community 37 - "AppraiseProjectIdentity"
Nodes (6): AppraiseProjectIdentity, AppraiseProjectIdentity.id, AppraiseProjectIdentity.projectFingerprint, AppraiseProjectIdentity.tokenHash, AppraiseProjectIdentity.createdAt, AppraiseProjectIdentity.rotatedAt

### Community 38 - "DelegatedAuthorizationNonce"
Nodes (5): DelegatedAuthorizationNonce, DelegatedAuthorizationNonce.nonce, DelegatedAuthorizationNonce.issuer, DelegatedAuthorizationNonce.expiresAt, DelegatedAuthorizationNonce.consumedAt

### Community 39 - "DelegatedValidationAstSubmission"
Nodes (10): DelegatedValidationAstSubmission, DelegatedValidationAstSubmission.id, DelegatedValidationAstSubmission.nonce, DelegatedValidationAstSubmission.targetFingerprint, DelegatedValidationAstSubmission.planHash, DelegatedValidationAstSubmission.issuer, DelegatedValidationAstSubmission.astId, DelegatedValidationAstSubmission.astJson (+more)

### Community 40 - "ValidationAstPublishOperation"
Nodes (34): ValidationAstPublishOperation, ValidationAstPublishOperation.id, ValidationAstPublishOperation.planId, ValidationAstPublishOperation.planProjectionId, ValidationAstPublishOperation.targetProjectId, ValidationAstPublishOperation.targetFingerprint, ValidationAstPublishOperation.idempotencyKey, ValidationAstPublishOperation.operationHash (+more)

### Community 41 - "ValidationExtensionReview"
Nodes (11): ValidationExtensionReview, ValidationExtensionReview.id, ValidationExtensionReview.operationId, ValidationExtensionReview.extensionId, ValidationExtensionReview.version, ValidationExtensionReview.sourceHash, ValidationExtensionReview.compiledHash, ValidationExtensionReview.artifactHash (+more)

### Community 42 - "PlanCoordinatorLease"
Nodes (10): PlanCoordinatorLease, PlanCoordinatorLease.id, PlanCoordinatorLease.planProjectionId, PlanCoordinatorLease.coordinatorId, PlanCoordinatorLease.connectionId, PlanCoordinatorLease.leaseExpiresAt, PlanCoordinatorLease.takeoverApproved, PlanCoordinatorLease.createdAt (+more)

### Community 43 - "PlanPersonalLayout"
Nodes (8): PlanPersonalLayout, PlanPersonalLayout.id, PlanPersonalLayout.planProjectionId, PlanPersonalLayout.owner, PlanPersonalLayout.positionsJson, PlanPersonalLayout.createdAt, PlanPersonalLayout.updatedAt, PlanPersonalLayout.plan

### Community 44 - "TestRunLog"
Nodes (7): TestRunLog, TestRunLog.id, TestRunLog.testRunId, TestRunLog.logs, TestRunLog.createdAt, TestRunLog.updatedAt, TestRunLog.testRun

### Community 45 - "Environment"
Nodes (10): Environment, Environment.id, Environment.name, Environment.baseUrl, Environment.apiBaseUrl, Environment.username, Environment.password, Environment.createdAt (+more)

### Community 46 - "Tag"
Nodes (10): Tag, Tag.id, Tag.name, Tag.tagExpression, Tag.type, Tag.createdAt, Tag.updatedAt, Tag.testRuns (+more)

### Community 47 - "ConflictResolution"
Nodes (10): ConflictResolution, ConflictResolution.id, ConflictResolution.entityType, ConflictResolution.entityId, ConflictResolution.conflictType, ConflictResolution.conflictingEntityId, ConflictResolution.resolved, ConflictResolution.createdAt (+more)

### Community 48 - "ReportTestCase"
Nodes (10): ReportTestCase, ReportTestCase.id, ReportTestCase.reportId, ReportTestCase.testCaseId, ReportTestCase.testRunTestCaseId, ReportTestCase.reportScenarioId, ReportTestCase.testRunTestCase, ReportTestCase.report (+more)

### Community 49 - "Report"
Nodes (11): Report, Report.id, Report.name, Report.description, Report.reportPath, Report.createdAt, Report.updatedAt, Report.testRunId (+more)

### Community 50 - "ReportFeature"
Nodes (13): ReportFeature, ReportFeature.id, ReportFeature.reportId, ReportFeature.name, ReportFeature.description, ReportFeature.uri, ReportFeature.line, ReportFeature.keyword (+more)

### Community 51 - "ReportFeatureTag"
Nodes (7): ReportFeatureTag, ReportFeatureTag.id, ReportFeatureTag.reportFeatureId, ReportFeatureTag.tagName, ReportFeatureTag.line, ReportFeatureTag.createdAt, ReportFeatureTag.reportFeature

### Community 52 - "ReportScenario"
Nodes (16): ReportScenario, ReportScenario.id, ReportScenario.reportFeatureId, ReportScenario.name, ReportScenario.description, ReportScenario.line, ReportScenario.keyword, ReportScenario.type (+more)

### Community 53 - "ReportScenarioTag"
Nodes (7): ReportScenarioTag, ReportScenarioTag.id, ReportScenarioTag.reportScenarioId, ReportScenarioTag.tagName, ReportScenarioTag.line, ReportScenarioTag.createdAt, ReportScenarioTag.reportScenario

### Community 54 - "ReportStep"
Nodes (17): ReportStep, ReportStep.id, ReportStep.reportScenarioId, ReportStep.keyword, ReportStep.line, ReportStep.name, ReportStep.matchLocation, ReportStep.status (+more)

### Community 55 - "ReportHook"
Nodes (12): ReportHook, ReportHook.id, ReportHook.reportScenarioId, ReportHook.keyword, ReportHook.status, ReportHook.duration, ReportHook.errorMessage, ReportHook.errorTrace (+more)

### Community 56 - "TestCaseMetrics"
Nodes (15): TestCaseMetrics, TestCaseMetrics.id, TestCaseMetrics.testCaseId, TestCaseMetrics.isRepeatedlyFailing, TestCaseMetrics.isFlaky, TestCaseMetrics.consecutiveFailures, TestCaseMetrics.failureRate, TestCaseMetrics.totalRecentRuns (+more)

### Community 57 - "TestSuiteMetrics"
Nodes (7): TestSuiteMetrics, TestSuiteMetrics.id, TestSuiteMetrics.testSuiteId, TestSuiteMetrics.lastExecutedAt, TestSuiteMetrics.createdAt, TestSuiteMetrics.updatedAt, TestSuiteMetrics.testSuite

### Community 58 - "DashboardMetrics"
Nodes (8): DashboardMetrics, DashboardMetrics.id, DashboardMetrics.failedRecentRunsCount, DashboardMetrics.repeatedlyFailingTestsCount, DashboardMetrics.flakyTestsCount, DashboardMetrics.suitesNotExecutedRecentlyCount, DashboardMetrics.lastUpdatedAt, DashboardMetrics.createdAt

### Community 59 - "TagType"
Nodes (3): TagType, TagType.IDENTIFIER, TagType.FILTER

### Community 60 - "TestRunStatus"
Nodes (6): TestRunStatus, TestRunStatus.QUEUED, TestRunStatus.RUNNING, TestRunStatus.CANCELLING, TestRunStatus.COMPLETED, TestRunStatus.CANCELLED

### Community 61 - "TestRunTestCaseStatus"
Nodes (5): TestRunTestCaseStatus, TestRunTestCaseStatus.PENDING, TestRunTestCaseStatus.RUNNING, TestRunTestCaseStatus.COMPLETED, TestRunTestCaseStatus.CANCELLED

### Community 62 - "TestRunTestCaseResult"
Nodes (4): TestRunTestCaseResult, TestRunTestCaseResult.PASSED, TestRunTestCaseResult.FAILED, TestRunTestCaseResult.UNTESTED

### Community 63 - "TestRunResult"
Nodes (5): TestRunResult, TestRunResult.PENDING, TestRunResult.PASSED, TestRunResult.FAILED, TestRunResult.CANCELLED

### Community 64 - "TestRunEvidenceHealth"
Nodes (9): TestRunEvidenceHealth, TestRunEvidenceHealth.valid, TestRunEvidenceHealth.invalid_empty_run, TestRunEvidenceHealth.invalid_missing_test_cases, TestRunEvidenceHealth.invalid_missing_report, TestRunEvidenceHealth.invalid_placeholder_binary, TestRunEvidenceHealth.invalid_unmatched_scenarios, TestRunEvidenceHealth.invalid_stale_runtime (+more)

### Community 65 - "Role"
Nodes (4): Role, Role.ADMIN, Role.TESTER, Role.REVIEWER

### Community 66 - "ReviewStatus"
Nodes (4): ReviewStatus, ReviewStatus.PENDING, ReviewStatus.APPROVED, ReviewStatus.CHANGES_REQUESTED

### Community 67 - "TestCaseStatus"
Nodes (4): TestCaseStatus, TestCaseStatus.PENDING, TestCaseStatus.IN_PROGRESS, TestCaseStatus.COMPLETED

### Community 68 - "TestCaseResult"
Nodes (7): TestCaseResult, TestCaseResult.PASSED, TestCaseResult.FAILED, TestCaseResult.BLOCKED, TestCaseResult.SKIPPED, TestCaseResult.RETEST, TestCaseResult.UNTESTED

### Community 69 - "TemplateStepType"
Nodes (3): TemplateStepType, TemplateStepType.ACTION, TemplateStepType.ASSERTION

### Community 70 - "StepParameterType"
Nodes (6): StepParameterType, StepParameterType.NUMBER, StepParameterType.STRING, StepParameterType.DATE, StepParameterType.BOOLEAN, StepParameterType.LOCATOR

### Community 71 - "StepParameterValueType"
Nodes (4): StepParameterValueType, StepParameterValueType.STRING, StepParameterValueType.NUMBER, StepParameterValueType.LOCATOR

### Community 72 - "TemplateStepIcon"
Nodes (13): TemplateStepIcon, TemplateStepIcon.MOUSE, TemplateStepIcon.NAVIGATION, TemplateStepIcon.INPUT, TemplateStepIcon.DOWNLOAD, TemplateStepIcon.API, TemplateStepIcon.STORE, TemplateStepIcon.FORMAT (+more)

### Community 73 - "BrowserEngine"
Nodes (4): BrowserEngine, BrowserEngine.CHROMIUM, BrowserEngine.FIREFOX, BrowserEngine.WEBKIT

### Community 74 - "TemplateStepGroupType"
Nodes (3): TemplateStepGroupType, TemplateStepGroupType.ACTION, TemplateStepGroupType.VALIDATION

### Community 75 - "EntityType"
Nodes (2): EntityType, EntityType.LOCATOR

### Community 76 - "ConflictType"
Nodes (3): ConflictType, ConflictType.DUPLICATE_NAME, ConflictType.DUPLICATE_VALUE

### Community 77 - "StepStatus"
Nodes (6): StepStatus, StepStatus.PASSED, StepStatus.FAILED, StepStatus.SKIPPED, StepStatus.PENDING, StepStatus.UNDEFINED

### Community 78 - "StepKeyword"
Nodes (8): StepKeyword, StepKeyword.GIVEN, StepKeyword.WHEN, StepKeyword.THEN, StepKeyword.AND, StepKeyword.BUT, StepKeyword.BEFORE, StepKeyword.AFTER

### Community 79 - "String"
Nodes (1): String

### Community 80 - "DateTime"
Nodes (1): DateTime

### Community 81 - "Int"
Nodes (1): Int

### Community 82 - "Boolean"
Nodes (1): Boolean

### Community 83 - "Float"
Nodes (1): Float

### Community 84 - "20251026202316_migrate_back_to_sqlite"
Nodes (1): 20251026202316_migrate_back_to_sqlite

### Community 85 - "_TagToTestRun"
Nodes (1): _TagToTestRun

### Community 86 - "_TestSuiteTestCases"
Nodes (1): _TestSuiteTestCases

### Community 87 - "20251104113456_add_type_for_template_step_groups"
Nodes (1): 20251104113456_add_type_for_template_step_groups

### Community 88 - "new_TemplateStepGroup"
Nodes (1): new_TemplateStepGroup

### Community 89 - "20251104170946_add_tags_to_test_suite_and_test_case"
Nodes (1): 20251104170946_add_tags_to_test_suite_and_test_case

### Community 90 - "_TagToTestCase"
Nodes (1): _TagToTestCase

### Community 91 - "_TagToTestSuite"
Nodes (1): _TagToTestSuite

### Community 92 - "20251112190024_add_cascade_delete_to_test_run_test_case"
Nodes (1): 20251112190024_add_cascade_delete_to_test_run_test_case

### Community 93 - "new_TestRunTestCase"
Nodes (1): new_TestRunTestCase

### Community 94 - "20251113181100_add_test_run_log"
Nodes (1): 20251113181100_add_test_run_log

### Community 95 - "20251119191838_add_tag_type"
Nodes (1): 20251119191838_add_tag_type

### Community 96 - "new_Tag"
Nodes (1): new_Tag

### Community 97 - "20251121164059_add_conflict_resolution"
Nodes (1): 20251121164059_add_conflict_resolution

### Community 98 - "20251130190737_add_trace_path_to_test_run_test_case"
Nodes (1): 20251130190737_add_trace_path_to_test_run_test_case

### Community 99 - "20251213074835_add_log_path_to_test_run"
Nodes (1): 20251213074835_add_log_path_to_test_run

### Community 100 - "20251213183952_add_name_property_for_the_test_run_entities"
Nodes (1): 20251213183952_add_name_property_for_the_test_run_entities

### Community 101 - "new_TestRun"
Nodes (1): new_TestRun

### Community 102 - "20251223183400_add_report_model_to_db_schema"
Nodes (1): 20251223183400_add_report_model_to_db_schema

### Community 103 - "20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases"
Nodes (1): 20251223183637_add_report_test_case_entity_for_storing_test_results_for_individual_test_cases

### Community 104 - "20251224083549_add_comprehensive_report_storage"
Nodes (1): 20251224083549_add_comprehensive_report_storage

### Community 105 - "new_ReportTestCase"
Nodes (1): new_ReportTestCase

### Community 106 - "20251229194422_migrate_duration_to_string"
Nodes (1): 20251229194422_migrate_duration_to_string

### Community 107 - "new_ReportHook"
Nodes (1): new_ReportHook

### Community 108 - "new_ReportStep"
Nodes (1): new_ReportStep

### Community 109 - "20251230124637_add_unique_constraint_to_test_run_name"
Nodes (1): 20251230124637_add_unique_constraint_to_test_run_name

### Community 110 - "20260115094436_add_dashboard_metrics"
Nodes (1): 20260115094436_add_dashboard_metrics

### Community 111 - "20260127172022_add_cascade_delete_to_step_parameters"
Nodes (1): 20260127172022_add_cascade_delete_to_step_parameters

### Community 112 - "new_TemplateTestCaseStepParameter"
Nodes (1): new_TemplateTestCaseStepParameter

### Community 113 - "new_TestCaseStepParameter"
Nodes (1): new_TestCaseStepParameter

### Community 114 - "20260313093000_add_report_step_screenshot_path"
Nodes (1): 20260313093000_add_report_step_screenshot_path

### Community 115 - "20260318120000_add_test_suite_context_to_test_run_test_case"
Nodes (1): 20260318120000_add_test_suite_context_to_test_run_test_case

### Community 116 - "20260318173512_add_support_of_test_suite_level_runs"
Nodes (1): 20260318173512_add_support_of_test_suite_level_runs

### Community 117 - "20260507000000_add_flow_builder_node_grouping"
Nodes (1): 20260507000000_add_flow_builder_node_grouping

### Community 118 - "20260609002500_add_plan_projection_and_sync"
Nodes (1): 20260609002500_add_plan_projection_and_sync

### Community 119 - "20260609090000_add_plan_review_runtime"
Nodes (1): 20260609090000_add_plan_review_runtime

### Community 120 - "20260609160000_add_coordinator_events_api_mcp"
Nodes (1): 20260609160000_add_coordinator_events_api_mcp

### Community 121 - "new_PlanEvent"
Nodes (1): new_PlanEvent

### Community 122 - "20260613015000_add_plan_description"
Nodes (1): 20260613015000_add_plan_description

### Community 123 - "20260628090000_add_target_projects"
Nodes (1): 20260628090000_add_target_projects

### Community 124 - "new_PlanProjection"
Nodes (1): new_PlanProjection

### Community 125 - "20260628103000_add_plan_slug_legacy_identity"
Nodes (1): 20260628103000_add_plan_slug_legacy_identity

### Community 126 - "20260701090000_add_provider_workflow_runs"
Nodes (1): 20260701090000_add_provider_workflow_runs

### Community 127 - "20260701120000_add_provider_registration_settings"
Nodes (1): 20260701120000_add_provider_registration_settings

### Community 128 - "20260708090000_add_test_run_evidence_health"
Nodes (1): 20260708090000_add_test_run_evidence_health

### Community 129 - "20260709090000_add_step_blocks"
Nodes (1): 20260709090000_add_step_blocks

### Community 130 - "20260711120000_add_baseline_attempt_history"
Nodes (1): 20260711120000_add_baseline_attempt_history

### Community 131 - "20260711150000_add_delegated_authorization_nonces"
Nodes (1): 20260711150000_add_delegated_authorization_nonces

### Community 132 - "20260711170000_add_delegated_ast_submissions"
Nodes (1): 20260711170000_add_delegated_ast_submissions

### Community 133 - "20260711190000_add_validation_ast_publish_journal"
Nodes (1): 20260711190000_add_validation_ast_publish_journal

## Suggested Questions
- Which models are connected to PlanProjection?
- Which migrations introduced coordinator and plan review tables?
- Which models depend on Locator or TestRun?
- Which enums are used by execution report models?
